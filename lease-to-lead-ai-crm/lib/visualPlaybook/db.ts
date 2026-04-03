import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  VisualWorkflowEdgeRow,
  VisualWorkflowNodeRow,
  VisualWorkflowRow,
  VisualWorkflowSessionRow,
  VisitPathEntry
} from "./types";

function mapNode(r: Record<string, unknown>): VisualWorkflowNodeRow {
  return {
    id: String(r.id),
    workflow_id: String(r.workflow_id),
    node_key: String(r.node_key),
    node_type: r.node_type as VisualWorkflowNodeRow["node_type"],
    position_x: Number(r.position_x) || 0,
    position_y: Number(r.position_y) || 0,
    message_prompt: String(r.message_prompt ?? ""),
    condition_type: String(r.condition_type ?? "any"),
    condition_value: String(r.condition_value ?? ""),
    actions: r.actions ?? [],
    created_at: String(r.created_at),
    updated_at: String(r.updated_at)
  };
}

function mapEdge(r: Record<string, unknown>): VisualWorkflowEdgeRow {
  return {
    id: String(r.id),
    workflow_id: String(r.workflow_id),
    source_key: String(r.source_key),
    target_key: String(r.target_key),
    condition_label: String(r.condition_label ?? "next"),
    match_type: r.match_type as VisualWorkflowEdgeRow["match_type"],
    match_value: String(r.match_value ?? ""),
    sort_order: Number(r.sort_order) || 0,
    created_at: String(r.created_at)
  };
}

function mapWorkflow(r: Record<string, unknown>): VisualWorkflowRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    name: String(r.name),
    description: String(r.description ?? ""),
    is_active: Boolean(r.is_active),
    entry_node_key: String(r.entry_node_key ?? "start"),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at)
  };
}

function mapSession(r: Record<string, unknown>): VisualWorkflowSessionRow {
  const vp = r.visit_path;
  return {
    id: String(r.id),
    workflow_id: String(r.workflow_id),
    company_id: String(r.company_id),
    subject_type: r.subject_type as VisualWorkflowSessionRow["subject_type"],
    subject_id: String(r.subject_id),
    current_node_key: String(r.current_node_key),
    lead_data: (r.lead_data && typeof r.lead_data === "object" ? r.lead_data : {}) as Record<string, unknown>,
    visit_path: Array.isArray(vp) ? (vp as VisitPathEntry[]) : [],
    updated_at: String(r.updated_at)
  };
}

export async function listVisualWorkflows(companyId: string): Promise<VisualWorkflowRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("visual_workflows")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error || !data) {
    console.error("[visualPlaybook] listVisualWorkflows", error?.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(mapWorkflow);
}

export async function getVisualWorkflow(companyId: string, workflowId: string): Promise<VisualWorkflowRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("visual_workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return mapWorkflow(data as Record<string, unknown>);
}

/** STEP 2 — Active visual workflow for the company (at most one should be active). */
export async function getActiveVisualWorkflow(companyId: string): Promise<VisualWorkflowRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("visual_workflows")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapWorkflow(data as Record<string, unknown>);
}

/** STEP 3 — Persisted session for a tenant in a specific workflow graph. */
export async function getOrCreateTenantWorkflowSession(
  companyId: string,
  workflowId: string,
  tenantId: string,
  seedLeadData: Record<string, unknown>
): Promise<VisualWorkflowSessionRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from("visual_workflow_sessions")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("subject_type", "tenant")
    .eq("subject_id", tenantId)
    .maybeSingle();

  if (existing) {
    const s = mapSession(existing as Record<string, unknown>);
    s.lead_data = { ...s.lead_data, ...seedLeadData };
    return s;
  }

  const wf = await getVisualWorkflow(companyId, workflowId);
  if (!wf) return null;

  const row = {
    id: crypto.randomUUID(),
    workflow_id: workflowId,
    company_id: companyId,
    subject_type: "tenant" as const,
    subject_id: tenantId,
    current_node_key: wf.entry_node_key,
    lead_data: { ...seedLeadData },
    visit_path: [],
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from("visual_workflow_sessions").insert(row).select("*").single();
  if (error || !data) {
    console.error("[visualPlaybook] getOrCreateTenantWorkflowSession", error?.message);
    return null;
  }
  return mapSession(data as Record<string, unknown>);
}

