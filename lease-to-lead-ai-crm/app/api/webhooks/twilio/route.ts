import { NextResponse } from "next/server";
import { handleTwilioInboundWebhook, handleTwilioStatusWebhook } from "@/lib/services/twilioWebhooks";

export async function POST(request: Request) {
  const form = await request.formData();

  const messageStatus = String(form.get("MessageStatus") || "").trim();
  const smsStatus = String(form.get("SmsStatus") || "").trim();

  // Twilio status callbacks include MessageStatus/SmsStatus. Inbound webhooks include Body + From.
  if (messageStatus || smsStatus) {
    await handleTwilioStatusWebhook({
      to: String(form.get("To") || ""),
      messageStatus: messageStatus || smsStatus,
      messageSid: String(form.get("MessageSid") || ""),
      errorCode: String(form.get("ErrorCode") || "")
    });

    return NextResponse.json({ ok: true });
  }

  await handleTwilioInboundWebhook({
    from: String(form.get("From") || ""),
    body: String(form.get("Body") || ""),
    messageSid: String(form.get("MessageSid") || "")
  });

  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml"
    }
  });
}
