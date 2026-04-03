import { NextRequest, NextResponse } from "next/server";
import { updateTenantAutomation } from "@/lib/services/tenantWorkflow";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const automationEnabled = typeof body.automation_enabled === "boolean" ? body.automation_enabled : undefined;
  const automationIntervalHours =
    body.automation_interval_hours === null || body.automation_interval_hours === ""
      ? null
      : Number(body.automation_interval_hours);

  const result = await updateTenantAutomation(params.id, {
    automationEnabled,
    automationIntervalHours: Number.isFinite(automationIntervalHours as number) ? (automationIntervalHours as number) : undefined
  });
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
