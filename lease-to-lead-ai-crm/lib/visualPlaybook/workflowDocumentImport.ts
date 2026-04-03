import OpenAI from "openai";
import { z } from "zod";
import type { EdgeMatchType, VisualWorkflowNodeRow } from "./types";

/** AI output: `type` (preferred) or legacy `node_type`. Only message | decision for new format. */
const aiNodeSchema = z.object({
  node_id: z.string(),
  type: z.enum(["message", "decision"]).optional(),
  node_type: z.enum(["message", "decision", "action"]).optional(),
  message_prompt: z.string(),
  condition_type: z.string().optional(),
  condition_value: z.string().optional()
});

const aiEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  condition_label: z.string(),
  match_type: z.enum(["keyword_any", "default"]).optional(),
  match_value: z.string().optional()
});

const aiWorkflowSchema = z
  .object({
    summary: z.string().optional(),
    entry_node_id: z.string().optional(),
    nodes: z.array(aiNodeSchema).min(1, "At least one node is required"),
    edges: z.array(aiEdgeSchema).default([])
  })
  .refine((d) => d.nodes.length <= 10, { message: "Too many nodes (maximum 10)." });

export type ImportedWorkflowGraph = {
  entryNodeKey: string;
  nodes: Array<{
    node_key: string;
    node_type: VisualWorkflowNodeRow["node_type"];
    position_x: number;
    position_y: number;
    message_prompt: string;
    condition_type: string;
    condition_value: string;
    actions: unknown;
  }>;
  edges: Array<{
    id: string;
    source_key: string;
    target_key: string;
    condition_label: string;
    match_type: EdgeMatchType;
    match_value: string;
    sort_order: number;
  }>;
};

export type WorkflowRefineModifier = "simplify" | "conversational" | "followups";

export const WORKFLOW_REFINE_MODIFIERS: WorkflowRefineModifier[] = [
  "simplify",
  "conversational",
  "followups"
];

const MATCH_TYPES: EdgeMatchType[] = ["default", "always", "keyword_contains", "keyword_any", "intent_equals"];

function normalizeMatchType(raw: string | undefined): EdgeMatchType {
  const v = String(raw || "default")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (MATCH_TYPES.includes(v as EdgeMatchType)) return v as EdgeMatchType;
  return "default";
}

const importRefinementNodeSchema = z.object({
  node_key: z.string(),
  node_type: z.enum(["message", "decision", "action"]),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  message_prompt: z.string(),
  condition_type: z.string().optional(),
  condition_value: z.string().optional(),
  actions: z.unknown().optional()
});

const importRefinementEdgeSchema = z.object({
  id: z.string().optional(),
  source_key: z.string(),
  target_key: z.string(),
  condition_label: z.string(),
  match_type: z.string().optional(),
  match_value: z.string().optional(),
  sort_order: z.number().optional()
});

const importRefinementGraphSchema = z.object({
  entryNodeKey: z.string(),
  nodes: z.array(importRefinementNodeSchema).min(1),
  edges: z.array(importRefinementEdgeSchema)
});

const importRefinementBodySchema = z.object({
  refineFromGraph: importRefinementGraphSchema,
  modifier: z.enum(["simplify", "conversational", "followups"])
});

export function parseImportRefinementBody(
  body: unknown
): { ok: true; graph: ImportedWorkflowGraph; modifier: WorkflowRefineModifier } | { ok: false } {
  const p = importRefinementBodySchema.safeParse(body);
  if (!p.success) return { ok: false };
  const g = p.data.refineFromGraph;
  const graph: ImportedWorkflowGraph = {
    entryNodeKey: g.entryNodeKey,
    nodes: g.nodes.map((n) => ({
      node_key: n.node_key,
      node_type: n.node_type,
      position_x: n.position_x ?? 0,
      position_y: n.position_y ?? 0,
      message_prompt: n.message_prompt,
      condition_type: (n.condition_type ?? "any").trim() || "any",
      condition_value: (n.condition_value ?? "").trim(),
      actions: n.actions ?? []
    })),
    edges: g.edges.map((e, i) => ({
      id: e.id?.trim() || `e-${e.source_key}-${e.target_key}-${i}`,
      source_key: e.source_key,
      target_key: e.target_key,
      condition_label: e.condition_label.trim() || "next",
      match_type: normalizeMatchType(e.match_type),
      match_value: (e.match_value ?? "").trim(),
      sort_order: e.sort_order ?? i
    }))
  };
  return { ok: true, graph, modifier: p.data.modifier };
}

