import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SiteNav } from "@/components/site-nav";
import { apiFetch } from "@/lib/auth";

export function HomePage() {
  const navigate = useNavigate();
  const [jdText, setJdText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ candidatesLoaded: 0, embeddingsReady: false });

  useEffect(() => {
    apiFetch("/api/status").then(r => r.json()).then(setStatus).catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!jdText.trim()) return;
    setAnalyzing(true);
    setError("");

    try {
      const jdRes = await apiFetch("/api/jd/analyze", {
        method: "POST",
        body: JSON.stringify({ text: jdText })
      });
      const jd = await jdRes.json();

      const rankRes = await apiFetch("/api/rank", {
        method: "POST",
        body: JSON.stringify({ jdId: jd.id })
      });
      const result = await rankRes.json();

      navigate(`/dashboard?sessionId=${result.sessionId}`);
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <section className="relative overflow-hidden border-b border-foreground/15">
        <div className="grid-paper absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-[1400px] px-6 pb-16 pt-16">
          <div className="mb-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-px w-12 bg-foreground" />
            Recruiter Screening Tool
          </div>
          <h1 className="font-display text-[clamp(2.5rem,6vw,6rem)] font-light leading-[0.92] tracking-tight">
            Rank candidates the way a great recruiter would.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
            Paste a job description below. We rank candidates by expertise, startup potential, readiness, and credibility.
          </p>

          {status.candidatesLoaded > 0 && <div className="mt-4" />}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Job Description
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste a job description here..."
              rows={16}
              className="mt-2 w-full border border-foreground/25 bg-background p-4 font-mono text-sm leading-relaxed focus:border-foreground focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {jdText.length.toLocaleString()} characters
              </span>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="border border-foreground/15 bg-card p-5 ink-shadow-sm">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                How scoring works
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: "Expertise", weight: "40%", desc: "Technical skills, JD match, production experience" },
                  { label: "Startup Potential", weight: "20%", desc: "Startup history, ownership, product thinking" },
                  { label: "Readiness", weight: "20%", desc: "Availability, notice period, engagement" },
                  { label: "Credibility", weight: "15%", desc: "Profile quality, career evidence, certifications" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between border-b border-foreground/10 pb-2">
                    <div>
                      <div className="font-mono text-sm font-medium">{item.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{item.desc}</div>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-signal">{item.weight}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground/60">
                Total score uses a 95-point system. Confidence is displayed separately and does not affect ranking.
              </p>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || !jdText.trim()}
              className="mt-6 w-full border border-foreground bg-foreground px-6 py-4 font-mono text-sm uppercase tracking-[0.2em] text-background ink-shadow transition-all hover:-translate-y-[1px] disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Analyzing...
                </span>
              ) : (
                "Analyze & Rank Candidates →"
              )}
            </button>

            {error && (
              <div className="mt-4 border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
