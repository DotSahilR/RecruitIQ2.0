const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const SKILLS_POOL = [
  "React", "TypeScript", "Node.js", "Python", "GraphQL", "PostgreSQL",
  "AWS", "Docker", "Kubernetes", "Tailwind", "Figma", "Next.js",
  "Rust", "Go", "Redis", "TensorFlow", "PyTorch", "Kafka",
  "JavaScript", "HTML", "CSS", "Express", "MongoDB", "MySQL", "SQL",
  "Java", "Spring Boot", "C++", "C#", "Git", "REST", "API", "OpenAI",
  "n8n", "MERN", "Redux", "Vite", "Firebase", "Azure", "GCP", "Linux",
];

const ROLES = [
  "Senior Frontend Engineer", "Full-Stack Engineer", "ML Engineer",
  "Staff Engineer", "Product Designer → Eng", "Platform Engineer",
];

function sanitizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function isSectionHeading(line) {
  return /^(summary|profile|objective|work experience|experience|employment|projects|skills|technical skills|education|certifications|achievements|contact|languages)$/i.test(line);
}

function formatResumeText(text) {
  const lines = sanitizeText(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const formatted = [];
  let bulletPending = false;

  for (const line of lines) {
    if (line === "•" || line === "-" || line === "●") {
      bulletPending = true;
      continue;
    }

    let nextLine = line
      .replace(/([a-zA-Z])(\d{2}\/\d{4})/g, "$1 $2")
      .replace(/(\d{2}\/\d{4})([A-Za-z])/g, "$1 $2")
      .replace(/\bworkows\b/gi, "workflows")
      .replace(/\bworkow\b/gi, "workflow")
      .replace(/\befciency\b/gi, "efficiency")
      .replace(/\befcient\b/gi, "efficient")
      .replace(/\brst\b/gi, "first");

    if (isSectionHeading(nextLine)) {
      if (formatted.length > 0) formatted.push("");
      formatted.push(nextLine.toUpperCase());
      continue;
    }

    if (bulletPending) {
      formatted.push(`- ${nextLine}`);
      bulletPending = false;
      continue;
    }

    const bulletCount = (nextLine.match(/•/g) || []).length;
    if (bulletCount >= 2 && /@|linkedin|github|https?:\/\//i.test(nextLine)) {
      nextLine = nextLine.replace(/\s*•\s*/g, " | ");
    } else if (bulletCount > 0) {
      nextLine = nextLine
        .replace(/\s*•\s*$/g, "")
        .replace(/\s*•\s*/g, " - ");
    }

    formatted.push(nextLine);
  }

  return formatted
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Minimum number of characters considered "real" extracted text.
// PDFs that return less than this are treated as scanned/image-only and queued for OCR.
const TEXT_OCR_THRESHOLD = 50;

/**
 * Extracts text + extraction method from a document.
 * Returns { text, method } where method is one of:
 *   'pdf'       — pdf-parse succeeded with meaningful text
 *   'pdf-empty' — PDF appears to be scanned/image-only (caller should queue OCR)
 *   'docx'      — extracted via mammoth
 *   'doc'       — best-effort raw read of legacy .doc
 *   'txt'       — plain text file
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.promises.readFile(filePath);
  console.log(`[parser] extractText file=${path.basename(filePath)} ext=${ext} bytes=${buffer.length}`);

  if (ext === ".pdf") {
    const data = await pdfParse(buffer);
    const text = sanitizeText(data.text);
    const method = text.length < TEXT_OCR_THRESHOLD ? "pdf-empty" : "pdf";
    console.log(`[parser] extractText -> method=${method} chars=${text.length}`);
    return { text, method };
  } else if (ext === ".docx") {
    const data = await mammoth.extractRawText({ buffer });
    const text = sanitizeText(data.value);
    console.log(`[parser] extractText -> method=docx chars=${text.length}`);
    return { text, method: "docx" };
  } else if (ext === ".txt") {
    const text = sanitizeText(buffer.toString("utf8"));
    console.log(`[parser] extractText -> method=txt chars=${text.length}`);
    return { text, method: "txt" };
  } else if (ext === ".doc") {
    const text = sanitizeText(buffer.toString("utf8"));
    console.log(`[parser] extractText -> method=doc chars=${text.length}`);
    return { text, method: "doc" };
  } else {
    console.warn(`[parser] extractText unsupported ext=${ext}`);
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

function makeExcerpt(text, maxLength = 420) {
  const cleaned = formatResumeText(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "No readable resume text was extracted from this file.";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

/**
 * Parses text to pull candidate metadata. It does not invent resume history,
 * education, companies, locations, or skills that are not present in the CV.
 */
function parseResumeText(text, fileName) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  console.log(`[parser] parseResumeText file=${path.basename(fileName || "unknown")} lines=${lines.length} chars=${text.length}`);
  
  // 1. Extract Name (from first line or filename)
  let name = "";
  if (lines.length > 0 && lines[0].length < 40 && !lines[0].includes("@") && !lines[0].toLowerCase().includes("resume") && !lines[0].toLowerCase().includes("curriculum")) {
    name = lines[0];
  } else {
    // Parse from file name (e.g., Jane_Doe_CV.pdf -> Jane Doe)
    const base = path.basename(fileName, path.extname(fileName));
    name = base
      .replace(/[-_]/g, " ")
      .replace(/resume/gi, "")
      .replace(/cv/gi, "")
      .trim()
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    if (!name) name = "Candidate";
  }

  // 2. Extract Email using Regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  const email = emails ? emails[0] : "";

  // 3. Extract Experience Years using Regex
  // Matches "5 years", "3 yrs", "8+ years", etc.
  const expRegex = /(\d+)\+?\s*(?:years?|yrs?|years of exp)/i;
  const expMatch = text.match(expRegex);
  let experience = 0;
  if (expMatch) {
    experience = parseInt(expMatch[1]);
  }

  // 4. Extract Skills present in our SKILLS_POOL
  const skills = [];
  for (const skill of SKILLS_POOL) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
    if (regex.test(text)) {
      skills.push(skill);
    }
  }

  // 5. Keep location blank unless a future parser can confidently extract it.
  const location = "";

  // 6. Extract Role
  let role = "";
  for (const r of ROLES) {
    const cleanRole = r.split(" → ")[0];
    const escapedRole = cleanRole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedRole}\\b`, "i");
    if (regex.test(text)) {
      role = r;
      break;
    }
  }
  // 7. Use an excerpt from the actual CV as the summary.
  const summary = makeExcerpt(text);

  console.log(`[parser] parseResumeText -> name="${name}" email=${email || "-"} experience=${experience}y skills=${skills.length}`);

  return {
    name,
    email,
    experience,
    skills,
    location,
    role,
    summary,
    history: [],
    education: [],
  };
}

module.exports = {
  extractText,
  parseResumeText,
  sanitizeText,
  formatResumeText,
  SKILLS_POOL,
  TEXT_OCR_THRESHOLD,
};
