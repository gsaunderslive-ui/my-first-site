import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { isTwilioDemoMode, normalizePhone } from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isLikelyUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromPhone = String(process.env.TWILIO_PHONE_NUMBER || "").trim();
  const statusCallbackUrl = String(process.env.TWILIO_STATUS_CALLBACK_URL || "").trim();
  const demoMode = isTwilioDemoMode();

  const normalizedFrom = normalizePhone(fromPhone);
  const callbackLooksValid =
    Boolean(statusCallbackUrl) &&
    isLikelyUrl(statusCallbackUrl) &&
    statusCallbackUrl.includes("/api/webhooks/twilio");

  const hasLiveCreds = Boolean(accountSid && authToken && normalizedFrom);
  const liveReady = hasLiveCreds && !demoMode;
  const mode = demoMode ? "demo" : "live";

  const checks = {
    hasAccountSid: Boolean(accountSid),
    accountSidFormatValid: accountSid.startsWith("AC"),
    hasAuthToken: Boolean(authToken),
    hasFromPhone: Boolean(fromPhone),
    fromPhoneNormalized: normalizedFrom || null,
    hasStatusCallbackUrl: Boolean(statusCallbackUrl),
    statusCallbackLooksValid: callbackLooksValid
  };

  const warnings: string[] = [];
  if (!checks.hasAccountSid) warnings.push("Missing TWILIO_ACCOUNT_SID");
  if (checks.hasAccountSid && !checks.accountSidFormatValid) warnings.push("TWILIO_ACCOUNT_SID does not start with AC");
  if (!checks.hasAuthToken) warnings.push("Missing TWILIO_AUTH_TOKEN");
  if (!checks.hasFromPhone) warnings.push("Missing TWILIO_PHONE_NUMBER");
  if (checks.hasFromPhone && !checks.fromPhoneNormalized) warnings.push("TWILIO_PHONE_NUMBER could not be normalized");
  if (!checks.hasStatusCallbackUrl) warnings.push("Missing TWILIO_STATUS_CALLBACK_URL");
  if (checks.hasStatusCallbackUrl && !checks.statusCallbackLooksValid) {
    warnings.push("TWILIO_STATUS_CALLBACK_URL should be a valid URL ending with /api/webhooks/twilio");
  }
  if (demoMode) warnings.push("TWILIO_DEMO_MODE is true; live SMS is intentionally disabled");

  // Optional auth probe for when user wants confidence before launch:
  // GET /api/diagnostics/twilio?probe=1
  const shouldProbe = request.nextUrl.searchParams.get("probe") === "1";
  let probe: { attempted: boolean; ok: boolean; error: string | null } = {
    attempted: false,
    ok: false,
    error: null
  };

  if (shouldProbe && hasLiveCreds) {
    probe.attempted = true;
    try {
      const client = twilio(accountSid, authToken);
      await client.api.accounts(accountSid).fetch();
      probe.ok = true;
    } catch (error) {
      probe.ok = false;
      probe.error = error instanceof Error ? error.message : "Twilio probe failed";
    }
  }

  return NextResponse.json({
    ok: demoMode ? true : liveReady,
    mode,
    readyForLiveSend: liveReady,
    webhookEndpoint: "/api/webhooks/twilio",
    checks,
    probe
  });
}
