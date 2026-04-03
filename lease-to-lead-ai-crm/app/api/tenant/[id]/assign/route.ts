import { NextRequest, NextResponse } from "next/server";
import { assignHotLead } from "@/lib/services/tenantWorkflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const type = body.type as "assign" | "schedule";

  if (!type || !["assign", "schedule"].includes(type)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await assignHotLead(params.id, type);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
