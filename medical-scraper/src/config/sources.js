// ─────────────────────────────────────────────
//  Legitimate medical data sources
// ─────────────────────────────────────────────

const SOURCES = [
  {
    name: "PubMed",
    id: "pubmed",
    baseUrl: "https://pubmed.ncbi.nlm.nih.gov",
    searchUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=",
    type: "research_paper",
    enabled: true,
    usesPuppeteer: false,
  },
  {
    name: "MedlinePlus",
    id: "medline",
    baseUrl: "https://medlineplus.gov",
    searchUrl: "https://medlineplus.gov/search/?query=",
    type: "consumer_health",
    enabled: true,
    usesPuppeteer: false,
  },
  {
    name: "WHO",
    id: "who",
    baseUrl: "https://www.who.int",
    searchUrl: "https://www.who.int/search?query=",
    type: "global_health",
    enabled: true,
    usesPuppeteer: true, // WHO uses Cloudflare — needs headless browser
  },
];

module.exports = { SOURCES };