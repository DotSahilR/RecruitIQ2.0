import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteNav } from "@/components/site-nav";
import { API_URL, authFetch } from "@/lib/auth";

const ACCEPT = [".pdf", ".doc", ".docx", ".txt"];

type UploadedFile = { name: string; size: number; status: "queued" | "ready" | "error"; progress: number; fileObj?: File };

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadPage() {
  const nav = useNavigate();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [jd, setJd] = useState("");
  const [jdFile, setJdFile] = useState<string | null>(null);
  const [jdFileObj, setJdFileObj] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const valid: UploadedFile[] = [];
    let bad = 0;
    for (const f of incoming) {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      if (!ACCEPT.includes(ext)) { bad++; continue; }
      valid.push({ name: f.name, size: f.size, status: "queued", progress: 0, fileObj: f });
    }
    if (bad > 0) setError(`${bad} file${bad > 1 ? "s" : ""} rejected — only PDF, DOC, DOCX, TXT accepted.`);
    else setError(null);
    setFiles((cur) => [...cur, ...valid]);
    
    // Simulate quick visual validation and load
    valid.forEach((vf) => {
      let p = 0;
      const iv = setInterval(() => {
        p = Math.min(100, p + 25);
        setFiles((cur) => cur.map((f) => f.name === vf.name ? { ...f, progress: p, status: p >= 100 ? "ready" : "queued" } : f));
        if (p >= 100) clearInterval(iv);
      }, 80);
    });
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const canAnalyze = files.some((f) => f.status === "ready") && (jd.trim().length > 20 || jdFile);

  const analyze = async () => {
    if (!canAnalyze) {
      setError("Add at least one résumé and a job description (20+ characters).");
      return;
    }
    setAnalyzing(true);
    setError(null);

    try {
      // 1. Upload Resumes (Multipart batch)
      const formData = new FormData();
      let hasFile = false;
      files.forEach((f) => {
        if (f.fileObj) {
          formData.append("resumes", f.fileObj);
          hasFile = true;
        }
      });

      if (!hasFile) {
        throw new Error("No files are ready for upload.");
      }

      const uploadRes = await authFetch(`${API_URL}/api/resumes/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || "Failed to upload resumes.");
      }
      const uploadData = await uploadRes.json();
      if (!uploadData.candidates || uploadData.candidates.length === 0) {
        throw new Error(uploadData.error || "No candidates were created from the uploaded resume files.");
      }

      // 2. Upload Job Description
      const jdFormData = new FormData();
      jdFormData.append("title", jdFile ? jdFile.replace(/\.[^/.]+$/, "") : "Target Spec Role");
      jdFormData.append("description", jd);
      if (jdFileObj) jdFormData.append("jd", jdFileObj);

      const jdRes = await authFetch(`${API_URL}/api/jd/upload`, {
        method: "POST",
        body: jdFormData,
      });

      if (!jdRes.ok) {
        const errData = await jdRes.json();
        throw new Error(errData.error || "Failed to save job description.");
      }
      const jdData = await jdRes.json();

      // 3. Trigger analysis comparison
      const analyzeRes = await authFetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: jdData.job.id,
        }),
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || "Failed to execute candidate matching.");
      }

      // Complete analysis, redirect to dashboard results page
      nav("/dashboard");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Server communication error. Make sure backend is running.");
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <div className="mx-auto max-w-[1400px] px-6 py-12">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">§ Intake</p>
            <h1 className="mt-2 font-display text-5xl tracking-tight">New screening session</h1>
          </div>
          <div className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:block">
            Session ID · Created after analysis
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
          {/* Résumés */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-2xl">① Résumés</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                PDF · DOC · DOCX · TXT
              </span>
            </div>

            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={`relative block cursor-pointer border-2 border-dashed p-12 text-center transition-all ${
                drag ? "border-signal bg-signal/5" : "border-foreground/30 hover:border-foreground"
              }`}
            >
              <input
                type="file"
                multiple
                accept={ACCEPT.join(",")}
                className="sr-only"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <div className="font-display text-4xl">
                {drag ? "Release to upload." : "Drop résumés here."}
              </div>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                or <span className="underline underline-offset-4">browse files</span> · multiple OK
              </p>
            </label>

            {error && (
              <div className="mt-3 border border-destructive/40 bg-destructive/5 px-4 py-2 font-mono text-xs text-destructive">
                ! {error}
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-6 border border-foreground/15">
                <div className="flex items-center justify-between border-b border-foreground/15 bg-card px-4 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Queue · {files.length}
                  </span>
                  <button
                    onClick={() => setFiles([])}
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <ul>
                  {files.map((f, i) => (
                    <li key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-foreground/10 px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm">{f.name}</div>
                        <div className="mt-1 h-[3px] w-full bg-foreground/10">
                          <div
                            className={`h-full transition-all ${f.status === "ready" ? "bg-optic" : "bg-foreground"}`}
                            style={{ width: `${f.progress}%` }}
                          />
                        </div>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {fmt(f.size)}
                      </span>
                      <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                        f.status === "ready" ? "text-optic" : "text-muted-foreground"
                      }`}>
                        {f.status === "ready" ? "✓ ready" : `${Math.round(f.progress)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* JD */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-2xl">② Job description</h2>
              <label className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setJdFile(f.name);
                      setJdFileObj(f);
                      if (f.name.endsWith(".txt")) {
                        const txt = await f.text();
                        setJd(txt);
                      } else {
                        setJd("");
                      }
                    }
                  }}
                />
                + upload file
              </label>
            </div>

            <div className="border border-foreground/20 bg-card">
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder="Paste the role spec. Required skills, seniority, scope, anything you'd say to a recruiter. The more grain, the better the ranking."
                rows={14}
                className="w-full resize-none bg-transparent p-5 font-mono text-sm leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
              />
              <div className="flex items-center justify-between border-t border-foreground/15 bg-background px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>{jd.length} chars</span>
                {jdFile && <span className="text-foreground">📎 {jdFile}</span>}
              </div>
            </div>

            <button
              onClick={analyze}
              disabled={analyzing}
              className="group mt-6 flex w-full items-center justify-between border border-foreground bg-foreground px-6 py-4 text-background ink-shadow transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] disabled:opacity-50"
            >
              <span className="font-mono text-xs uppercase tracking-[0.25em]">
                {analyzing ? "Analysing résumés…" : "Analyse candidates"}
              </span>
              <span className="font-display text-3xl leading-none">
                {analyzing ? "◐" : "→"}
              </span>
            </button>
            {!canAnalyze && (
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Needs at least one résumé and a job description
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
