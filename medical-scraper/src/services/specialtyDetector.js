/**
 * Detects the relevant medical specialty from keywords and AI summary text.
 * Maps symptom keywords → medical specialty → routes to correct doctors.
 */

const SPECIALTY_MAP = [
  {
    specialty: "neurology",
    keywords: [
      "headache", "migraine", "seizure", "dizziness", "vertigo", "numbness",
      "tingling", "memory", "confusion", "stroke", "tremor", "paralysis",
      "neurological", "brain", "nerve", "neuropathy", "epilepsy",
    ],
  },
  {
    specialty: "cardiology",
    keywords: [
      "chest pain", "heart", "palpitation", "shortness of breath", "hypertension",
      "blood pressure", "cardiac", "arrhythmia", "tachycardia", "bradycardia",
      "angina", "coronary", "cardiovascular", "edema", "swelling legs",
    ],
  },
  {
    specialty: "pulmonology",
    keywords: [
      "cough", "breathing", "asthma", "pneumonia", "bronchitis", "lung",
      "respiratory", "wheeze", "sputum", "oxygen", "dyspnea", "copd",
      "tuberculosis", "pleural", "inhaler",
    ],
  },
  {
    specialty: "gastroenterology",
    keywords: [
      "stomach", "nausea", "vomiting", "diarrhea", "constipation", "abdominal",
      "bowel", "liver", "hepatitis", "ulcer", "acid reflux", "gerd",
      "bloating", "indigestion", "gallbladder", "pancreas", "colitis",
    ],
  },
  {
    specialty: "infectious_disease",
    keywords: [
      "fever", "infection", "bacteria", "virus", "sepsis", "malaria",
      "dengue", "typhoid", "tuberculosis", "hiv", "covid", "flu", "influenza",
      "antibiotic", "antimicrobial", "outbreak", "contagious", "mild fever",
    ],
  },
  {
    specialty: "dermatology",
    keywords: [
      "rash", "skin", "itching", "eczema", "psoriasis", "acne", "hives",
      "allergy", "dermatitis", "lesion", "wound", "blister", "urticaria",
    ],
  },
  {
    specialty: "orthopedics",
    keywords: [
      "bone", "joint", "fracture", "arthritis", "back pain", "knee",
      "shoulder", "spine", "muscle", "ligament", "tendon", "osteoporosis",
      "swollen joint", "orthopedic",
    ],
  },
  {
    specialty: "endocrinology",
    keywords: [
      "diabetes", "thyroid", "insulin", "glucose", "hormone", "obesity",
      "metabolic", "adrenal", "cortisol", "hypoglycemia", "hyperglycemia",
      "pituitary", "endocrine",
    ],
  },
  {
    specialty: "psychiatry",
    keywords: [
      "anxiety", "depression", "mental", "stress", "insomnia", "sleep",
      "panic", "bipolar", "schizophrenia", "psychosis", "mood", "phobia",
      "ptsd", "ocd", "adhd",
    ],
  },
  {
    specialty: "pediatrics",
    keywords: [
      "child", "infant", "baby", "toddler", "pediatric", "vaccination",
      "growth", "developmental", "newborn", "childhood",
    ],
  },
];

/**
 * Detect specialty from keywords array + optional text content.
 * Returns the best-matching specialty or "general" as fallback.
 */
function detectSpecialty(keywords = [], summaryText = "") {
  const combinedText = [
    ...keywords,
    summaryText,
  ].join(" ").toLowerCase();

  const scores = {};

  for (const { specialty, keywords: specKeywords } of SPECIALTY_MAP) {
    let score = 0;
    for (const kw of specKeywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        // Exact keyword match from user input scores higher
        const isUserKeyword = keywords.some((k) =>
          k.toLowerCase().includes(kw.toLowerCase())
        );
        score += isUserKeyword ? 3 : 1;
      }
    }
    if (score > 0) scores[specialty] = score;
  }

  if (Object.keys(scores).length === 0) return "general";

  // Return specialty with highest score
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Get a human-readable specialty label.
 */
function getSpecialtyLabel(specialty) {
  const labels = {
    neurology: "Neurology",
    cardiology: "Cardiology",
    pulmonology: "Pulmonology",
    gastroenterology: "Gastroenterology",
    infectious_disease: "Infectious Disease",
    dermatology: "Dermatology",
    orthopedics: "Orthopedics",
    endocrinology: "Endocrinology",
    psychiatry: "Psychiatry",
    pediatrics: "Pediatrics",
    general: "General Medicine",
  };
  return labels[specialty] || "General Medicine";
}

module.exports = { detectSpecialty, getSpecialtyLabel };