import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { markTenantAsHot } from "@/lib/services/tenantWorkflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const result = await markTenantAsHot(params.id);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
