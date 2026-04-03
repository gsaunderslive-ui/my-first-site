import { NextRequest, NextResponse } from "next/server";
import { assignLeadToAgent } from "@/lib/services/tenantWorkflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const specialty = String(body.specialty || "").trim();
  const source = String(body.source || "").trim();

  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  const result = await assignLeadToAgent(params.id, { name, email, specialty, source });
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
