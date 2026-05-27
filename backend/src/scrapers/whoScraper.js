const BaseScraper = require("./baseScraper");
const httpClient = require("../utils/httpClient");
const logger = require("../utils/logger");

/**
 * WHO scraper — diagnosis showed WHO uses Google Custom Search (gsc-* classes)
 * which loads results asynchronously via JS and is extremely hard to scrape.
 *
 * Strategy:
 *   1. WHO IRIS REST API       — WHO's document repository, clean JSON
 *   2. WHO RSS feeds           — topic-specific feeds, clean XML
 *   3. WHO Global Health Observatory API — structured health data
 */
class WHOScraper extends BaseScraper {
  constructor(source) {
    super(source);
    // WHO IRIS document repository API
    this.irisBase = "https://iris.who.int/rest";
    // WHO RSS base
    this.rssBase = "https://www.who.int/rss-feeds/news-releases.xml";
  }

  async scrape(keywords) {
    const results = [];

    for (const keyword of keywords) {
      let found = false;

      // Strategy 1: WHO IRIS Repository API
      found = await this.scrapeIrisApi(keyword, results);

      // Strategy 2: WHO RSS Feeds (always works, no scraping)
      if (!found) {
        found = await this.scrapeWhoRss(keyword, results);
      }

      // Strategy 3: WHO GHO (Global Health Observatory) OData API
      if (!found) {
        await this.scrapeWhoGho(keyword, results);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return results;
  }

  // ── Strategy 1: WHO IRIS REST API ─────────────────────────────────────────
  async scrapeIrisApi(keyword, results) {
    try {
      // IRIS search endpoint — returns JSON list of WHO publications
      const url = `${this.irisBase}/discover?query=${encodeURIComponent(keyword)}&size=10&sort=score`;
      logger.info(`[WHO IRIS] Searching: "${keyword}"`);

      const res = await httpClient.get(url, {
        headers: { Accept: "application/json" },
      });

      const data = res.data;

      // IRIS API response: data._embedded["search-result"] array
      const items =
        data?._embedded?.["search-result"] ||
        data?._embedded?.["items"] ||
        data?.items ||
        [];

      if (items.length === 0) return false;

      for (const item of items) {
        // Each item has: name, handle, metadata array
        const title =
          item.name ||
          item?.metadata?.find((m) => m.key === "dc.title")?.value ||
          "N/A";

        const handle = item.handle || item.id || null;
        const itemUrl = handle
          ? `https://iris.who.int/handle/${handle}`
          : null;

        const description =
          item?.metadata?.find((m) => m.key === "dc.description")?.value ||
          item?.metadata?.find((m) => m.key === "dc.description.abstract")?.value ||
          "";

        const date =
          item?.metadata?.find((m) => m.key === "dc.date.issued")?.value ||
          item?.metadata?.find((m) => m.key === "dc.date")?.value ||
          "";

        if (title !== "N/A" && itemUrl) {
          results.push(
            this.buildResult({
              title,
              url: itemUrl,
              summary: [date, description].filter(Boolean).join(" | ").slice(0, 300),
              source: this.source.name,
              type: this.source.type,
              matchedKeywords: [keyword],
            })
          );
        }
      }

      logger.info(`[WHO IRIS] "${keyword}" → ${items.length} results`);
      return items.length > 0;
    } catch (err) {
      logger.warn(`[WHO IRIS] Error for "${keyword}": ${err.message}`);
      return false;
    }
  }

  // ── Strategy 2: WHO RSS Feeds ─────────────────────────────────────────────
  async scrapeWhoRss(keyword, results) {
    try {
      // WHO news releases RSS — filter by keyword
      const feeds = [
        "https://www.who.int/rss-feeds/news-releases.xml",
        "https://www.who.int/rss-feeds/disease-outbreak-news.xml",
        "https://www.who.int/rss-feeds/technical-guidance.xml",
      ];

      const cheerio = require("cheerio");
      let totalFound = 0;

      for (const feedUrl of feeds) {
        try {
          logger.info(`[WHO RSS] Fetching feed for "${keyword}": ${feedUrl}`);
          const res = await httpClient.get(feedUrl);
          const $ = cheerio.load(res.data, { xmlMode: true });

          $("item").each((i, el) => {
            const title = $(el).find("title").first().text().trim();
            const link = $(el).find("link").first().text().trim() ||
                         $(el).find("guid").first().text().trim();
            const description = $(el).find("description").first().text()
              .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            const pubDate = $(el).find("pubDate").first().text().trim();

            // Only include items that mention the keyword
            const combined = `${title} ${description}`.toLowerCase();
            if (!combined.includes(keyword.toLowerCase())) return;

            if (title && link) {
              results.push(
                this.buildResult({
                  title,
                  url: link,
                  summary: [pubDate, description].filter(Boolean).join(" | ").slice(0, 300),
                  source: `${this.source.name} (News)`,
                  type: this.source.type,
                  matchedKeywords: [keyword],
                })
              );
              totalFound++;
            }
          });
        } catch (feedErr) {
          logger.warn(`[WHO RSS] Feed failed: ${feedUrl} — ${feedErr.message}`);
        }
      }

      logger.info(`[WHO RSS] "${keyword}" → ${totalFound} results from feeds`);
      return totalFound > 0;
    } catch (err) {
      logger.warn(`[WHO RSS] Error: ${err.message}`);
      return false;
    }
  }

  // ── Strategy 3: WHO GHO OData API ─────────────────────────────────────────
  async scrapeWhoGho(keyword, results) {
    try {
      // WHO GHO (Global Health Observatory) — indicators search
      const url = `https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'${encodeURIComponent(keyword)}')&$top=10`;
      logger.info(`[WHO GHO] Searching indicators for: "${keyword}"`);

      const res = await httpClient.get(url, {
        headers: { Accept: "application/json" },
      });

      const items = res.data?.value || [];
      if (items.length === 0) return;

      for (const item of items) {
        const title = item.IndicatorName || "N/A";
        const code = item.IndicatorCode || "";
        const itemUrl = code
          ? `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${code}`
          : "https://www.who.int/data/gho";

        results.push(
          this.buildResult({
            title,
            url: itemUrl,
            summary: `WHO Global Health Observatory Indicator | Code: ${code}`,
            source: `${this.source.name} (GHO)`,
            type: "health_data",
            matchedKeywords: [keyword],
          })
        );
      }

      logger.info(`[WHO GHO] "${keyword}" → ${items.length} indicators`);
    } catch (err) {
      logger.warn(`[WHO GHO] Error: ${err.message}`);
    }
  }
}

module.exports = WHOScraper;