const REFINE_MODIFIER_INSTRUCTION: Record<WorkflowRefineModifier, string> = {
  simplify:
    "Simplify this workflow: shorter, clearer message_prompt text, fewer redundant steps if possible, same branching rules (Yes / No / Unsure with exactly one default Unsure edge per decision). Stay within the node count limits.",
  conversational:
    "Make message_prompt texts warmer and more natural for SMS — still concise. Keep the same graph shape and node_ids unless a tiny rename improves clarity; preserve all decision edge rules.",
  followups:
    "Add helpful follow-up steps where they improve the lease-to-lead flow (e.g. gentle nudge, clarify timing) without bloating the tree. Obey decision edge rules and node limits."
};

function resolveAiNodeKind(n: z.infer<typeof aiNodeSchema>): "message" | "decision" {
  const t = n.type ?? n.node_type;
  if (t === "decision") return "decision";
  if (t === "action") return "message";
  return "message";
}

const DECISION_EDGE_LABELS = new Set<string>(["Yes", "No", "Unsure"]);

function normalizeDecisionEdgeLabel(raw: string): "Yes" | "No" | "Unsure" | null {
  const t = raw.trim();
  if (DECISION_EDGE_LABELS.has(t)) return t as "Yes" | "No" | "Unsure";
  const lower = t.toLowerCase();
  if (lower === "yes") return "Yes";
  if (lower === "no") return "No";
  if (lower === "unsure" || lower === "not sure") return "Unsure";
  return null;
}

function defaultKeywordValueForYesNo(label: "Yes" | "No"): string {
  if (label === "Yes") return "yes,yep,yeah,sure,interested,ok";
  return "no,nope,not really,not interested,cant";
}

function sanitizeKeyBase(raw: string): string {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  if (!s || /^[0-9]/.test(s)) s = `n_${s || "node"}`;
  return s.slice(0, 64) || "node";
}

