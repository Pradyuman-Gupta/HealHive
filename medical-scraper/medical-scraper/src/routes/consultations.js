const express = require("express");
const Consultation = require("../models/Consultation");
const { protect, restrictTo, requireVerifiedDoctor } = require("../middleware/auth");
const { detectSpecialty, getSpecialtyLabel } = require("../services/specialtyDetector");
const { buildConsultationPayload } = require("../services/summaryGenerator");
const { DEFAULT_KEYWORDS } = require("../config/keywords");
const { SOURCES } = require("../config/sources");
const PubMedScraper = require("../scrapers/pubmedScraper");
const MedlineScraper = require("../scrapers/medlineScraper");
const WHOScraper = require("../scrapers/whoScraper");
const { filterByKeywords } = require("../processors/keywordFilter");
const { formatAndDeduplicate } = require("../processors/dataFormatter");
const logger = require("../utils/logger");

const router = express.Router();

const SCRAPER_MAP = { pubmed: PubMedScraper, medline: MedlineScraper, who: WHOScraper };

async function quickScrape(keywords) {
  const enabledSources = SOURCES.filter((s) => s.enabled);
  const tasks = enabledSources.map(async (source) => {
    const ScraperClass = SCRAPER_MAP[source.id];
    if (!ScraperClass) return [];
    try {
      return await new ScraperClass(source).scrape(keywords);
    } catch {
      return [];
    }
  });
  const all = (await Promise.all(tasks)).flat();
  return formatAndDeduplicate(filterByKeywords(all, keywords));
}

