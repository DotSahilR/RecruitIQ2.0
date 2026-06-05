import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, loginOrRegister } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) navigate("/");
  }, [navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginOrRegister(mode, {
        ...(mode === "register" ? { name } : {}),
        email,
        password,
      });
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1200px] grid-cols-1 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col justify-between border-b border-foreground/15 px-6 py-10 lg:border-b-0 lg:border-r lg:px-10">
          <div className="font-display text-3xl">RecruitIQ</div>
          <div className="max-w-3xl py-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              HR workspace
            </p>
            <h1 className="mt-4 font-display text-[clamp(3rem,8vw,7rem)] font-light leading-[0.95] tracking-tight">
              Your private screening desk.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Log in before uploading résumés. Every job description, candidate, score, and past session stays tied to your HR account.
            </p>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            JWT secured · PostgreSQL backed
          </p>
        </section>

        <section className="flex items-center px-6 py-10 lg:px-10">
          <form onSubmit={submit} className="w-full border border-foreground bg-card p-6 ink-shadow">
            <div className="mb-6 flex border border-foreground/20 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] ${
                  mode === "login" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] ${
                  mode === "register" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                Register
              </button>
            </div>

            <h2 className="font-display text-4xl">
              {mode === "login" ? "Welcome back." : "Create HR account."}
            </h2>

            <div className="mt-6 space-y-4">
              {mode === "register" && (
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 w-full border border-foreground/25 bg-background px-3 py-3 text-sm focus:border-foreground focus:outline-none"
                    required
                  />
                </label>
              )}
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border border-foreground/25 bg-background px-3 py-3 text-sm focus:border-foreground focus:outline-none"
                  required
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full border border-foreground/25 bg-background px-3 py-3 text-sm focus:border-foreground focus:outline-none"
                  minLength={6}
                  required
                />
              </label>
            </div>

            {error && (
              <div className="mt-4 border border-destructive/40 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
                ! {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-between border border-foreground bg-foreground px-5 py-4 text-background ink-shadow-sm transition-transform hover:-translate-y-[1px] disabled:opacity-60"
            >
              <span className="font-mono text-xs uppercase tracking-[0.22em]">
                {loading ? "Please wait" : mode === "login" ? "Login" : "Create account"}
              </span>
              <span className="font-display text-3xl leading-none">→</span>
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
