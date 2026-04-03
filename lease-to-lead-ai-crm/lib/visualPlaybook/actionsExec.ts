import type { PlaybookAction } from "./types";
import { parsePlaybookActions } from "./types";

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value as unknown;
}

export function applyPlaybookActions(actionsRaw: unknown, leadData: Record<string, unknown>): void {
  const actions = parsePlaybookActions(actionsRaw);
  for (const a of actions) {
    applyOne(a, leadData);
  }
}

function applyOne(action: PlaybookAction, leadData: Record<string, unknown>) {
  switch (action.type) {
    case "set_lead_status":
      leadData.status = action.value;
      break;
    case "add_tag": {
      const tags = leadData.tags;
      const arr = Array.isArray(tags) ? [...tags] : [];
      if (!arr.includes(action.value)) arr.push(action.value);
      leadData.tags = arr;
      break;
    }
    case "assign_agent":
      leadData.assignedAgentName = action.name;
      leadData.assignedAgentEmail = action.email;
      leadData.assignedAgent = true;
      break;
    case "schedule_followup":
      leadData.nextFollowupHours = action.hours;
      break;
    case "set_lead_data":
      setPath(leadData, action.path, action.value);
      break;
    default:
      break;
  }
}
