import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/site-nav";
import { API_URL, authFetch } from "@/lib/auth";

type PipelineCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
  location: string;
  score: number;
  rank: number;
  experience: number;
  summary: string;
  topSkills: string[];
  jobTitle: string | null;
  algorithmVersion: string | null;
  statusUpdatedAt: string | null;
};

type Column = {
  status: string;
  count: number;
  candidates: PipelineCandidate[];
};

type PipelineResponse = {
  columns: Column[];
  counts: Record<string, number>;
  total: number;
  statuses: string[];
};

const STATUSES = [
  "Applied",
  "Screened",
  "Shortlisted",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
] as const;

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; pill: string }> = {
  Applied: {
    bg: "bg-muted/30",
    border: "border-muted",
    text: "text-foreground",
    pill: "bg-muted text-muted-foreground",
  },
  Screened: {
    bg: "bg-secondary/40",
    border: "border-secondary",
    text: "text-foreground",
    pill: "bg-secondary text-secondary-foreground",
  },
  Shortlisted: {
    bg: "bg-signal/10",
    border: "border-signal/60",
    text: "text-foreground",
    pill: "bg-signal text-signal-foreground",
  },
  Interview: {
    bg: "bg-primary/10",
    border: "border-primary/60",
    text: "text-foreground",
    pill: "bg-primary text-primary-foreground",
  },
  Offer: {
    bg: "bg-optic/10",
    border: "border-optic/60",
    text: "text-foreground",
    pill: "bg-optic text-optic-foreground",
  },
  Hired: {
    bg: "bg-optic/25",
    border: "border-optic",
    text: "text-foreground",
    pill: "bg-optic text-optic-foreground ring-2 ring-foreground/30",
  },
  Rejected: {
    bg: "bg-destructive/10",
    border: "border-destructive/60",
    text: "text-foreground",
    pill: "bg-destructive text-destructive-foreground",
  },
};

export function PipelinePage() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  useEffect(() => {
    void loadPipeline();
  }, []);

  async function loadPipeline() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/pipeline`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = (await res.json()) as PipelineResponse;
      setData(json);
      console.log("[pipeline] loaded", json.total, "candidates", json.counts);
    } catch (err: any) {
      console.error("[pipeline] load failed:", err);
      setError(err?.message || "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }

  async function moveCandidate(candidateId: string, newStatus: string) {
    if (!data) return;
    const previous = data;
    setMovingId(candidateId);
    setData((cur) => (cur ? applyMove(cur, candidateId, newStatus) : cur));
    try {
      const res = await authFetch(
        `${API_URL}/api/candidates/${candidateId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server returned ${res.status}`);
      }
      console.log(`[pipeline] moved candidate=${candidateId} -> ${newStatus}`);
    } catch (err: any) {
      console.error("[pipeline] move failed, reverting:", err);
      setData(previous);
      setError(err?.message || "Failed to move candidate");
    } finally {
      setMovingId(null);
    }
  }

  const allCandidates = useMemo(() => {
    if (!data) return [] as Array<{ c: PipelineCandidate; status: string }>;
    const out: Array<{ c: PipelineCandidate; status: string }> = [];
    for (const col of data.columns) {
      for (const c of col.candidates) {
        out.push({ c, status: col.status });
      }
    }
    return out.sort((a, b) => b.c.score - a.c.score);
  }, [data]);

  const filtered = useMemo(() => {
    if (statusFilter === "All") return allCandidates;
    return allCandidates.filter((row) => row.status === statusFilter);
  }, [allCandidates, statusFilter]);

  const totalCounts = useMemo(() => {
    if (!data) return { active: 0, hired: 0, rejected: 0 };
    const active = data.statuses
      .filter((s) => s !== "Hired" && s !== "Rejected")
      .reduce((acc, s) => acc + (data.counts[s] || 0), 0);
    return {
      active,
      hired: data.counts.Hired || 0,
      rejected: data.counts.Rejected || 0,
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15">
        <div className="mx-auto max-w-[1600px] px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                § Pipeline · Live Board
              </p>
              <h1 className="mt-1 font-display text-5xl tracking-tight">Candidate pipeline</h1>
              {data ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {data.total} total · {totalCounts.active} in motion · {totalCounts.hired} hired · {totalCounts.rejected} rejected
                </p>
              ) : (
                <p className="mt-2 font-mono text-xs text-muted-foreground">Loading…</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadPipeline}
                disabled={loading}
                className="border border-foreground/30 bg-background px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] hover:border-foreground disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>

          {data && data.total > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              <FilterChip
                label="All"
                count={allCandidates.length}
                active={statusFilter === "All"}
                onClick={() => setStatusFilter("All")}
              />
              {STATUSES.map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  count={data.counts[s] || 0}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {error && (
          <div className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 font-mono text-[11px] text-destructive">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline">dismiss</button>
          </div>
        )}

        {loading && !data ? (
          <div className="border border-dashed border-foreground/30 bg-card p-16 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Loading pipeline…
            </p>
          </div>
        ) : data && allCandidates.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(({ c, status }) => (
              <PipelineCard
                key={c.id}
                candidate={c}
                currentStatus={status}
                isMoving={movingId === c.id}
                onMove={moveCandidate}
              />
            ))}
          </div>
        ) : null}

        {data && data.total === 0 && !loading && (
          <div className="border border-dashed border-foreground/30 bg-card p-12 text-center ink-shadow rounded-sm">
            <div className="font-display text-3xl">No candidates in the pipeline yet.</div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Upload résumés + a job description, then run analysis to populate this board.
            </p>
            <div className="mt-6">
              <Link
                to="/upload"
                className="inline-flex items-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-background ink-shadow transition-transform hover:-translate-y-[1px]"
              >
                Start screening →
              </Link>
            </div>
          </div>
        )}

        {data && data.total > 0 && filtered.length === 0 && (
          <div className="border border-dashed border-foreground/30 bg-card p-12 text-center">
            <p className="font-display text-2xl">No candidates in {statusFilter}.</p>
            <button
              onClick={() => setStatusFilter("All")}
              className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] underline underline-offset-4"
            >
              Show all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-foreground/20 bg-card text-foreground hover:border-foreground"
      }`}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function applyMove(data: PipelineResponse, candidateId: string, newStatus: string): PipelineResponse {
  let movedCard: PipelineCandidate | null = null;
  const strippedColumns = data.columns.map((col) => {
    const remaining = col.candidates.filter((c) => {
      if (c.id === candidateId) {
        movedCard = { ...c, statusUpdatedAt: new Date().toISOString() };
        return false;
      }
      return true;
    });
    return { ...col, candidates: remaining, count: remaining.length };
  });
  const finalColumns = strippedColumns.map((col) => {
    if (col.status === newStatus && movedCard) {
      return {
        ...col,
        candidates: [{ ...(movedCard as PipelineCandidate) }, ...col.candidates],
        count: col.candidates.length + 1,
      };
    }
    return col;
  });
  const counts = Object.fromEntries(finalColumns.map((c) => [c.status, c.count]));
  return { ...data, columns: finalColumns, counts };
}