// ════════════════════════════════════════════════════════════════════════════
//  PATIENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
//  POST /consultations/request
//  Patient requests a consultation after seeing scraper results.
//  Body: { keywords: [], scraperResults: [] }
//  If no scraperResults provided, system runs scraper automatically.
// ────────────────────────────────────────────────────────────────────────────
router.post("/request", [protect, restrictTo("patient")], async (req, res) => {
  try {
    const keywords = Array.isArray(req.body.keywords) && req.body.keywords.length > 0
      ? req.body.keywords.map((k) => k.trim().toLowerCase())
      : DEFAULT_KEYWORDS;

    // Check patient hasn't already submitted a pending consultation
    const existingPending = await Consultation.findOne({
      patient: req.user._id,
      status: "pending",
    });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: "You already have a pending consultation. Wait for a doctor to reply before submitting a new one.",
        existingConsultationId: existingPending._id,
      });
    }

    // Use provided scraper results or run fresh scrape
    let scraperResults = req.body.scraperResults || [];
    if (scraperResults.length === 0) {
      logger.info(`[Consultation] Running fresh scrape for patient ${req.user._id}`);
      scraperResults = await quickScrape(keywords);
    }

    // Build AI summary + detect specialty
    const { aiSummary } = buildConsultationPayload(keywords, scraperResults);
    const detectedSpecialty = detectSpecialty(keywords, aiSummary);
    const specialtyLabel = getSpecialtyLabel(detectedSpecialty);

    // Create consultation record
    const consultation = await Consultation.create({
      patient: req.user._id,
      keywords,
      aiSummary,
      scraperResults: scraperResults.slice(0, 20), // store top 20
      detectedSpecialty,
      status: "pending",
    });

    logger.info(
      `[Consultation] Created #${consultation._id} | specialty: ${detectedSpecialty} | patient: ${req.user.email}`
    );

    return res.status(201).json({
      success: true,
      message: `Your consultation has been posted to the ${specialtyLabel} board. A verified doctor will reply shortly.`,
      consultation: {
        id: consultation._id,
        keywords: consultation.keywords,
        aiSummary: consultation.aiSummary,
        detectedSpecialty,
        specialtyLabel,
        status: consultation.status,
        expiresAt: consultation.expiresAt,
        createdAt: consultation.createdAt,
      },
    });
  } catch (err) {
    logger.error(`[Consultation] Request failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /consultations/mine
//  Patient views all their own consultations.
// ────────────────────────────────────────────────────────────────────────────
router.get("/mine", [protect, restrictTo("patient")], async (req, res) => {
  try {
    const consultations = await Consultation.find({ patient: req.user._id })
      .populate("doctorReply.doctor", "name specialty")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: consultations.length,
      consultations: consultations.map((c) => ({
        id: c._id,
        keywords: c.keywords,
        aiSummary: c.aiSummary,
        detectedSpecialty: c.detectedSpecialty,
        specialtyLabel: getSpecialtyLabel(c.detectedSpecialty),
        status: c.status,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        // Show doctor reply if answered
        doctorReply: c.status === "answered" ? {
          doctorName: c.doctorReply.doctor?.name,
          doctorSpecialty: c.doctorReply.doctor?.specialty,
          message: c.doctorReply.message,
          repliedAt: c.doctorReply.repliedAt,
        } : null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /consultations/mine/:id
//  Patient views a single consultation with full details.
// ────────────────────────────────────────────────────────────────────────────
router.get("/mine/:id", [protect, restrictTo("patient")], async (req, res) => {
  try {
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      patient: req.user._id,
    }).populate("doctorReply.doctor", "name specialty isVerified");

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: "Consultation not found.",
      });
    }

    return res.json({
      success: true,
      consultation: {
        id: consultation._id,
        keywords: consultation.keywords,
        aiSummary: consultation.aiSummary,
        detectedSpecialty: consultation.detectedSpecialty,
        specialtyLabel: getSpecialtyLabel(consultation.detectedSpecialty),
        status: consultation.status,
        expiresAt: consultation.expiresAt,
        createdAt: consultation.createdAt,
        scraperResults: consultation.scraperResults,
        doctorReply: consultation.status === "answered" ? {
          doctorName: consultation.doctorReply.doctor?.name,
          doctorSpecialty: consultation.doctorReply.doctor?.specialty,
          message: consultation.doctorReply.message,
          repliedAt: consultation.doctorReply.repliedAt,
        } : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  DELETE /consultations/mine/:id
//  Patient cancels a pending consultation.
// ────────────────────────────────────────────────────────────────────────────
router.delete("/mine/:id", [protect, restrictTo("patient")], async (req, res) => {
  try {
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      patient: req.user._id,
    });

    if (!consultation) {
      return res.status(404).json({ success: false, error: "Consultation not found." });
    }

    if (consultation.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel a consultation with status: ${consultation.status}.`,
      });
    }

    consultation.status = "cancelled";
    await consultation.save();

    return res.json({ success: true, message: "Consultation cancelled." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  DOCTOR ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
//  GET /consultations/board
//  Verified doctor views the consultation board for their specialty.
//  Only shows pending consultations matching doctor's specialty.
// ────────────────────────────────────────────────────────────────────────────
router.get("/board", requireVerifiedDoctor, async (req, res) => {
  try {
    const doctorSpecialty = req.user.specialty?.toLowerCase() || "general";

    // Doctors see their specialty + general consultations
    const query = {
      status: "pending",
      detectedSpecialty: { $in: [doctorSpecialty, "general"] },
      expiresAt: { $gt: new Date() },
    };

    const consultations = await Consultation.find(query)
      .select("-scraperResults") // Don't send full results in board view
      .populate("patient", "name")
      .sort({ createdAt: -1 });

    // Mark as viewed by this doctor (non-blocking)
    const ids = consultations.map((c) => c._id);
    Consultation.updateMany(
      { _id: { $in: ids }, viewedBy: { $ne: req.user._id } },
      { $addToSet: { viewedBy: req.user._id } }
    ).catch(() => {});

    return res.json({
      success: true,
      specialty: doctorSpecialty,
      specialtyLabel: getSpecialtyLabel(doctorSpecialty),
      count: consultations.length,
      consultations: consultations.map((c) => ({
        id: c._id,
        patientName: c.patient?.name || "Anonymous",
        keywords: c.keywords,
        aiSummary: c.aiSummary,
        detectedSpecialty: c.detectedSpecialty,
        specialtyLabel: getSpecialtyLabel(c.detectedSpecialty),
        expiresAt: c.expiresAt,
        postedAt: c.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /consultations/board/:id
//  Verified doctor views full details of a single consultation.
// ────────────────────────────────────────────────────────────────────────────
router.get("/board/:id", requireVerifiedDoctor, async (req, res) => {
  try {
    const doctorSpecialty = req.user.specialty?.toLowerCase() || "general";

    const consultation = await Consultation.findOne({
      _id: req.params.id,
      detectedSpecialty: { $in: [doctorSpecialty, "general"] },
    }).populate("patient", "name");

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: "Consultation not found or not in your specialty.",
      });
    }

    // Mark viewed
    if (!consultation.viewedBy.includes(req.user._id)) {
      consultation.viewedBy.push(req.user._id);
      await consultation.save();
    }

    return res.json({
      success: true,
      consultation: {
        id: consultation._id,
        patientName: consultation.patient?.name || "Anonymous",
        keywords: consultation.keywords,
        aiSummary: consultation.aiSummary,
        detectedSpecialty: consultation.detectedSpecialty,
        specialtyLabel: getSpecialtyLabel(consultation.detectedSpecialty),
        scraperResults: consultation.scraperResults,
        status: consultation.status,
        expiresAt: consultation.expiresAt,
        postedAt: consultation.createdAt,
        alreadyAnswered: consultation.status === "answered",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  POST /consultations/board/:id/reply
//  Verified doctor sends exactly ONE reply. Channel closes immediately after.
//  Body: { message: "..." }
// ────────────────────────────────────────────────────────────────────────────
router.post("/board/:id/reply", requireVerifiedDoctor, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: "Reply message must be at least 10 characters.",
      });
    }

    const doctorSpecialty = req.user.specialty?.toLowerCase() || "general";

    // Find consultation — must be in doctor's specialty and still pending
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      detectedSpecialty: { $in: [doctorSpecialty, "general"] },
      status: "pending",
    });

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: "Consultation not found, not in your specialty, or already answered.",
      });
    }

    // Check not expired
    if (consultation.expiresAt < new Date()) {
      consultation.status = "expired";
      await consultation.save();
      return res.status(400).json({
        success: false,
        error: "This consultation has expired.",
      });
    }

    // ── Set reply and CLOSE the channel ──────────────────────────────────────
    consultation.doctorReply = {
      doctor: req.user._id,
      message: message.trim(),
      repliedAt: new Date(),
    };
    consultation.status = "answered"; // Channel permanently closed

    await consultation.save();

    logger.info(
      `[Consultation] #${consultation._id} answered by Dr. ${req.user.name} (${req.user.specialty})`
    );

    return res.json({
      success: true,
      message: "Your reply has been sent to the patient. This consultation is now closed.",
      reply: {
        consultationId: consultation._id,
        message: message.trim(),
        repliedAt: consultation.doctorReply.repliedAt,
        status: "answered",
        channelClosed: true,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /consultations/my-replies
//  Doctor views all consultations they have replied to.
// ────────────────────────────────────────────────────────────────────────────
router.get("/my-replies", requireVerifiedDoctor, async (req, res) => {
  try {
    const consultations = await Consultation.find({
      "doctorReply.doctor": req.user._id,
      status: "answered",
    })
      .populate("patient", "name")
      .sort({ "doctorReply.repliedAt": -1 });

    return res.json({
      success: true,
      count: consultations.length,
      replies: consultations.map((c) => ({
        consultationId: c._id,
        patientName: c.patient?.name || "Anonymous",
        keywords: c.keywords,
        aiSummary: c.aiSummary,
        myReply: c.doctorReply.message,
        repliedAt: c.doctorReply.repliedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;