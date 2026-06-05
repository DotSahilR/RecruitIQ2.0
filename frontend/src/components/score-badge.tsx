export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const tone =
    score >= 85 ? "bg-optic text-optic-foreground" :
    score >= 70 ? "bg-signal text-signal-foreground" :
    "bg-foreground/10 text-foreground";

  const sizes = {
    sm: "text-[11px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-base px-3 py-1.5",
  }[size];

  return (
    <span className={`font-mono inline-flex items-baseline gap-0.5 rounded-sm ${sizes} ${tone}`}>
      <span className="font-bold tabular-nums">{score}</span>
      <span className="opacity-70">/100</span>
    </span>
  );
}

export function ScoreBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>{label}</span>
          <span className="text-foreground tabular-nums">{value}</span>
        </div>
      )}
      <div className="h-[6px] w-full overflow-hidden rounded-sm bg-foreground/10">
        <div
          className="h-full bg-foreground transition-[width] duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
