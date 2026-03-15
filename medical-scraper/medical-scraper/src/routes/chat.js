const express = require("express");
const axios = require("axios");
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

const AI_SERVER = process.env.AI_SERVER_URL || "http://localhost:8000";

const SCRAPER_MAP = {
  pubmed: PubMedScraper,
  medline: MedlineScraper,
  who: WHOScraper,
};

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
    // ── Step 1: Extract keywords via HealHive NLP ────────────────────────────
    let keywords = [];
    let isHealthQuery = true;

    try {
      const kwRes = await axios.post(
        `${AI_SERVER}/extract-keywords`,
        { query: userMessage },
        { timeout: 30000 }
      );
      keywords = kwRes.data.keywords || [];
    } catch (aiErr) {
      logger.warn(`[Chat] AI keyword extraction failed: ${aiErr.message}. Falling back to message words.`);
      // Fallback: use the message words as keywords
      keywords = userMessage
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);
    }

    // If AI returned empty keywords, it's not a health query
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

    // ── Step 3: Analyze papers via HealHive NLP ──────────────────────────────
    let report = null;
    let formattedReply = "";

    if (scraperResults.length > 0) {
      try {
        const analyzeRes = await axios.post(
          `${AI_SERVER}/analyze-papers`,
          {
            query: userMessage,
            papers: { results: scraperResults.slice(0, 15) }, // cap at 15 to avoid overload
          },
          { timeout: 120000 } // 2 min timeout for AI analysis
        );
        report = analyzeRes.data;
        formattedReply = formatAIResponse(report, report.source_references || []);
      } catch (analyzeErr) {
        logger.warn(`[Chat] AI analysis failed: ${analyzeErr.message}`);
        // Fallback: give a basic response based on scraper data
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
