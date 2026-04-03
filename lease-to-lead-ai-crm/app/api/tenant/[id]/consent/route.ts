import { NextRequest, NextResponse } from "next/server";
import { updateConsentStatus } from "@/lib/services/tenantWorkflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const consent = Boolean(body.consent_status);

  const result = await updateConsentStatus(params.id, consent);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
