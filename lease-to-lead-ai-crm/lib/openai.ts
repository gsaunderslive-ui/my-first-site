import OpenAI from "openai";
import { Stage, Tenant } from "./types";

let client: OpenAI | null = null;

function getOpenAiClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  client = new OpenAI({ apiKey });
  return client;
}

export function isOpenAiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function fallbackTenantMessage(tenant: Tenant, stage: Stage) {
  const firstName = tenant.name.split(" ")[0] || "there";
  return `Hi ${firstName}, quick heads up for your ${stage.toLowerCase()} stage: you may be able to own nearby for a monthly cost similar to your current rent of $${tenant.rentAmount.toLocaleString()}. Want details? Reply YES.`;
}

export async function generateTenantMessage(tenant: Tenant, stage: Stage) {
  const openai = getOpenAiClient();
  if (!openai) {
    return {
      text: fallbackTenantMessage(tenant, stage),
      source: "fallback" as const
    };
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You write concise, compliant real-estate nurture SMS messages. Max 320 chars, no guarantees, clear CTA."
        },
        {
          role: "user",
          content: `Draft one SMS for tenant lead ${tenant.name}.\nStage: ${stage}\nCurrent rent: ${tenant.rentAmount}\nEstimated income: ${tenant.estimatedIncome}\nCredit range: ${tenant.creditScoreRange}\nTone: helpful and direct. Include CTA to reply YES.`
        }
      ],
      max_output_tokens: 160
    });

    const text = response.output_text?.trim();
    if (!text) {
      return {
        text: fallbackTenantMessage(tenant, stage),
        source: "fallback" as const
      };
    }

    return {
      text,
      source: "openai" as const
    };
  } catch {
    return {
      text: fallbackTenantMessage(tenant, stage),
      source: "fallback" as const
    };
  }
}

/**
 * CRM “pretend you’re the tenant” tester: one contextual SMS reply from the model
 * using the playbook line as intent. Falls back to `playbookTemplate` if no API key or on error.
 */
export async function generateSimulateInboundAssistantReply(
  tenant: Tenant,
  inboundMessage: string,
  workflowStage: string,
  playbookTemplate: string
) {
  const openai = getOpenAiClient();
  if (!openai) {
    return { text: playbookTemplate, source: "playbook" as const };
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a compliant real-estate leasing assistant replying by SMS to a tenant or buyer lead. Stay under 320 characters, helpful and direct, no guarantees or legal advice. Address what they asked when it makes sense."
        },
        {
          role: "user",
          content: `Lead name: ${tenant.name}\nApprox rent: $${tenant.rentAmount}/mo\nWorkflow stage: ${workflowStage}\nTheir message: "${inboundMessage}"\nPlaybook-suggested reply (match intent; rewrite to fit their message): ${playbookTemplate}`
        }
      ],
      max_output_tokens: 220
    });

    const text = response.output_text?.trim();
    return {
      text: text || playbookTemplate,
      source: text ? ("openai" as const) : ("playbook" as const)
    };
  } catch {
    return { text: playbookTemplate, source: "playbook" as const };
  }
}

export async function formatWorkflowMessage(
  tenant: Tenant,
  template: string,
  workflowStage: string,
  options?: { allowOpenAiPolish?: boolean }
) {
  const allowPolish = options?.allowOpenAiPolish === true;
  if (!allowPolish) {
    return {
      text: template,
      source: "playbook_exact" as const
    };
  }

  const openai = getOpenAiClient();
  if (!openai) {
    return {
      text: template,
      source: "fallback" as const
    };
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Rewrite the provided SMS template only for clarity and personalization. Keep workflow intent unchanged. Max 320 chars."
        },
        {
          role: "user",
          content: `Tenant: ${tenant.name}\nWorkflow stage: ${workflowStage}\nTemplate:\n${template}`
        }
      ],
      max_output_tokens: 140
    });

    const text = response.output_text?.trim();
    return {
      text: text || template,
      source: text ? ("openai" as const) : ("fallback" as const)
    };
  } catch {
    return {
      text: template,
      source: "fallback" as const
    };
  }
}