export async function createVisualWorkflow(
  companyId: string,
  input: { name: string; description?: string }
): Promise<VisualWorkflowRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const id = crypto.randomUUID();
  const row = {
    id,
    company_id: companyId,
    name: input.name,
    description: input.description ?? "",
    is_active: false,
    entry_node_key: "start",
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from("visual_workflows").insert(row).select("*").single();
  if (error || !data) {
    console.error("[visualPlaybook] createVisualWorkflow", error?.message);
    return null;
  }
  const wf = mapWorkflow(data as Record<string, unknown>);
  await seedStarterGraph(supabase, wf.id);
  return getVisualWorkflow(companyId, wf.id);
}

async function seedStarterGraph(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, workflowId: string) {
  const nodes = [
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      node_key: "start",
      node_type: "message",
      position_x: 80,
      position_y: 120,
      message_prompt:
        "Hi — thanks for your interest. Are you still exploring rent-to-own or buying options in your area? Reply YES if you want a quick overview.",
      condition_type: "any",
      condition_value: "",
      actions: [],
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      node_key: "tag_interested",
      node_type: "action",
      position_x: 400,
      position_y: 120,
      message_prompt: "",
      condition_type: "any",
      condition_value: "",
      actions: [{ type: "add_tag", value: "interested" }],
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      node_key: "followup",
      node_type: "message",
      position_x: 720,
      position_y: 120,
      message_prompt:
        "Great — a specialist can walk you through next steps with no obligation. What is the best way to reach you this week?",
      condition_type: "any",
      condition_value: "",
      actions: [],
      updated_at: new Date().toISOString()
    }
  ];
  const edges = [
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      source_key: "start",
      target_key: "tag_interested",
      condition_label: "interested",
      match_type: "keyword_any",
      match_value: "yes,yeah,yep,sure,interested",
      sort_order: 0
    },
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      source_key: "start",
      target_key: "followup",
      condition_label: "default",
      match_type: "default",
      match_value: "",
      sort_order: 10
    },
    {
      id: crypto.randomUUID(),
      workflow_id: workflowId,
      source_key: "tag_interested",
      target_key: "followup",
      condition_label: "continue",
      match_type: "always",
      match_value: "",
      sort_order: 0
    }
  ];
  await supabase.from("visual_workflow_nodes").insert(nodes);
  await supabase.from("visual_workflow_edges").insert(edges);
}