function buildIdMap(nodeIds: string[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const id of nodeIds) {
    const base = sanitizeKeyBase(id);
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n++}`;
    }
    used.add(key);
    map.set(id, key);
  }
  return map;
}

function inferEntryNode(
  nodeKeys: string[],
  edges: { source: string; target: string }[],
  explicit?: string
): string {
  if (explicit && nodeKeys.includes(explicit)) return explicit;
  const targets = new Set(edges.map((e) => e.target));
  const noIncoming = nodeKeys.filter((k) => !targets.has(k));
  if (noIncoming.length === 1) return noIncoming[0];
  if (noIncoming.length > 0) return noIncoming[0];
  return nodeKeys[0];
}

/** Layered layout: BFS from entry, left-to-right. */
function layoutPositions(
  nodeKeys: string[],
  entry: string,
  edges: { source: string; target: string }[]
): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const queue: string[] = [];
  if (nodeKeys.includes(entry)) {
    level.set(entry, 0);
    queue.push(entry);
  }
  while (queue.length) {
    const k = queue.shift()!;
    const L = level.get(k) ?? 0;
    for (const e of edges) {
      if (e.source !== k) continue;
      if (!nodeKeys.includes(e.target)) continue;
      const nextL = L + 1;
      if (!level.has(e.target) || (level.get(e.target) ?? 999) > nextL) {
        level.set(e.target, nextL);
        queue.push(e.target);
      }
    }
  }
  const maxL = nodeKeys.reduce((m, k) => Math.max(m, level.get(k) ?? 0), 0);
  for (const k of nodeKeys) {
    if (!level.has(k)) level.set(k, maxL + 1);
  }

  const colBuckets = new Map<number, string[]>();
  for (const k of nodeKeys) {
    const c = level.get(k) ?? 0;
    if (!colBuckets.has(c)) colBuckets.set(c, []);
    colBuckets.get(c)!.push(k);
  }
  const pos = new Map<string, { x: number; y: number }>();
  const sortedCols = Array.from(colBuckets.keys()).sort((a, b) => a - b);
  for (const c of sortedCols) {
    const row = colBuckets.get(c)!;
    row.sort();
    row.forEach((k, i) => {
      pos.set(k, { x: c * 300, y: i * 160 });
    });
  }
  return pos;
}

/** Turn optional AI summary into at most 3 concise display lines. */
export function formatImportSummaryBullets(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const t = raw.trim();
  const lines = t
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 3);
  const parts = t
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts.slice(0, 3);
  return [t.length > 140 ? `${t.slice(0, 137)}…` : t];
}

/**
 * Parse and validate AI JSON, remap ids, layout, and produce graph rows for the visual builder.
 */
export function buildImportedWorkflowGraph(
  parsed: unknown
): { ok: true; graph: ImportedWorkflowGraph; summary?: string } | { ok: false; error: string } {
  let obj: unknown = parsed;
  if (typeof parsed === "string") {
    try {
      obj = JSON.parse(parsed);
    } catch {
      return { ok: false, error: "AI returned invalid JSON." };
    }
  }

  const prelim = aiWorkflowSchema.safeParse(obj);
  if (!prelim.success) {
    const msg = prelim.error.issues.map((i) => i.message).join("; ") || "Invalid workflow shape.";
    return { ok: false, error: msg };
  }

  const data = prelim.data;
  const uniqueById = new Map<string, z.infer<typeof aiNodeSchema>>();
  for (const n of data.nodes) {
    if (!uniqueById.has(n.node_id)) uniqueById.set(n.node_id, n);
  }
  const uniqueNodes = Array.from(uniqueById.values());

  const idMap = buildIdMap(uniqueNodes.map((n) => n.node_id));
  const nodeKeys = Array.from(idMap.values());

  const remappedEdges: Array<{
    source: string;
    target: string;
    condition_label: string;
    match_type: string | undefined;
    match_value: string;
  }> = [];

  for (let i = 0; i < data.edges.length; i++) {
    const e = data.edges[i];
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t) {
      return {
        ok: false,
        error: `Edge ${i + 1} references an unknown node id (source: "${e.source}", target: "${e.target}").`
      };
    }
    remappedEdges.push({
      source: s,
      target: t,
      condition_label: e.condition_label.trim() || "next",
      match_type: e.match_type,
      match_value: e.match_value ?? ""
    });
  }

  const entryRaw = data.entry_node_id;
  const entryMapped = entryRaw ? idMap.get(entryRaw) : undefined;
  const entryNodeKey = nodeKeys.includes("start")
    ? "start"
    : inferEntryNode(
        nodeKeys,
        remappedEdges.map((e) => ({ source: e.source, target: e.target })),
        entryMapped
      );

  const positions = layoutPositions(
    nodeKeys,
    entryNodeKey,
    remappedEdges.map((e) => ({ source: e.source, target: e.target }))
  );

  const nodes: ImportedWorkflowGraph["nodes"] = uniqueNodes.map((n) => {
    const node_key = idMap.get(n.node_id)!;
    const kind = resolveAiNodeKind(n);
    const p = positions.get(node_key) ?? { x: 0, y: 0 };
    return {
      node_key,
      node_type: kind,
      position_x: p.x,
      position_y: p.y,
      message_prompt: n.message_prompt.trim(),
      condition_type: (n.condition_type ?? "any").trim() || "any",
      condition_value: (n.condition_value ?? "").trim(),
      actions: [] as unknown[]
    };
  });

  const nodeTypeByKey = new Map(nodes.map((n) => [n.node_key, n.node_type]));

  const builtEdges: ImportedWorkflowGraph["edges"] = [];
  for (let i = 0; i < remappedEdges.length; i++) {
    const e = remappedEdges[i];
    const srcType = nodeTypeByKey.get(e.source);
    if (!srcType) {
      return { ok: false, error: `Internal error: unknown source "${e.source}".` };
    }

    if (srcType === "decision") {
      const lab = normalizeDecisionEdgeLabel(e.condition_label);
      if (!lab) {
        return {
          ok: false,
          error: `Edge ${i + 1} from decision "${e.source}": condition_label must be Yes, No, or Unsure (got "${e.condition_label}").`
        };
      }
      const wantsDefault = e.match_type === "default" || lab === "Unsure";
      const match_type: EdgeMatchType = wantsDefault ? "default" : "keyword_any";
      const match_value =
        match_type === "default"
          ? ""
          : String(e.match_value ?? "").trim() ||
            (lab === "Yes" || lab === "No" ? defaultKeywordValueForYesNo(lab) : "");
      builtEdges.push({
        id: `e-${e.source}-${e.target}-${i}`,
        source_key: e.source,
        target_key: e.target,
        condition_label: lab,
        match_type,
        match_value,
        sort_order: i
      });
    } else {
      const mtIn = (e.match_type || "default").toLowerCase();
      const rawVal = String(e.match_value ?? "").trim();
      const match_type: EdgeMatchType =
        mtIn === "keyword_any" && rawVal ? "keyword_any" : "always";
      const match_value = match_type === "keyword_any" ? rawVal : "";
      builtEdges.push({
        id: `e-${e.source}-${e.target}-${i}`,
        source_key: e.source,
        target_key: e.target,
        condition_label: e.condition_label.trim() || "next",
        match_type,
        match_value,
        sort_order: i
      });
    }
  }

  let edges = ensureDefaultFallbackOnDecisions(nodes, builtEdges);

  const structuralError = validateImportedWorkflowStructure(nodes, edges, entryNodeKey);
  if (structuralError) {
    return { ok: false, error: structuralError };
  }

  const summaryRaw = data.summary?.trim();
  const summary = summaryRaw ? summaryRaw.slice(0, 1200) : undefined;

  return {
    ok: true,
    graph: { entryNodeKey, nodes, edges },
    ...(summary ? { summary } : {})
  };
}

function validateImportedWorkflowStructure(
  nodes: ImportedWorkflowGraph["nodes"],
  edges: ImportedWorkflowGraph["edges"],
  entryNodeKey: string
): string | null {
  const start = nodes.find((n) => n.node_key === "start");
  if (!start) {
    return 'Missing required node_id "start" (opening message).';
  }
  if (start.node_type !== "message") {
    return 'Node "start" must have type "message".';
  }
  if (entryNodeKey !== "start") {
    return 'entry_node_id must be "start" and match the opening message node.';
  }

  const keys = new Set(nodes.map((n) => n.node_key));
  const decisionKeys = new Set(nodes.filter((n) => n.node_type === "decision").map((n) => n.node_key));

  for (const dk of Array.from(decisionKeys)) {
    const out = edges.filter((e) => e.source_key === dk);
    if (out.length < 2 || out.length > 3) {
      return `Decision "${dk}" must have 2–3 outgoing edges (found ${out.length}).`;
    }
    const defaults = out.filter((e) => e.match_type === "default");
    if (defaults.length !== 1) {
      return `Decision "${dk}" must have exactly one fallback edge with match_type "default" and condition_label "Unsure".`;
    }
    if (defaults[0].condition_label !== "Unsure") {
      return `Decision "${dk}": the default edge must use condition_label "Unsure".`;
    }
    for (const e of out) {
      if (!["Yes", "No", "Unsure"].includes(e.condition_label)) {
        return `Decision "${dk}": edge labels must be only Yes, No, or Unsure.`;
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [entryNodeKey];
  while (queue.length) {
    const k = queue.shift()!;
    if (reachable.has(k)) continue;
    if (!keys.has(k)) continue;
    reachable.add(k);
    for (const e of edges) {
      if (e.source_key === k) queue.push(e.target_key);
    }
  }
  if (reachable.size !== nodes.length) {
    return "Every node must be reachable from start (no orphan nodes).";
  }

  for (const n of nodes) {
    if (n.node_key === "start") continue;
    const hasIn = edges.some((e) => e.target_key === n.node_key);
    if (!hasIn) {
      return `Node "${n.node_key}" has no incoming edge.`;
    }
  }

  return null;
}

/** Every decision with 2+ outgoing edges must have exactly one default fallback (prompt also requires this). */
function ensureDefaultFallbackOnDecisions(
  nodes: ImportedWorkflowGraph["nodes"],
  edges: ImportedWorkflowGraph["edges"]
): ImportedWorkflowGraph["edges"] {
  const decisionKeys = new Set(nodes.filter((n) => n.node_type === "decision").map((n) => n.node_key));
  const next = edges.map((e) => ({ ...e }));

  for (const dk of Array.from(decisionKeys)) {
    const outIndices = next.map((e, i) => (e.source_key === dk ? i : -1)).filter((i) => i >= 0);
    if (outIndices.length < 2) continue;

    const hasDefault = outIndices.some((i) => next[i].match_type === "default");
    if (hasDefault) continue;

    const scored = outIndices.map((i) => {
      const lab = next[i].condition_label.toLowerCase();
      let score = 0;
      if (/\b(unsure|not sure|other|else|default|anything|maybe)\b/.test(lab)) score = 3;
      else if (/\bno\b/.test(lab)) score = 1;
      return { i, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const pick = scored[0]?.i ?? outIndices[outIndices.length - 1];
    const cur = next[pick];
    next[pick] = {
      ...cur,
      match_type: "default",
      match_value: "",
      condition_label: "Unsure"
    };
  }

  return next;
}

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function stripJsonFromMarkdown(text: string): string {
  const t = text.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : t).trim();
}

const WORKFLOW_AI_SYSTEM = `You are an expert at converting written business ideas into structured conversational workflows for an AI system.

Your task is to convert the provided text into a clean, simple decision-tree workflow for SMS-style conversations.

The output must strictly follow this JSON format:

{
  "summary": "optional string — 2–3 short lines separated by newlines, plain English: what this workflow does, who it is for, and what happens next (no markdown bullets)",
  "entry_node_id": "start",
  "nodes": [
    {
      "node_id": "string",
      "type": "message | decision",
      "message_prompt": "string"
    }
  ],
  "edges": [
    {
      "source": "node_id",
      "target": "node_id",
      "condition_label": "Yes | No | Unsure",
      "match_type": "keyword_any | default",
      "match_value": "string"
    }
  ]
}

STRICT RULES:

START NODE
Always include a start node:
node_id must be "start"
type must be "message"
This is the first message sent to the user

WORKFLOW SIZE
Target 5–7 nodes
Hard cap at 8 nodes (maximum 10 only if extremely linear)
If input is long, summarize into a simple "happy path + opt-out + fallback"

MESSAGE STYLE
Keep message_prompt short (1–3 sentences max)
Use conversational, human SMS tone
No corporate language
No long paragraphs or bullet lists unless absolutely necessary

NODE TYPES
Use only:
"message" (AI sends message)
"decision" (branches based on user reply)

BRANCHING RULES
Decision nodes must have 2–3 outgoing edges
condition_label must ONLY be:
"Yes"
"No"
"Unsure"
Labels must be Title Case exactly (no variations)

DEFAULT / FALLBACK
Every decision node with 2+ edges MUST include exactly ONE:
match_type: "default"
match_value: ""
condition_label: "Unsure"

MATCHING LOGIC
For Yes / No edges:
use match_type: "keyword_any"
include simple keywords like:
Yes: "yes,yep,yeah,sure,interested"
No: "no,not really,nope,not interested"

SIMPLICITY
Avoid complex trees
Avoid deep nesting
Keep flow intuitive and linear where possible

STRUCTURAL INTEGRITY
Every node must be reachable
Every decision node must have outgoing edges
No orphan nodes
No duplicate node_ids
node_id must be lowercase with underscores (e.g. "ask_interest")

GOAL
The workflow should:
qualify the user
determine interest level
guide to a clear next step (call, follow-up, or exit)

SUMMARY (optional but recommended)
Include top-level "summary" as 2–3 newline-separated plain sentences for humans reviewing the import.

OUTPUT
Return ONLY valid JSON
No explanations, no comments, no extra text`;

export async function generateWorkflowFromDocumentText(documentText: string): Promise<
  { ok: true; graph: ImportedWorkflowGraph; summary?: string } | { ok: false; error: string }
> {
  const trimmed = documentText.trim();
  if (!trimmed) {
    return { ok: false, error: "No text to analyze." };
  }
  const maxChars = 100_000;
  const text = trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n\n[truncated]` : trimmed;

  const openai = getOpenAI();
  if (!openai) {
    return { ok: false, error: "OpenAI is not configured (missing OPENAI_API_KEY)." };
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8192,
      messages: [
        { role: "system", content: WORKFLOW_AI_SYSTEM },
        {
          role: "user",
          content: `Convert the following text into the workflow JSON.\n\n---\n${text}\n---`
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, error: "AI returned an empty response." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFromMarkdown(raw));
    } catch {
      return { ok: false, error: "AI output was not valid JSON." };
    }

    return buildImportedWorkflowGraph(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed.";
    return { ok: false, error: msg };
  }
}

function workflowGraphToRefinementPayload(base: ImportedWorkflowGraph): string {
  return JSON.stringify(
    {
      entry_node_key: base.entryNodeKey,
      nodes: base.nodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        message_prompt: n.message_prompt,
        condition_type: n.condition_type,
        condition_value: n.condition_value
      })),
      edges: base.edges.map((e) => ({
        source_key: e.source_key,
        target_key: e.target_key,
        condition_label: e.condition_label,
        match_type: e.match_type,
        match_value: e.match_value
      }))
    },
    null,
    0
  );
}

