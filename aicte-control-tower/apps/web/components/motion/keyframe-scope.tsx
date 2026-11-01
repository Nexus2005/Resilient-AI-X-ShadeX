"use client";

import { useId, type ReactNode } from "react";

type LayerConfig = {
  property?: string;
  transform?: string;
  values?: number[];
  from?: number;
  to?: number;
  keyTimes?: number[];
  duration?: string;
  delay?: number | string;
  easing?: string;
  origin?: string;
  dashArray?: number;
};

export type KeyframeConfig = {
  layers?: Record<string, LayerConfig>;
  targets?: string[];
  includes?: string;
  static?: boolean;
  [key: string]: unknown;
};

function clean(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function parseSeconds(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.endsWith("ms")) return Number.parseFloat(value) / 1000;
  if (typeof value === "string" && value.endsWith("s")) return Number.parseFloat(value);
  return 0;
}

function framesFor(layer: LayerConfig): { offset: number; value: number }[] {
  const values =
    layer.values ??
    (layer.from !== undefined && layer.to !== undefined ? [layer.from, layer.to] : []);
  if (values.length === 0) return [];
  const keyTimes =
    layer.keyTimes ??
    (values.length === 1 ? [0] : values.map((_, index) => index / (values.length - 1)));
  return values.map((value, index) => ({
    offset: keyTimes[index] ?? (values.length === 1 ? 0 : index / (values.length - 1)),
    value,
  }));
}

function declaration(layer: LayerConfig, value: number): string | null {
  if (layer.property === "opacity") return `opacity: ${value}`;
  if (layer.property === "stroke-dashoffset") return `stroke-dashoffset: ${value}`;
  switch (layer.transform) {
    case "rotate":
      return `transform: rotate(${value}deg)`;
    case "translateY":
      return `transform: translateY(${value}px)`;
    case "translateX":
      return `transform: translateX(${value}px)`;
    case "scale":
      return `transform: scale(${value})`;
    default:
      return null;
  }
}

function buildCss(scope: string, config: KeyframeConfig): string {
  const layers = Object.entries(config.layers ?? {});
  const rules: string[] = [];

  layers.forEach(([name, layer], index) => {
    const frames = framesFor(layer);
    if (frames.length === 0) return;

    const animation = `kf_${scope}_${index}`;
    const stops = frames
      .map((frame) => {
        const body = declaration(layer, frame.value);
        return body ? `${(frame.offset * 100).toFixed(2)}% { ${body} }` : null;
      })
      .filter(Boolean)
      .join(" ");

    if (!stops) return;
    rules.push(`@keyframes ${animation} { ${stops} }`);
    rules.push(
      `[data-kf="${scope}"] [data-layer="${name}"] { animation: ${animation} ${layer.duration ?? "3s"} ${layer.easing ?? "ease-in-out"} ${parseSeconds(layer.delay)}s infinite; transform-origin: ${layer.origin ?? "center"}; }`,
    );
  });

  return rules.join("\n");
}

/**
 * Applies an animation config to the artwork inside this scope.
 * Motion is off when the visitor asks for reduced motion.
 */
export function KeyframeScope({
  config,
  children,
  className,
  label,
}: {
  config: KeyframeConfig;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const rawId = useId();
  const scope = clean(rawId);
  const css = buildCss(scope, config);

  return (
    <div
      data-kf={scope}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      className={className}
    >
      <style>{`@media (prefers-reduced-motion: no-preference) { ${css} }`}</style>
      {children}
    </div>
  );
}
