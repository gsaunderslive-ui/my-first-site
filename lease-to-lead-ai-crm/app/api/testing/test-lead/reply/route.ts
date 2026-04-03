import { NextRequest, NextResponse } from "next/server";
import { handleTwilioInboundWebhook } from "@/lib/services/twilioWebhooks";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone || "508-808-3249").trim();
  const message = String(body.message || "").trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const result = await handleTwilioInboundWebhook({
    from: phone,
    body: message,
    messageSid: `SM-TEST-${Date.now()}`
  });

  return NextResponse.json({ ok: true, result });
}
