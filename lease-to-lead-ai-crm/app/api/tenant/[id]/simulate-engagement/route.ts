import { NextResponse } from "next/server";
import { simulateYlopoEngagement } from "@/lib/services/tenantWorkflow";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const result = await simulateYlopoEngagement(params.id);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event: result });
}
