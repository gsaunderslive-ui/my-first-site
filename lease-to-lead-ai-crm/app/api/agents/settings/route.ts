import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, updateAgentSettings } from "@/lib/agentData";

export async function GET() {
  return NextResponse.json({ settings: getAgentSettings() });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const settings = updateAgentSettings({
    autoAssignEligibleLeads:
      body.autoAssignEligibleLeads !== undefined ? Boolean(body.autoAssignEligibleLeads) : undefined,
    priority: body.priority
  });

  return NextResponse.json({ ok: true, settings });
}
