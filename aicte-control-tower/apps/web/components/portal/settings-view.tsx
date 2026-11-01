"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SealCheck } from "@phosphor-icons/react";

import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS, type Preferences, type SessionUser } from "@/lib/types";
import { cn } from "cn";

function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="max-w-[52ch]">
        <p className="text-[14px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-primary-600 bg-primary-600" : "border-line bg-primary-50",
          disabled && "opacity-60",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full bg-surface shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsView({
  user,
  initialPreferences,
}: {
  user: SessionUser;
  initialPreferences: Preferences;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [prefMessage, setPrefMessage] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  async function savePreferences() {
    setSavingPrefs(true);
    setPrefError(null);
    setPrefMessage(null);
    const response = await fetch("/api/proxy/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });
    const body = await response.json().catch(() => ({}));
    setSavingPrefs(false);
    if (!response.ok) {
      setPrefError(typeof body.detail === "string" ? body.detail : "Preferences were not saved.");
      return;
    }
    setPreferences(body as Preferences);
    setPrefMessage("Preferences saved. New alerts follow them immediately.");
    router.refresh();
  }

  async function changePassword() {
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("The two new passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    const response = await fetch("/api/proxy/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    setSavingPassword(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setPasswordError(
        typeof body.detail === "string" ? body.detail : "The password was not changed.",
      );
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password changed. Use it the next time you sign in.");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Settings" }]}
        title="Settings"
        description="Your profile, password and the channels alerts are delivered on."
      />

      <div className="rounded-2xl border border-line bg-surface p-5">
        <Tabs defaultValue="profile">
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <dl className="max-w-[560px]">
              {[
                ["Name", user.name],
                ["Email", user.email],
                ["Role", ROLE_LABELS[user.role]],
                ["Institution", user.institution_name],
                ["Region", user.region_name],
              ]
                .filter((entry): entry is [string, string] => Boolean(entry[1]))
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col gap-0.5 border-b border-line py-3 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <dt className="text-[13px] text-muted">{label}</dt>
                    <dd className="text-[14px] text-ink sm:text-right">{value}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-4 text-[12px] text-muted">
              Name, email and scope are managed by the administrator. Ask for a correction rather
              than editing them here.
            </p>
          </TabsContent>

          <TabsContent value="security" className="pt-4">
            <div className="flex max-w-[420px] flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="h-11 rounded-[12px] text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-11 rounded-[12px] text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Repeat new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-11 rounded-[12px] text-[14px]"
                />
              </div>
              {passwordError ? (
                <p aria-live="polite" className="text-[13px] text-danger">
                  {passwordError}
                </p>
              ) : null}
              {passwordMessage ? (
                <p aria-live="polite" className="flex items-center gap-1.5 text-[13px] text-ink">
                  <SealCheck size={15} className="text-primary-600" aria-hidden="true" />
                  {passwordMessage}
                </p>
              ) : null}
              <Button
                size="lg"
                className="self-start"
                onClick={changePassword}
                disabled={savingPassword || !currentPassword || !newPassword}
              >
                {savingPassword ? "Changing" : "Change password"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="pt-4">
            <div className="max-w-[720px]">
              <Toggle
                id="pref-in-app"
                checked={preferences.in_app}
                onChange={(value) => setPreferences({ ...preferences, in_app: value })}
                label="In-app notifications"
                description="Shown in the bell and on the notifications page. This is the record of what was sent."
              />
              <Toggle
                id="pref-email"
                checked={preferences.email}
                onChange={(value) => setPreferences({ ...preferences, email: value })}
                label="Email"
                description="Deadline warnings, escalations and resubmission requests are also sent to your registered address."
              />
              <Toggle
                id="pref-sms"
                checked={preferences.sms}
                onChange={(value) => setPreferences({ ...preferences, sms: value })}
                label="SMS"
                description="Only for overdue statutory deadlines. The provider in this build is simulated."
              />
              <Toggle
                id="pref-digest"
                checked={preferences.daily_digest}
                onChange={(value) => setPreferences({ ...preferences, daily_digest: value })}
                label="Daily digest"
                description="One summary each morning instead of a message per alert."
              />

              {prefError ? (
                <p aria-live="polite" className="mt-4 text-[13px] text-danger">
                  {prefError}
                </p>
              ) : null}
              {prefMessage ? (
                <p aria-live="polite" className="mt-4 flex items-center gap-1.5 text-[13px] text-ink">
                  <SealCheck size={15} className="text-primary-600" aria-hidden="true" />
                  {prefMessage}
                </p>
              ) : null}

              <Button
                size="lg"
                className="mt-4"
                onClick={savePreferences}
                disabled={savingPrefs}
              >
                {savingPrefs ? "Saving" : "Save preferences"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
