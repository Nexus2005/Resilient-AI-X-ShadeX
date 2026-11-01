import { cn } from "cn";

export function ClockBar({
  elapsedDays,
  targetDays,
  label = "Time in stage",
  className,
}: {
  elapsedDays: number;
  targetDays: number;
  label?: string;
  className?: string;
}) {
  const ratio = targetDays === 0 ? 0 : elapsedDays / targetDays;
  const over = elapsedDays > targetDays;
  const width = Math.min(ratio, 1) * 100;

  return (
    <div className={cn("min-w-[160px]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-muted">{label}</span>
        <span
          className={cn(
            "text-[13px] tabular-nums",
            over ? "font-medium text-danger" : ratio >= 0.8 ? "font-medium text-primary-700" : "text-ink",
          )}
        >
          {elapsedDays} of {targetDays} days
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-primary-100"
        role="progressbar"
        aria-valuenow={elapsedDays}
        aria-valuemin={0}
        aria-valuemax={targetDays}
        aria-label={`${label}: ${elapsedDays} of ${targetDays} days`}
      >
        <div
          className={cn("h-full rounded-full", over ? "bg-danger" : "bg-primary-600")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
