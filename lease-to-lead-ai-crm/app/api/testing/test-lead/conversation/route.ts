import { NextRequest, NextResponse } from "next/server";
import { startTestLeadConversation } from "@/lib/services/testLead";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone || "508-808-3249").trim();
  const intervalMs = Number(body.intervalMs || 5000);
  const messages = Array.isArray(body.messages)
    ? (body.messages as unknown[]).map((m: unknown) => String(m))
    : undefined;

  const result = await startTestLeadConversation({
    phone,
    intervalMs,
    messages
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 404 });
  }

  return NextResponse.json(result);
}
