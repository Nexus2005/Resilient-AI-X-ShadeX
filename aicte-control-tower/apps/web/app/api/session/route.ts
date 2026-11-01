import { cookies } from "next/headers";

import { API_INTERNAL_URL } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Send an email and password." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_INTERNAL_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { detail: "The sign-in service is not reachable. Try again in a moment." },
      { status: 503 },
    );
  }

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : "Email or password is incorrect.";
    return Response.json({ detail }, { status: upstream.status });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return Response.json({ user: data.user });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
