import { cookies } from "next/headers";

import { API_INTERNAL_URL } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Authenticated pass-through to the API. The browser never sees the JWT:
 * the cookie is exchanged for an Authorization header here, and the API still
 * enforces every role, scope and signature rule on its own.
 */
async function forward(request: Request, path: string[]): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return Response.json({ detail: "Sign in to continue." }, { status: 401 });
  }

  const incoming = new URL(request.url);
  const target = `${API_INTERNAL_URL}/${path.join("/")}${incoming.search}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  const signToken = request.headers.get("x-sign-token");
  if (signToken) headers["X-Sign-Token"] = signToken;

  const init: RequestInit = { method: request.method, headers, cache: "no-store" };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type");
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
      if (contentType) headers["Content-Type"] = contentType;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      { detail: "The API is not reachable. Try again in a moment." },
      { status: 503 },
    );
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return forward(request, (await context.params).path);
}

export async function POST(request: Request, context: Context) {
  return forward(request, (await context.params).path);
}

export async function PATCH(request: Request, context: Context) {
  return forward(request, (await context.params).path);
}

export async function DELETE(request: Request, context: Context) {
  return forward(request, (await context.params).path);
}
