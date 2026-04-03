import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;
const twilioDemoMode = String(process.env.TWILIO_DEMO_MODE || "").toLowerCase() === "true";

let client: ReturnType<typeof twilio> | null = null;

export function isTwilioEnabled() {
  return Boolean(accountSid && authToken && fromPhone);
}

export function isTwilioDemoMode() {
  return twilioDemoMode;
}

function getTwilioClient() {
  if (!isTwilioEnabled()) {
    return null;
  }

  if (!client) {
    client = twilio(accountSid as string, authToken as string);
  }

  return client;
}

export function normalizePhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return phone.startsWith("+") ? phone : `+${digits}`;
}

export async function sendSms(to: string, body: string) {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    return {
      ok: false as const,
      reason: "Missing destination phone",
      mode: "live" as const
    };
  }

  if (twilioDemoMode) {
    return {
      ok: true as const,
      sid: `SM_DEMO_${crypto.randomUUID()}`,
      to: normalizedTo,
      status: "queued",
      mode: "demo" as const
    };
  }

  const twilioClient = getTwilioClient();
  if (!twilioClient || !fromPhone) {
    return {
      ok: false as const,
      reason: "Twilio is not configured",
      mode: "disabled" as const
    };
  }

  try {
    const message = await twilioClient.messages.create({
      to: normalizedTo,
      from: fromPhone,
      body,
      statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL
    });

    return {
      ok: true as const,
      sid: message.sid,
      to: normalizedTo,
      status: message.status,
      mode: "live" as const
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Twilio send failed",
      mode: "live" as const
    };
  }
}
