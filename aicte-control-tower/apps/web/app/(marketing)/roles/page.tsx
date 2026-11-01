import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";

import { buttonVariants } from "@/components/ui/button";
import { roleSummaries } from "@/lib/site-content";
import { cn } from "cn";

export default function RolesPage() {
  return (
    <>
      <section className="landing-wash border-b border-line pb-16 pt-14">
        <div className="section-shell">
          <div className="max-w-[760px]">
            <h1 className="text-[36px] font-bold leading-[44px] tracking-tight sm:text-[44px] sm:leading-[52px]">
              Five roles, each with its own portal.
            </h1>
            <p className="mt-4 text-[16px] leading-7 text-muted">
              Permissions are enforced by the service, not by hiding buttons.
              Every list is filtered by region or institution before it reaches a
              screen.
            </p>
          </div>
        </div>
      </section>

      <div className="section-shell py-20">
        <div className="flex flex-col gap-5">
          {roleSummaries.map((role, index) => (
            <section
              key={role.key}
              id={role.key}
              className="scroll-mt-28 rounded-2xl border border-line bg-surface p-6 sm:p-8"
            >
              <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <div>
                  <p className="text-[12px] font-medium text-primary-700">
                    Role {index + 1}
                  </p>
                  <h2 className="mt-1 text-[24px] font-semibold leading-8 tracking-tight">
                    {role.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">{role.who}</p>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-primary-900">Sees</h3>
                    <p className="mt-2 flex items-start gap-2 text-[14px] leading-6 text-muted">
                      <Check size={15} className="mt-1 shrink-0 text-primary-600" aria-hidden="true" />
                      {role.sees}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-primary-900">Main actions</h3>
                    <p className="mt-2 flex items-start gap-2 text-[14px] leading-6 text-muted">
                      <Check size={15} className="mt-1 shrink-0 text-primary-600" aria-hidden="true" />
                      {role.does}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-primary-50 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold leading-7">Try a role</h2>
            <p className="mt-1 text-[14px] text-muted">
              Demonstration accounts are listed on the sign-in page.
            </p>
          </div>
          <Link href="/login" className={cn(buttonVariants())}>
            Sign in
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
}
