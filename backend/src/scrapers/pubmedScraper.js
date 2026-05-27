const BaseScraper = require("./baseScraper");
const httpClient = require("../utils/httpClient");
const logger = require("../utils/logger");

/**
 * PubMed scraper — uses the official NCBI E-utilities JSON API.
 * No HTML parsing. Never breaks due to DOM changes.
 *
 * Flow:
 *   esearch  → get article IDs for keyword
 *   esummary → get full metadata for those IDs
 */
class PubMedScraper extends BaseScraper {
  constructor(source) {
    super(source);
    this.apiKey = process.env.NCBI_API_KEY || "";
    this.baseApi = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  }

  apiUrl(endpoint, params) {
    const key = this.apiKey ? `&api_key=${this.apiKey}` : "";
    return `${this.baseApi}/${endpoint}.fcgi?db=pubmed&retmode=json${key}&${params}`;
  }

  async scrape(keywords) {
    const results = [];

    for (const keyword of keywords) {
      try {
        // Step 1 — search for IDs
        const searchUrl = this.apiUrl(
          "esearch",
          `term=${encodeURIComponent(keyword)}[Title/Abstract]&retmax=10&sort=relevance`
        );
        logger.info(`[PubMed API] Searching: "${keyword}"`);
        const searchRes = await httpClient.get(searchUrl);
        const idList = searchRes.data?.esearchresult?.idlist || [];

        if (idList.length === 0) {
          logger.warn(`[PubMed API] No IDs found for: "${keyword}"`);
          continue;
        }

        // Step 2 — fetch summaries
        const summaryUrl = this.apiUrl("esummary", `id=${idList.join(",")}`);
        const summaryRes = await httpClient.get(summaryUrl);
        const uids = summaryRes.data?.result?.uids || [];

        for (const uid of uids) {
          const article = summaryRes.data.result[uid];
          if (!article) continue;

          const title = article.title || "N/A";
          const authors = (article.authors || [])
            .slice(0, 3)
            .map((a) => a.name)
            .join(", ");
          const journal = article.fulljournalname || article.source || "";
          const pubDate = article.pubdate || "";
          const articleUrl = `https://pubmed.ncbi.nlm.nih.gov/${uid}/`;
          const summary = [authors, journal, pubDate].filter(Boolean).join(" | ");

          results.push(
            this.buildResult({
              title,
              url: articleUrl,
              summary,
              source: this.source.name,
              type: this.source.type,
              matchedKeywords: [keyword],
            })
          );
        }

        logger.info(`[PubMed API] "${keyword}" → ${uids.length} articles`);
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        logger.error(`[PubMed API] Error for "${keyword}": ${err.message}`);
      }
    }

    return results;
  }
}

module.exports = PubMedScraper;
