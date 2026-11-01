"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Info } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { demoAccounts, demoPassword } from "@/lib/demo-accounts";
import type { SessionUser } from "@/lib/types";
import { cn } from "cn";

type Errors = { email?: string; password?: string; form?: string };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const applyDemoAccount = (account: (typeof demoAccounts)[number]) => {
    setEmail(account.email);
    setPassword(demoPassword);
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Errors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter the email address registered with AICTE.";
    }
    if (password.length < 8) {
      nextErrors.password = "Passwords are at least 8 characters. Check the demo accounts below.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrors({ form: data?.detail ?? "Sign-in failed. Try again." });
        return;
      }

      const user = data.user as SessionUser;
      router.replace(user.portal);
      router.refresh();
    } catch {
      setErrors({ form: "The sign-in service is not reachable. Try again in a moment." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Sign in</h1>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        Use your AICTE account. Demonstration accounts are listed below the form.
      </p>

      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {errors.form ? (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[13px] leading-5 text-danger"
          >
            {errors.form}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            placeholder="name@institution.ac.in"
          />
          {errors.email ? (
            <p id="email-error" role="alert" className="text-[13px] text-danger">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Dialog>
              <DialogTrigger
                render={
                  <button
                    type="button"
                    className="rounded text-[13px] font-medium text-primary-700 hover:text-primary-900"
                  />
                }
              >
                Forgot password
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Resetting a password</DialogTitle>
                  <DialogDescription>
                    In this prototype, passwords are issued only for the five
                    demonstration accounts shown on this page. There is no live
                    mailbox and no reset email is sent.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-[14px] leading-6 text-muted">
                  A production build routes resets through the regional office
                  that owns the account, with the request recorded in the audit
                  trail.
                </p>
              </DialogContent>
            </Dialog>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password ? (
            <p id="password-error" role="alert" className="text-[13px] text-danger">
              {errors.password}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </form>

      <div className="mt-8 border-t border-line pt-6">
        <p className="text-[12px] font-medium text-muted">Demonstration accounts</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => applyDemoAccount(account)}
              aria-pressed={email === account.email}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-150",
                email === account.email
                  ? "border-primary-600 bg-primary-100 text-primary-900"
                  : "border-line text-muted hover:border-primary-200 hover:bg-primary-50 hover:text-primary-900",
              )}
            >
              {account.role}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-5 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Selecting a role fills its email and the shared demo password.
        </p>
      </div>
    </div>
  );
}
