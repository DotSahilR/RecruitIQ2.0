import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ScoreBadge } from "@/components/score-badge";
import { SiteNav } from "@/components/site-nav";
import { SkillTag } from "@/components/skill-tag";
import { API_URL, authFetch, getToken } from "@/lib/auth";

type HomeCandidate = {
  id: string;
  name: string;
  role: string;
  location: string;
  score: number;
  experience: number;
  matchingSkills: string[];
};

export function HomePage() {
  const [topCandidates, setTopCandidates] = useState<HomeCandidate[]>([]);

  useEffect(() => {
    async function loadResults() {
      if (!getToken()) return;

      try {
        const res = await authFetch(`${API_URL}/api/results`);
        if (!res.ok) return;
        const data = await res.json();
        setTopCandidates((data.results || []).slice(0, 3));
      } catch (error) {
        console.error("Home results load error:", error);
      }
    }

    loadResults();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="border-b border-foreground/15 bg-foreground text-background">
        <div className="flex overflow-hidden">
          <div className="flex animate-ticker whitespace-nowrap py-1.5">
            {Array.from({ length: 2 }).flatMap((_, k) =>
              ["RECRUITMENT INTELLIGENCE", "EXPLAINABLE SCORING", "PDF DOC DOCX", "RANKED IN SECONDS"].map((t, i) => (
                <span key={`${k}-${i}`} className="mx-8 font-mono text-[11px] uppercase tracking-[0.3em]">
                  {t}
                </span>
              )),
            )}
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-foreground/15">
        <div className="grid-paper absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-[1400px] grid-cols-12 gap-8 px-6 pb-24 pt-20">
          <div className="col-span-12 lg:col-span-8">
            <div className="mb-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              <span className="h-px w-12 bg-foreground" />
              Hiring workspace
            </div>
            <h1 className="font-display text-[clamp(3rem,8.5vw,8.5rem)] font-light leading-[0.92] tracking-tight">
              Rank resumes against a job description.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-foreground/80">
              Upload candidate resumes, add a role description, and get an explainable ranking with scores, matching skills,
              missing skills, and candidate previews.
            </p>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link
                to="/upload"
                className="group inline-flex items-center gap-3 rounded-sm border border-foreground bg-foreground px-6 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-background ink-shadow transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px]"
              >
                Start screening
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground/80 underline-offset-8 hover:underline"
              >
                View dashboard
              </Link>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <div className="border border-foreground bg-card p-5 ink-shadow">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Candidate preview</span>
                <span className="h-2 w-2 rounded-full bg-optic" />
              </div>
              <div className="mt-4 font-display text-3xl leading-tight">
                {topCandidates[0]?.name || "No screening yet"}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {topCandidates[0]?.role || "Upload CVs to create rankings"}
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Match</div>
                  <div className="font-display text-6xl leading-none tabular-nums">{topCandidates[0]?.score || 0}</div>
                </div>
                <ScoreBadge score={topCandidates[0]?.score || 0} size="lg" />
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {(topCandidates[0]?.matchingSkills || []).slice(0, 5).map((skill) => (
                  <SkillTag key={skill} label={skill} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-foreground/15 bg-card">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Recent output</p>
              <h2 className="mt-2 font-display text-5xl tracking-tight">Your top three.</h2>
            </div>
            <Link to="/dashboard" className="font-mono text-xs uppercase tracking-[0.2em] underline-offset-8 hover:underline">
              See dashboard →
            </Link>
          </div>

          {topCandidates.length === 0 ? (
            <div className="border border-dashed border-foreground/30 bg-background p-10 text-center">
              <div className="font-display text-3xl">No screenings yet.</div>
              <p className="mx-auto mt-3 max-w-md font-mono text-[11px] uppercase leading-relaxed tracking-[0.2em] text-muted-foreground">
                Upload resumes and a job description to create real rankings.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {topCandidates.map((candidate, index) => (
                <Link
                  key={candidate.id}
                  to={`/candidate/${candidate.id}`}
                  className="group block border border-foreground/15 bg-background p-6 transition-all hover:border-foreground hover:ink-shadow"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Rank {String(index + 1).padStart(2, "0")}
                    </span>
                    <ScoreBadge score={candidate.score} />
                  </div>
                  <h3 className="mt-4 font-display text-3xl leading-tight">{candidate.name}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{candidate.role}</p>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {candidate.matchingSkills.slice(0, 4).map((skill) => (
                      <SkillTag key={skill} label={skill} />
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-foreground/10 pt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    <span>{candidate.experience} yrs · {candidate.location}</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
