import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { LoginForm } from "@/components/auth/login-form";
import { CompassDial } from "@/components/motion/artwork";
import { Logo } from "@/components/brand/logo";
import { Toaster } from "@/components/ui/sonner";
import { getSessionUser } from "@/lib/session";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.portal);

  return (
    <main className="grid min-h-full flex-1 lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-primary-900 px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-[380px] rounded-full border border-primary-700"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 size-[420px] rounded-full border border-primary-700"
        />

        <Link href="/" className="relative inline-flex w-fit rounded-lg text-white">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-[12px] bg-white/12"
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
            <span className="text-[15px] font-semibold leading-5 text-white">
              AICTE
              <span className="block text-[12px] font-medium leading-4 text-primary-200">
                Control Tower
              </span>
            </span>
          </span>
        </Link>

        <div className="relative max-w-[420px]">
          <CompassDial className="mb-8 text-primary-200" />
          <h2 className="text-[32px] font-semibold leading-10 tracking-tight text-white">
            Every stage timed. Every decision signed.
          </h2>
          <p className="mt-4 text-[15px] leading-6 text-primary-200">
            Routing, EVC scheduling and undertaking monitoring in one record,
            with escalations that reach a named owner.
          </p>

          <div className="mt-10 rounded-2xl border border-primary-700 bg-primary-900/60 p-5">
            <div className="flex items-center justify-between text-[12px] text-primary-200">
              <span>Scrutiny</span>
              <span>6 of 5 days</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-700">
              <div className="h-full w-full rounded-full bg-primary-200" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-[13px] text-white">
              <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
              Escalated to the Regional Officer. Awaiting a signed decision.
            </div>
          </div>
        </div>

        <p className="relative text-[12px] text-primary-200">
          Demonstration build. Institutions and cases are fictional.
        </p>
      </section>

      <section className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12">
        <div className="mx-auto flex w-full max-w-[420px] flex-col">
          <div className="mb-10 flex items-center justify-between gap-4 lg:hidden">
            <Logo />
          </div>
          <Link
            href="/"
            className="mb-8 inline-flex w-fit items-center gap-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-primary-900"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to home
          </Link>
          <LoginForm />
        </div>
        <Toaster position="bottom-right" />
      </section>
    </main>
  );
}
