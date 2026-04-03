import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/apiAuth";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import {
  deleteVisualWorkflow,
  loadWorkflowGraph,
  updateVisualWorkflowMeta
} from "@/lib/visualPlaybook/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const { workflowId } = params;
  const graph = await loadWorkflowGraph(companyId, workflowId);
  if (!graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(graph);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const { workflowId } = params;
  const body = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateVisualWorkflowMeta>[2] = {};
  if (body.name !== undefined) patch.name = String(body.name ?? "");
  if (body.description !== undefined) patch.description = String(body.description ?? "");
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.entry_node_key !== undefined) patch.entry_node_key = String(body.entry_node_key ?? "");
  const ok = await updateVisualWorkflowMeta(companyId, workflowId, patch);
  if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const { workflowId } = params;
  const ok = await deleteVisualWorkflow(companyId, workflowId);
  if (!ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
