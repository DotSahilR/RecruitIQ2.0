import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
  reasoning?: string;
};

export function ValidationLabPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [weights, setWeights] = useState({ capability: 40, founderFit: 20, hireability: 20, trust: 15 });
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [comparison, setComparison] = useState<any[] | null>(null);

  useEffect(() => {
    apiFetch("/api/sessions").then(r => r.json()).then(setSessions).catch(() => {});
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      const res = await apiFetch("/api/results/top?count=20");
      const data = await res.json();
      setCandidates(data || []);
    } catch {}
  };

  const handleRerank = async () => {
    if (!activeSession) {
      setMessage("No active session. Run an analysis first.");
      return;
    }
    setLoading(true);
    setMessage("Re-ranking...");
    try {
      const res = await apiFetch("/api/rerank", {
        method: "POST",
        body: JSON.stringify({ sessionId: activeSession.id, weights }),
      });
      const data = await res.json();
      setCandidates(data.topCandidates || []);
      setMessage(`Applied: expertise ${weights.capability}% / startup potential ${weights.founderFit}% / readiness ${weights.hireability}% / credibility ${weights.trust}%`);
    } catch (err: any) {
      setMessage(err.message || "Re-ranking failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWeightChange = (key: string, value: number) => {
    setWeights(prev => {
      const newWeights = { ...prev, [key]: value };
      const total = newWeights.capability + newWeights.founderFit + newWeights.hireability + newWeights.trust;
      if (total > 0 && total !== 95) {
        const scale = 95 / total;
        newWeights.capability = Math.round(newWeights.capability * scale);
        newWeights.founderFit = Math.round(newWeights.founderFit * scale);
        newWeights.hireability = Math.round(newWeights.hireability * scale);
        newWeights.trust = Math.round(newWeights.trust * scale);
      }
      return newWeights;
    });
  };

  const resetWeights = () => {
    setWeights({ capability: 40, founderFit: 20, hireability: 20, trust: 15 });
  };

  const toggleCompare = (id: string) => {
    if (!compareA) { setCompareA(id); setComparison(null); }
    else if (compareA === id) { setCompareA(null); setComparison(null); }
    else if (!compareB) { setCompareB(id); }
    else { setCompareA(id); setCompareB(null); setComparison(null); }
  };

  useEffect(() => {
    if (compareA && compareB) {
      apiFetch(`/api/compare?a=${compareA}&b=${compareB}`)
        .then(r => r.json()).then(d => setComparison(d.candidates || [])).catch(() => {});
    }
  }, [compareA, compareB]);

  const clearCompare = () => { setCompareA(null); setCompareB(null); setComparison(null); };

  const total = weights.capability + weights.founderFit + weights.hireability + weights.trust;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15">
        <div className="mx-auto max-w-[1400px] px-6 py-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Recruiter Validation Lab
          </p>
          <h1 className="mt-1 font-display text-5xl tracking-tight">Tune ranking weights</h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Adjust scoring weights and instantly see updated rankings. Click two candidates to compare side-by-side.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <div className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Score Weights</h3>
              <div className="mt-4 space-y-5">
                <WeightSlider label="Expertise" value={weights.capability} onChange={(v) => handleWeightChange("capability", v)} color="bg-foreground" />
                <WeightSlider label="Startup Potential" value={weights.founderFit} onChange={(v) => handleWeightChange("founderFit", v)} color="bg-signal" />
                <WeightSlider label="Readiness" value={weights.hireability} onChange={(v) => handleWeightChange("hireability", v)} color="bg-optic" />
                <WeightSlider label="Credibility" value={weights.trust} onChange={(v) => handleWeightChange("trust", v)} color="bg-blue-500" />
              </div>

              <div className="mt-4 border-t border-foreground/10 pt-3">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span className={`${total === 95 ? "text-optic" : "text-signal"}`}>{total}%</span>
                </div>
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>Confidence (displayed separately)</span>
                  <span>5%</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={handleRerank} disabled={loading}
                  className="flex-1 border border-foreground bg-foreground px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-background ink-shadow-sm hover:-translate-y-[1px] transition-transform disabled:opacity-40">
                  {loading ? "Re-ranking..." : "Apply Weights"}
                </button>
                <button onClick={resetWeights}
                  className="border border-foreground/25 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] hover:border-foreground">
                  Reset
                </button>
              </div>

              {message && (
                <div className="mt-3 border border-foreground/15 bg-background p-2 font-mono text-[10px] text-muted-foreground">{message}</div>
              )}
            </div>

            <div className="border border-foreground/15 bg-card p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Past Sessions</h3>
              <div className="mt-3 space-y-2">
                {sessions.length === 0 ? (
                  <p className="font-mono text-xs text-muted-foreground">No sessions yet.</p>
                ) : (
                  sessions.slice(0, 5).map((s) => (
                    <button key={s.id} onClick={() => setActiveSession(s)}
                      className={`block w-full border px-3 py-2 text-left transition-colors ${activeSession?.id === s.id ? "border-foreground bg-foreground text-background" : "border-foreground/15 hover:border-foreground"}`}>
                      <div className="truncate font-mono text-[11px]">{s.jd_title || "Untitled"}</div>
                      <div className={`mt-0.5 font-mono text-[10px] ${activeSession?.id === s.id ? "text-background/70" : "text-muted-foreground"}`}>
                        {s.candidate_count} candidates  top {Math.round(s.top_score)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-foreground/15 pb-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {compareA && compareB ? "Side-by-Side Comparison" : "Top 20 Candidates"}
              </h2>
              <div className="flex items-center gap-3">
                {(compareA || compareB) && (
                  <button onClick={clearCompare} className="font-mono text-[10px] text-signal hover:underline">Clear comparison</button>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">{candidates.length} candidates</span>
              </div>
            </div>

            {comparison && comparison.length === 2 && (
              <div className="mt-4 mb-6 grid grid-cols-2 gap-4">
                {comparison.map((c: any) => (
                  <div key={c.candidate_id} className="border border-foreground/20 bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-display text-lg">{c.profile?.anonymized_name || c.profile?.name || c.candidate_id}</div>
                      <ScoreBadge score={Math.round(c.overall_score)} size="sm" />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">{c.profile?.current_title || c.profile?.headline}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
                      <div>Expertise: <span className="text-foreground">{Math.round(c.capability_score)}</span></div>
                      <div>Startup Potential: <span className="text-foreground">{Math.round(c.founder_fit_score)}</span></div>
                      <div>Readiness: <span className="text-foreground">{Math.round(c.hireability_score)}</span></div>
                      <div>Credibility: <span className="text-foreground">{Math.round(c.trust_score)}</span></div>
                    </div>
                    {c.reasoning && (
                      <div className="mt-2 font-mono text-[9px] text-muted-foreground leading-relaxed">{c.reasoning}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="mt-8 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Run an analysis first on the home page.</p>
                <Link to="/" className="mt-4 inline-block border border-foreground bg-foreground px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-background">
                  Analyze a JD
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-1">
                {candidates.map((c, i) => (
                  <div key={c.candidate_id} className="group flex items-center gap-3 border border-foreground/10 px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-card">
                    <button onClick={() => toggleCompare(c.candidate_id)}
                      className={`w-5 h-5 flex-shrink-0 border ${compareA === c.candidate_id ? "bg-foreground text-background" : compareB === c.candidate_id ? "bg-signal text-background" : "border-foreground/30"} flex items-center justify-center font-mono text-[9px] transition-colors`}>
                      {compareA === c.candidate_id ? "A" : compareB === c.candidate_id ? "B" : "+"}
                    </button>
                    <span className="w-6 font-display text-xl tabular-nums text-foreground/30">{String(i + 1).padStart(2, "0")}</span>
                    <Link to={`/candidate/${c.candidate_id}`} className="flex-1 min-w-0 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base group-hover:text-signal">{c.profile?.anonymized_name || c.profile?.name || c.candidate_id}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{c.profile?.current_title || c.profile?.headline || ""}</div>
                        {c.reasoning && (
                          <div className="mt-0.5 truncate font-mono text-[8px] text-muted-foreground/60">{c.reasoning}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          E:{Math.round(c.capability_score)} SP:{Math.round(c.founder_fit_score)}
                        </span>
                        <ScoreBadge score={Math.round(c.overall_score)} size="sm" />
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightSlider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-signal">{value}%</span>
      </div>
      <input type="range" min={0} max={60} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="mt-1 w-full accent-foreground" />
      <div className="mt-0.5 h-1 w-full bg-foreground/10">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
