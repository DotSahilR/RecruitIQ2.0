const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Initialize DB (this automatically fires pool connection and table creation in db.js)
const pool = require("./db");

const resumeRoutes = require("./routes/resumeRoutes");
const jdRoutes = require("./routes/jdRoutes");
const analysisRoutes = require("./routes/analysisRoutes");
const authRoutes = require("./routes/authRoutes");
const pipelineRoutes = require("./routes/pipelineRoutes");
const notesRoutes = require("./routes/notesRoutes");
const ocrWorker = require("./services/ocrWorker");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const CORS_ORIGIN = process.env.CORS_ORIGIN || FRONTEND_URL;
const allowedOrigins = CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

// Enable CORS for frontend communications
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded resumes statically if needed
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logger — every request gets a one-liner once it completes.
// Helpful for tracing which endpoint the frontend is hitting and how long it took.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const userTag = req.user ? `user=${req.user.id}` : "anon";
    const status = res.statusCode;
    const marker = status >= 500 ? "✗" : status >= 400 ? "⚠" : "✓";
    console.log(`[http] ${marker} ${req.method} ${req.originalUrl} ${userTag} -> ${status} (${ms}ms)`);
  });
  next();
});

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/jd", jdRoutes);
app.use("/api", pipelineRoutes);
app.use("/api", notesRoutes);
app.use("/api", analysisRoutes); // Exposes /api/analyze, /api/results, /api/candidates/:id

// Health check (for uptime monitors / load balancers)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", name: "RecruitIQ API" });
});

// Root Route
app.get("/", (req, res) => {
  res.json({
    name: "RecruitIQ AI Resume Screening API",
    version: "1.0.0",
    status: "online"
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err.stack || err.message);
  res.status(500).json({ error: err.message || "An unexpected error occurred." });
});

// Boot Server
app.listen(PORT, () => {
  console.log("\n==========================================================");
  console.log(`🚀 RECRUITIQ API SERVER RUNNING ON PORT: http://localhost:${PORT}`);
  console.log(`🌐 Frontend allowed from: ${allowedOrigins.join(", ")}`);
  console.log(`📁 Uploads stored in: ${path.join(__dirname, "uploads")}`);
  console.log("==========================================================\n");

  // Start the OCR background worker (Phase 2). Polls every 5s for queued jobs.
  // Disable with OCR_WORKER=off for tests or read-only deployments.
  if (process.env.OCR_WORKER !== "off") {
    ocrWorker.start();
  }
});

// Graceful shutdown — terminate tesseract worker so process exits cleanly.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`\n[${signal}] shutting down…`);
    try {
      await ocrWorker.stop();
    } catch (_) {
      // ignore
    }
    process.exit(0);
  });
}
