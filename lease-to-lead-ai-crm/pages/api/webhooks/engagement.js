import { handleEngagementWebhook } from "../../../lib/store";
import { verifyYlopoSignature } from "../../../lib/integrations/ylopo";

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-ylopo-signature"] || req.headers["x-signature"];
  const verification = verifyYlopoSignature(rawBody, signature);
  if (!verification.valid) {
    return res.status(401).json({ error: "Invalid webhook signature", details: verification.reason });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const { eventType, leadId, message } = payload || {};

  if (!eventType || !leadId) {
    return res.status(400).json({ error: "eventType and leadId are required" });
  }

  const result = await handleEngagementWebhook(leadId, eventType, { message });
  if (!result) {
    return res.status(404).json({ error: "Lead not found or invalid eventType" });
  }

  return res.status(200).json({ ok: true, event: result });
}
