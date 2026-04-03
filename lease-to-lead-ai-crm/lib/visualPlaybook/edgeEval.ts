import type { VisualWorkflowEdgeRow } from "./types";

function sortEdges(edges: VisualWorkflowEdgeRow[]) {
  return [...edges].sort(
    (a, b) => a.sort_order - b.sort_order || a.condition_label.localeCompare(b.condition_label)
  );
}

function normalizeMsg(s: string) {
  return s.trim().toLowerCase();
}

function edgeMatches(
  e: VisualWorkflowEdgeRow,
  normalizedUserMessage: string,
  leadData: Record<string, unknown>
): boolean {
  switch (e.match_type) {
    case "always":
      return true;
    case "default":
      return false;
    case "keyword_contains": {
      const v = e.match_value.trim().toLowerCase();
      return Boolean(v && normalizedUserMessage.includes(v));
    }
    case "keyword_any": {
      const parts = e.match_value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      return parts.some((p) => normalizedUserMessage.includes(p));
    }
    case "intent_equals":
      return String(leadData.lastIntent ?? "") === e.match_value;
    default:
      return false;
  }
}

export type PickedEdge = { edge: VisualWorkflowEdgeRow; usedEngineFallback: boolean };

/**
 * After user sends text at a message or decision node.
 * If nothing matches (including no `default` edge), uses the first outgoing edge by sort_order so the graph never dead-ends.
 */
export function pickEdgeForUserMessage(
  edges: VisualWorkflowEdgeRow[],
  userMessage: string,
  leadData: Record<string, unknown>
): PickedEdge | null {
  if (edges.length === 0) return null;

  const normalized = normalizeMsg(userMessage);
  const nonDefault = sortEdges(edges.filter((e) => e.match_type !== "default"));

  for (const e of nonDefault) {
    if (edgeMatches(e, normalized, leadData)) {
      return { edge: e, usedEngineFallback: false };
    }
  }

  const defaults = sortEdges(edges.filter((e) => e.match_type === "default"));
  if (defaults[0]) {
    return { edge: defaults[0], usedEngineFallback: false };
  }

  const fallback = sortEdges(edges)[0];
  return { edge: fallback, usedEngineFallback: true };
}

/** Action nodes: follow always first, then default, then any single outgoing edge (engine fallback). */
export function pickAutoTransitionEdge(edges: VisualWorkflowEdgeRow[]): VisualWorkflowEdgeRow | null {
  if (edges.length === 0) return null;

  const always = sortEdges(edges.filter((e) => e.match_type === "always"));
  if (always.length) return always[0];

  const defaults = sortEdges(edges.filter((e) => e.match_type === "default"));
  if (defaults[0]) return defaults[0];

  return sortEdges(edges)[0];
}
