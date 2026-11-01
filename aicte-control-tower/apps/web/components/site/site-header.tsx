"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, List, X } from "@phosphor-icons/react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { navigationLinks } from "@/lib/site-content";
import { cn } from "cn";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-4 z-50 px-4">
      <nav
        aria-label="Main"
        className="mx-auto w-full max-w-[1160px] rounded-full border border-line bg-surface px-3 py-2 shadow-card"
      >
        <div className="flex items-center justify-between gap-4 pl-2">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {navigationLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium transition-colors duration-150",
                      active
                        ? "bg-primary-100 text-primary-900"
                        : "text-muted hover:bg-primary-50 hover:text-primary-900",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "default" }), "hidden md:inline-flex")}
            >
              Sign in
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              className="inline-flex size-10 items-center justify-center rounded-full text-primary-900 transition-colors hover:bg-primary-50 md:hidden"
            >
              {open ? <X size={20} /> : <List size={20} />}
            </button>
          </div>
        </div>

        {open ? (
          <div id="mobile-nav" className="border-t border-line px-2 pb-2 pt-3 md:hidden">
            <ul className="flex flex-col gap-1">
              {navigationLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex h-11 items-center rounded-xl px-3 text-[15px] font-medium text-ink hover:bg-primary-50"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className={cn(buttonVariants(), "mt-3 w-full")}
            >
              Sign in
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
