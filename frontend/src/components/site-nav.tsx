import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { clearAuth, getUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

const LINKS = [
  { to: "/", label: "Index" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pipeline", label: "Pipeline" },
];

export function SiteNav() {
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const logout = () => {
    clearAuth();
    setUser(null);
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/15 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-medium tracking-tight">RecruitIQ</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            / recruitment intelligence
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
          <Link
            to="/upload"
            className="ml-3 inline-flex items-center gap-2 rounded-sm border border-foreground bg-foreground px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-background ink-shadow-sm transition-transform hover:-translate-y-[1px]"
          >
            Start screening →
          </Link>
          {user && (
            <button
              onClick={logout}
              className="ml-2 rounded-sm border border-foreground/25 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              {user.name.split(" ")[0]} · Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
