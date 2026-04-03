import { NextRequest, NextResponse } from "next/server";
import { CRM_SESSION_COOKIE, verifyCrmSession, type CrmSessionPayload } from "./crmSession";

export async function getSessionFromRequest(request: NextRequest): Promise<CrmSessionPayload | null> {
  const token = request.cookies.get(CRM_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyCrmSession(token);
}

export async function requireSession(request: NextRequest): Promise<CrmSessionPayload | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}

export async function requireAdmin(request: NextRequest): Promise<CrmSessionPayload | NextResponse> {
  const s = await requireSession(request);
  if (s instanceof NextResponse) return s;
  if (!s.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return s;
}
