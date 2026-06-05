/**
 * AI provider façade.
 *
 * Per architecture decision §1, *all* AI calls in the codebase MUST go through
 * this module. No controller or service should ever import an SDK directly.
 *
 * Switching providers is a matter of dropping a new file into
 * services/aiProviders/<name>.js that implements the same interface, then
 * setting AI_PROVIDER=<name>.
 *
 * Required provider interface:
 *   - isAvailable(): boolean           — true if configured (e.g. API key set)
 *   - extractResume(text)              — returns structured candidate JSON or null
 *   - generateSummary(candidate)       — short HR-facing blurb
 *   - generateExplanation(c, j, score) — { strengths, weaknesses, explanation, recommendation }
 *   - generateInterviewQuestions(c, j) — { technical, behavioral, riskAreas }
 *   - generateEmbedding(text)          — Float32Array | number[] (vector)
 *
 * Every method must catch its own errors and return null on failure.
 * Callers rely on `null` to trigger the deterministic fallback path.
 */

const PROVIDER_NAME = (process.env.AI_PROVIDER || "groq").toLowerCase();
const EMBED_PROVIDER_NAME = (process.env.EMBED_PROVIDER || "voyage").toLowerCase();

let provider;
try {
  provider = require(`./aiProviders/${PROVIDER_NAME}`);
} catch (err) {
  console.error(
    `[ai] Unknown provider "${PROVIDER_NAME}". AI features will be disabled. ` +
    `Fix by setting AI_PROVIDER in .env or adding services/aiProviders/${PROVIDER_NAME}.js`
  );
  provider = require("./aiProviders/null");
}

let embedProvider;
try {
  embedProvider = require(`./aiProviders/${EMBED_PROVIDER_NAME}`);
} catch (err) {
  console.error(
    `[ai] Embed provider "${EMBED_PROVIDER_NAME}" not found. Embeddings disabled. ` +
    `Fix by setting EMBED_PROVIDER in .env or adding services/aiProviders/${EMBED_PROVIDER_NAME}.js`
  );
  embedProvider = require("./aiProviders/null");
}

function isAvailable() {
  try {
    return Boolean(provider.isAvailable && provider.isAvailable());
  } catch (_) {
    return false;
  }
}

function isEmbedAvailable() {
  try {
    return Boolean(embedProvider.isAvailable && embedProvider.isAvailable());
  } catch (_) {
    return false;
  }
}

async function safeCall(fnName, args, fallback = null) {
  if (!provider[fnName]) return fallback;
  if (!isAvailable()) return fallback;
  try {
    const result = await provider[fnName](...args);
    return result === undefined ? fallback : result;
  } catch (err) {
    console.error(`[ai] ${PROVIDER_NAME}.${fnName} failed: ${err.message || err}`);
    return fallback;
  }
}

async function safeEmbedCall(text, fallback = null) {
  if (!embedProvider.generateEmbedding) return fallback;
  if (!isEmbedAvailable()) return fallback;
  try {
    const result = await embedProvider.generateEmbedding(text);
    return result === undefined ? fallback : result;
  } catch (err) {
    console.error(`[ai] ${EMBED_PROVIDER_NAME}.generateEmbedding failed: ${err.message || err}`);
    return fallback;
  }
}

module.exports = {
  name: PROVIDER_NAME,
  embedName: EMBED_PROVIDER_NAME,
  isAvailable,
  isEmbedAvailable,
  extractResume: (text) => safeCall("extractResume", [text]),
  generateSummary: (candidate) => safeCall("generateSummary", [candidate]),
  generateExplanation: (candidate, job, score) =>
    safeCall("generateExplanation", [candidate, job, score]),
  generateInterviewQuestions: (candidate, job) =>
    safeCall("generateInterviewQuestions", [candidate, job]),
  generateEmbedding: (text) => safeEmbedCall(text),
};
