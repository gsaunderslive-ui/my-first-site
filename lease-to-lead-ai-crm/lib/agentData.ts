import type { AgentApiRecord } from "./crmUsersDb";
import type { AgentRole, AgentStatus } from "./teamTypes";

export type AgentRecord = AgentApiRecord;
export type { AgentRole, AgentStatus } from "./teamTypes";

export type AgentSettings = {
  autoAssignEligibleLeads: boolean;
  priority: "High" | "Medium" | "Low";
};

type AgentStore = {
  settings: AgentSettings;
};

const store: AgentStore = {
  settings: {
    autoAssignEligibleLeads: false,
    priority: "Medium"
  }
};

/** Used only when Supabase is not configured (local demo). */
export const FALLBACK_AGENTS: AgentRecord[] = [
  {
    id: "fallback-1",
    name: "Alex Morgan",
    email: "alex@example.com",
    role: "Buyer Specialist",
    status: "Active"
  }
];

export function getAgentsFallback(): AgentRecord[] {
  return FALLBACK_AGENTS;
}

export function getAgentSettings() {
  return store.settings;
}

export function updateAgentSettings(input: Partial<AgentSettings>) {
  store.settings = {
    ...store.settings,
    ...input
  };
  return store.settings;
}
