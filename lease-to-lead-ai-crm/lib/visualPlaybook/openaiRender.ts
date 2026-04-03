import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient() {
  if (client) return client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  client = new OpenAI({ apiKey: key });
  return client;
}

/**
 * AI only rewrites the fixed playbook line — no new facts, offers, or workflow decisions.
 */
export async function renderPlaybookNodeMessage(params: {
  messagePrompt: string;
  leadData: Record<string, unknown>;
  tenantName?: string;
}): Promise<{ text: string; source: "openai" | "passthrough" }> {
  const prompt = String(params.messagePrompt || "").trim();
  if (!prompt) return { text: "", source: "passthrough" };

  const openai = getClient();
  if (!openai) {
    return { text: prompt, source: "passthrough" };
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You rewrite SMS-style CRM messages. Output ONLY the final message text, no quotes or labels. " +
            "Do not add new facts, promises, legal claims, or steps that are not already implied by the script. " +
            "Keep the same meaning and constraints; adjust tone for clarity and warmth. Max 320 characters."
        },
        {
          role: "user",
          content:
            `Script (preserve intent exactly):\n${prompt}\n\n` +
            `Context (JSON, do not invent fields): ${JSON.stringify({
              lead: params.leadData,
              name: params.tenantName ?? null
            })}`
        }
      ],
      max_output_tokens: 200
    });

    const text = response.output_text?.trim();
    return {
      text: text || prompt,
      source: text ? "openai" : "passthrough"
    };
  } catch {
    return { text: prompt, source: "passthrough" };
  }
}
