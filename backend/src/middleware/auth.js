const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ── Verify JWT and attach user to req ────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token.",
      });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User no longer exists.",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated.",
      });
    }

    req.user = user;
    return next(); // only reaches here if everything is OK
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Authentication error: " + err.message,
    });
  }
};

// ── Role-based access control ─────────────────────────────────────────────────
// IMPORTANT: Must always be used AFTER protect middleware
// Usage: router.get("/route", protect, restrictTo("admin"), handler)
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // req.user is guaranteed to exist here because protect runs first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated.",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(" or ")}. Your role: ${req.user.role}`,
      });
    }
    return next();
  };
};

// ── Doctor must be verified ───────────────────────────────────────────────────
const requireVerifiedDoctor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Not authenticated." });
  }
  if (req.user.role !== "doctor") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Doctors only.",
    });
  }
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      error: "Your doctor account is pending verification by an admin.",
    });
  }
  return next();
};

// ── Optional auth — attaches user if token present, continues if not ──────────
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    return next();
  } catch {
    req.user = null;
    return next();
  }
};

module.exports = { protect, restrictTo, requireVerifiedDoctor, optionalAuth };