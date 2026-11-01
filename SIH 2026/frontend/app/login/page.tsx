"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button, ErrorBox, Field, inputClass } from "@/components/ui";

const DEMO_USERS = [
  { email: "admin@resilient-ai.local", label: "AICTE admin", detail: "Full access to intake and settings" },
  { email: "reviewer@resilient-ai.local", label: "Scrutiny reviewer", detail: "Confirm and correct classifications" },
  { email: "institution@resilient-ai.local", label: "Institution head", detail: "Create and upload applications" },
  { email: "auditor@resilient-ai.local", label: "Auditor", detail: "Read-only access to evidence" },
];

export default function LoginPage() {
  const { login, me, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@resilient-ai.local");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace("/dashboard");
  }, [loading, me, router]);

  async function doLogin(mail: string, pw: string) {
    setError(null);
    setBusy(true);
    try {
      await login(mail, pw);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[#070B1E] lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "url(/landing/neural.webp)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(7,11,30,0.94), rgba(7,11,30,0.55))" }} />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#7BF1C0" strokeWidth="2.2">
                <path d="M5 19L19 5M5 5l14 14" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[18px] font-semibold text-white">
              Resilient AI <span className="text-[#7BF1C0]">X ShadeX</span>
            </span>
          </Link>
        </div>
        <div className="relative max-w-md">
          <p className="text-[12px] uppercase tracking-[0.18em] text-[#7EA6FF]">Module 1 · Intake gateway</p>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
            Validate every document before scrutiny begins
          </h1>
          <p className="mt-5 text-[14px] leading-7 text-[#AEB9D6]">
            Upload a bundle, watch real processing stages run, correct what the classifier is unsure about
            and export a signed intake manifest. No simulated progress bars.
          </p>
          <ul className="mt-8 space-y-3 text-[13px] text-[#C1CBE5]">
            {[
              "Private storage with SHA-256 integrity for every original",
              "Page-level text, OCR confidence and quality flags",
              "Versioned checklist reconciliation against the application",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7BF1C0]" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-[11px] text-[#7C88A6]">
          Synthetic demo environment · simulated external checks · no real identity documents
        </div>
      </div>

      <div className="flex items-center justify-center bg-[#F5F6FA] px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Link href="/" className="text-[17px] font-semibold text-[#0B1230]">
              Resilient AI <span className="text-[#2F6BFF]">X ShadeX</span>
            </Link>
          </div>
          <div className="rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgba(11,18,48,0.12)]">
            <h2 className="text-[22px] font-semibold tracking-tight text-[#0B1230]">Sign in</h2>
            <p className="mt-1.5 text-[13px] text-[#5A6580]">
              Continue to the documents intake workspace.
            </p>
            <div className="mt-6">
              <ErrorBox message={error} />
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doLogin(email, password);
                }}
              >
                <Field label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field label="Password">
                  <input
                    className={inputClass}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </div>

            <div className="mt-7 border-t border-[#E6EAF2] pt-5">
              <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-[#7B879F]">
                Demo accounts · password Password123!
              </div>
              <div className="grid gap-2">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    onClick={() => void doLogin(u.email, "Password123!")}
                    className="flex items-center justify-between rounded-lg border border-[#E6EAF2] px-3 py-2 text-left transition hover:border-[#2F6BFF] hover:bg-[#F3F6FF] disabled:cursor-not-allowed"
                    disabled={busy}
                  >
                    <span>
                      <span className="block text-[12px] font-semibold text-[#0B1230]">{u.label}</span>
                      <span className="block text-[10.5px] text-[#7B879F]">{u.detail}</span>
                    </span>
                    <span className="text-[10px] text-[#2F6BFF]">Use →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[11px] text-[#7B879F]">
            <Link href="/" className="hover:text-[#2F6BFF]">
              ← Back to platform overview
            </Link>
            <span>Module 1 · intake readiness</span>
          </div>
        </div>
      </div>
    </div>
  );
}
