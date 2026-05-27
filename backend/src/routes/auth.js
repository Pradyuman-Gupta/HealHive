const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ── Helper: sign JWT ─────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /auth/register
//  Body: { name, email, password, role?, specialty?, licenseNumber? }
//  role can be "patient" (default) or "doctor"
//  Doctors start unverified — admin must toggle isVerified to true
// ────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, specialty, licenseNumber } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email and password are required.",
      });
    }

    // Prevent registering as admin via the public API
    const safeRole = role === "doctor" ? "doctor" : "patient";

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists.",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: safeRole,
      specialty: safeRole === "doctor" ? specialty : undefined,
      licenseNumber: safeRole === "doctor" ? licenseNumber : undefined,
      isVerified: false,
    });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message:
        safeRole === "doctor"
          ? "Doctor account created. Awaiting admin verification before you can access the consultation board."
          : "Patient account created successfully.",
      token,
      user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  POST /auth/login
//  Body: { email, password }
// ────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required.",
      });
    }

    // Explicitly select password since schema excludes it by default
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated. Contact admin.",
      });
    }

    const token = signToken(user._id);
    user.password = undefined; // strip before sending

    return res.json({
      success: true,
      message: "Logged in successfully.",
      token,
      user,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  GET /auth/me — get currently logged-in user's profile
// ────────────────────────────────────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  PATCH /auth/me — update own profile (name, specialty, licenseNumber)
// ────────────────────────────────────────────────────────────────────────────
router.patch("/me", protect, async (req, res) => {
  try {
    const allowed = ["name", "specialty", "licenseNumber"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;