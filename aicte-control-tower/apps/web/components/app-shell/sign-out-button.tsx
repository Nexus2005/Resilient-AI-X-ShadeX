"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOut } from "@phosphor-icons/react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-muted transition-colors hover:bg-primary-50 hover:text-primary-900 disabled:opacity-60"
    >
      <SignOut size={16} aria-hidden="true" />
      {compact ? <span className="sr-only">Sign out</span> : "Sign out"}
    </button>
  );
}
