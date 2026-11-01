import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ct_session";

export default function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/institution/:path*",
    "/regional/:path*",
    "/evc/:path*",
    "/bureau/:path*",
    "/admin/:path*",
  ],
};
