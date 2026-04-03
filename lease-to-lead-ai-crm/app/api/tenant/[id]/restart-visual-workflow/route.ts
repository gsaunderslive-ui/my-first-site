import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { getDefaultCompanyId } from "@/lib/crmBootstrap";
import { deleteTenantVisualWorkflowSessions } from "@/lib/visualPlaybook/db";

/**
 * POST — remove all visual_workflow_sessions for this tenant (subject_type tenant).
 * Next SMS inbound or engage will create a fresh session from the active workflow entry.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const tenantId = params.id;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });
  }

  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return NextResponse.json({ error: "Company not configured" }, { status: 503 });
  }

  const ok = await deleteTenantVisualWorkflowSessions(companyId, tenantId);
  if (!ok) {
    return NextResponse.json({ error: "Failed to reset workflow sessions" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
