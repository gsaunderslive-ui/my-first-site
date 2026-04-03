import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { getCrmUserByUsername, verifyCrmPassword, updateCrmUserPassword } from "@/lib/crmUsersDb";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Password change requires database (not available in dev-user-only mode)" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const current = String(body.currentPassword || "");
  const next = String(body.newPassword || "");
  if (!current || !next || next.length < 8) {
    return NextResponse.json({ error: "Current password and new password (8+ chars) required" }, { status: 400 });
  }

  const row = await getCrmUserByUsername(session.username);
  if (!row || row.id !== session.sub) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!(await verifyCrmPassword(row, current))) {
    return NextResponse.json({ error: "Current password incorrect" }, { status: 401 });
  }

  const ok = await updateCrmUserPassword(row.id, next);
  if (!ok) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
