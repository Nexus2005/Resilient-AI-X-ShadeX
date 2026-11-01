"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowFatLineUp,
  Bell,
  CalendarCheck,
  FileText,
  Files,
  FingerprintSimple,
  Gear,
  List,
  MagnifyingGlass,
  SquaresFour,
  Stamp,
} from "@phosphor-icons/react";

import { LogoMark } from "@/components/brand/logo";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { DemoClock } from "@/components/app-shell/demo-clock";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_BY_ROLE, roleBasePath, type NavIcon } from "@/lib/nav";
import { ROLE_LABELS, type DemoClock as DemoClockData, type SessionUser } from "@/lib/types";
import { cn } from "cn";

const icons: Record<NavIcon, typeof SquaresFour> = {
  overview: SquaresFour,
  applications: Files,
  evc: CalendarCheck,
  undertakings: Stamp,
  documents: FileText,
  escalations: ArrowFatLineUp,
  audit: FingerprintSimple,
  notifications: Bell,
  settings: Gear,
};

function NavList({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = NAV_BY_ROLE[user.role];

  return (
    <nav aria-label="Portal" className="flex flex-col gap-1 px-3">
      {links.map((link) => {
        const Icon = icons[link.icon];
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors duration-150",
              active
                ? "bg-primary-100 text-primary-900"
                : "text-muted hover:bg-primary-50 hover:text-primary-900",
            )}
          >
            <Icon
              size={19}
              weight={active ? "fill" : "regular"}
              className={active ? "text-primary-600" : "text-muted"}
              aria-hidden="true"
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RoleBadge({ user }: { user: SessionUser }) {
  return (
    <div className="rounded-xl border border-line bg-primary-50 px-3 py-2.5">
      <p className="text-[12px] text-muted">{ROLE_LABELS[user.role]}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-primary-900">
        {user.institution_name ?? user.region_name ?? "Headquarters"}
      </p>
    </div>
  );
}

export function AppShell({
  user,
  clock,
  unread,
  children,
}: {
  user: SessionUser;
  clock: DemoClockData | null;
  unread: number;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = roleBasePath(user.role);
  const searchPath = user.role === "evc_coordinator" ? "/evc/queue" : `${base}/applications`;

  return (
    <div className="min-h-screen bg-primary-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-[72px] items-center px-5">
          <Link href={user.portal} className="flex items-center gap-2.5 rounded-lg">
            <LogoMark />
            <span className="text-[15px] font-semibold leading-5 text-primary-900">
              AICTE
              <span className="block text-[12px] font-medium leading-4 text-muted">
                Control Tower
              </span>
            </span>
          </Link>
        </div>
        <div className="mt-2 overflow-y-auto">
          <NavList user={user} />
        </div>
        <div className="mt-auto flex flex-col gap-2 p-4">
          <RoleBadge user={user} />
          <SignOutButton />
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-line bg-primary-50/95 px-4 backdrop-blur sm:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  aria-label="Open menu"
                  className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-surface text-primary-900 lg:hidden"
                />
              }
            >
              <List size={19} aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto py-4">
                <NavList user={user} onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <RoleBadge user={user} />
                <SignOutButton />
              </div>
            </SheetContent>
          </Sheet>

          <form action={searchPath} method="get" className="relative w-full max-w-[340px]">
            <label htmlFor="portal-search" className="sr-only">
              Search applications or institutions
            </label>
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="portal-search"
              name="search"
              type="search"
              placeholder="Search application or institution"
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-muted focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
            />
          </form>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {clock ? <DemoClock clock={clock} /> : null}
            <NotificationBell initialUnread={unread} notificationsHref={`${base}/notifications`} />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-5 text-ink">{user.name}</p>
              <p className="text-[12px] leading-4 text-muted">{ROLE_LABELS[user.role]}</p>
            </div>
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-primary-100 text-[13px] font-semibold text-primary-900"
            >
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">{children}</main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 pb-10 text-[12px] text-muted sm:px-8">
          Demo data. Fictional institutions.
        </footer>
      </div>
    </div>
  );
}
