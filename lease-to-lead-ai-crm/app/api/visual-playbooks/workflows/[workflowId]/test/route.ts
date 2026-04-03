import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import {
  getOrCreateTestSession,
  loadWorkflowGraph,
  resetTestSessions,
  upsertSessionState
} from "@/lib/visualPlaybook/db";
import { buildGraph, playbookHandleUserMessage, playbookStartOrResume } from "@/lib/visualPlaybook/engine";

export async function POST(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const { workflowId } = params;

  const body = await request.json().catch(() => ({}));
  const testSessionId = String(body.testSessionId || "").trim() || crypto.randomUUID();
  const userMessage = body.userMessage != null ? String(body.userMessage) : "";
  const reset = Boolean(body.reset);

  const loaded = await loadWorkflowGraph(companyId, workflowId);
  if (!loaded) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  if (reset) {
    await resetTestSessions(companyId, workflowId, testSessionId);
  }

  let testSession = await getOrCreateTestSession(companyId, workflowId, testSessionId);
  if (!testSession) return NextResponse.json({ error: "Session error" }, { status: 500 });

  const graph = buildGraph(loaded.workflow, loaded.nodes, loaded.edges);

  let result;
  if (userMessage.trim()) {
    result = await playbookHandleUserMessage(graph, testSession, userMessage);
  } else {
    result = await playbookStartOrResume(graph, testSession);
  }

  await upsertSessionState(testSession);

  return NextResponse.json({
    testSessionId,
    ...result,
    workflowId
  });
}
