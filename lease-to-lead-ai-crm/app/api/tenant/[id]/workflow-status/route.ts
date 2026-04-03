import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { getDefaultCompanyId } from "@/lib/crmBootstrap";
import { getLatestTenantWorkflowSessionSummary } from "@/lib/visualPlaybook/db";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return NextResponse.json({ summary: null });
  }

  const summary = await getLatestTenantWorkflowSessionSummary(companyId, params.id);
  return NextResponse.json({ summary });
}
