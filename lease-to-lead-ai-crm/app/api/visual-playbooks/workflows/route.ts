import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/apiAuth";
import { createVisualWorkflow, listVisualWorkflows } from "@/lib/visualPlaybook/db";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const workflows = await listVisualWorkflows(companyId);
  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim() || "Untitled workflow";
  const description = String(body.description || "").trim();
  const wf = await createVisualWorkflow(companyId, { name, description });
  if (!wf) {
    return NextResponse.json(
      {
        error:
          "Could not create workflow. Apply the Supabase migration that adds visual_workflows / visual_workflow_nodes / visual_workflow_edges (see supabase/migrations/), and confirm SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are set."
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ workflow: wf });
}
