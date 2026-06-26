import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/superadmin", "/api/auth/", "/api/superadmin/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = !!req.cookies.get("sess_tok")?.value;

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg).*)"],
};
