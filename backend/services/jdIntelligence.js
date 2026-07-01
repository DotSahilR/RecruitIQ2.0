const TECHNICAL_SIGNALS = [
  "retrieval", "ranking", "recommendation", "vector database", "evaluation",
  "embedding", "machine learning", "deep learning", "nlp", "natural language",
  "search", "information retrieval", "pipeline", "inference", "model deployment",
  "llm", "generative ai", "transformer", "attention", "semantic",
  "classification", "regression", "clustering", "recommender", "personalization",
  "a/b testing", "experimentation", "metrics", "precision", "recall",
  "pytorch", "tensorflow", "scikit-learn", "xgboost", "gradient boosting",
  "data mining", "feature engineering", "feature extraction", "dimensionality reduction",
  "time series", "anomaly detection", "computer vision", "speech recognition",
  "reinforcement learning", "knowledge graph", "graph neural network", "rag"
];

const FOUNDER_SIGNALS = [
  "startup", "ownership", "builder", "ship fast", "product thinking",
  "0 to 1", "from scratch", "built", "launched", "created", "founded",
  "co-founded", "early-stage", "growth", "scaling", "lean", "agile",
  "mvp", "prototype", "product-market fit", "customer development",
  "user research", "design thinking", "cross-functional", "wore many hats",
  "fast-paced", "autonomous", "self-starter", "ownership mentality",
  "entrepreneur", "entrepreneurial", "founder", "bootstrapped",
  "platform", "marketplace", "ecosystem", "side project"
];

const HIREABILITY_SIGNALS = [
  "relocation", "willing to relocate", "remote", "hybrid", "onsite",
  "notice period", "immediate", "available", "open to work",
  "work authorization", "visa", "green card", "citizen",
  "relocate", "relocating", "willing to move"
];

const NEGATIVE_SIGNALS = [
  "consultant", "consulting", "freelance", "contractor",
  "research only", "academic", "professor", "phd only",
  "no production", "theoretical", "intern only", "junior",
  "entry level", "fresher", "trainee", "internship"
];

function extractSignals(text) {
  const lower = text.toLowerCase();

  const technicalSignals = TECHNICAL_SIGNALS.filter(s => lower.includes(s));
  const founderSignals = FOUNDER_SIGNALS.filter(s => lower.includes(s));
  const hireabilitySignals = HIREABILITY_SIGNALS.filter(s => lower.includes(s));
  const negativeSignals = NEGATIVE_SIGNALS.filter(s => lower.includes(s));

  return {
    technicalSignals: [...new Set(technicalSignals)],
    founderSignals: [...new Set(founderSignals)],
    hireabilitySignals: [...new Set(hireabilitySignals)],
    negativeSignals: [...new Set(negativeSignals)],
    allSignals: [
      ...technicalSignals.map(s => ({ type: "technical", signal: s })),
      ...founderSignals.map(s => ({ type: "founder", signal: s })),
      ...hireabilitySignals.map(s => ({ type: "hireability", signal: s })),
      ...negativeSignals.map(s => ({ type: "negative", signal: s }))
    ]
  };
}

module.exports = { extractSignals };
