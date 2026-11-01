"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDate, formatDateTime } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";
import { cn } from "cn";

function dayKey(value: string): string {
  return formatDate(value);
}

export function NotificationBell({
  initialUnread,
  notificationsHref,
}: {
  initialUnread: number;
  notificationsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/proxy/notifications?page_size=20", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as {
        items: NotificationItem[];
        unread: number;
      };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setError("Notifications could not be read. The API may be down.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  async function markRead(id: string) {
    const response = await fetch(`/api/proxy/notifications/${id}/read`, { method: "POST" });
    if (response.ok) {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
      setUnread((value) => Math.max(0, value - 1));
    }
  }

  async function markAll() {
    const response = await fetch("/api/proxy/notifications/read-all", { method: "POST" });
    if (response.ok) {
      setItems((current) =>
        current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
      );
      setUnread(0);
    }
  }

  const groups = items.reduce<Record<string, NotificationItem[]>>((accumulator, item) => {
    const key = dayKey(item.created_at);
    accumulator[key] = [...(accumulator[key] ?? []), item];
    return accumulator;
  }, {});

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
            className="relative inline-flex size-10 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors hover:bg-primary-50"
          />
        }
      >
        <Bell size={19} aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-semibold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-line">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {unread > 0 ? `${unread} unread` : "Everything is read"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0}>
            Mark all as read
          </Button>
          <Link
            href={notificationsHref}
            onClick={() => setOpen(false)}
            className="text-[13px] font-medium text-primary-600 hover:text-primary-700"
          >
            Open all
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-[13px] text-muted">Loading notifications.</p>
          ) : error ? (
            <p className="p-6 text-[13px] leading-5 text-muted">{error}</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-[13px] leading-5 text-muted">
              No notifications yet. Reminders and escalations appear here as deadlines approach.
            </p>
          ) : (
            Object.entries(groups).map(([day, dayItems]) => (
              <section key={day}>
                <h3 className="bg-primary-50 px-4 py-2 text-[12px] font-medium text-muted">{day}</h3>
                <ul className="divide-y divide-line">
                  {dayItems.map((item) => {
                    const isUnread = item.read_at === null;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => (isUnread ? markRead(item.id) : undefined)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                            isUnread ? "bg-surface hover:bg-primary-50/70" : "bg-surface",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                              isUnread ? "bg-primary-100 text-primary-600" : "bg-primary-50 text-muted",
                            )}
                          >
                            {item.channel === "email" ? (
                              <EnvelopeSimple size={16} />
                            ) : (
                              <Bell size={16} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span
                                className={cn(
                                  "text-[13px] leading-5",
                                  isUnread ? "font-medium text-ink" : "text-ink",
                                )}
                              >
                                {item.subject}
                              </span>
                              {isUnread ? (
                                <span
                                  aria-label="Unread"
                                  className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-600"
                                />
                              ) : (
                                <CheckCircle
                                  size={14}
                                  className="mt-1 shrink-0 text-primary-400"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="mt-0.5 block text-[12px] leading-5 text-muted">
                              {item.body}
                            </span>
                            <span className="mt-1 block text-[11px] text-muted">
                              {formatDateTime(item.created_at)} / {item.channel.replace("_", " ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
