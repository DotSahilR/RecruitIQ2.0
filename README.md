# RecruitIQ

RecruitIQ is a full-stack resume screening web application for HR teams. Users can create an HR account, upload one or more resumes, enter or upload a job description, run analysis, and view candidates ranked from highest to lowest match.

## Features

- HR authentication with JWT.
- Upload multiple resumes.
- Supported resume formats: PDF, DOC, DOCX, TXT.
- Enter a JD manually or upload a JD document.
- Extract readable text from resumes and JD files.
- Score candidates from 0 to 100.
- Rank candidates by score.
- Show matching skills, missing skills, score breakdown, and formatted resume preview.
- Dashboard search, filtering, sorting, and CSV export.
- PostgreSQL-backed screening sessions so HR users can revisit previous results.

## Tech Stack

- Frontend: React, TanStack Start/Router, Tailwind CSS.
- Backend: Node.js, Express.
- Database: PostgreSQL.
- Parsing: `pdf-parse` for PDFs, `mammoth` for DOCX, text fallback for TXT and simple DOC.
- Auth: bcrypt password hashing and JWT bearer tokens.

## Architecture

```text
frontend/
  React routes for login, upload, dashboard, candidate detail

backend/
  Express API
  controllers/  request handlers
  routes/       API route definitions
  services/     parsing and scoring logic
  db.js         PostgreSQL connection and schema initialization

PostgreSQL tables:
  users
  jobs
  screening_sessions
  candidates
  skills
  job_skills
```

## Scoring Approach

The scoring engine is deterministic and explainable:

- Skills match: 50 percent of the score.
- Experience fit: 30 percent of the score.
- Keyword relevance: 20 percent of the score.

Skills are extracted by matching known technical terms from the resume and JD text. Missing skills are JD skills not found in the candidate resume. Experience is estimated from phrases such as `3 years`, `5+ years`, or `years of experience`.

## Assumptions

- The application is meant for initial screening assistance, not final hiring decisions.
- PDF/DOCX parsing depends on whether the document contains selectable text. Scanned image-only PDFs need OCR, which is not included.
- Old binary `.doc` files have limited support. DOCX, PDF, and TXT are preferred.
- The skill extractor uses a curated keyword list and can be expanded for more domains.

## Local Setup

### Install dependencies

```bash
npm run install:all
```

### Create PostgreSQL database

Make sure PostgreSQL is running, then create the database:

```bash
createdb resume_screening
```

If `createdb` is not available, open your PostgreSQL GUI or `psql` and run:

```sql
CREATE DATABASE resume_screening;
```

### Start the app

```bash
npm run dev
```

### Use the app

1. Register or log in as an HR user.
2. Upload resumes.
3. Paste or upload a JD.
4. Run analysis.
5. View ranked candidates in the dashboard.

### For deployment, change only these URL values in your hosting dashboards:

```bash
# Frontend host, for example Vercel/Netlify
VITE_API_URL=https://your-backend-url.com

# Backend host, for example Render/Railway
FRONTEND_URL=https://your-frontend-url.com
CORS_ORIGIN=https://your-frontend-url.com
```
