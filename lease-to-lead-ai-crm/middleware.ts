import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CRM_SESSION_COOKIE, verifyCrmSession } from "@/lib/crmSession";

const PUBLIC_PATHS = new Set<string>(["/login"]);

function isPublicApi(pathname: string): boolean {
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(CRM_SESSION_COOKIE)?.value;
  const session = token ? await verifyCrmSession(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
