import { cn } from "cn";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-5", className)}>
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-[36px] font-bold leading-10 tracking-tight",
          tone === "danger" ? "text-danger" : "text-primary-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-[13px] leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}
