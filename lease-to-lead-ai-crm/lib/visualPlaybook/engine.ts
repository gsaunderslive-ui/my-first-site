import { applyPlaybookActions } from "./actionsExec";
import { pickAutoTransitionEdge, pickEdgeForUserMessage } from "./edgeEval";
import { renderPlaybookNodeMessage } from "./openaiRender";
import type {
  LoadedPlaybookGraph,
  VisitPathEntry,
  VisualWorkflowEdgeRow,
  VisualWorkflowNodeRow,
  VisualWorkflowSessionRow
} from "./types";

export type PlaybookStepResult = {
  assistantMessages: string[];
  currentNodeKey: string;
  leadData: Record<string, unknown>;
  visitPath: VisitPathEntry[];
  lastEdge?: { id: string; label: string; matchType: string; engineFallback?: boolean } | null;
  error?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function appendPath(session: VisualWorkflowSessionRow, entry: Record<string, unknown>) {
  const path = [...(session.visit_path || [])];
  path.push({ ...entry, at: nowIso() } as VisitPathEntry);
  session.visit_path = path;
}

async function runActionChain(graph: LoadedPlaybookGraph, session: VisualWorkflowSessionRow, startKey: string): Promise<string> {
  let key = startKey;
  for (let i = 0; i < 40; i++) {
    const node = graph.nodesByKey.get(key);
    if (!node) return key;
    if (node.node_type !== "action") return key;

    applyPlaybookActions(node.actions, session.lead_data);
    appendPath(session, { kind: "action", nodeKey: node.node_key });

    const out = graph.edgesBySource.get(key) || [];
    const edge = pickAutoTransitionEdge(out);
    if (!edge) return key;

    appendPath(session, {
      kind: "edge",
      edgeId: edge.id,
      label: edge.condition_label,
      matchType: edge.match_type
    });

    key = edge.target_key;
    session.current_node_key = key;
  }
  return key;
}

async function emitMessageForNode(session: VisualWorkflowSessionRow, node: VisualWorkflowNodeRow): Promise<string> {
  const { text } = await renderPlaybookNodeMessage({
    messagePrompt: node.message_prompt,
    leadData: session.lead_data,
    tenantName: typeof session.lead_data.name === "string" ? session.lead_data.name : undefined
  });
  const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  appendPath(session, { kind: "message_out", nodeKey: node.node_key, preview });
  return text;
}

/** Start or reset: move through action chain from entry, then emit first message if landing on message node. */
export async function playbookStartOrResume(graph: LoadedPlaybookGraph, session: VisualWorkflowSessionRow): Promise<PlaybookStepResult> {
  session.current_node_key = graph.workflow.entry_node_key;
  session.visit_path = [];
  const entryNode = graph.nodesByKey.get(graph.workflow.entry_node_key);
  appendPath(session, {
    kind: "enter",
    nodeKey: graph.workflow.entry_node_key,
    nodeType: entryNode?.node_type ?? "message"
  });

  session.current_node_key = await runActionChain(graph, session, session.current_node_key);

  const node = graph.nodesByKey.get(session.current_node_key);
  if (!node) {
    return {
      assistantMessages: [],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      error: `Unknown node "${session.current_node_key}"`
    };
  }

  if (node.node_type === "message") {
    const text = await emitMessageForNode(session, node);
    return {
      assistantMessages: [text],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path]
    };
  }

  if (node.node_type === "decision") {
    return {
      assistantMessages: [],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path]
    };
  }

  return {
    assistantMessages: [],
    currentNodeKey: session.current_node_key,
    leadData: session.lead_data,
    visitPath: [...session.visit_path],
    error: "Entry resolved to an unsupported state; add a message or decision node after actions."
  };
}

/** User message at current message or decision node. */
export async function playbookHandleUserMessage(
  graph: LoadedPlaybookGraph,
  session: VisualWorkflowSessionRow,
  userMessage: string
): Promise<PlaybookStepResult> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return {
      assistantMessages: [],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      error: "Empty message"
    };
  }

  session.lead_data = { ...session.lead_data, lastUserMessage: trimmed };
  appendPath(session, { kind: "user_in", text: trimmed });

  const curKey = session.current_node_key;
  const cur = graph.nodesByKey.get(curKey);
  if (!cur || (cur.node_type !== "message" && cur.node_type !== "decision")) {
    return {
      assistantMessages: [],
      currentNodeKey: curKey,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      error: "Current node does not accept user input (expected message or decision)."
    };
  }

  const edges = graph.edgesBySource.get(curKey) || [];
  const picked = pickEdgeForUserMessage(edges, trimmed, session.lead_data);
  if (!picked) {
    return {
      assistantMessages: [],
      currentNodeKey: curKey,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      error: "This node has no outgoing edges. Connect at least one edge in the playbook editor."
    };
  }

  const { edge, usedEngineFallback } = picked;
  appendPath(session, {
    kind: "edge",
    edgeId: edge.id,
    label: usedEngineFallback ? `${edge.condition_label} (engine fallback)` : edge.condition_label,
    matchType: edge.match_type,
    ...(usedEngineFallback ? { engineFallback: true } : {})
  });

  session.current_node_key = edge.target_key;
  const target = graph.nodesByKey.get(edge.target_key);
  if (target) {
    appendPath(session, { kind: "enter", nodeKey: target.node_key, nodeType: target.node_type });
  }

  session.current_node_key = await runActionChain(graph, session, session.current_node_key);

  const next = graph.nodesByKey.get(session.current_node_key);
  if (!next) {
    return {
      assistantMessages: [],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      lastEdge: {
        id: edge.id,
        label: edge.condition_label,
        matchType: edge.match_type,
        ...(usedEngineFallback ? { engineFallback: true } : {})
      },
      error: `Unknown node "${session.current_node_key}"`
    };
  }

  if (next.node_type === "message") {
    const text = await emitMessageForNode(session, next);
    return {
      assistantMessages: [text],
      currentNodeKey: session.current_node_key,
      leadData: session.lead_data,
      visitPath: [...session.visit_path],
      lastEdge: {
        id: edge.id,
        label: edge.condition_label,
        matchType: edge.match_type,
        ...(usedEngineFallback ? { engineFallback: true } : {})
      }
    };
  }

  return {
    assistantMessages: [],
    currentNodeKey: session.current_node_key,
    leadData: session.lead_data,
    visitPath: [...session.visit_path],
    lastEdge: {
      id: edge.id,
      label: edge.condition_label,
      matchType: edge.match_type,
      ...(usedEngineFallback ? { engineFallback: true } : {})
    }
  };
}

export function buildGraph(
  workflow: LoadedPlaybookGraph["workflow"],
  nodes: VisualWorkflowNodeRow[],
  edges: VisualWorkflowEdgeRow[]
): LoadedPlaybookGraph {
  const nodesByKey = new Map<string, VisualWorkflowNodeRow>();
  for (const n of nodes) {
    nodesByKey.set(n.node_key, n);
  }
  const edgesBySource = new Map<string, VisualWorkflowEdgeRow[]>();
  for (const e of edges) {
    const list = edgesBySource.get(e.source_key) || [];
    list.push(e);
    edgesBySource.set(e.source_key, list);
  }
  for (const [, list] of Array.from(edgesBySource.entries())) {
    list.sort(
      (a: VisualWorkflowEdgeRow, b: VisualWorkflowEdgeRow) =>
        a.sort_order - b.sort_order || a.condition_label.localeCompare(b.condition_label)
    );
  }
  return { workflow, nodesByKey, edgesBySource };
}
