import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import { SiteNav } from "@/components/site-nav";
import { ScoreBadge } from "@/components/score-badge";
import { apiFetch } from "@/lib/auth";

type RankedCandidate = {
  candidate_id: string;
  profile: { anonymized_name?: string; name?: string; headline: string; current_title: string; location: string; years_of_experience: number };
  rank: number;
  overall_score: number;
  capability_score: number;
  founder_fit_score: number;
  hireability_score: number;
  trust_score: number;
  confidence_score: number;
  reasoning: string;
  is_honeypot: boolean;
  honeypot_reasons: string[];
};

type FilterOption = "top10" | "top50";

export function DashboardPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [jdText, setJdText] = useState("");
  const [jdExpanded, setJdExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterOption>("top10");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [candRes, sessionRes] = await Promise.all([
          apiFetch("/api/results/top?count=100"),
          sessionId ? apiFetch(`/api/sessions/${sessionId}`).then(r => r.json()) : null
        ]);
        const data = await candRes.json();
        setCandidates(data || []);

        if (sessionRes) {
          const jdRes = await apiFetch(`/api/jd/analyses/${sessionRes.jd_id}`);
          const jd = await jdRes.json();
          setJdText(jd.description || "");
        }
      } catch (err) {
        console.error("Failed to load results:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  const filtered = useMemo(() => {
    const limit = filter === "top10" ? 10 : 50;
    return candidates.slice(0, limit);
  }, [candidates, filter]);

  const exportCsv = async () => {
    try {
      const url = sessionId ? `/api/export/csv?sessionId=${sessionId}` : "/api/export/csv";
      const res = await apiFetch(url);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/);
      const filename = match ? decodeURIComponent(match[1]) : "rankings.csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15">
        <div className="mx-auto max-w-[1400px] px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Ranking Results
              </p>
              <h1 className="mt-1 font-display text-5xl tracking-tight">Top Candidates</h1>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {candidates.length} candidates ranked · Top score: {candidates[0]?.overall_score || "—"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                className="border border-foreground bg-background px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] ink-shadow-sm transition-transform hover:-translate-y-[1px]"
              >
                ↓ Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {jdText && (
          <div className="mb-6 border border-foreground/15 bg-card p-5 ink-shadow-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Job Description
            </p>
            <p className="mt-2 whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground/80">
              {jdExpanded ? jdText : jdText.length > 200 ? jdText.slice(0, 200) + "..." : jdText}
            </p>
            {jdText.length > 200 && (
              <button onClick={() => setJdExpanded(!jdExpanded)} className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-signal hover:underline">
                {jdExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 border-b border-foreground/15 pb-4">
          <div className="flex gap-2">
            {(["top10", "top50"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  filter === f
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:border-foreground"
                }`}
              >
                {f === "top10" ? "Top 10" : "Top 50"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Loading results...
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-foreground/30 p-12 text-center">
            <div className="font-display text-3xl">No rankings yet.</div>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Paste a job description on the home page to generate rankings.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block border border-foreground bg-foreground px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-background"
            >
              Analyze a JD →
            </Link>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border border-foreground/15">
              <thead>
                <tr className="border-b border-foreground bg-foreground text-background">
                  {["Rank", "Candidate", "Overall", "Expertise", "Startup Potential", "Readiness", "Credibility", "Confidence", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.candidate_id} className="border-b border-foreground/10 transition-colors hover:bg-card">
                    <td className="px-3 py-3 font-display text-2xl tabular-nums text-foreground/40">
                      {String(c.rank).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/candidate/${c.candidate_id}`} className="group">
                        <div className="font-display text-lg leading-tight group-hover:text-signal">
                          {c.profile?.anonymized_name || c.profile?.name || c.candidate_id}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {c.profile?.current_title || c.profile?.headline || ""}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBadge score={Math.round(c.overall_score)} />
                    </td>
                    <td className="px-3 py-3">
                      <EngineScore value={Math.round(c.capability_score)} />
                    </td>
                    <td className="px-3 py-3">
                      <EngineScore value={Math.round(c.founder_fit_score)} />
                    </td>
                    <td className="px-3 py-3">
                      <EngineScore value={Math.round(c.hireability_score)} />
                    </td>
                    <td className="px-3 py-3">
                      <EngineScore value={Math.round(c.trust_score)} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {Math.round(c.confidence_score)}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/candidate/${c.candidate_id}`}
                        className="font-display text-xl text-foreground/30 hover:text-foreground"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EngineScore({ value }: { value: number }) {
  const color = value >= 70 ? "text-optic" : value >= 40 ? "text-signal" : "text-muted-foreground";
  return (
    <span className={`font-mono text-sm tabular-nums ${color}`}>
      {value}
    </span>
  );
}
