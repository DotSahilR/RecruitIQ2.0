import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Analyze" },
  { to: "/dashboard", label: "Results" },
];

export function SiteNav() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/15 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-medium tracking-tight">RecruitIQ</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            / candidate screening
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.to === "/" ? path === "/" : path.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`relative rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-3 -bottom-[1px] h-[2px] bg-signal" />
                )}
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
