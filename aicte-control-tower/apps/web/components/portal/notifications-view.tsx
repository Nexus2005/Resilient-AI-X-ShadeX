"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle, EnvelopeSimple, DeviceMobile } from "@phosphor-icons/react";

import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type NotificationItem, type SessionUser } from "@/lib/types";
import { cn } from "cn";

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In app",
  email: "Email",
  sms: "SMS",
};

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "email") return <EnvelopeSimple size={16} aria-hidden="true" />;
  if (channel === "sms") return <DeviceMobile size={16} aria-hidden="true" />;
  return <Bell size={16} aria-hidden="true" />;
}

export function NotificationsView({
  user,
  items,
  total,
  unread,
}: {
  user: SessionUser;
  items: NotificationItem[];
  total: number;
  unread: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [unreadCount, setUnreadCount] = useState(unread);
  const [status, setStatus] = useState<"all" | "unread">("all");
  const [channel, setChannel] = useState("all");

  const visible = rows.filter((row) => {
    if (status === "unread" && row.read_at !== null) return false;
    if (channel !== "all" && row.channel !== channel) return false;
    return true;
  });

  const groups = visible.reduce<Record<string, NotificationItem[]>>((accumulator, item) => {
    const key = formatDate(item.created_at);
    accumulator[key] = [...(accumulator[key] ?? []), item];
    return accumulator;
  }, {});

  async function markRead(id: string) {
    const response = await fetch(`/api/proxy/notifications/${id}/read`, { method: "POST" });
    if (response.ok) {
      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      );
      setUnreadCount((value) => Math.max(0, value - 1));
    }
  }

  async function markAll() {
    const response = await fetch("/api/proxy/notifications/read-all", { method: "POST" });
    if (response.ok) {
      setRows((current) =>
        current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Notifications" }]}
        title="Notifications"
        description="Reminders, deadline warnings and escalations addressed to you."
        actions={
          <Button variant="outline" size="lg" onClick={markAll} disabled={unreadCount === 0}>
            Mark all as read
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="notification-status" className="text-[13px] font-medium text-ink">
              Show
            </label>
            <select
              id="notification-status"
              value={status}
              onChange={(event) => setStatus(event.target.value === "unread" ? "unread" : "all")}
              className="h-11 w-[180px] rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
            >
              <option value="all">All notifications</option>
              <option value="unread">Unread only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="notification-channel" className="text-[13px] font-medium text-ink">
              Channel
            </label>
            <select
              id="notification-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="h-11 w-[180px] rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
            >
              <option value="all">All channels</option>
              <option value="in_app">In app</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
        </div>
        <p className="text-[13px] text-muted">
          {unreadCount} unread of {total} delivered
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary-900">Nothing in this view</p>
          <p className="mt-1 text-[13px] text-muted">
            Change the filters, or wait for the next deadline check.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groups).map(([day, dayItems]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-[13px] font-medium text-muted">{day}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {dayItems.map((item) => (
                  <li key={item.id} className={cn("flex gap-3 px-4 py-3.5", item.read_at === null && "bg-primary-50/40")}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.read_at === null
                          ? "bg-primary-100 text-primary-600"
                          : "bg-primary-50 text-muted",
                      )}
                    >
                      <ChannelIcon channel={item.channel} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[14px] font-medium text-ink">{item.subject}</p>
                        <span className="text-[12px] text-muted">
                          {CHANNEL_LABELS[item.channel] ?? item.channel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-5 text-muted">{item.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <span className="text-[12px] text-muted">{formatDateTime(item.created_at)}</span>
                        {item.read_at === null ? (
                          <button
                            type="button"
                            onClick={() => markRead(item.id)}
                            className="text-[12px] font-medium text-primary-600 hover:text-primary-700"
                          >
                            Mark as read
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                            <CheckCircle size={13} className="text-primary-400" aria-hidden="true" />
                            Read
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
