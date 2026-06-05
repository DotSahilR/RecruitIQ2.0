/**
 * Groq Cloud provider implementation.
 *
 * Uses Groq's OpenAI-compatible REST endpoint via native fetch — no SDK needed.
 * All public methods throw on hard failure; the aiProvider façade catches and
 * returns null so callers can fall back to deterministic logic.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.1-8b-instant";

// Llama 3.1 8B context window is 128K but the free tier is heavily rate-limited.
// Cap input at ~20K chars (~5K tokens) to stay safe and predictable.
const MAX_INPUT_CHARS = 20000;

function getConfig() {
  return {
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
  };
}

function isAvailable() {
  return Boolean(getConfig().apiKey);
}

function clip(text) {
  const s = String(text || "");
  return s.length > MAX_INPUT_CHARS ? s.slice(0, MAX_INPUT_CHARS) : s;
}

/**
 * Low-level chat completion call. Returns the assistant message content as a string.
 * Throws on non-2xx response or network error.
 */
async function chat({ system, user, jsonMode = false, temperature = 0.2, maxTokens = 1500 }) {
  const { apiKey, model } = getConfig();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty content");
  return content;
}

function tryParseJson(raw) {
  if (!raw) return null;
  // Llama sometimes wraps JSON in ```json ... ``` fences even in JSON mode.
  const cleaned = String(raw).trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Last-resort: try to find the first balanced { ... } block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) { /* fallthrough */ }
    }
    throw new Error(`JSON parse failed: ${err.message}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a precise resume parser. Extract structured data from the resume text the user provides.
Return ONLY a single JSON object that matches this exact schema. Use null for missing fields and [] for empty arrays.
Do NOT invent or guess information that is not present in the resume.

Schema:
{
  "name": string|null,
  "email": string|null,
  "phone": string|null,
  "currentRole": string|null,
  "experienceYears": number|null,
  "summary": string|null,
  "skills": string[],
  "workHistory": [
    {
      "company": string,
      "role": string,
      "startDate": "YYYY-MM"|null,
      "endDate": "YYYY-MM"|"Present"|null,
      "description": string|null
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "fieldOfStudy": string|null,
      "graduationYear": number|null
    }
  ]
}`;

async function extractResume(text) {
  const content = await chat({
    system: EXTRACT_SYSTEM,
    user: `Resume text:\n\n${clip(text)}`,
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 2000,
  });
  return tryParseJson(content);
}

async function generateSummary(candidate) {
  const content = await chat({
    system:
      "You write concise, factual recruiter summaries. 2-3 sentences max. " +
      "Plain text, no markdown, no preamble.",
    user:
      `Write a short summary of this candidate based ONLY on the data below.\n\n` +
      `Name: ${candidate.name || "Unknown"}\n` +
      `Current role: ${candidate.role || candidate.currentRole || "n/a"}\n` +
      `Years of experience: ${candidate.experience ?? "n/a"}\n` +
      `Top skills: ${(candidate.skills || []).slice(0, 12).join(", ") || "n/a"}\n` +
      `Resume excerpt:\n${clip(candidate.raw_text || candidate.summary || "")}`,
    temperature: 0.3,
    maxTokens: 200,
  });
  return content.trim();
}

async function generateExplanation(candidate, job, score) {
  const content = await chat({
    system:
      `You are a recruiting analyst. Compare a candidate to a job description and ` +
      `return a JSON object with this exact shape: ` +
      `{"strengths":string[],"weaknesses":string[],"explanation":string,"recommendation":string}. ` +
      `recommendation must be one of: "Strong fit","Possible fit","Weak fit","Not a fit". ` +
      `Keep each array to 3-5 items, each item under 15 words. explanation is 2-3 sentences.`,
    user:
      `Candidate:\nName: ${candidate.name}\nRole: ${candidate.role || ""}\n` +
      `Experience: ${candidate.experience} years\nSkills: ${(candidate.skills || []).join(", ")}\n` +
      `Summary: ${clip(candidate.summary || candidate.raw_text || "")}\n\n` +
      `Job: ${job.title}\nDescription:\n${clip(job.description || "")}\n\n` +
      `Match score: ${score}/100`,
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 800,
  });
  return tryParseJson(content);
}

async function generateInterviewQuestions(candidate, job) {
  const content = await chat({
    system:
      `You generate interview questions tailored to a candidate's resume and a job description. ` +
      `Return JSON: {"technical":string[],"behavioral":string[],"riskAreas":string[]}. ` +
      `5-7 items per array. Each question is one sentence. riskAreas lists gaps or concerns to probe.`,
    user:
      `Candidate skills: ${(candidate.skills || []).join(", ")}\n` +
      `Candidate experience: ${candidate.experience} years\n` +
      `Candidate role: ${candidate.role || ""}\n` +
      `Resume excerpt:\n${clip(candidate.raw_text || candidate.summary || "")}\n\n` +
      `Job: ${job.title}\n${clip(job.description || "")}`,
    jsonMode: true,
    temperature: 0.4,
    maxTokens: 1200,
  });
  return tryParseJson(content);
}

async function generateEmbedding(_text) {
  // Groq does not offer an embedding endpoint. Phase 4 will wire in a separate
  // embedding provider (likely a hosted free service or local model).
  throw new Error("Groq has no embedding endpoint — configure a separate embedding provider in Phase 4");
}

module.exports = {
  isAvailable,
  extractResume,
  generateSummary,
  generateExplanation,
  generateInterviewQuestions,
  generateEmbedding,
};
