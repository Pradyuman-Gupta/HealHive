// ─────────────────────────────────────────────
//  Keywords used to filter scraped medical data
// ─────────────────────────────────────────────

const DEFAULT_KEYWORDS = ["mild", "fever", "headache"];

// 'any'  → result must contain AT LEAST ONE keyword
// 'all'  → result must contain ALL keywords
const MATCH_MODE = "all";

module.exports = { DEFAULT_KEYWORDS, MATCH_MODE };