import { NextRequest, NextResponse } from "next/server";
import { engageTenant } from "@/lib/services/tenantWorkflow";
import { Channel } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const channel = body.channel as Channel;

  if (!channel || !["Email", "SMS", "AI Call"].includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const result = await engageTenant(params.id, channel);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event: result });
}