export async function generateWorkflowRefinement(
  base: ImportedWorkflowGraph,
  modifier: WorkflowRefineModifier
): Promise<
  { ok: true; graph: ImportedWorkflowGraph; summary?: string } | { ok: false; error: string }
> {
  const openai = getOpenAI();
  if (!openai) {
    return { ok: false, error: "OpenAI is not configured (missing OPENAI_API_KEY)." };
  }

  const spec = workflowGraphToRefinementPayload(base);
  const maxSpec = 60_000;
  const specTruncated = spec.length > maxSpec ? `${spec.slice(0, maxSpec)}\n…[truncated]` : spec;

  const userContent = `Revise the following SMS workflow JSON. Apply ONLY this instruction:

${REFINE_MODIFIER_INSTRUCTION[modifier]}

Return a complete replacement workflow in the same JSON shape your system message requires (entry_node_id "start", nodes with node_id and type, edges with Yes/No/Unsure rules, optional summary). Preserve the overall intent unless the instruction asks to change tone or structure.

Current workflow:
${specTruncated}`;

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.25,
      max_tokens: 8192,
      messages: [
        { role: "system", content: WORKFLOW_AI_SYSTEM },
        { role: "user", content: userContent }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, error: "AI returned an empty response." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFromMarkdown(raw));
    } catch {
      return { ok: false, error: "AI output was not valid JSON." };
    }

    return buildImportedWorkflowGraph(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed.";
    return { ok: false, error: msg };
  }
}
