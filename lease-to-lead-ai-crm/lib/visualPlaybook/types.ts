import { z } from "zod";

export const visualNodeTypes = ["message", "decision", "action"] as const;
export type VisualNodeType = (typeof visualNodeTypes)[number];

export const edgeMatchTypes = ["default", "keyword_contains", "keyword_any", "intent_equals", "always"] as const;
export type EdgeMatchType = (typeof edgeMatchTypes)[number];

export const playbookActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_lead_status"), value: z.string() }),
  z.object({ type: z.literal("add_tag"), value: z.string() }),
  z.object({
    type: z.literal("assign_agent"),
    name: z.string(),
    email: z.string()
  }),
  z.object({ type: z.literal("schedule_followup"), hours: z.number() }),
  z.object({
    type: z.literal("set_lead_data"),
    path: z.string(),
    value: z.unknown()
  })
]);

export type PlaybookAction = z.infer<typeof playbookActionSchema>;

export function parsePlaybookActions(raw: unknown): PlaybookAction[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaybookAction[] = [];
  for (const item of raw) {
    const p = playbookActionSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}

export type VisualWorkflowRow = {
  id: string;
  company_id: string;
  name: string;
  description: string;
  is_active: boolean;
  entry_node_key: string;
  created_at: string;
  updated_at: string;
};

export type VisualWorkflowNodeRow = {
  id: string;
  workflow_id: string;
  node_key: string;
  node_type: VisualNodeType;
  position_x: number;
  position_y: number;
  message_prompt: string;
  condition_type: string;
  condition_value: string;
  actions: unknown;
  created_at: string;
  updated_at: string;
};

export type VisualWorkflowEdgeRow = {
  id: string;
  workflow_id: string;
  source_key: string;
  target_key: string;
  condition_label: string;
  match_type: EdgeMatchType;
  match_value: string;
  sort_order: number;
  created_at: string;
};

export type VisualWorkflowSessionRow = {
  id: string;
  workflow_id: string;
  company_id: string;
  subject_type: "tenant" | "test";
  subject_id: string;
  current_node_key: string;
  lead_data: Record<string, unknown>;
  visit_path: VisitPathEntry[];
  updated_at: string;
};

export type VisitPathEntry =
  | { at: string; kind: "enter"; nodeKey: string; nodeType: VisualNodeType }
  | { at: string; kind: "action"; nodeKey: string }
  | { at: string; kind: "edge"; edgeId: string; label: string; matchType: EdgeMatchType; engineFallback?: boolean }
  | { at: string; kind: "message_out"; nodeKey: string; preview: string }
  | { at: string; kind: "user_in"; text: string };

export type LoadedPlaybookGraph = {
  workflow: VisualWorkflowRow;
  nodesByKey: Map<string, VisualWorkflowNodeRow>;
  edgesBySource: Map<string, VisualWorkflowEdgeRow[]>;
};
