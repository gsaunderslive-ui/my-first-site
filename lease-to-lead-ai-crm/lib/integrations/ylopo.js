import crypto from "node:crypto";

const events = ["open", "click", "reply"];
const ylopoApiKey = process.env.YLOPO_API_KEY || "";
const ylopoBaseUrl = (process.env.YLOPO_BASE_URL || "").replace(/\/$/, "");
const ylopoWebhookSecret = process.env.YLOPO_WEBHOOK_SECRET || "";

function hasLiveConfig() {
  return Boolean(ylopoApiKey && ylopoBaseUrl);
}

export async function sendLeadToYlopo(lead) {
  if (!hasLiveConfig()) {
    return {
      ok: true,
      live: false,
      leadId: lead.id,
      reason: "YLOPO_API_KEY or YLOPO_BASE_URL missing"
    };
  }

  try {
    const response = await fetch(`${ylopoBaseUrl}/leads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ylopoApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        externalLeadId: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        stage: lead.stage,
        score: lead.engagement_score,
        consent_status: lead.consent_status
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Ylopo sendLead failed (${response.status}): ${details}`);
    }

    return {
      ok: true,
      live: true,
      leadId: lead.id,
      sentAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: true,
      live: false,
      leadId: lead.id,
      sentAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown Ylopo error"
    };
  }
}

export function generateRandomEngagementEvent() {
  return events[Math.floor(Math.random() * events.length)];
}

export function normalizeEventType(eventType) {
  if (!eventType) return null;
  const normalized = String(eventType).trim().toLowerCase();
  if (normalized === "open" || normalized === "opened") return "open";
  if (normalized === "click" || normalized === "clicked") return "click";
  if (normalized === "reply" || normalized === "replied") return "reply";
  return null;
}

export function verifyYlopoSignature(rawBody, signatureHeader) {
  if (!ylopoWebhookSecret) {
    return {
      valid: true,
      mode: "dev",
      reason: "YLOPO_WEBHOOK_SECRET missing"
    };
  }

  if (!signatureHeader) {
    return { valid: false, mode: "live", reason: "Missing signature header" };
  }

  const provided = String(signatureHeader).trim();
  const expected = crypto.createHmac("sha256", ylopoWebhookSecret).update(rawBody).digest("hex");

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return { valid: false, mode: "live", reason: "Signature length mismatch" };
  }

  const valid = crypto.timingSafeEqual(a, b);
  return {
    valid,
    mode: "live",
    reason: valid ? "ok" : "Invalid signature"
  };
}
