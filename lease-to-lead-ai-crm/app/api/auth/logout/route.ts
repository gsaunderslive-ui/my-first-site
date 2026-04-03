import { NextResponse } from "next/server";
import { CRM_SESSION_COOKIE } from "@/lib/crmSession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CRM_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
