import { Link, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { ScoreBadge } from "@/components/score-badge";
import { SkillTag } from "@/components/skill-tag";
import { API_URL, authFetch, getToken } from "@/lib/auth";

export type Candidate = {
  id: string;
  rank: number;
  name: string;
  role: string;
  location: string;
  score: number;
  experience: number;
  email: string;
  matchingSkills: string[];
  missingSkills: string[];
  education: { degree: string; school: string; year: number }[];
  history: { role: string; company: string; period: string; bullets: string[] }[];
  summary: string;
  rawText?: string;
  displayText?: string;
  mimeType?: string | null;
  originalName?: string | null;
  hasFile?: boolean;
  breakdown: { label: string; value: number }[];
};

type AnalysisPayload = {
  available: boolean;
  fromCache: boolean;
  aiUsed: boolean;
  strengths: string[];
  weaknesses: string[];
  explanation: string;
  recommendation: string | null;
  interviewQuestions: { technical: string[]; behavioral: string[]; riskAreas: string[] } | null;
  finalScore: number | null;
  updatedAt: string | null;
};

type Note = {
  id: number;
  note: string;
  authorId: number;
  createdAt: string;
};

const RECOMMENDATION_TONE: Record<string, string> = {
  "Strong fit": "border-signal bg-signal/10 text-signal",
  "Possible fit": "border-foreground/30 bg-card text-foreground",
  "Weak fit": "border-foreground/15 bg-foreground/5 text-muted-foreground",
  "Not a fit": "border-destructive/30 bg-destructive/5 text-destructive",
};

export function CandidatePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [allResults, setAllResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobTitle, setJobTitle] = useState<string>("");
  const [analysisJobId, setAnalysisJobId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return navigate("/dashboard");
      if (!getToken()) return navigate("/login");

      setLoading(true);
      try {
        const res = await authFetch(`${API_URL}/api/candidates/${id}`);
        if (!res.ok) return navigate("/dashboard");

        const data = await res.json();
        setCandidate(data);

        const listRes = await authFetch(`${API_URL}/api/results`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const results = listData.results || [];
          setAllResults(results);
          setJobId(listData.sessionId ?? null);
          setJobTitle(listData.jobTitle || "");

          if (listData.sessionId) {
            try {
              const jobRes = await authFetch(
                `${API_URL}/api/results?sessionId=${listData.sessionId}`
              );
              if (jobRes.ok) {
                const jd = await jobRes.json();
                setAnalysisJobId(jd.sessionId ?? null);
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        console.error("Candidate load error:", err);
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-6 py-32 text-center">
          Loading…
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-6 py-32 text-center">
          <h1 className="font-display text-5xl">Candidate not found.</h1>
          <Link
            to="/dashboard"
            className="mt-6 inline-block font-mono text-xs uppercase tracking-[0.2em] underline underline-offset-8"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const c = candidate;
  const candidateIdNum = Number(c.id);
  const currentIdx = allResults.findIndex((r) => String(r.id) === String(id));
  const nextCandidate =
    currentIdx >= 0 ? allResults[(currentIdx + 1) % Math.max(1, allResults.length)] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-3">
          {/* Name on the left */}
          <div className="lg:col-span-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              § Candidate · Rank {String(c.rank).padStart(2, "0")}
              {jobTitle && <> · {jobTitle}</>}
            </p>
            <h1 className="mt-2 font-display text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-[0.95] tracking-[-0.03em]">
              {c.name}
            </h1>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {[c.role, c.location, c.experience ? `${c.experience} years` : null, c.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Overall match — side of the name (home "Candidate preview" style) */}
          <div className="border border-foreground bg-card p-5 ink-shadow">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>§ Overall match</span>
              <span className="h-2 w-2 rounded-full bg-optic" />
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Match
                </div>
                <div className="font-display text-6xl leading-none tabular-nums">
                  {c.score}
                </div>
              </div>
              <ScoreBadge score={c.score} size="lg" />
            </div>

            <div className="mt-3 font-mono text-[11px] text-muted-foreground">
              {jobTitle ? `vs ${jobTitle}` : c.role || "Role not detected"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-3">
        {/* LEFT — CV, exactly as uploaded */}
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              § Submitted résumé
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {c.originalName || c.mimeType || "raw, unchanged"}
            </span>
          </div>
          <ResumeViewer
            candidateId={candidateIdNum}
            mimeType={c.mimeType}
            originalName={c.originalName}
            rawText={c.rawText}
            summary={c.summary}
            hasFile={c.hasFile}
          />
        </section>

        {/* RIGHT — Sidebar */}
        <aside className="space-y-6">
          {/* Score breakdown — top of right sidebar */}
          <section className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>§ Score breakdown</span>
              <span>{c.breakdown.length} components</span>
            </div>
            <div className="mt-4 space-y-3">
              {c.breakdown.map((b) => (
                <ScoreBar key={b.label} label={b.label} value={b.value} />
              ))}
            </div>
          </section>

          {/* Matching skills — below score breakdown */}
          <section className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              § Matching skills
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.matchingSkills.length ? (
                c.matchingSkills.slice(0, 12).map((s) => (
                  <SkillTag key={s} label={s} />
                ))
              ) : (
                <span className="text-xs italic text-muted-foreground">None</span>
              )}
              {c.matchingSkills.length > 12 && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  +{c.matchingSkills.length - 12}
                </span>
              )}
            </div>
            {c.missingSkills.length > 0 && (
              <>
                <h2 className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  § Missing skills
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.missingSkills.map((s) => (
                    <span
                      key={s}
                      className="border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-mono text-xs text-destructive"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          {analysisJobId ? (
            <AnalysisPanel candidateId={candidateIdNum} jobId={analysisJobId} />
          ) : jobId ? (
            <AnalysisPanel candidateId={candidateIdNum} jobId={jobId} />
          ) : null}

          <NotesPanel candidateId={candidateIdNum} />

          {nextCandidate && (
            <button
              onClick={() => navigate(`/candidate/${nextCandidate.id}`)}
              className="w-full border-2 border-foreground bg-foreground px-5 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-background ink-shadow transition-transform hover:-translate-y-[1px]"
            >
              Next candidate →
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function ResumeViewer({
  candidateId,
  mimeType,
  originalName,
  rawText,
  summary,
  hasFile,
}: {
  candidateId: number;
  mimeType?: string | null;
  originalName?: string | null;
  rawText?: string;
  summary?: string;
  hasFile?: boolean;
}) {
  const token = getToken();
  const fileUrl = `${API_URL}/api/candidates/${candidateId}/file${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;

  if (!hasFile) {
    return (
      <article className="min-h-[500px] border border-foreground/15 bg-paper p-8 lg:p-12">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground">
          {rawText || summary || "No readable resume content."}
        </pre>
      </article>
    );
  }

  const mime = (mimeType || "").toLowerCase();
  const isPdf = mime === "application/pdf" || (originalName || "").toLowerCase().endsWith(".pdf");
  const isImage = mime.startsWith("image/");
  const isText = mime.startsWith("text/") || mime === "" || /\.(txt|md|csv|json)$/i.test(originalName || "");

  if (isPdf) {
    return (
      <article className="min-h-[700px] border border-foreground/15 bg-paper">
        <iframe
          title="Submitted résumé"
          src={fileUrl}
          className="h-[80vh] min-h-[700px] w-full bg-white"
        />
      </article>
    );
  }

  if (isImage) {
    return (
      <article className="flex min-h-[500px] items-center justify-center border border-foreground/15 bg-paper p-6">
        <img
          src={fileUrl}
          alt={originalName || "Resume"}
          className="max-h-[80vh] max-w-full"
        />
      </article>
    );
  }

  if (isText) {
    return (
      <article className="min-h-[500px] border border-foreground/15 bg-paper p-8 lg:p-12">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground">
          {rawText || summary || "No readable text content."}
        </pre>
      </article>
    );
  }

  return (
    <article className="flex min-h-[400px] flex-col items-center justify-center gap-3 border border-foreground/15 bg-paper p-8 text-center">
      <p className="font-display text-2xl">Preview not available for this file type.</p>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {originalName || mimeType || "Unknown file"}
      </p>
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 border border-foreground bg-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-background"
      >
        ↓ Download file
      </a>
    </article>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = typeof value === "number" ? value : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {typeof value === "number" ? Math.round(value) : value}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-foreground/10">
        <div className="h-full bg-foreground" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </div>
    </div>
  );
}

function AnalysisPanel({ candidateId, jobId }: { candidateId: number; jobId: number }) {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/api/candidates/${candidateId}/analysis?jobId=${jobId}${
        force ? "&refresh=true" : ""
      }`;
      const res = await authFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server returned ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("[analysis-panel] load error:", err);
      setError(err?.message || "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          § AI Insights
        </h2>
        <div className="flex gap-1.5">
          {data && (
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="border border-foreground/30 bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] hover:border-foreground disabled:opacity-50"
            >
              {loading ? "…" : "↻"}
            </button>
          )}
          {!data && !loading && (
            <button
              onClick={() => load(false)}
              className="border border-foreground bg-foreground px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-background"
            >
              Generate
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 border border-destructive/30 bg-destructive/5 p-2 font-mono text-[11px] text-destructive">
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Generating…
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-4">
          {data.recommendation && (
            <div className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${RECOMMENDATION_TONE[data.recommendation] || RECOMMENDATION_TONE["Possible fit"]}`}>
              {data.recommendation}
            </div>
          )}

          <p className="text-sm leading-relaxed text-foreground/90">
            {data.explanation || "No explanation provided."}
          </p>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Strengths
            </h3>
            <ul className="mt-2 space-y-1">
              {data.strengths.length ? (
                data.strengths.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                    {s}
                  </li>
                ))
              ) : (
                <li className="text-xs italic text-muted-foreground">None</li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Weaknesses
            </h3>
            <ul className="mt-2 space-y-1">
              {data.weaknesses.length ? (
                data.weaknesses.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                    {s}
                  </li>
                ))
              ) : (
                <li className="text-xs italic text-muted-foreground">None</li>
              )}
            </ul>
          </div>

          {data.interviewQuestions && (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Suggested questions
              </h3>
              <div className="mt-2 space-y-2">
                {data.interviewQuestions.technical.slice(0, 3).map((q, i) => (
                  <p key={i} className="text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Tech {i + 1} ·
                    </span>{" "}
                    {q}
                  </p>
                ))}
                {data.interviewQuestions.behavioral.slice(0, 2).map((q, i) => (
                  <p key={i} className="text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Behavioral {i + 1} ·
                    </span>{" "}
                    {q}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NotesPanel({ candidateId }: { candidateId: number }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/candidates/${candidateId}/notes`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server returned ${res.status}`);
      }
      const json = await res.json();
      setNotes(json.notes || []);
    } catch (err: any) {
      console.error("[notes-panel] load error:", err);
      setError(err?.message || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [candidateId]);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server returned ${res.status}`);
      }
      const json = await res.json();
      setNotes((cur) => [json, ...cur]);
      setDraft("");
    } catch (err: any) {
      console.error("[notes-panel] submit error:", err);
      setError(err?.message || "Failed to add note");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: number) {
    try {
      const res = await authFetch(`${API_URL}/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server returned ${res.status}`);
      }
      setNotes((cur) => cur.filter((n) => n.id !== id));
    } catch (err: any) {
      console.error("[notes-panel] delete error:", err);
      setError(err?.message || "Failed to delete note");
    }
  }

  return (
    <section className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        § Recruiter notes
      </h2>

      <div className="mt-3 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          maxLength={4000}
          className="w-full border border-foreground/25 bg-background px-2.5 py-1.5 font-mono text-sm focus:border-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {draft.length}/4000
          </span>
          <button
            onClick={submit}
            disabled={posting || !draft.trim()}
            className="border border-foreground bg-foreground px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-background disabled:opacity-40"
          >
            {posting ? "…" : "Add"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 border border-destructive/30 bg-destructive/5 p-2 font-mono text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="font-mono text-[10px] italic text-muted-foreground">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="border border-foreground/15 bg-background p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
                <button
                  onClick={() => remove(n.id)}
                  className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive"
                >
                  delete
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.note}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
