import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";

const columns = [
  {
    title: "Platform",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Roles", href: "/roles" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Roles",
    links: [
      { label: "Institution", href: "/roles#institution" },
      { label: "Regional Officer", href: "/roles#regional" },
      { label: "EVC Coordinator", href: "/roles#evc" },
      { label: "Bureau Officer", href: "/roles#bureau" },
      { label: "Admin", href: "/roles#admin" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Approval lifecycle", href: "/how-it-works#lifecycle" },
      { label: "Routing rules", href: "/how-it-works#routes" },
      { label: "Safeguards", href: "/about#safeguards" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Who does what", href: "/roles" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="section-shell py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <LogoMark />
            <p className="mt-4 max-w-[240px] text-[13px] leading-5 text-muted">
              Approval workflow automation, compliance monitoring and alert
              management for AICTE.
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-[13px] font-semibold text-primary-900">
                {column.title}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-muted transition-colors hover:text-primary-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Built for Institutional Regulatory Compliance Platform. Prototype, not a certified government service.</p>
          <p>Demo data throughout. Institutions are fictional.</p>
        </div>
      </div>
    </footer>
  );
}
