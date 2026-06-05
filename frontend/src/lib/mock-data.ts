export type Candidate = {
  id: string;
  rank: number;
  name: string;
  role: string;
  location: string;
  score: number;
  experience: number; // years
  email: string;
  matchingSkills: string[];
  missingSkills: string[];
  education: { degree: string; school: string; year: number }[];
  history: { role: string; company: string; period: string; bullets: string[] }[];
  summary: string;
  breakdown: { label: string; value: number }[];
};

const SKILLS_POOL = [
  "React", "TypeScript", "Node.js", "Python", "GraphQL", "PostgreSQL",
  "AWS", "Docker", "Kubernetes", "Tailwind", "Figma", "Next.js",
  "Rust", "Go", "Redis", "TensorFlow", "PyTorch", "Kafka",
];

const NAMES = [
  ["Amara", "Okonkwo"], ["Lior", "Bensimon"], ["Mei", "Tanaka"],
  ["Sasha", "Volkov"], ["Idris", "Faulkner"], ["Noor", "Rahimi"],
  ["Theo", "Marchetti"], ["Inés", "Vidal"], ["Kenji", "Park"],
  ["Anouk", "Visser"], ["Rafael", "Cruz"], ["Yara", "Haddad"],
];

const ROLES = [
  "Senior Frontend Engineer", "Full-Stack Engineer", "ML Engineer",
  "Staff Engineer", "Product Designer → Eng", "Platform Engineer",
];

const CITIES = ["Berlin", "Lisbon", "Toronto", "Singapore", "Brooklyn", "Mexico City"];

function seeded(i: number) {
  return (Math.sin(i * 9301 + 49297) * 233280) % 1;
}

export const CANDIDATES: Candidate[] = NAMES.map((n, i) => {
  const r = Math.abs(seeded(i));
  const score = Math.round(98 - i * (3 + r * 2));
  const exp = Math.round(3 + r * 12);
  const matching = SKILLS_POOL.slice(i % 4, (i % 4) + 5);
  const missing = SKILLS_POOL.slice((i + 7) % SKILLS_POOL.length, ((i + 7) % SKILLS_POOL.length) + 2);
  return {
    id: `cand-${i + 1}`,
    rank: i + 1,
    name: `${n[0]} ${n[1]}`,
    role: ROLES[i % ROLES.length],
    location: CITIES[i % CITIES.length],
    score,
    experience: exp,
    email: `${n[0].toLowerCase()}.${n[1].toLowerCase()}@mail.co`,
    matchingSkills: matching,
    missingSkills: missing,
    education: [
      { degree: "M.Sc. Computer Science", school: "ETH Zürich", year: 2018 - (i % 4) },
      { degree: "B.Sc. Software Engineering", school: "University of Toronto", year: 2015 - (i % 4) },
    ],
    history: [
      {
        role: "Senior Engineer",
        company: "Northwind Labs",
        period: `${2021 - (i % 3)} — Present`,
        bullets: [
          "Led migration of monolith to event-driven services on Kafka.",
          "Shipped design-system v2 used by 14 product teams.",
          "Mentored 6 engineers; ran weekly architecture reviews.",
        ],
      },
      {
        role: "Engineer II",
        company: "Mercator & Co.",
        period: `${2018 - (i % 3)} — ${2021 - (i % 3)}`,
        bullets: [
          "Built realtime analytics pipeline processing 2B events/day.",
          "Reduced p95 latency by 38% through query plan refactors.",
        ],
      },
    ],
    summary:
      "Builds calm, high-leverage systems. Equal parts product instinct and infrastructure rigor. Prefers writing things down before writing them up.",
    breakdown: [
      { label: "Skills match", value: Math.min(100, score + 2) },
      { label: "Experience fit", value: Math.max(40, score - 8) },
      { label: "Domain relevance", value: Math.max(50, score - 4) },
      { label: "Education", value: Math.max(60, score - 12) },
      { label: "Recency", value: Math.min(100, score + 5) },
    ],
  };
});

export function getCandidate(id: string) {
  return CANDIDATES.find((c) => c.id === id);
}
