/**
 * Voyage AI provider.
 *
 * Voyage is the dedicated embedding provider for RecruitIQ. The free tier
 * gives 200M tokens/month which is more than enough for screening workloads.
 *
 *   - VOYAGE_API_KEY  : required for embeddings
 *   - VOYAGE_MODEL    : default 'voyage-3-lite' (512-dim)
 *
 * Voyage has no chat endpoint, so extractResume / generateSummary /
 * generateExplanation / generateInterviewQuestions are intentionally absent.
 * aiProvider's safeCall treats missing methods as "feature not supported"
 * and returns null, which is exactly what we want.
 */

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || "";
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_INPUT_CHARS = 20000;

function isAvailable() {
  return Boolean(VOYAGE_API_KEY);
}

async function generateEmbedding(text) {
  if (!isAvailable()) return null;
  const input = String(text || "").slice(0, MAX_INPUT_CHARS).trim();
  if (!input) return null;

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input, model: VOYAGE_MODEL }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Voyage API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw new Error("Voyage API returned no embedding array");
  }
  return vec;
}

module.exports = {
  name: "voyage",
  isAvailable,
  generateEmbedding,
};
