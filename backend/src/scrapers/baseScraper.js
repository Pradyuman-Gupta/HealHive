const httpClient = require("../utils/httpClient");
const { fetchWithPuppeteer } = require("../utils/puppeteerClient");
const logger = require("../utils/logger");
const cheerio = require("cheerio");

class BaseScraper {
  constructor(source) {
    this.source = source;
  }

  // ── Fetch page HTML and return a Cheerio instance ──────────────────────────
  async fetchPage(url) {
    try {
      logger.info(`[${this.source.name}] Fetching: ${url}`);
      let html;

      if (this.source.usesPuppeteer) {
        // Use headless Chrome for JS-rendered / Cloudflare-protected pages
        html = await fetchWithPuppeteer(url);
      } else {
        const response = await httpClient.get(url);
        html = response.data;
      }

      if (!html) return null;
      return cheerio.load(html);
    } catch (error) {
      logger.error(
        `[${this.source.name}] Failed to fetch ${url}: ${error.message}`
      );
      return null;
    }
  }

  // ── Must be implemented by each child scraper ──────────────────────────────
  async scrape(keywords) {
    throw new Error(`scrape() not implemented for ${this.source.name}`);
  }

  // ── Shared result builder — ensures a consistent shape across all scrapers ─
  buildResult({ title, url, summary, source, type, matchedKeywords }) {
    return {
      title: title?.trim() || "N/A",
      url: url || "N/A",
      summary: summary?.trim() || "N/A",
      source,
      type,
      matchedKeywords,
      scrapedAt: new Date().toISOString(),
    };
  }
}

module.exports = BaseScraper;