import { Link, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { apiFetch } from "@/lib/auth";

type CandidateDetail = {
  candidate_id: string;
  profile: {
    anonymized_name?: string;
    name?: string;
    headline: string;
    summary: string;
    location: string;
    country: string;
    current_title: string;
    current_company: string;
    years_of_experience: number;
    current_company_size: number;
    current_industry: string;
  };
  skills: { name: string; proficiency: string; endorsements: number; duration_months: number }[];
  career_history: {
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    duration_months: number;
    industry: string;
    company_size: number;
    description: string;
  }[];
  education: { institution: string; degree: string; field_of_study: string; start_year: number; end_year: number; tier: string }[];
  redrob_signals: Record<string, any>;
  overall_score: number;
  capability_score: number;
  founder_fit_score: number;
  hireability_score: number;
  trust_score: number;
  confidence_score: number;
  rank: number;
  reasoning: string;
  is_honeypot: boolean;
  honeypot_reasons: string[];
  honeypot_confidence: number;
  features: {
    capability: { score: number; reasons: string[] };
    founderFit: { score: number; reasons: string[] };
    hireability: { score: number; reasons: string[] };
    trust: { score: number; reasons: string[] };
  };
};

function getWhyRankedItems(c: CandidateDetail): { text: string; type: "strength" | "weakness" }[] {
  const items: { text: string; type: "strength" | "weakness" }[] = [];
  const signals = c.redrob_signals || {};

  if (c.capability_score >= 70) {
    items.push({ text: "Strong technical match", type: "strength" });
  } else if (c.capability_score >= 50) {
    items.push({ text: "Relevant experience", type: "strength" });
  }

  if (c.founder_fit_score >= 60) {
    items.push({ text: "Startup experience", type: "strength" });
  } else if (c.founder_fit_score < 40) {
    items.push({ text: "No startup background", type: "weakness" });
  }

  if (signals.notice_period_days <= 30 && signals.notice_period_days != null) {
    items.push({ text: "Available within 30 days", type: "strength" });
  } else if (signals.notice_period_days > 60) {
    items.push({ text: "Long notice period", type: "weakness" });
  }

  if (signals.open_to_work_flag) {
    items.push({ text: "Actively looking", type: "strength" });
  }

  if (c.hireability_score >= 70) {
    items.push({ text: "Strong readiness signals", type: "strength" });
  }

  if (c.trust_score >= 70) {
    items.push({ text: "Verified profile", type: "strength" });
  } else if (c.trust_score < 50) {
    items.push({ text: "Limited verification", type: "weakness" });
  }

  if (c.is_honeypot) {
    items.push({ text: "Suspicious profile flagged", type: "weakness" });
  }

  let result: { text: string; type: "strength" | "weakness" }[] = [];
  const strengths = items.filter((i) => i.type === "strength");
  const weaknesses = items.filter((i) => i.type === "weakness");

  if (strengths.length >= 3) {
    result = strengths.slice(0, 3);
    if (weaknesses.length > 0) result.push(weaknesses[0]);
  } else {
    result = [...strengths];
    const needed = 3 - result.length;
    result.push(...weaknesses.slice(0, needed));
    if (result.length < 3 && strengths.length + weaknesses.length < 3) {
      result.push({ text: "Profile analysis complete", type: "strength" });
    }
  }

  return result.slice(0, 5);
}

export function CandidatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return navigate("/dashboard");
      setLoading(true);
      try {
        const res = await apiFetch(`/api/dataset/candidates/${id}`);
        const data = await res.json();
        setCandidate(data);
      } catch (err) {
        console.error("Candidate load error:", err);
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-6 py-32 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Loading candidate profile...
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
          <Link to="/dashboard" className="mt-6 inline-block font-mono text-xs uppercase tracking-[0.2em] underline underline-offset-8">
            ← Back to results
          </Link>
        </div>
      </div>
    );
  }

  const c = candidate;
  const p = c.profile || {};
  const signals = c.redrob_signals || {};
  const whyRankedItems = getWhyRankedItems(c);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15">
        <div className="mx-auto max-w-[1600px] px-6 py-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                § Candidate Profile · Rank {String(c.rank).padStart(2, "0")}
              </p>
              <h1 className="mt-2 font-display text-[clamp(2.5rem,4vw,4rem)] font-light leading-[0.95] tracking-[-0.03em]">
                {p.anonymized_name || p.name || c.candidate_id}
              </h1>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {[p.current_title || p.headline, p.location, p.country, p.years_of_experience ? `${p.years_of_experience}y exp` : null]
                  .filter(Boolean).join(" · ")}
              </p>
              {c.is_honeypot && (
                <div className="mt-3 inline-flex items-center gap-2 border border-destructive/30 bg-destructive/5 px-3 py-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-destructive">
                    ⚑ Suspicious Profile
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {Math.round(c.honeypot_confidence * 100)}% confidence
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ScoreCard label="Overall" value={Math.round(c.overall_score)} large />
              <ScoreCard label="Confidence" value={c.confidence_score} />
              <ScoreCard label="Expertise" value={Math.round(c.capability_score)} />
              <ScoreCard label="Startup Potential" value={Math.round(c.founder_fit_score)} />
              <ScoreCard label="Readiness" value={Math.round(c.hireability_score)} />
              <ScoreCard label="Credibility" value={Math.round(c.trust_score)} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-8 border border-foreground/15 bg-card p-6 ink-shadow-sm">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-signal" />
            Why Ranked
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {whyRankedItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 font-mono text-sm">
                {item.type === "strength" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-optic/20 text-optic text-xs font-bold">✓</span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signal/20 text-signal text-xs font-bold">⚠</span>
                )}
                <span className={item.type === "weakness" ? "text-foreground/60" : ""}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {c.is_honeypot && c.honeypot_reasons.length > 0 && (
          <div className="mb-8 border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive">
              Honeypot Detection
            </h3>
            <ul className="mt-2 space-y-1">
              {c.honeypot_reasons.map((r, i) => (
                <li key={i} className="flex gap-2 font-mono text-xs text-foreground/80">
                  <span>•</span> {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <section className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Key Highlights
              </h3>
              <div className="mt-4 space-y-5">
                <HighlightBlock
                  label="Expertise"
                  desc="How well the candidate's experience matches the job."
                  score={Math.round(c.capability_score)}
                  reasons={c.features?.capability?.reasons}
                />
                <HighlightBlock
                  label="Startup Potential"
                  desc="How well the candidate fits a fast-growing startup."
                  score={Math.round(c.founder_fit_score)}
                  reasons={c.features?.founderFit?.reasons}
                />
                <HighlightBlock
                  label="Readiness"
                  desc="How likely the candidate is to join soon."
                  score={Math.round(c.hireability_score)}
                  reasons={c.features?.hireability?.reasons}
                />
                <HighlightBlock
                  label="Credibility"
                  desc="How trustworthy and consistent the profile is."
                  score={Math.round(c.trust_score)}
                  reasons={c.features?.trust?.reasons}
                />
              </div>
            </section>

            <section className="border border-foreground/15 bg-card p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Career Timeline ({c.career_history.length} roles)
              </h3>
              <div className="mt-4 space-y-4">
                {c.career_history.map((h, i) => (
                  <div key={i} className="border-l-2 border-foreground/20 pl-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="font-display text-lg">{h.title}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">at {h.company}</span>
                      </div>
                      {h.is_current && (
                        <span className="rounded-sm bg-optic/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-optic">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {h.start_date} — {h.is_current ? "Present" : h.end_date} · {h.duration_months}mo
                      {h.company_size ? ` · ${h.company_size} employees` : ""}
                    </div>
                    {h.description && (
                      <p className="mt-2 text-sm leading-relaxed text-foreground/80">{h.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="border border-foreground/15 bg-card p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Skills ({c.skills.length})
              </h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.skills.slice(0, 20).map((s) => (
                  <span
                    key={s.name}
                    className="border border-foreground/20 px-2 py-0.5 font-mono text-[11px]"
                    title={`${s.proficiency} · ${Math.round(s.duration_months / 12 || 0)}yrs`}
                  >
                    {s.name}
                    <span className="ml-1 text-[9px] text-muted-foreground">{s.proficiency?.slice(0, 1)}</span>
                  </span>
                ))}
              </div>
            </section>

            {c.education.length > 0 && (
              <section className="border border-foreground/15 bg-card p-5">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Education
                </h3>
                <div className="mt-3 space-y-2">
                  {c.education.map((e, i) => (
                    <div key={i} className="flex items-baseline justify-between">
                      <div>
                        <span className="font-mono text-sm">{e.degree}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{e.institution}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{e.field_of_study}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="border border-foreground/15 bg-card p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Platform Signals
              </h3>
              <div className="mt-3 space-y-2 font-mono text-xs">
                <SignalRow label="Open to work" value={signals.open_to_work_flag ? "Yes" : "No"} />
                <SignalRow label="Notice period" value={signals.notice_period_days ? `${signals.notice_period_days} days` : "—"} />
                <SignalRow label="Response rate" value={signals.recruiter_response_rate ? `${Math.round(signals.recruiter_response_rate * 100)}%` : "—"} />
                <SignalRow label="Interview rate" value={signals.interview_completion_rate ? `${Math.round(signals.interview_completion_rate * 100)}%` : "—"} />
                <SignalRow label="Offer acceptance" value={signals.offer_acceptance_rate ? `${Math.round(signals.offer_acceptance_rate * 100)}%` : "—"} />
                <SignalRow label="Saved by recruiters" value={signals.saved_by_recruiters_30d || 0} />
                <SignalRow label="Profile views (30d)" value={signals.profile_views_received_30d || 0} />
                <SignalRow label="Willing to relocate" value={signals.willing_to_relocate ? "Yes" : "No"} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, large }: { label: string; value: number; large?: boolean }) {
  return (
    <div className={`border border-foreground/15 bg-card p-4 ${large ? "row-span-2" : ""}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`font-display tabular-nums leading-none ${large ? "mt-1 text-5xl" : "mt-1 text-2xl"}`}>
        {Math.round(value)}
        {large && <span className="text-lg text-muted-foreground">/100</span>}
      </div>
    </div>
  );
}

function HighlightBlock({ label, desc, score, reasons }: { label: string; desc: string; score: number; reasons?: string[] }) {
  return (
    <div className="border-b border-foreground/10 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-mono text-sm font-medium">{label}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{desc}</span>
        </div>
        <span className="font-mono text-lg tabular-nums">{score}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-foreground/10">
        <div className="h-full bg-foreground" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      {reasons && reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <span key={i} className="flex items-center gap-1 font-mono text-[10px] text-foreground/70">
              <span className="inline-block h-1 w-1 rounded-full bg-signal" />
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between border-b border-foreground/10 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{String(value)}</span>
    </div>
  );
}
