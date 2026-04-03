export type AgentRole = "Buyer Specialist" | "Listing Agent" | "General";
export type AgentStatus = "Active" | "Inactive";

export const AGENT_ROLES: AgentRole[] = ["Buyer Specialist", "Listing Agent", "General"];
export const AGENT_STATUSES: AgentStatus[] = ["Active", "Inactive"];

export function parseAgentRole(v: unknown): AgentRole {
  const s = String(v || "");
  return AGENT_ROLES.includes(s as AgentRole) ? (s as AgentRole) : "General";
}

export function parseAgentStatus(v: unknown): AgentStatus {
  const s = String(v || "");
  return AGENT_STATUSES.includes(s as AgentStatus) ? (s as AgentStatus) : "Active";
}
