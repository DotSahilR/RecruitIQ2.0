const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const pool = require("./db");
const datasetLoader = require("./services/datasetLoader");
const embeddingService = require("./services/embeddingService");
const datasetRoutes = require("./routes/datasetRoutes");
const jdRoutes = require("./routes/jdRoutes");
const rankRoutes = require("./routes/rankRoutes");

const app = express();
const PORT = process.env.PORT || 5002;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const CORS_ORIGIN = process.env.CORS_ORIGIN || FRONTEND_URL;
const allowedOrigins = CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const marker = res.statusCode >= 500 ? "✗" : res.statusCode >= 400 ? "⚠" : "✓";
    console.log(`[http] ${marker} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use("/api/dataset", datasetRoutes);
app.use("/api/jd", jdRoutes);
app.use("/api", rankRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    name: "RecruitIQ AI 2.0",
    candidatesLoaded: global.candidatesLoaded || 0,
    embeddingsReady: global.embeddingsReady || false,
    datasetLoaded: global.datasetLoaded || false
  });
});

app.get("/api/status", async (req, res) => {
  const result = await pool.query("SELECT COUNT(*) as count FROM candidates");
  const embedResult = await pool.query("SELECT COUNT(*) as count FROM candidates WHERE embedding IS NOT NULL");
  res.json({
    candidatesLoaded: parseInt(result.rows[0].count),
    embeddingsGenerated: parseInt(embedResult.rows[0].count),
    datasetLoaded: global.datasetLoaded || false,
    embeddingsReady: global.embeddingsReady || false
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "RecruitIQ AI 2.0 - Candidate Intelligence Platform",
    version: "2.0.0",
    status: "online"
  });
});

app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err.stack || err.message);
  res.status(500).json({ error: err.message || "An unexpected error occurred." });
});

async function startup() {
  try {
    await pool.initPromise;

    const count = await datasetLoader.loadDataset();
    global.candidatesLoaded = count;
    global.datasetLoaded = true;

    app.listen(PORT, () => {
      console.log(`\nServer running on http://localhost:${PORT}`);
      console.log(`Frontend allowed from: ${allowedOrigins.join(", ")}`);

      embeddingService.generateAllEmbeddings().then(() => {
        global.embeddingsReady = true;
        console.log("Embeddings generation complete. System ready for ranking.");
      });
    });

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => {
        console.log(`\n[${signal}] shutting down...`);
        process.exit(0);
      });
    }
  } catch (err) {
    console.error("Startup failed:", err.message);
    app.listen(PORT, () => {
      console.log(`\nServer running on http://localhost:${PORT} (with startup errors)`);
    });
  }
}

startup();
