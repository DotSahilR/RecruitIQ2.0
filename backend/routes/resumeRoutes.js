const express = require("express");
const multer = require("multer");
const path = require("path");
const resumeController = require("../controllers/resumeController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// Configure Multer storage inside backend/uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Limit file types to PDF, DOC, DOCX, TXT
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".doc", ".docx", ".txt"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, and TXT are supported."));
    }
  }
});

// Route matches POST /api/resumes/upload
// Standard field name is 'resumes' (accepts array of files)
router.post("/upload", requireAuth, upload.array("resumes", 50), resumeController.uploadResumes);

module.exports = router;
