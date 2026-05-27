const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { optionalAuth } = require("../middleware/auth");
const { SOURCES } = require("../config/sources");
const { DEFAULT_KEYWORDS } = require("../config/keywords");
const PubMedScraper = require("../scrapers/pubmedScraper");
const MedlineScraper = require("../scrapers/medlineScraper");
const WHOScraper = require("../scrapers/whoScraper");
const { filterByKeywords } = require("../processors/keywordFilter");
const { formatAndDeduplicate } = require("../processors/dataFormatter");
const logger = require("../utils/logger");

const router = express.Router();

// Initialize Google Generative AI client
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI = null;
if (geminiApiKey) {
  genAI = new GoogleGenerativeAI(geminiApiKey);
  logger.info("[Chat] Google Generative AI client initialized successfully.");
} else {
  logger.warn("[Chat] GEMINI_API_KEY environment variable is not set. Chat will operate in fallback mode.");
}

const SCRAPER_MAP = {
  pubmed: PubMedScraper,
  medline: MedlineScraper,
  who: WHOScraper,
};

// Helper function to extract unique source URLs
function listUniqueUrls(results) {
  const urls = results
    .map((r) => r.url)
    .filter((u) => u && typeof u === "string" && u.trim().length > 0);
  return [...new Set(urls)];
}

// ── Internal scrape helper ───────────────────────────────────────────────────
async function scrapeForKeywords(keywords) {
  const enabledSources = SOURCES.filter((s) => s.enabled);
  const tasks = enabledSources.map(async (source) => {
    const ScraperClass = SCRAPER_MAP[source.id];
    if (!ScraperClass) return [];
    try {
      return await new ScraperClass(source).scrape(keywords);
    } catch (err) {
      logger.warn(`[chat/scrape] ${source.name} failed: ${err.message}`);
      return [];
    }
  });
  const all = (await Promise.all(tasks)).flat();
  return formatAndDeduplicate(filterByKeywords(all, keywords));
}

