import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import { loadWorkflowGraph, saveWorkflowGraph, type GraphSavePayload } from "@/lib/visualPlaybook/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const { workflowId } = params;
  const body = (await request.json().catch(() => ({}))) as GraphSavePayload;
  if (!body?.nodes || !body?.edges) {
    return NextResponse.json({ error: "nodes and edges required" }, { status: 400 });
  }
  const ok = await saveWorkflowGraph(companyId, workflowId, {
    entryNodeKey: String(body.entryNodeKey || "start"),
    nodes: body.nodes,
    edges: body.edges
  });
  if (!ok) return NextResponse.json({ error: "Save failed" }, { status: 500 });
  const graph = await loadWorkflowGraph(companyId, workflowId);
  return NextResponse.json({ ok: true, graph });
}
