const mongoose = require("mongoose");
const logger = require("./logger");

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    logger.warn("MONGODB_URI not set — skipping MongoDB connection (running in DB-less mode)");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    // Don't exit the process; allow the server to run without DB for local testing
  }
}

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});

module.exports = { connectDB };