// ── Format AI report into a readable chat message ───────────────────────────
function formatAIResponse(report, sources) {
  const lines = [];

  if (report.query_summary) {
    lines.push(`**Summary:** ${report.query_summary}`);
  }

  if (report.treatment_overview) {
    lines.push(`\n**Treatment Overview:** ${report.treatment_overview}`);
  }

  if (report.common_side_effects && report.common_side_effects.length > 0) {
    lines.push(`\n**Common Side Effects:**`);
    report.common_side_effects.forEach((se) => lines.push(`• ${se}`));
  }

  if (report.recovery_timeline) {
    lines.push(`\n**Recovery Timeline:** ${report.recovery_timeline}`);
  }

  if (report.sentiment_analysis) {
    const sa = report.sentiment_analysis;
    if (sa.positive_experiences) {
      lines.push(`\n**Positive Experiences:** ${sa.positive_experiences}`);
    }
    if (sa.negative_experiences) {
      lines.push(`**Negative Experiences:** ${sa.negative_experiences}`);
    }
  }

  if (report.credibility_score !== null && report.credibility_score !== undefined) {
    lines.push(`\n**Credibility Score:** ${report.credibility_score}/10`);
  }

  if (sources && sources.length > 0) {
    lines.push(`\n**Sources:**`);
    sources.slice(0, 3).forEach((url) => lines.push(`🔗 ${url}`));
  }

  if (lines.length === 0) {
    return "I've processed your query but couldn't extract structured information. Please consult a healthcare professional for medical advice.";
  }

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /chat
//  Body: { message: string, conversationHistory?: [{role, text}] }
//  Returns: { reply: string, report: object, isHealthQuery: bool }
// ────────────────────────────────────────────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message is required." });
  }

  const userMessage = message.trim();
  logger.info(`[Chat] Message from ${req.user?.email || "guest"}: "${userMessage.substring(0, 60)}"`);

  try {
    // ── Step 1: Extract keywords via Gemini ──────────────────────────────────
    let keywords = [];
    let isHealthQuery = true;

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "array",
              items: { type: "string" }
            }
          }
        });

        const prompt = `You are a medical AI assistant. Extract important medical/health-related keywords from the user's query that would be useful for searching medical databases like PubMed. If the query is completely unrelated to health, medicine, symptoms, or medical advice, return an empty array.

User Query: "${userMessage}"`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        keywords = JSON.parse(text);
        if (!Array.isArray(keywords)) {
          keywords = [];
        }
      } catch (aiErr) {
        logger.warn(`[Chat] Gemini keyword extraction failed: ${aiErr.message}. Falling back to message words.`);
        // Fallback: use the message words as keywords
        keywords = userMessage
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 5);
      }
    } else {
      // Fallback: use message words directly
      keywords = userMessage
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);
    }

    // If AI returned empty keywords or fallback was empty, it's not a health query
    if (keywords.length === 0) {
      isHealthQuery = false;
      return res.json({
        success: true,
        isHealthQuery: false,
        reply:
          "I'm HealHive AI, specialized in health and medical topics. Please ask me something related to your health, symptoms, or medical conditions.",
        report: null,
      });
    }

    // ── Step 2: Scrape medical papers for those keywords ─────────────────────
    let scraperResults = [];
    try {
      scraperResults = await scrapeForKeywords(keywords);
      logger.info(`[Chat] Scraped ${scraperResults.length} results for keywords: [${keywords.join(", ")}]`);
    } catch (scrapeErr) {
      logger.warn(`[Chat] Scraping failed: ${scrapeErr.message}`);
    }

    // ── Step 3: Analyze papers via Gemini ────────────────────────────────────
    let report = null;
    let formattedReply = "";

    if (scraperResults.length > 0) {
      if (genAI) {
        try {
          const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  query_summary: { type: "string" },
                  treatment_overview: { type: "string" },
                  common_side_effects: {
                    type: "array",
                    items: { type: "string" }
                  },
                  recovery_timeline: { type: "string" },
                  sentiment_analysis: {
                    type: "object",
                    properties: {
                      positive_experiences: { type: "string" },
                      negative_experiences: { type: "string" }
                    },
                    required: ["positive_experiences", "negative_experiences"]
                  },
                  credibility_score: { type: "integer" }
                },
                required: [
                  "query_summary",
                  "treatment_overview",
                  "common_side_effects",
                  "recovery_timeline",
                  "sentiment_analysis",
                  "credibility_score"
                ]
              }
            }
          });

          const papersText = scraperResults.slice(0, 15).map((paper, idx) => {
            return `[Paper ${idx + 1}]
Title: ${paper.title}
Summary/Abstract: ${paper.summary || paper.abstract || "N/A"}
Source: ${paper.source || "N/A"}`;
          }).join("\n\n");

          const prompt = `You are a medical research assistant. Analyze the following medical papers/articles to answer the user's query: "${userMessage}".

Context (scraped papers):
${papersText}

Based on the provided context, generate a structured analysis matching the requested JSON schema.
Each string field in the JSON response MUST be extremely brief (maximum 1 short sentence). Avoid long paragraphs and verbose explanations. Keep side effects limited to at most 3 concise items.
If the context doesn't contain specific recovery timeline or side effects, use general clinical knowledge to fill them in very briefly (e.g. "Usually 3-5 days" or "Mild gastrointestinal upset").
Evaluate the evidence strength and quality from the papers to assign a credibility_score from 0 (very low/untrustworthy) to 10 (very high/strong evidence).`;

          const result = await model.generateContent(prompt);
          const text = result.response.text();
          report = JSON.parse(text);

          const sources = listUniqueUrls(scraperResults.slice(0, 15));
          report.source_references = sources;
          formattedReply = formatAIResponse(report, sources);
        } catch (analyzeErr) {
          logger.warn(`[Chat] Gemini analysis failed: ${analyzeErr.message}`);
          const topResult = scraperResults[0];
          formattedReply = topResult
            ? `Based on medical literature, here's what I found about "${userMessage}":\n\n**${topResult.title}**\n\n${topResult.summary || topResult.abstract || "No summary available."}\n\n🔗 ${topResult.url || ""}`
            : `I found some information about "${userMessage}" but couldn't generate a detailed analysis. Please consult a healthcare professional.`;
        }
      } else {
        // Fallback without Gemini API key
        const topResult = scraperResults[0];
        formattedReply = topResult
          ? `Based on medical literature, here's what I found about "${userMessage}":\n\n**${topResult.title}**\n\n${topResult.summary || topResult.abstract || "No summary available."}\n\n🔗 ${topResult.url || ""}`
          : `I found some information about "${userMessage}" but couldn't generate a detailed analysis. Please consult a healthcare professional.`;
      }
    } else {
      // No scraper results — give a generic health advice response
      formattedReply = `I searched medical databases for information about "${userMessage}" but couldn't find specific research results right now. Here are some general tips:\n\n• Monitor your symptoms and note any changes\n• Stay hydrated and get adequate rest\n• Consult a healthcare professional if symptoms persist or worsen\n\nWould you like me to try a different search, or would you like to **Consult an Expert** for personalized advice?`;
    }

    return res.json({
      success: true,
      isHealthQuery: true,
      reply: formattedReply,
      report,
      meta: {
        keywords,
        sourcesFound: scraperResults.length,
      },
    });
  } catch (err) {
    logger.error(`[Chat] Unexpected error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: "Something went wrong processing your message. Please try again.",
    });
  }
});

module.exports = router;