function PipelineCard({
  candidate,
  currentStatus,
  isMoving,
  onMove,
}: {
  candidate: PipelineCandidate;
  currentStatus: string;
  isMoving: boolean;
  onMove: (candidateId: string, newStatus: string) => void;
}) {
  const style = STATUS_STYLES[currentStatus] || STATUS_STYLES.Applied;

  return (
    <article
      className={`group relative flex flex-col border-2 ${style.bg} ${style.border} p-5 transition-all hover:-translate-y-[2px] hover:shadow-lg ${
        isMoving ? "animate-pulse" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/candidate/${candidate.id}`}
            className="block font-display text-2xl leading-tight hover:underline"
          >
            {candidate.name}
          </Link>
          {candidate.role && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {candidate.role}
            </div>
          )}
        </div>
        <ScorePill score={candidate.score} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        {candidate.experience > 0 && (
          <span className="border border-foreground/20 bg-background/50 px-1.5 py-0.5">
            {candidate.experience}y exp
          </span>
        )}
        {candidate.location && (
          <span className="truncate">{candidate.location}</span>
        )}
        {candidate.jobTitle && (
          <span className="ml-auto truncate text-signal">↳ {candidate.jobTitle}</span>
        )}
      </div>

      {candidate.topSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {candidate.topSkills.slice(0, 4).map((s) => (
            <span
              key={s}
              className="border border-foreground/20 bg-background/70 px-1.5 py-0.5 font-mono text-[10px]"
            >
              {s}
            </span>
          ))}
          {candidate.topSkills.length > 4 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              +{candidate.topSkills.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-foreground/15 pt-3">
        <span className={`inline-block px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${style.pill}`}>
          {currentStatus}
        </span>
        <select
          value={currentStatus}
          onChange={(e) => {
            if (e.target.value && e.target.value !== currentStatus) {
              onMove(candidate.id, e.target.value);
            }
          }}
          className="cursor-pointer border border-foreground/30 bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] focus:border-foreground focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              → {s}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-foreground text-background"
      : score >= 60
      ? "bg-foreground/80 text-background"
      : "border border-foreground/30 bg-background text-foreground";
  return (
    <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center ${tone}`}>
      <span className="font-display text-xl leading-none tabular-nums">{score}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] opacity-80">match</span>
    </div>
  );
}
