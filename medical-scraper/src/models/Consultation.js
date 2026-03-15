const mongoose = require("mongoose");

/**
 * Consultation lifecycle:
 *
 *   pending   → patient posted, waiting for a doctor to reply
 *   answered  → exactly one doctor has replied, channel is closed
 *   expired   → no doctor replied within 72 hours
 *   cancelled → patient cancelled before a reply
 */
const consultationSchema = new mongoose.Schema(
  {
    // ── Who posted it ────────────────────────────────────────────────────────
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Original scraper input ───────────────────────────────────────────────
    keywords: {
      type: [String],
      required: true,
    },

    // ── AI-generated summary (2-3 lines from scraper results) ────────────────
    aiSummary: {
      type: String,
      required: true,
    },

    // ── Full scraper results snapshot ────────────────────────────────────────
    scraperResults: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    // ── Detected medical specialty (routes to right doctors) ─────────────────
    detectedSpecialty: {
      type: String,
      required: true,
      lowercase: true,
      // e.g. "neurology", "cardiology", "general"
    },

    // ── Status ───────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "answered", "expired", "cancelled"],
      default: "pending",
    },

    // ── Doctor's single reply ────────────────────────────────────────────────
    doctorReply: {
      doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      message: {
        type: String,
        default: null,
      },
      repliedAt: {
        type: Date,
        default: null,
      },
    },

    // ── Auto-expire after 72 hours if no reply ───────────────────────────────
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 72 * 60 * 60 * 1000),
    },

    // ── Track which doctors have seen this post ───────────────────────────────
    viewedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// ── Index for fast specialty-based board queries ─────────────────────────────
consultationSchema.index({ detectedSpecialty: 1, status: 1, createdAt: -1 });
consultationSchema.index({ patient: 1, createdAt: -1 });
consultationSchema.index({ "doctorReply.doctor": 1 });

module.exports = mongoose.model("Consultation", consultationSchema);