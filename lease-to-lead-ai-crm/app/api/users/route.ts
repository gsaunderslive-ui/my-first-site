import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { createCrmUser, listCrmUsersForCompany } from "@/lib/crmUsersDb";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import { parseAgentRole, parseAgentStatus } from "@/lib/teamTypes";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  const users = await listCrmUsersForCompany(companyId);
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) {
    return NextResponse.json({ error: "No company configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const is_admin = Boolean(body.isAdmin);
  const display_name =
    body.display_name !== undefined && body.display_name !== null
      ? String(body.display_name).trim()
      : undefined;
  const emailRaw = body.email !== undefined && body.email !== null ? String(body.email).trim() : "";
  const email = emailRaw === "" ? null : emailRaw.toLowerCase();
  const agent_role = parseAgentRole(body.agent_role ?? body.agentRole);
  const agent_status = parseAgentStatus(body.agent_status ?? body.agentStatus);

  if (!username || !password || password.length < 8) {
    return NextResponse.json({ error: "username and password (8+ chars) required" }, { status: 400 });
  }
  if (email && !validEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const created = await createCrmUser({
    username,
    password,
    is_admin,
    company_id: companyId,
    display_name: display_name === "" ? undefined : display_name,
    email,
    agent_role,
    agent_status
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: created.id });
}
