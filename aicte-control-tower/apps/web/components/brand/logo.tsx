import { cn } from "cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-600",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none">
        <path
          d="M6 18V13M12 18V7M18 18V10"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold leading-5 text-primary-900">
        AICTE
        <span className="block text-[12px] font-medium leading-4 text-muted">
          Control Tower
        </span>
      </span>
    </span>
  );
}
