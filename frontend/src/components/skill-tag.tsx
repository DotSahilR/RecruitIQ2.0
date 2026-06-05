export function SkillTag({ label, variant = "match" }: { label: string; variant?: "match" | "missing" | "neutral" }) {
  const styles = {
    match: "border-foreground/20 bg-foreground/[0.04] text-foreground",
    missing: "border-destructive/30 bg-destructive/5 text-destructive line-through decoration-destructive/50",
    neutral: "border-foreground/15 bg-background text-muted-foreground",
  }[variant];
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${styles}`}>
      {label}
    </span>
  );
}
