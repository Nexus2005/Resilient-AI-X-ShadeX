"use client";

import { useState } from "react";
import { FingerprintSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import type { ChainStatus } from "@/lib/types";

export function ChainVerify() {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/proxy/audit/verify", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(typeof body.detail === "string" ? body.detail : "The chain could not be verified.");
      return;
    }
    setStatus(body as ChainStatus);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="outline" size="lg" onClick={verify} disabled={pending}>
        <FingerprintSimple size={16} aria-hidden="true" />
        Verify chain
      </Button>
      <p aria-live="polite" className="text-[12px]">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : status ? (
          status.valid ? (
            <span className="text-ink">
              Chain verified. {status.checked} events intact.
            </span>
          ) : (
            <span className="text-danger">
              Chain broken at event {status.broken_id}. {status.checked} events checked.
            </span>
          )
        ) : (
          <span className="text-muted">Recomputes every hash from the first event.</span>
        )}
      </p>
    </div>
  );
}