export async function updateVisualWorkflowMeta(
  companyId: string,
  workflowId: string,
  patch: Partial<Pick<VisualWorkflowRow, "name" | "description" | "is_active" | "entry_node_key">>
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  if (patch.is_active === true) {
    await supabase
      .from("visual_workflows")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  if (patch.entry_node_key !== undefined) row.entry_node_key = patch.entry_node_key;

  const { error } = await supabase.from("visual_workflows").update(row).eq("id", workflowId).eq("company_id", companyId);
  if (error) {
    console.error("[visualPlaybook] updateVisualWorkflowMeta", error.message);
    return false;
  }
  return true;
}

export async function deleteVisualWorkflow(companyId: string, workflowId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("visual_workflows").delete().eq("id", workflowId).eq("company_id", companyId);
  if (error) {
    console.error("[visualPlaybook] deleteVisualWorkflow", error.message);
    return false;
  }
  return true;
}

export async function loadWorkflowGraph(
  companyId: string,
  workflowId: string
): Promise<{ workflow: VisualWorkflowRow; nodes: VisualWorkflowNodeRow[]; edges: VisualWorkflowEdgeRow[] } | null> {
  const wf = await getVisualWorkflow(companyId, workflowId);
  if (!wf) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [nRes, eRes] = await Promise.all([
    supabase.from("visual_workflow_nodes").select("*").eq("workflow_id", workflowId),
    supabase.from("visual_workflow_edges").select("*").eq("workflow_id", workflowId)
  ]);

  const nodes = (nRes.data as Record<string, unknown>[] | null)?.map(mapNode) ?? [];
  const edges = (eRes.data as Record<string, unknown>[] | null)?.map(mapEdge) ?? [];
  return { workflow: wf, nodes, edges };
}

export type GraphSavePayload = {
  entryNodeKey: string;
  nodes: Array<{
    nodeKey: string;
    nodeType: VisualWorkflowNodeRow["node_type"];
    position: { x: number; y: number };
    messagePrompt: string;
    conditionType: string;
    conditionValue: string;
    actions: unknown;
  }>;
  edges: Array<{
    id?: string;
    sourceKey: string;
    targetKey: string;
    conditionLabel: string;
    matchType: VisualWorkflowEdgeRow["match_type"];
    matchValue: string;
    sortOrder: number;
  }>;
};

export async function saveWorkflowGraph(companyId: string, workflowId: string, payload: GraphSavePayload): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const wf = await getVisualWorkflow(companyId, workflowId);
  if (!wf) return false;

  await supabase.from("visual_workflow_edges").delete().eq("workflow_id", workflowId);
  await supabase.from("visual_workflow_nodes").delete().eq("workflow_id", workflowId);

  const now = new Date().toISOString();
  const nodeRows = payload.nodes.map((n) => ({
    id: crypto.randomUUID(),
    workflow_id: workflowId,
    node_key: n.nodeKey,
    node_type: n.nodeType,
    position_x: n.position.x,
    position_y: n.position.y,
    message_prompt: n.messagePrompt,
    condition_type: n.conditionType,
    condition_value: n.conditionValue,
    actions: n.actions ?? [],
    updated_at: now
  }));

  const edgeRows = payload.edges.map((e) => ({
    id: crypto.randomUUID(),
    workflow_id: workflowId,
    source_key: e.sourceKey,
    target_key: e.targetKey,
    condition_label: e.conditionLabel,
    match_type: e.matchType,
    match_value: e.matchValue,
    sort_order: e.sortOrder,
    created_at: now
  }));

  if (nodeRows.length) {
    const { error: ne } = await supabase.from("visual_workflow_nodes").insert(nodeRows);
    if (ne) {
      console.error("[visualPlaybook] save nodes", ne.message);
      return false;
    }
  }
  if (edgeRows.length) {
    const { error: ee } = await supabase.from("visual_workflow_edges").insert(edgeRows);
    if (ee) {
      console.error("[visualPlaybook] save edges", ee.message);
      return false;
    }
  }

  await supabase
    .from("visual_workflows")
    .update({ entry_node_key: payload.entryNodeKey, updated_at: now })
    .eq("id", workflowId)
    .eq("company_id", companyId);

  return true;
}

export async function getOrCreateTestSession(
  companyId: string,
  workflowId: string,
  testSessionId: string
): Promise<VisualWorkflowSessionRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from("visual_workflow_sessions")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("subject_type", "test")
    .eq("subject_id", testSessionId)
    .maybeSingle();

  if (existing) return mapSession(existing as Record<string, unknown>);

  const wf = await getVisualWorkflow(companyId, workflowId);
  if (!wf) return null;

  const row = {
    id: crypto.randomUUID(),
    workflow_id: workflowId,
    company_id: companyId,
    subject_type: "test",
    subject_id: testSessionId,
    current_node_key: wf.entry_node_key,
    lead_data: { name: "Test Lead" },
    visit_path: [],
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from("visual_workflow_sessions").insert(row).select("*").single();
  if (error || !data) {
    console.error("[visualPlaybook] getOrCreateTestSession", error?.message);
    return null;
  }
  return mapSession(data as Record<string, unknown>);
}

export async function upsertSessionState(session: VisualWorkflowSessionRow): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("visual_workflow_sessions")
    .update({
      current_node_key: session.current_node_key,
      lead_data: session.lead_data,
      visit_path: session.visit_path,
      updated_at: new Date().toISOString()
    })
    .eq("id", session.id);
  if (error) {
    console.error("[visualPlaybook] upsertSessionState", error.message);
    return false;
  }
  return true;
}

export async function resetTestSessions(companyId: string, workflowId: string, subjectId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("visual_workflow_sessions")
    .delete()
    .eq("company_id", companyId)
    .eq("workflow_id", workflowId)
    .eq("subject_type", "test")
    .eq("subject_id", subjectId);
  return !error;
}

export type TenantWorkflowSessionSummary = {
  workflowId: string;
  workflowName: string;
  currentNodeKey: string;
  /** Human-readable journey, e.g. "Qualification → Budget → Ready" */
  progressDisplay: string;
  lastTransition: string | null;
  sessionUpdatedAt: string;
};

function humanizeWorkflowNodeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  if (!s) return key;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function workflowNodeDisplayLabel(node: VisualWorkflowNodeRow | undefined, key: string): string {
  const prompt = node?.message_prompt?.trim();
  if (prompt) {
    const first = prompt.split(/\n/)[0].trim();
    if (first.length > 0) {
      return first.length > 36 ? `${first.slice(0, 33)}…` : first;
    }
  }
  return humanizeWorkflowNodeKey(key);
}

function buildWorkflowProgressDisplay(
  visitPath: VisitPathEntry[],
  currentNodeKey: string,
  nodesByKey: Map<string, VisualWorkflowNodeRow>
): string {
  const orderedKeys: string[] = [];
  for (const step of visitPath) {
    if (step && typeof step === "object" && "kind" in step && step.kind === "enter") {
      const k = (step as Extract<VisitPathEntry, { kind: "enter" }>).nodeKey;
      if (orderedKeys.length === 0 || orderedKeys[orderedKeys.length - 1] !== k) {
        orderedKeys.push(k);
      }
    }
  }
  if (currentNodeKey && (orderedKeys.length === 0 || orderedKeys[orderedKeys.length - 1] !== currentNodeKey)) {
    orderedKeys.push(currentNodeKey);
  }

  const maxSteps = 5;
  const truncated = orderedKeys.length > maxSteps;
  const keys = truncated ? orderedKeys.slice(-maxSteps) : orderedKeys;

  if (keys.length === 0 && currentNodeKey) {
    return workflowNodeDisplayLabel(nodesByKey.get(currentNodeKey), currentNodeKey);
  }

  const labels = keys.map((k) => workflowNodeDisplayLabel(nodesByKey.get(k), k));
  const chain = labels.join(" → ");
  return truncated ? `… → ${chain}` : chain;
}

/** Latest visual playbook session for a tenant (read-only; does not create rows). */
export async function getLatestTenantWorkflowSessionSummary(
  companyId: string,
  tenantId: string
): Promise<TenantWorkflowSessionSummary | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: sessions, error } = await supabase
    .from("visual_workflow_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("subject_type", "tenant")
    .eq("subject_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !sessions?.length) {
    if (error) console.error("[visualPlaybook] getLatestTenantWorkflowSessionSummary", error.message);
    return null;
  }

  const s = mapSession(sessions[0] as Record<string, unknown>);
  const wf = await getVisualWorkflow(companyId, s.workflow_id);
  const path = s.visit_path || [];

  const { data: nodeRows } = await supabase
    .from("visual_workflow_nodes")
    .select("*")
    .eq("workflow_id", s.workflow_id);
  const nodesByKey = new Map<string, VisualWorkflowNodeRow>();
  for (const row of nodeRows || []) {
    const n = mapNode(row as Record<string, unknown>);
    nodesByKey.set(n.node_key, n);
  }

  const progressDisplay = buildWorkflowProgressDisplay(path, s.current_node_key, nodesByKey);

  let lastTransition: string | null = null;
  for (let i = path.length - 1; i >= 0; i--) {
    const e = path[i];
    if (e && typeof e === "object" && "kind" in e && e.kind === "edge") {
      const edge = e as Extract<VisitPathEntry, { kind: "edge" }>;
      const fb = "engineFallback" in edge && edge.engineFallback ? " · engine fallback" : "";
      lastTransition = `${edge.label} (${edge.matchType})${fb}`;
      break;
    }
  }

  return {
    workflowId: s.workflow_id,
    workflowName: wf?.name ?? "Workflow",
    currentNodeKey: s.current_node_key,
    progressDisplay,
    lastTransition,
    sessionUpdatedAt: s.updated_at
  };
}

/** Clears all visual playbook sessions for a tenant so the next inbound/engage can start from entry. */
export async function deleteTenantVisualWorkflowSessions(companyId: string, tenantId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("visual_workflow_sessions")
    .delete()
    .eq("company_id", companyId)
    .eq("subject_type", "tenant")
    .eq("subject_id", tenantId);
  if (error) {
    console.error("[visualPlaybook] deleteTenantVisualWorkflowSessions", error.message);
    return false;
  }
  return true;
}
