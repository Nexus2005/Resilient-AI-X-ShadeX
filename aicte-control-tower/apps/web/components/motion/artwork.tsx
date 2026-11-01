import arrowsConfig from "@/components/motion/data/arrows.json";
import cloudsConfig from "@/components/motion/data/clouds.json";
import compassConfig from "@/components/motion/data/compass.json";
import windLinesConfig from "@/components/motion/data/wind-lines.json";

import { KeyframeScope } from "@/components/motion/keyframe-scope";

/** Two dashed lines that drift, driven by the supplied wind-lines keyframe file. */
export function DriftingLines({ className }: { className?: string }) {
  return (
    <KeyframeScope config={windLinesConfig} className={className}>
      <svg viewBox="0 0 560 180" className="h-full w-full" fill="none">
        <path
          data-layer="Wind Line 1"
          d="M10 60 C 140 10, 250 120, 386 60 S 520 18, 552 44"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="50 26"
        />
        <path
          data-layer="Wind Line 1_2"
          d="M8 128 C 120 88, 236 168, 360 116 S 500 86, 554 112"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="50 26"
        />
      </svg>
    </KeyframeScope>
  );
}

/** Three chevrons that step in sequence, from the supplied arrows keyframe file. */
export function StepChevrons({ className }: { className?: string }) {
  return (
    <KeyframeScope config={arrowsConfig} className={className}>
      <svg viewBox="0 0 160 28" className="h-7 w-40" fill="none">
        {[0, 1, 2].map((index) => (
          <path
            key={index}
            data-layer={`Arrow ${index + 1}`}
            d={`M${14 + index * 50} 6 L${30 + index * 50} 14 L${14 + index * 50} 22`}
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </KeyframeScope>
  );
}

/** A soft haze band that drifts, driven by the supplied clouds keyframe file. */
export function DriftingHaze({ className }: { className?: string }) {
  return (
    <KeyframeScope config={cloudsConfig} className={className}>
      <svg viewBox="0 0 900 220" className="h-full w-full" fill="none" preserveAspectRatio="none">
        <g data-layer="Cloud">
          <ellipse cx="250" cy="150" rx="230" ry="58" fill="currentColor" />
          <ellipse cx="470" cy="128" rx="250" ry="62" fill="currentColor" />
          <ellipse cx="690" cy="156" rx="210" ry="52" fill="currentColor" />
        </g>
      </svg>
    </KeyframeScope>
  );
}

/** A compass dial whose needle sways, from the supplied compass keyframe file. */
export function CompassDial({ className }: { className?: string }) {
  return (
    <KeyframeScope
      config={compassConfig}
      className={className}
      label="A compass dial settling on north"
    >
      <svg viewBox="0 0 160 160" className="size-40" fill="none" aria-hidden="true">
        <circle cx="80" cy="80" r="72" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
        <circle cx="80" cy="80" r="58" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index * 30 * Math.PI) / 180;
          const inner = 50;
          const outer = 56;
          return (
            <line
              key={index}
              x1={80 + Math.sin(angle) * inner}
              y1={80 - Math.cos(angle) * inner}
              x2={80 + Math.sin(angle) * outer}
              y2={80 - Math.cos(angle) * outer}
              stroke="currentColor"
              strokeOpacity={index % 3 === 0 ? 0.9 : 0.4}
              strokeWidth={index % 3 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <text x="80" y="24" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.7">
          N
        </text>
        <text x="80" y="145" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.5">
          S
        </text>
        <g data-layer="Pointer">
          <path d="M80 44 L88 84 L80 92 L72 84 Z" fill="currentColor" />
          <circle cx="80" cy="80" r="4" fill="var(--brand-900)" />
        </g>
      </svg>
    </KeyframeScope>
  );
}
