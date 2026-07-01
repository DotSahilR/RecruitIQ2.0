# RecruitIQ 2.0 — Product Requirements Document

## 1. Product Overview

RecruitIQ is a fully local Candidate Intelligence Platform built for the Redrob AI Challenge. It ranks 100,000+ candidate profiles against a given job description using four scoring dimensions — Expertise, Potential, Readiness, Credibility — with no external AI APIs required.

### 1.1 Goals
- Rank 100k candidates within 5 minutes (achieved: 43-74s)
- Fully local execution (no cloud APIs, no external AI)
- Explainable, recruiter-friendly scoring with transparent reasoning
- Honeypot/fake profile detection
- Interactive weight tuning for recruiters

### 1.2 Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, React Router |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL (JSONB for flexible profile storage) |
| Embeddings | all-MiniLM-L6-v2 via @xenova/transformers (ONNX, 384-dim) |
| Styling | Brutalist-meets-archive theme (Fraunces, Inter Tight, JetBrains Mono) |

---

## 2. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  React SPA  │────▶│  Express API │────▶│ PostgreSQL │
│  :8080      │     │  :5002       │     │            │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
                    ┌──────┴───────┐
                    │  @xenova/    │
                    │ transformers │
                    └──────────────┘
```

### 2.1 Frontend Routes
| Route | Page | Purpose |
|-------|------|---------|
| `/` | HomePage | JD input, scoring explanation, trigger analysis |
| `/dashboard?sessionId=` | DashboardPage | Ranked results table, JD display, CSV export |
| `/candidate/:id` | CandidatePage | Full candidate intelligence profile |

### 2.2 Backend API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/jd/analyze` | Extract signals + generate embedding from JD text |
| GET | `/api/jd/analyses/:id` | Fetch full JD analysis |
| POST | `/api/rank` | Run full ranking pipeline |
| GET | `/api/results/top?count=` | Get top N ranked candidates |
| GET | `/api/results` | Paginated, filterable results |
| GET | `/api/export/csv` | Download CSV of top 500 |
| POST | `/api/rerank` | Re-rank with different weights (no re-scoring) |
| GET | `/api/sessions` | List past ranking sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/compare?a=&b=` | Compare two candidates side-by-side |
| GET | `/api/dataset/candidates/:id` | Full candidate profile |
| GET | `/api/dataset/stats` | System statistics |
| GET | `/api/status` | System readiness status |
| GET | `/api/health` | Health check |

---

## 3. Scoring Model

### 3.1 Weight Distribution (95-point model)

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Expertise** (formerly Capability) | 40% | Technical skill match, semantic JD alignment, production experience |
| **Potential** (formerly Founder Fit) | 20% | Startup history, ownership signals, product thinking, scrappiness |
| **Readiness** (formerly Hireability) | 20% | Availability, notice period, recruiter engagement, stability |
| **Credibility** (formerly Trust) | 15% | Career evidence, certification validation, signal consistency |

**Confidence Score** is displayed separately (5%) and does not affect ranking.

### 3.2 Overall Score Calculation
```
overall = (expertise * 0.40 + potential * 0.20 + readiness * 0.20 + credibility * 0.15) / 0.95
if honeypot: overall *= 0.1
```

### 3.3 Expertise Engine (capabilityEngine.js)
| Component | Weight | Implementation |
|-----------|--------|---------------|
| Semantic Match | 40% | Cosine similarity (candidate embedding vs JD embedding) via all-MiniLM-L6-v2 |
| Skill Match | 25% | Fuzzy match of JD technical signals against candidate skill names |
| Production Experience | 15% | Keyword counting (production, deployed, k8s, docker, api, pipeline, etc.) |
| Career Velocity | 10% | Title progression through 13 levels (intern → ceo) |
| Assessment Validation | 10% | Average of Redrob skill assessment scores |
| Experience Bonus | +5 flat | If years_of_experience between 3-15 |

### 3.4 Potential Engine (founderFitEngine.js)
| Component | Weight | Implementation |
|-----------|--------|---------------|
| Early-Stage/Startup Exp | 35% | Company size scoring (1-10=100pts, 11-50=95, 51-200=80, etc.) + bonuses for concentration |
| Ownership & Initiative | 25% | Keyword matching (built, launched, created, led, founded, etc.) |
| Product Thinking | 20% | Keyword matching (marketplace, recommendation, UX, growth, retention, etc.) |
| Scrappiness & Breadth | 15% | Keywords (full stack, cross-functional, end-to-end, scrappy) |
| Startup Journey Signals | 5% | Funding, exit, team-building, business impact keywords |
| Founder Mentality Bonus | up to +15 | Multi-role at small co + seniority + ownership + product thinking |

### 3.5 Readiness Engine (hireabilityEngine.js)
Base score: 20. Components:
- Open to Work flag (+25 / -5 / +10 unknown)
- Last Active Date (within 7d=+18, 30d=+12, 90d=+5, older=-8)
- Recruiter Response Rate (≥80%=+15, ≥60%=+10, etc.)
- Interview Completion Rate (≥80%=+12, ≥50%=+6, <50%=-5)
- Offer Acceptance Rate (≥80%=+10, ≥50%=+5, <50%=-5)
- Notice Period (≤15d=+25, ≤30d=+20, ≤45d=+10, ≤60d=+5, ≤90d=0, >90d=-15)
- Willing to Relocate (+5)
- Career Stability (avg tenure ≥3yr=+10, ≥1.5yr=+5, <0.8yr with 3+ roles=-8)
- Employment Gaps (-5 per gap >180d)
- Market Demand (recruiter saves, profile views, search appearances)

### 3.6 Credibility Engine (trustEngine.js)
Base score: 40. Components:
- Skills-Career Evidence (40%): ratio of skills appearing in career history text
- Assessment Validation (15%): Redrob skill assessment averages
- Certification Validation (up to +8): +2 per certification
- Signal Consistency (deductions): missing summary, non-relevant edu, gaps, senior title + minimal history
- Market Validation (up to +20): recruiter saves (12/8/4pt), search appearances (5/2pt), profile views (3/1pt)
- Profile Completeness Bonus (+3)

### 3.7 Confidence Engine (confidenceEngine.js)
NOT part of ranking score. Measures data quality: profile completeness, career depth, skills depth, education, assessments, email/phone verification, etc.

---

## 4. Honeypot Detection

### 4.1 Detection Rules
| Rule | Points | Logic |
|------|--------|-------|
| Overlapping non-current roles | +15 | Two jobs overlapping in time, neither current |
| Skill duration > total experience | +10 | Skill years exceed total career years by >2yr |
| Career regression | +8 | Title level drops significantly (director → associate) |
| Contradictory skill levels | +5 | "entry level" + "architect" in same profile |
| Unrealistic experience | +10 | >30yr exp with <3 roles |
| Too many expert skills | +5 | >15 skills marked "expert" |
| Job-hopping | +8 | ≥5 roles averaging <0.5yr each |
| Unrealistic progression | +10 | Intern/Junior → VP/CTO in <4yr |

### 4.2 Scoring
- Threshold: suspicionScore ≥ 20 triggers `isSuspicious = true`
- Confidence: normalized suspicionScore to 0-1 range
- Penalty: overall_score multiplied by 0.1 (effectively bottom of rankings)
- All flagged candidates have rank = 0

---

## 5. Data Model

### 5.1 Database Tables

#### candidates
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| candidate_id | VARCHAR(20) UNIQUE | e.g., CAND_0000001 |
| profile | JSONB | Name, headline, summary, location, experience, company |
| career_history | JSONB[] | Array of roles with company, title, dates, description |
| education | JSONB[] | Array of degrees, institutions |
| skills | JSONB[] | Array of skill objects (name, proficiency, endorsements, duration) |
| certifications | JSONB[] | Array of certifications |
| languages | JSONB[] | Array of language proficiencies |
| redrob_signals | JSONB | Platform engagement data |
| embedding | FLOAT[] | 384-dim vector |
| is_honeypot | BOOLEAN | Suspicious flag |
| honeypot_confidence | FLOAT | 0-1 |
| honeypot_reasons | JSONB[] | Reason strings |
| capability_score | FLOAT | 0-100 |
| founder_fit_score | FLOAT | 0-100 |
| hireability_score | FLOAT | 0-100 |
| trust_score | FLOAT | 0-100 |
| overall_score | FLOAT | Weighted composite |
| confidence_score | FLOAT | 0-100 |
| rank | INT | Ranking position |
| reasoning | TEXT | Generated explanation |
| features | JSONB | Per-engine scores + reasons |

#### jd_analyses
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| title | TEXT | JD title |
| description | TEXT | Full JD text |
| embedding | FLOAT[] | 384-dim JD embedding |
| technical_signals | JSONB | Extracted tech keywords |
| founder_signals | JSONB | Startup keywords |
| hireability_signals | JSONB | Availability keywords |
| negative_signals | JSONB | Bad-fit signals |

#### ranking_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| jd_id | INT FK | Reference to jd_analyses |
| weights | JSONB | Weight configuration used |
| candidate_count | INT | Total ranked |
| top_score | FLOAT | Highest overall |
| created_at | TIMESTAMP | |

---

## 6. Dataset

### 6.1 Source
- File: `dataset/candidates.jsonl` (100,000 lines)
- Schema: `dataset/candidate_schema.json`

### 6.2 Candidate Profile Fields
- **anonymized_name**, **headline**, **summary**
- **location**, **country**, **years_of_experience**
- **current_title**, **current_company**, **current_company_size**, **current_industry**
- Career history (1-10 roles with company, title, dates, duration, industry, company_size, description)
- Education (0-5 entries with institution, degree, field, years, tier)
- Skills (0+ with name, proficiency, endorsements, duration_months)
- Redrob signals (profile completeness, activity, recruiter engagement, availability, etc.)

### 6.3 Key Dataset Facts
- 100,000 total candidates
- 15,321 flagged as honeypots (15.3%)
- 84,679 legitimate candidates ranked
- Zero candidates have actual founder/co-founder/CEO titles (all ML/engineering titles)
- Company sizes range from "1-10" to "10001+"

---

## 7. Ranking Pipeline (End-to-End Flow)

### Step-by-Step
1. **JD Analysis** — User pastes JD text → signals extracted + embedding generated → stored in `jd_analyses`
2. **Score Candidates** — Iterate all 100k candidates in chunks of 1000:
   - Run honeypot detection
   - Run 4 scoring engines in parallel
   - Compute weighted overall score
   - Apply honeypot penalty if flagged
3. **Persist Scores** — Batch UPDATE (100 at a time) writing all scores + features + honeypot data
4. **Rank** — Sort non-honeypot by overall_score DESC → assign ranks 1-N
5. **Explain** — Generate recruiter-prose explanations for top 500 candidates using 13 template categories
6. **Session** — Record ranking session with weights and results

### Timing
- Full 100k ranking: ~43-74 seconds (well under 5-min challenge limit)
- Scoring loop: CPU-bound per chunk
- DB writes: batched to 100 per transaction

### Re-Ranking (weight changes)
- Re-ranks without re-running scoring engines
- Recalculates overall_score from stored per-engine scores with new weights
- Re-assigns ranks and returns new top candidates

---

## 8. Frontend Features

### 8.1 Home Page
- JD textarea with character counter
- "How scoring works" sidebar showing Expertise, Potential, Readiness, Credibility with weights
- Scoring note: 95-point model, confidence separate
- Analyze button with loading state

### 8.2 Dashboard / Results Page
- JD display (truncated to 200 chars with expand/collapse)
- Filter toggles: Top 10 / Top 50
- Results table: Rank, Candidate, Overall, Expertise, Potential, Readiness, Credibility, Confidence
- Color-coded scores (green ≥70, orange ≥40, muted <40)
- Link to full candidate profile
- CSV export (top 500)

### 8.3 Candidate Detail Page
- Full profile header (name, title, location, experience)
- Honeypot warning banner if flagged (with reasons)
- "Why ranked" explanation box
- Skills list (up to 20, with proficiency + years tooltip)
- Career history timeline
- Education section
- Score breakdown with per-engine details
- Platform signals panel
- Score cards (Overall, Confidence, Expertise, Potential, Readiness, Credibility)

### 8.4 Validation Lab
- Weight slider controls (0-60 range per dimension, auto-normalized to 95)
- Apply weights / reset
- Past sessions list
- A/B candidate comparison

---

## 9. Explanation System

### 9.1 Template Categories (13 pools)
| Category | Threshold | Example |
|----------|-----------|---------|
| capabilityVeryHigh | ≥85 | "Exceptional technical match — the candidate's skill profile closely mirrors the core requirements" |
| capabilityHigh | ≥65 | "Direct experience in the core technical domains sought for this position" |
| capabilityModerate | <55 | "Moderate technical alignment — the candidate has some relevant skills" |
| capabilityLow | <40 | "The candidate's technical background shows only partial alignment" |
| founderVeryHigh | ≥75 | "Outstanding entrepreneurial background: founder or founding-team member" |
| founderHigh | ≥55 | "Demonstrated founder or founding-team track record with ownership" |
| founderNone | <40 | "The candidate's background is primarily in established organizations" |
| hireabilityVeryHigh | ≥85 | "Immediately available with strong hiring signals" |
| hireabilityHigh | ≥65 | "Strong availability signals — the candidate appears to be actively looking" |
| hireabilityModerate | <60 | "Some availability signals but not indicating immediate readiness" |
| hireabilityLow | <40 | "Availability concerns — the candidate's profile suggests a longer notice period" |
| trustVeryHigh | ≥80 | "Exceptional trust signals: clear career progression, verifiable achievements" |
| trustHigh | ≥65 | "Trusted profile with consistent career evidence" |
| trustLow | <50 | "Limited career evidence or validation signals" |

Plus supplemental templates for notice period and leadership signals.

### 9.2 Generation Strategy
- Up to 2 high-signal sentences + up to 2 low-signal/concern sentences
- Random selection from template pool for variety (not deterministic per score)
- Combined into natural paragraph prose

---

## 10. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Full ranking (100k) | 43-74s | Chunked iteration, batched DB writes |
| Score DB writes | ~20s | 100-row batch UPDATEs in single transaction |
| Explanations (top 500) | ~2s | Template selection + individual UPDATEs |
| CSV export | <1s | Simple query + text generation |
| Re-ranking | ~10s | Weighted recalculation from stored scores |
| JD analysis | ~2s | Signal extraction + embedding generation |

---

## 11. Key Design Decisions

1. **95-point model**: Weights sum to 95, with confidence as a separate 5% display-only metric. Prevents confusion between ranking score and data quality score.

2. **No authentication**: Single-user/demo system for hackathon. All API routes are open.

3. **JSONB storage**: Flexible schema for candidate profiles. Enables Postgres JSON operators for querying while maintaining relational integrity.

4. **Honeypot penalty multiplies by 0.1** rather than hard-filtering. Allows visibility into flagged profiles while preventing them from ranking.

5. **Feature reasons stored per candidate**: The `features` JSONB column captures each engine's score + reasoning, enabling the Score Details section on the candidate detail page.

6. **Embedding all-MiniLM-L6-v2**: 384-dim is sufficient for semantic matching, runs entirely in Node.js via ONNX (no Python dependency), and is fast enough for 100k comparisons.

7. **Batch DB updates**: 100-row batches reduce round-trips from 100k to 1,000, critical for meeting the 5-min ranking target.

8. **Dataset has no founder titles**: The founder fit engine compensates by scoring company size, ownership language, and role breadth rather than relying on title matching.

---

## 12. Files Reference

### Backend (`backend/`)
| File | Lines | Purpose |
|------|-------|---------|
| `server.js` | 116 | Express setup, middleware, routes, startup |
| `db.js` | 80 | PostgreSQL pool + schema initialization |
| `services/rankingEngine.js` | 447 | Orchestrator: scoring pipeline, ranking, explanations, CSV export |
| `services/capabilityEngine.js` | 123 | Expertise scoring |
| `services/founderFitEngine.js` | 259 | Potential scoring |
| `services/hireabilityEngine.js` | 176 | Readiness scoring |
| `services/trustEngine.js` | 142 | Credibility scoring |
| `services/confidenceEngine.js` | 72 | Data confidence scoring (display-only) |
| `services/honeypotDetection.js` | 123 | Fake profile detection |
| `services/embeddingService.js` | 142 | Embedding generation + cosine similarity |
| `services/datasetLoader.js` | 133 | JSONL/JSON → PostgreSQL ingestion |
| `services/jdIntelligence.js` | 61 | JD signal extraction |
| `routes/rankRoutes.js` | 166 | Ranking + results + CSV API |
| `routes/jdRoutes.js` | 69 | JD analysis API |
| `routes/datasetRoutes.js` | 77 | Candidate data API |

### Frontend (`frontend/src/`)
| File | Lines | Purpose |
|------|-------|---------|
| `main.tsx` | 29 | Router setup |
| `pages/HomePage.tsx` | 139 | JD input + analysis trigger |
| `pages/DashboardPage.tsx` | 233 | Results table + JD display + CSV |
| `pages/CandidatePage.tsx` | 360 | Full candidate intelligence |
| `components/site-nav.tsx` | 43 | Navigation bar |
| `components/score-badge.tsx` | 38 | Score display component |
| `lib/auth.ts` | 16 | API fetch helper |

### Configuration
| File | Purpose |
|------|---------|
| `backend/.env` | DB connection, ports, dataset path |
| `frontend/vite.config.ts` | Vite plugins, server settings |
| `dataset/candidate_schema.json` | Dataset field definitions |
