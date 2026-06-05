import { Link } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
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
  breakdown: { label: string; value: number }[];
};

type ScreeningSession = {
  id: number;
  title: string;
  candidateCount: number;
  topScore: number;
  createdAt: string;
};

// DashboardPage: fetches results and sessions from the backend API

type SortKey = "score-desc" | "score-asc" | "exp-desc" | "name";

function exportCsv(rows: Candidate[]) {
  const header = ["rank", "name", "role", "score", "experience", "location", "matching", "missing"];
  const lines = rows.map((c) =>
    [c.rank, c.name, c.role, c.score, c.experience, c.location, c.matchingSkills.join("|"), c.missingSkills.join("|")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "recruitiq-candidates.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows: Candidate[]) {
  const headers = ["Rank", "Name", "Role", "Score", "Experience", "Location", "Matching Skills", "Missing Skills"];
  const escapeHtml = (value: unknown) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const tableRows = rows.map((c) => [
    c.rank,
    c.name,
    c.role,
    c.score,
    c.experience,
    c.location,
    c.matchingSkills.join(", "),
    c.missingSkills.join(", "),
  ]);

  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>
          <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
          <tbody>
            ${tableRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recruitiq-candidates.xls";
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const [jobTitle, setJobTitle] = useState("No Job Profile Screened");
  const [results, setResults] = useState<Candidate[]>([]);
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | undefined>(undefined);
  const [loadingSession, setLoadingSession] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score-desc");
  const [minScore, setMinScore] = useState(0);
  const [minExp, setMinExp] = useState(0);
  const [skill, setSkill] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!getToken()) return;
      try {
        const [res, sessionsRes] = await Promise.all([
          authFetch(`${API_URL}/api/results`),
          authFetch(`${API_URL}/api/sessions`),
        ]);
        if (!res.ok) throw new Error("Failed to load results from server");
        const data = await res.json();
        const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
        setResults(data.results || []);
        setJobTitle(data.jobTitle || "No Job Profile Screened");
        setSessions(sessionsData.sessions || []);
      } catch (err) {
        console.error("Dashboard load error:", err);
      }
    }
    load();
  }, []);

  const allSkills = useMemo(
    () => Array.from(new Set(results.flatMap((c: Candidate) => c.matchingSkills))).sort(),
    [results]
  );

  const filtered = useMemo(() => {
    let r = results.filter((c: Candidate) => {
      const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.matchingSkills.some((s: string) => s.toLowerCase().includes(q.toLowerCase()));
      const matchScore = c.score >= minScore;
      const matchExp = c.experience >= minExp;
      const matchSkill = !skill || c.matchingSkills.includes(skill);
      return matchQ && matchScore && matchExp && matchSkill;
    });
    r = [...r].sort((a, b) => {
      switch (sort) {
        case "score-desc": return b.score - a.score;
        case "score-asc": return a.score - b.score;
        case "exp-desc": return b.experience - a.experience;
        case "name": return a.name.localeCompare(b.name);
      }
    });
    return r;
  }, [results, q, sort, minScore, minExp, skill]);

  const avg = Math.round(filtered.reduce((acc: number, c: Candidate) => acc + c.score, 0) / Math.max(1, filtered.length));

  const shortlist = useMemo(
    () =>
      [...results]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [results]
  );

  const openSession = async (sessionId: number) => {
    setLoadingSession(true);
    try {
      const res = await authFetch(`${API_URL}/api/results?sessionId=${sessionId}`);
      if (!res.ok) throw new Error("Failed to load session");
      const data = await res.json();
      setActiveSessionId(data.sessionId);
      setJobTitle(data.jobTitle || "Screening session");
      setResults(data.results || []);
      setQ("");
      setSkill(null);
    } catch (err) {
      console.error("Session load error:", err);
    } finally {
      setLoadingSession(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      {/* Masthead */}
      <div className="border-b border-foreground/15">
        <div className="mx-auto max-w-[1400px] px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                § Results · Active Spec
              </p>
              <h1 className="mt-1 font-display text-5xl tracking-tight">Ranked candidates</h1>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {jobTitle} · {results.length} résumés analysed · Avg match {avg}/100
              </p>
            </div>
            {results.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => exportCsv(filtered)}
                  className="border border-foreground bg-background px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] ink-shadow-sm transition-transform hover:-translate-y-[1px]"
                >
                  ↓ Export CSV
                </button>
                <button
                  onClick={() => exportExcel(filtered)}
                  className="border border-foreground/30 bg-background px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] hover:border-foreground"
                >
                  ↓ Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI shortlist */}
      {shortlist.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-6 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-foreground/15 pb-3">
            <div>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                § AI shortlist
              </h2>
              <p className="mt-1 font-display text-2xl">Top matches — open one to see AI insights.</p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {shortlist.length} of {results.length}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {shortlist.map((c, i) => (
              <Link
                key={c.id}
                to={`/candidate/${c.id}`}
                className="group relative border border-foreground/15 bg-card p-5 transition-all hover:-translate-y-[2px] hover:border-foreground ink-shadow-sm"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Rank {String(c.rank || i + 1).padStart(2, "0")}
                  </span>
                  <ScoreBadge score={c.score} size="sm" />
                </div>
                <h3 className="mt-3 font-display text-2xl leading-tight">{c.name}</h3>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {[c.role, c.location, c.experience ? `${c.experience}y` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.matchingSkills.slice(0, 4).map((s) => (
                    <SkillTag key={s} label={s} />
                  ))}
                  {c.matchingSkills.length > 4 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      +{c.matchingSkills.length - 4}
                    </span>
                  )}
                </div>
                <p className="mt-4 line-clamp-2 font-display text-sm italic text-foreground/80">
                  "{c.summary || "No summary."}"
                </p>
                <span className="absolute right-3 top-3 font-display text-xl text-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-foreground">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="space-y-8">
          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Past sessions</h3>
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground">No saved sessions yet.</p>
              ) : (
                sessions.slice(0, 6).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => openSession(session.id)}
                    className={`block w-full border px-3 py-2 text-left transition-colors ${
                      activeSessionId === session.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/15 bg-card hover:border-foreground"
                    }`}
                  >
                    <div className="truncate font-mono text-[11px] uppercase tracking-[0.14em]">{session.title}</div>
                    <div className={`mt-1 font-mono text-[10px] ${activeSessionId === session.id ? "text-background/70" : "text-muted-foreground"}`}>
                      {session.candidateCount} candidates · top {session.topScore}/100
                    </div>
                  </button>
                ))
              )}
              {loadingSession && (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Loading session…
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Search</h3>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or skill…"
              className="w-full border border-foreground/25 bg-background px-3 py-2 font-mono text-sm focus:border-foreground focus:outline-none"
            />
          </div>

          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Sort</h3>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full border border-foreground/25 bg-background px-3 py-2 font-mono text-sm focus:border-foreground focus:outline-none"
            >
              <option value="score-desc">Highest match</option>
              <option value="score-asc">Lowest match</option>
              <option value="exp-desc">Most experience</option>
              <option value="name">Name (A→Z)</option>
            </select>
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Minimum score</h3>
              <span className="font-mono text-xs tabular-nums">{minScore}</span>
            </div>
            <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(+e.target.value)} className="w-full accent-foreground" />
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Min. experience</h3>
              <span className="font-mono text-xs tabular-nums">{minExp}y</span>
            </div>
            <input type="range" min={0} max={15} value={minExp} onChange={(e) => setMinExp(+e.target.value)} className="w-full accent-foreground" />
          </div>

          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Required skill</h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSkill(null)}
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  !skill ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground"
                }`}
              >
                Any
              </button>
              {allSkills.map((s: any) => (
                <button
                  key={s}
                  onClick={() => setSkill(s === skill ? null : s)}
                  className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    skill === s ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Table / Lists */}
        <section>
          {results.length === 0 ? (
            <div className="border border-dashed border-foreground/30 p-12 text-center bg-card ink-shadow rounded-sm">
              <div className="font-display text-4xl">No candidates screened yet.</div>
              <p className="mt-3 max-w-md mx-auto font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground leading-relaxed">
                Connect your team spec and stack of candidate résumés to run the AI match scoring engine.
              </p>
              <div className="mt-8">
                <Link
                  to="/upload"
                  className="group inline-flex items-center gap-3 rounded-sm border border-foreground bg-foreground px-6 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-background ink-shadow transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px]"
                >
                  Start Screening Session
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="border border-foreground/15 bg-background">
              <div className="grid grid-cols-[60px_1.6fr_90px_1.6fr_90px_60px] gap-4 border-b border-foreground bg-foreground px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-background">
                <span>Rank</span>
                <span>Candidate</span>
                <span className="text-right">Match</span>
                <span>Matching skills</span>
                <span className="text-right">Exp</span>
                <span />
              </div>
              {filtered.length === 0 && (
                <div className="px-4 py-12 text-center font-mono text-sm text-muted-foreground">
                  No candidates match these filters.
                </div>
              )}
              {filtered.map((c: Candidate, idx: number) => (
                <Link
                  key={c.id}
                  to={`/candidate/${c.id}`}
                  className="group grid grid-cols-[60px_1.6fr_90px_1.6fr_90px_60px] items-center gap-4 border-b border-foreground/10 px-4 py-4 transition-colors last:border-0 hover:bg-card"
                >
                  <span className="font-display text-3xl tabular-nums text-foreground/40 group-hover:text-signal">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-xl leading-tight">{c.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {[c.role || "Role not detected", c.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <ScoreBadge score={c.score} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.matchingSkills.slice(0, 4).map((s: string) => (
                      <SkillTag key={s} label={s} />
                    ))}
                    {c.matchingSkills.length > 4 && (
                      <span className="font-mono text-[10px] text-muted-foreground">+{c.matchingSkills.length - 4}</span>
                    )}
                  </div>
                  <span className="text-right font-mono text-sm tabular-nums">{c.experience}y</span>
                  <span className="text-right font-display text-2xl text-foreground/30 transition-all group-hover:translate-x-1 group-hover:text-foreground">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
