const BaseScraper = require("./baseScraper");
const httpClient = require("../utils/httpClient");
const logger = require("../utils/logger");

/**
 * MedlinePlus scraper — uses the official MedlinePlus Web Service API.
 *
 * Diagnosis showed: /search/?query= returns 404
 * Fix: use the correct search URL + the MedlinePlus Web Service JSON API
 *
 * API docs: https://medlineplus.gov/about/developers/medlinepluswebservice/
 * Correct search URL: https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta
 */
class MedlineScraper extends BaseScraper {
  constructor(source) {
    super(source);
  }

  async scrape(keywords) {
    const results = [];

    for (const keyword of keywords) {
      // Try official MedlinePlus Web Service first (JSON)
      const apiSuccess = await this.scrapeViaApi(keyword, results);

      // Fallback: scrape the correct MedlinePlus search URL
      if (!apiSuccess) {
        await this.scrapeViaHtml(keyword, results);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return results;
  }

  // ── Primary: MedlinePlus Web Service JSON API ──────────────────────────────
  async scrapeViaApi(keyword, results) {
    try {
      // Official MedlinePlus Web Service endpoint
      const url =
        `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics` +
        `&term=${encodeURIComponent(keyword)}&retmax=10`;

      logger.info(`[MedlinePlus API] Searching: "${keyword}"`);
      const res = await httpClient.get(url, {
        headers: { Accept: "application/json, text/xml" },
      });

      const raw = res.data;

      // The API returns XML — parse it with cheerio
      const cheerio = require("cheerio");
      const $ = cheerio.load(raw, { xmlMode: true });

      let count = 0;

      // Each result is a <document> element with rank attribute
      $("document").each((i, el) => {
        const docUrl = $(el).attr("url") || null;

        // Title is in <content name="title">
        const title = $(el).find('content[name="title"]').text()
          .replace(/<[^>]*>/g, "").trim();

        // Summary is in <content name="FullSummary"> or <content name="snippet">
        const summary = (
          $(el).find('content[name="FullSummary"]').text() ||
          $(el).find('content[name="snippet"]').text() ||
          $(el).find('content[name="alt-title"]').text()
        ).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

        if (title && docUrl) {
          results.push(
            this.buildResult({
              title,
              url: docUrl,
              summary,
              source: this.source.name,
              type: this.source.type,
              matchedKeywords: [keyword],
            })
          );
          count++;
        }
      });

      if (count > 0) {
        logger.info(`[MedlinePlus API] "${keyword}" → ${count} results`);
        return true;
      }
      return false;
    } catch (err) {
      logger.warn(`[MedlinePlus API] Error for "${keyword}": ${err.message}`);
      return false;
    }
  }

  // ── Fallback: scrape MedlinePlus search HTML ───────────────────────────────
  async scrapeViaHtml(keyword, results) {
    try {
      // Correct working MedlinePlus search URL (not /search/?query=)
      const url = `https://medlineplus.gov/search.html#query=${encodeURIComponent(keyword)}`;
      const altUrl = `https://medlineplus.gov/search/?query=${encodeURIComponent(keyword)}&server=clinical`;

      logger.info(`[MedlinePlus HTML] Fetching: ${altUrl}`);
      const res = await httpClient.get(altUrl).catch(() => null) ||
                  await httpClient.get(url).catch(() => null);

      if (!res) {
        logger.warn(`[MedlinePlus HTML] Both URLs failed for "${keyword}"`);
        return;
      }

      const cheerio = require("cheerio");
      const $ = cheerio.load(res.data);
      let count = 0;

      // Try all known selector patterns
      const selectors = [
        "ul.search-results-list li",
        ".search-result-item",
        "#search-results li",
        ".results-list li",
        "li.result",
        ".result",
        "ul li",
      ];

      for (const selector of selectors) {
        const items = $(selector);
        if (items.length === 0) continue;

        items.each((i, el) => {
          const titleEl = $(el).find("a").first();
          const title = titleEl.text().trim();
          const href = titleEl.attr("href");
          if (!title || !href || title.length < 3) return;

          const itemUrl = href.startsWith("http")
            ? href
            : `https://medlineplus.gov${href}`;
          const summary = $(el).find("p, span.description, .snippet").first().text().trim();

          results.push(
            this.buildResult({
              title,
              url: itemUrl,
              summary,
              source: this.source.name,
              type: this.source.type,
              matchedKeywords: [keyword],
            })
          );
          count++;
        });

        if (count > 0) {
          logger.info(`[MedlinePlus HTML] "${keyword}" → ${count} results via "${selector}"`);
          break;
        }
      }
    } catch (err) {
      logger.error(`[MedlinePlus HTML] Failed: ${err.message}`);
    }
  }
}

module.exports = MedlineScraper;
