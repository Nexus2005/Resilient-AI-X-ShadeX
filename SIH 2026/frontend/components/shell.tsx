"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, type Me } from "@/lib/auth";
import { Spinner } from "@/components/ui";

type NavItem = { href: string; label: string; icon: string };

const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/applications", label: "Applications", icon: "folder" },
  { href: "/applications/new", label: "New application", icon: "plus" },
];

const ICONS: Record<string, ReactNode> = {
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  upload: <path d="M12 16V4m0 0L8 8m4-4l4 4M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  check: <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  doc: <path d="M7 3h7l4 4v14H7zM14 3v4h4M9 12h7M9 16h7" />,
  cog: <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM4 12H2m20 0h-2M12 4V2m0 20v-2M5.6 5.6L4.2 4.2m15.6 15.6l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" />,
};

function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function SidebarBody({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#7BF1C0" strokeWidth="2.2">
            <path d="M5 19L19 5M5 5l14 14" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-white">
            Resilient AI <span className="text-[#7BF1C0]">X ShadeX</span>
          </div>
          <div className="text-[10.5px] text-[#8D9AC0]">Documents intake · Module 1</div>
        </div>
      </div>

      <div className="px-3">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6E7CA6]">
          Module 1 workspace
        </div>
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition ${
                  active
                    ? "bg-[#1D2C57] font-medium text-white shadow-inner"
                    : "text-[#B3BFDD] hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon name={item.icon} />
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#7BF1C0]" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-4 pb-5 pt-8">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F6BFF]/25 text-[11px] font-semibold text-white">
              {me.full_name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-white">{me.full_name}</div>
              <div className="truncate text-[10.5px] capitalize text-[#8D9AC0]">{me.role}</div>
            </div>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] leading-4 text-[#6E7CA6]">
          Document intake · synthetic demo data
        </p>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FB]">
        <Spinner label="Restoring session…" />
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="flex min-h-screen bg-[#F4F6FB]">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#0B1230] lg:flex">
        <SidebarBody me={me} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-[#050917]/60" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <aside className="relative flex h-full w-72 flex-col bg-[#0B1230]">
            <SidebarBody me={me} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#E3E8F2] bg-white/95 px-4 py-3 backdrop-blur lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded-lg border border-[#E3E8F2] p-1.5 text-[#0B1230] lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[#0B1230]">{pageTitle(pathname)}</div>
              <div className="truncate text-[11px] text-[#7B879F]">Document intake</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden rounded-lg border border-[#E3E8F2] px-3 py-1.5 text-[11.5px] text-[#5A6580] hover:bg-[#F4F6FB] sm:block"
            >
              View site
            </Link>
            <div className="hidden text-right sm:block">
              <div className="text-[12px] font-medium text-[#0B1230]">{me.full_name}</div>
              <div className="text-[10.5px] capitalize text-[#7B879F]">
                {me.role} · {me.email}
              </div>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-[#E3E8F2] bg-white px-3 py-1.5 text-[12px] text-[#5A6580] hover:bg-[#F4F6FB]"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-7">{children}</main>
      </div>
    </div>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/applications/new") return "Create application";
  if (pathname === "/applications") return "Applications";
  if (pathname.startsWith("/applications/")) return "Application";
  if (pathname.startsWith("/intake/")) return "Document workspace";
  if (pathname === "/intake") return "Applications";
  return pathname.replace(/^\//, "").replace(/-/g, " ");
}
