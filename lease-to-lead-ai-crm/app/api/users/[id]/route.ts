import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import {
  deleteCrmUser,
  getCrmUserById,
  updateCrmTeamMember,
  updateCrmUserPassword
} from "@/lib/crmUsersDb";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import { parseAgentRole, parseAgentStatus } from "@/lib/teamTypes";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function assertSameCompany(
  sessionCompanyId: string | null,
  rowCompanyId: string | null
): Promise<boolean> {
  if (!sessionCompanyId) return true;
  return rowCompanyId === sessionCompanyId;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  const row = await getCrmUserById(params.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await assertSameCompany(companyId, row.company_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  if (body.password !== undefined && body.password !== null && String(body.password) !== "") {
    const pwd = String(body.password);
    if (pwd.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const ok = await updateCrmUserPassword(params.id, pwd);
    if (!ok) return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }

  const patch: Parameters<typeof updateCrmTeamMember>[1] = {};
  if (body.display_name !== undefined) {
    const dn = body.display_name === null ? null : String(body.display_name).trim();
    patch.display_name = dn === "" ? row.username : dn;
  }
  if (body.email !== undefined) {
    const e = body.email === null ? null : String(body.email).trim().toLowerCase();
    if (e && !validEmail(e)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    patch.email = e === "" ? null : e;
  }
  if (body.agent_role !== undefined || body.agentRole !== undefined) {
    patch.agent_role = parseAgentRole(body.agent_role ?? body.agentRole);
  }
  if (body.agent_status !== undefined || body.agentStatus !== undefined) {
    patch.agent_status = parseAgentStatus(body.agent_status ?? body.agentStatus);
  }
  if (body.is_admin !== undefined || body.isAdmin !== undefined) {
    patch.is_admin = Boolean(body.is_admin ?? body.isAdmin);
  }

  if (Object.keys(patch).length > 0) {
    const updated = await updateCrmTeamMember(params.id, patch);
    if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  const row = await getCrmUserById(params.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await assertSameCompany(companyId, row.company_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.sub === params.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }
  const deleted = await deleteCrmUser(params.id);
  if (!deleted.ok) return NextResponse.json({ error: deleted.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
