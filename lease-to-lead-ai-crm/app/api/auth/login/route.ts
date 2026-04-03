import { NextRequest, NextResponse } from "next/server";
import { ensureCrmBootstrap } from "@/lib/crmBootstrap";
import { CRM_SESSION_COOKIE, signCrmSession } from "@/lib/crmSession";
import { getCrmUserByUsername, verifyCrmPassword } from "@/lib/crmUsersDb";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hasSessionSecret } from "@/lib/sessionSecret";
import { CRM_DEV_SESSION_USER_ID } from "@/lib/crmConstants";

export async function POST(request: NextRequest) {
  if (!hasSessionSecret()) {
    return NextResponse.json(
      {
        error:
          "Server misconfigured: set CRM_SESSION_SECRET (at least 32 characters). Locally: add it to .env.local and restart npm run dev. On Vercel: Project → Settings → Environment Variables → add CRM_SESSION_SECRET for Production, then Redeploy. Optional local-only: AUTH_INSECURE_DEV=true (never in production)."
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  await ensureCrmBootstrap();

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const row = await getCrmUserByUsername(username);
    if (row && (await verifyCrmPassword(row, password))) {
      const token = await signCrmSession({
        sub: row.id,
        username: row.username,
        isAdmin: row.is_admin
      });
      const res = NextResponse.json({ ok: true, username: row.username, isAdmin: row.is_admin });
      res.cookies.set(CRM_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
      });
      return res;
    }
  }

  const devUser = process.env.CRM_DEV_USERNAME?.trim().toLowerCase();
  const devPass = process.env.CRM_DEV_PASSWORD;
  if (devUser && devPass && username === devUser && password === devPass) {
    const token = await signCrmSession({
      sub: CRM_DEV_SESSION_USER_ID,
      username: devUser,
      isAdmin: true
    });
    const res = NextResponse.json({ ok: true, username: devUser, isAdmin: true, dev: true });
    res.cookies.set(CRM_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
}
