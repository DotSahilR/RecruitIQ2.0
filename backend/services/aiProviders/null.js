/**
 * Null AI provider — used when AI_PROVIDER is misconfigured.
 * All methods are no-ops returning null. Keeps the system fully functional
 * via deterministic regex fallbacks per the "core ATS independence" rule.
 */

module.exports = {
  isAvailable: () => false,
  extractResume: async () => null,
  generateSummary: async () => null,
  generateExplanation: async () => null,
  generateInterviewQuestions: async () => null,
  generateEmbedding: async () => null,
};
