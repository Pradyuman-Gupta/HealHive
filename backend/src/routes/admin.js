const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Consultation = require("../models/Consultation");
const { protect, restrictTo } = require("../middleware/auth");
const { getSpecialtyLabel } = require("../services/specialtyDetector");

const router = express.Router();

// ── Auth guard applied per-route (not globally) ───────────────────────────────
// This avoids blocking the public /create-admin bootstrap route
const adminOnly = [protect, restrictTo("admin")];

// ────────────────────────────────────────────────────────────────────────────
//  POST /admin/create-admin
//  PUBLIC — no auth needed (bootstrap only, creates first admin)
//  Only works if zero admins exist in the database yet
// ────────────────────────────────────────────────────────────────────────────
router.post("/create-admin", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email and password are required.",
      });
    }

    // Safety check — only allow if no admin exists yet
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(403).json({
        success: false,
        error: "An admin already exists. This route is disabled.",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: "admin",
      isVerified: true,
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      token,
      user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/users
//  Query: ?role=doctor  ?verified=false
// ────────────────────────────────────────────────────────────────────────────
router.get("/users", adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.verified !== undefined)
      filter.isVerified = req.query.verified === "true";

    const users = await User.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, count: users.length, users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/users/pending-doctors
// ────────────────────────────────────────────────────────────────────────────
router.get("/users/pending-doctors", adminOnly, async (req, res) => {
  try {
    const doctors = await User.find({
      role: "doctor",
      isVerified: false,
      isActive: true,
    }).sort({ createdAt: -1 });

    return res.json({ success: true, count: doctors.length, doctors });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  PATCH /admin/users/:id/verify-doctor
//  Body: { isVerified: true }
// ────────────────────────────────────────────────────────────────────────────
router.patch("/users/:id/verify-doctor", adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }
    if (user.role !== "doctor") {
      return res.status(400).json({ success: false, error: "This user is not a doctor." });
    }

    const isVerified =
      req.body.isVerified !== undefined ? Boolean(req.body.isVerified) : !user.isVerified;

    user.isVerified = isVerified;
    user.verifiedAt = isVerified ? new Date() : null;
    user.verifiedBy = isVerified ? req.user._id : null;
    await user.save();

    return res.json({
      success: true,
      message: isVerified
        ? `Dr. ${user.name} has been verified. They can now access the consultation board.`
        : `Dr. ${user.name}'s verification has been revoked.`,
      user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  PATCH /admin/users/:id/toggle-active
// ────────────────────────────────────────────────────────────────────────────
router.patch("/users/:id/toggle-active", adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found." });

    user.isActive = !user.isActive;
    await user.save();

    return res.json({
      success: true,
      message: `User ${user.name} has been ${user.isActive ? "activated" : "deactivated"}.`,
      user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  DELETE /admin/users/:id
// ────────────────────────────────────────────────────────────────────────────
router.delete("/users/:id", adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found." });
    return res.json({ success: true, message: `User ${user.name} deleted.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/consultations
//  Query: ?status=pending  ?specialty=neurology
// ────────────────────────────────────────────────────────────────────────────
router.get("/consultations", adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.specialty) filter.detectedSpecialty = req.query.specialty;

    const consultations = await Consultation.find(filter)
      .populate("patient", "name email")
      .populate("doctorReply.doctor", "name specialty")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      count: consultations.length,
      consultations: consultations.map((c) => ({
        id: c._id,
        patient: c.patient,
        keywords: c.keywords,
        aiSummary: c.aiSummary,
        detectedSpecialty: c.detectedSpecialty,
        specialtyLabel: getSpecialtyLabel(c.detectedSpecialty),
        status: c.status,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        doctorReply: c.doctorReply?.message
          ? {
              doctor: c.doctorReply.doctor,
              message: c.doctorReply.message,
              repliedAt: c.doctorReply.repliedAt,
            }
          : null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /admin/stats
// ────────────────────────────────────────────────────────────────────────────
router.get("/stats", adminOnly, async (req, res) => {
  try {
    const [
      totalUsers,
      totalPatients,
      totalDoctors,
      verifiedDoctors,
      pendingDoctors,
      totalConsultations,
      pendingConsultations,
      answeredConsultations,
      expiredConsultations,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "patient" }),
      User.countDocuments({ role: "doctor" }),
      User.countDocuments({ role: "doctor", isVerified: true }),
      User.countDocuments({ role: "doctor", isVerified: false }),
      Consultation.countDocuments(),
      Consultation.countDocuments({ status: "pending" }),
      Consultation.countDocuments({ status: "answered" }),
      Consultation.countDocuments({ status: "expired" }),
    ]);

    return res.json({
      success: true,
      stats: {
        users: { total: totalUsers, patients: totalPatients, doctors: totalDoctors },
        doctors: { verified: verifiedDoctors, pendingVerification: pendingDoctors },
        consultations: {
          total: totalConsultations,
          pending: pendingConsultations,
          answered: answeredConsultations,
          expired: expiredConsultations,
          answerRate:
            totalConsultations > 0
              ? `${Math.round((answeredConsultations / totalConsultations) * 100)}%`
              : "0%",
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;