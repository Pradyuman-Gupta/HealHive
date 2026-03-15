const express = require("express");
const { DEFAULT_KEYWORDS } = require("../config/keywords");
const { SOURCES } = require("../config/sources");
const PubMedScraper = require("../scrapers/pubmedScraper");
const MedlineScraper = require("../scrapers/medlineScraper");
const WHOScraper = require("../scrapers/whoScraper");
const { filterByKeywords } = require("../processors/keywordFilter");
const { formatAndDeduplicate } = require("../processors/dataFormatter");
const { optionalAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

const router = express.Router();

const SCRAPER_MAP = {
  pubmed: PubMedScraper,
  medline: MedlineScraper,
  who: WHOScraper,
};

// ── Core scraping logic ──────────────────────────────────────────────────────
async function runScraper(keywords, enabledSources) {
  const scraperTasks = enabledSources.map(async (source) => {
    const ScraperClass = SCRAPER_MAP[source.id];
    if (!ScraperClass) return { source: source.name, results: [], error: "Not implemented" };

    const scraper = new ScraperClass(source);
    try {
      const results = await scraper.scrape(keywords);
      return { source: source.name, results, error: null };
    } catch (err) {
      logger.error(`[${source.name}] Scraper failed: ${err.message}`);
      return { source: source.name, results: [], error: err.message };
    }
  });

  const settled = await Promise.all(scraperTasks);
  const allRaw = settled.flatMap((s) => s.results);
  const sourceErrors = settled.filter((s) => s.error).map((s) => ({
    source: s.source,
    error: s.error,
  }));

  const filtered = filterByKeywords(allRaw, keywords);
  const final = formatAndDeduplicate(filtered);
  return { results: final, sourceErrors, rawCount: allRaw.length };
}

// ── Parse sources from request ───────────────────────────────────────────────
function parseEnabledSources(sourcesParam) {
  const requested = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim().toLowerCase())
    : null;
  return SOURCES.filter((s) => {
    if (!s.enabled) return false;
    return requested ? requested.includes(s.id) : true;
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /scrape
//  Public — works for guests, patients, and doctors
//  If user is logged in (optionalAuth), response includes consultation option
// ────────────────────────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const startTime = Date.now();

  const keywords = req.query.keywords
    ? req.query.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_KEYWORDS;

  const enabledSources = parseEnabledSources(req.query.sources);

  if (enabledSources.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid sources. Available: pubmed, medline, who",
    });
  }

  logger.info(`[Scrape] keywords: [${keywords.join(", ")}] | user: ${req.user?.email || "guest"}`);

  try {
    const { results, sourceErrors, rawCount } = await runScraper(keywords, enabledSources);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Consultation option only shown to logged-in patients
    const canConsult = req.user?.role === "patient";

    return res.json({
      success: true,
      meta: {
        keywords,
        sources: enabledSources.map((s) => s.name),
        rawResultsCount: rawCount,
        filteredResultsCount: results.length,
        durationSeconds: parseFloat(duration),
        scrapedAt: new Date().toISOString(),
      },
      errors: sourceErrors.length > 0 ? sourceErrors : null,
      results,
      // ── Consultation prompt ────────────────────────────────────────────────
      consultation: {
        available: canConsult,
        message: canConsult
          ? "You can request a doctor consultation based on these results. POST /consultations/request"
          : req.user
          ? "Doctor consultation is available for patient accounts only."
          : "Log in as a patient to access doctor consultations.",
        // Pass these back so the client can use them in the consultation request
        payload: canConsult
          ? { keywords, resultCount: results.length }
          : null,
      },
    });
  } catch (err) {
    logger.error(`Scrape failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  POST /scrape
// ────────────────────────────────────────────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  const startTime = Date.now();

  const keywords =
    Array.isArray(req.body.keywords) && req.body.keywords.length > 0
      ? req.body.keywords.map((k) => k.trim().toLowerCase())
      : DEFAULT_KEYWORDS;

  const enabledSources = parseEnabledSources(
    Array.isArray(req.body.sources) ? req.body.sources.join(",") : null
  );

  if (enabledSources.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid sources. Available: pubmed, medline, who",
    });
  }

  try {
    const { results, sourceErrors, rawCount } = await runScraper(keywords, enabledSources);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const canConsult = req.user?.role === "patient";

    return res.json({
      success: true,
      meta: {
        keywords,
        sources: enabledSources.map((s) => s.name),
        rawResultsCount: rawCount,
        filteredResultsCount: results.length,
        durationSeconds: parseFloat(duration),
        scrapedAt: new Date().toISOString(),
      },
      errors: sourceErrors.length > 0 ? sourceErrors : null,
      results,
      consultation: {
        available: canConsult,
        message: canConsult
          ? "You can request a doctor consultation. POST /consultations/request"
          : req.user
          ? "Doctor consultation is available for patient accounts only."
          : "Log in as a patient to access doctor consultations.",
        payload: canConsult ? { keywords, resultCount: results.length } : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /scrape/sources
router.get("/sources", (req, res) => {
  res.json({
    sources: SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      enabled: s.enabled,
    })),
  });
});

module.exports = router;