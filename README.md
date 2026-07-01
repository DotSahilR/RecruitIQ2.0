# RecruitIQ 2.0

RecruitIQ is a local AI-powered candidate ranking platform that analyzes a Job Description (JD) and ranks **100,000+ candidates** in under **1 minute** without using external AI APIs.

## Key Features

- Rank **100,000+ candidates** from a job description in under **1 minute**.
- Score candidates using **Expertise, Potential, Readiness, and Credibility**.
- Detect fake or suspicious profiles and lower their ranking.
- Show clear reasons why each candidate was ranked.
- View results, candidate details, and export the top candidates as **CSV**.
- Simple REST API for job analysis, ranking, results, and system status.
- Runs completely **offline** with **no external AI APIs**.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Embeddings:** all-MiniLM-L6-v2 (`@xenova/transformers`)

## Scoring

- **Expertise** – 40%
- **Potential** – 20%
- **Readiness** – 20%
- **Credibility** – 15%

> Confidence score is displayed separately and does not affect ranking.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jd/analyze` | Analyze Job Description |
| POST | `/api/rank` | Rank candidates |
| POST | `/api/rerank` | Re-rank with new weights |
| GET | `/api/results` | Get ranked candidates |
| GET | `/api/export/csv` | Export CSV |
| GET | `/api/health` | Health check |

## Project Structure

```text
backend/
frontend/
dataset/
```

## Getting Started

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Performance

- **100k candidate ranking:** 43–74 seconds
- **JD analysis:** ~2 seconds
- **Re-ranking:** ~10 seconds
- **CSV export:** <1 second
