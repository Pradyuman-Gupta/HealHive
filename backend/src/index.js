require("dotenv").config();

const express = require("express");
const cors = require("cors");


// ── Original scraper imports (unchanged) ─────────────────────────────────────
const { DEFAULT_KEYWORDS } = require("./config/keywords");
const { SOURCES } = require("./config/sources");
const PubMedScraper = require("./scrapers/pubmedScraper");
const MedlineScraper = require("./scrapers/medlineScraper");
const WHOScraper = require("./scrapers/whoScraper");
const { filterByKeywords } = require("./processors/keywordFilter");
const { formatAndDeduplicate } = require("./processors/dataFormatter");
const { closeBrowser } = require("./utils/puppeteerClient");
const logger = require("./utils/logger");

// ── New imports for v2 features ───────────────────────────────────────────────
const { connectDB } = require("./utils/db");
const { optionalAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const consultationRoutes = require("./routes/consultations");
const adminRoutes = require("./routes/admin");
const chatRoute = require("./routes/chat");

const app = express();

// ── CORS — allow the React frontend ──────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3001;



// ── Connect to MongoDB (new) ──────────────────────────────────────────────────
connectDB();

// ── Scraper registry — unchanged from your original ──────────────────────────
const SCRAPER_MAP = {
  pubmed: PubMedScraper,
  medline: MedlineScraper,
  who: WHOScraper,
};

// ── Core scraping logic — unchanged from your original ───────────────────────
async function runScraper(keywords, enabledSources) {
  const scraperTasks = enabledSources.map(async (source) => {
    const ScraperClass = SCRAPER_MAP[source.id];
    if (!ScraperClass) {
      logger.warn(`No scraper implemented for: ${source.id}`);
      return { source: source.name, results: [], error: "Not implemented" };
    }

    const scraper = new ScraperClass(source);
    try {
      const results = await scraper.scrape(keywords);
      logger.info(`[${source.name}] Raw results: ${results.length}`);
      return { source: source.name, results, error: null };
    } catch (err) {
      logger.error(`[${source.name}] Scraper failed: ${err.message}`);
      return { source: source.name, results: [], error: err.message };
    }
  });

  const settled = await Promise.all(scraperTasks);

  const allRaw = settled.flatMap((s) => s.results);
  const sourceErrors = settled
    .filter((s) => s.error)
    .map((s) => ({ source: s.source, error: s.error }));

  const filtered = filterByKeywords(allRaw, keywords);
  const final = formatAndDeduplicate(filtered);

  return { results: final, sourceErrors, rawCount: allRaw.length };
}

// ── Mount route modules ───────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/consultations", consultationRoutes);
app.use("/admin", adminRoutes);
app.use("/chat", chatRoute);

// ────────────────────────────────────────────────────────────────────────────
//  GET /health — unchanged + version bump
// ────────────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    features: ["scraping", "auth", "consultations", "admin"],
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /scrape — your original code, + optionalAuth so logged-in patients
//  see a "consult a doctor" prompt in the response
// ────────────────────────────────────────────────────────────────────────────
app.get("/scrape", optionalAuth, async (req, res) => {
  const startTime = Date.now();

  const keywords = req.query.keywords
    ? req.query.keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_KEYWORDS;

  const requestedSources = req.query.sources
    ? req.query.sources.split(",").map((s) => s.trim().toLowerCase())
    : null;

  const enabledSources = SOURCES.filter((s) => {
    if (!s.enabled) return false;
    if (requestedSources) return requestedSources.includes(s.id);
    return true;
  });

  if (enabledSources.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid sources selected. Available: pubmed, medline, who",
    });
  }

  logger.info(`Scrape request — keywords: [${keywords.join(", ")}] | sources: [${enabledSources.map((s) => s.name).join(", ")}] | user: ${req.user?.email || "guest"}`);

  try {
    const { results, sourceErrors, rawCount } = await runScraper(
      keywords,
      enabledSources
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // ── Consultation prompt — only shown to logged-in patients ────────────────
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
      // ── NEW: consultation section appended to existing response ───────────
      consultation: {
        available: canConsult,
        message: canConsult
          ? "You can request a doctor consultation based on these results. POST /consultations/request"
          : req.user
          ? "Doctor consultation is only available for patient accounts."
          : "Create a patient account and log in to consult a verified doctor.",
        payload: canConsult ? { keywords, resultCount: results.length } : null,
      },
    });
  } catch (err) {
    logger.error(`Scrape failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  POST /scrape — your original code, + optionalAuth
// ────────────────────────────────────────────────────────────────────────────
app.post("/scrape", optionalAuth, async (req, res) => {
  const startTime = Date.now();

  const keywords =
    Array.isArray(req.body.keywords) && req.body.keywords.length > 0
      ? req.body.keywords.map((k) => k.trim().toLowerCase())
      : DEFAULT_KEYWORDS;

  const requestedSources = Array.isArray(req.body.sources)
    ? req.body.sources.map((s) => s.toLowerCase())
    : null;

  const enabledSources = SOURCES.filter((s) => {
    if (!s.enabled) return false;
    if (requestedSources) return requestedSources.includes(s.id);
    return true;
  });

  if (enabledSources.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid sources selected. Available: pubmed, medline, who",
    });
  }

  logger.info(`[POST] Scrape — keywords: [${keywords.join(", ")}] | sources: [${enabledSources.map((s) => s.name).join(", ")}] | user: ${req.user?.email || "guest"}`);

  try {
    const { results, sourceErrors, rawCount } = await runScraper(
      keywords,
      enabledSources
    );

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
          ? "Doctor consultation is only available for patient accounts."
          : "Create a patient account and log in to consult a verified doctor.",
        payload: canConsult ? { keywords, resultCount: results.length } : null,
      },
    });
  } catch (err) {
    logger.error(`Scrape failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /sources — unchanged from your original
// ────────────────────────────────────────────────────────────────────────────
app.get("/sources", (req, res) => {
  res.json({
    sources: SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      enabled: s.enabled,
    })),
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  404 fallback — updated to include new routes
// ────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    availableRoutes: [
      "GET  /health",
      "GET  /sources",
      "GET  /scrape?keywords=mild,fever,headache&sources=pubmed,medline,who",
      "POST /scrape  body: { keywords: [], sources: [] }",
      "POST /auth/register",
      "POST /auth/login",
      "GET  /auth/me",
      "POST /consultations/request          [patient]",
      "GET  /consultations/mine             [patient]",
      "GET  /consultations/mine/:id         [patient]",
      "DELETE /consultations/mine/:id       [patient]",
      "GET  /consultations/board            [verified doctor]",
      "GET  /consultations/board/:id        [verified doctor]",
      "POST /consultations/board/:id/reply  [verified doctor]",
      "GET  /consultations/my-replies       [verified doctor]",
      "GET  /admin/stats                    [admin]",
      "GET  /admin/users                    [admin]",
      "GET  /admin/users/pending-doctors    [admin]",
      "PATCH /admin/users/:id/verify-doctor [admin]",
    ],
  });
});

// ── Global error handler (new) ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  // TEMP: show real error for debugging
  res.status(500).json({ success: false, error: err.message, stack: err.stack });
});

// ────────────────────────────────────────────────────────────────────────────
//  Start server — unchanged from your original
// ────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`Medical Scraper API v2 running on http://localhost:${PORT}`);
  logger.info(`Try: GET http://localhost:${PORT}/scrape?keywords=mild,fever,headache`);
});

// Graceful shutdown — unchanged from your original
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await closeBrowser();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await closeBrowser();
  server.close(() => process.exit(0));
});

module.exports = app;