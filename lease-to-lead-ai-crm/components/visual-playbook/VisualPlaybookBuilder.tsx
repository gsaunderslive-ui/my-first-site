"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatImportSummaryBullets,
  type ImportedWorkflowGraph,
  type WorkflowRefineModifier
} from "@/lib/visualPlaybook/workflowDocumentImport";
import type { EdgeMatchType, VisualWorkflowNodeRow } from "@/lib/visualPlaybook/types";
import { ImportWorkflowModal } from "./ImportWorkflowModal";
import { PlaybookEditContext } from "./PlaybookEditContext";
import { PlaybookPreviewDiffContext } from "./PlaybookPreviewDiffContext";
import { playbookNodeTypes, type PlaybookRfData } from "./PlaybookFlowNodes";

const DND_TYPE = "application/playbook-node";

function rfTypeFor(nodeType: VisualWorkflowNodeRow["node_type"]) {
  if (nodeType === "decision") return "playbookDecision";
  if (nodeType === "action") return "playbookAction";
  return "playbookMessage";
}

function mapApiToFlow(
  nodes: Array<{
    node_key: string;
    node_type: VisualWorkflowNodeRow["node_type"];
    position_x: number;
    position_y: number;
    message_prompt: string;
    condition_type: string;
    condition_value: string;
    actions: unknown;
  }>,
  edges: Array<{
    id: string;
    source_key: string;
    target_key: string;
    condition_label: string;
    match_type: EdgeMatchType;
    match_value: string;
    sort_order: number;
  }>,
  highlightKeys: Set<string>
): { nodes: Node<PlaybookRfData>[]; edges: Edge[] } {
  const n: Node<PlaybookRfData>[] = nodes.map((row) => ({
    id: row.node_key,
    type: rfTypeFor(row.node_type),
    position: { x: row.position_x, y: row.position_y },
    data: {
      nodeKey: row.node_key,
      nodeType: row.node_type,
      messagePrompt: row.message_prompt,
      conditionType: row.condition_type,
      conditionValue: row.condition_value,
      actionsJson: JSON.stringify(row.actions ?? [], null, 2),
      highlighted: highlightKeys.has(row.node_key)
    }
  }));
  const e: Edge[] = edges.map((row) => ({
    id: row.id,
    source: row.source_key,
    target: row.target_key,
    label: row.condition_label,
    data: {
      conditionLabel: row.condition_label,
      matchType: row.match_type,
      matchValue: row.match_value,
      sortOrder: row.sort_order
    }
  }));
  return { nodes: n, edges: e };
}

function flowToPayload(
  nodes: Node<PlaybookRfData>[],
  edges: Edge[],
  entryNodeKey: string
) {
  return {
    entryNodeKey,
    nodes: nodes.map((node) => ({
      nodeKey: node.id,
      nodeType: node.data.nodeType,
      position: node.position,
      messagePrompt: node.data.messagePrompt,
      conditionType: node.data.conditionType,
      conditionValue: node.data.conditionValue,
      actions: (() => {
        try {
          return JSON.parse(node.data.actionsJson || "[]");
        } catch {
          return [];
        }
      })()
    })),
    edges: edges.map((edge, i) => ({
      sourceKey: edge.source,
      targetKey: edge.target,
      conditionLabel: String(edge.data?.conditionLabel ?? edge.label ?? "next"),
      matchType: (edge.data?.matchType as EdgeMatchType) || "default",
      matchValue: String(edge.data?.matchValue ?? ""),
      sortOrder: typeof edge.data?.sortOrder === "number" ? edge.data.sortOrder : i
    }))
  };
}

const MATCH_OPTIONS: EdgeMatchType[] = ["default", "always", "keyword_contains", "keyword_any", "intent_equals"];

type PendingWorkflowPreview = {
  nonce: number;
  graph: ImportedWorkflowGraph;
  summary: string | null;
};

function BuilderCanvas({
  workflowId,
  isAdmin,
  pendingPreview,
  onDiscardPreview,
  onPreviewApplied,
  replacePendingPreview,
  workflowImportBusy
}: {
  workflowId: string;
  isAdmin: boolean;
  pendingPreview: PendingWorkflowPreview | null;
  onDiscardPreview: () => void;
  onPreviewApplied: () => void;
  replacePendingPreview: (next: { graph: ImportedWorkflowGraph; summary: string | null }) => void;
  workflowImportBusy: boolean;
}) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const graphFetchIdRef = useRef(0);
  /** When true, completed server loads must not replace the canvas (imported draft in memory). */
  const hasImportedRef = useRef(false);
  const { screenToFlowPosition, fitView, getNode } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PlaybookRfData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [entryNodeKey, setEntryNodeKey] = useState("start");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [importIncompleteWarning, setImportIncompleteWarning] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testSessionId, setTestSessionId] = useState(() => crypto.randomUUID());
  const [testInput, setTestInput] = useState("");
  const [testLog, setTestLog] = useState<{ role: "user" | "assistant" | "system"; text: string }[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(new Set());
  const [lastCurrentNode, setLastCurrentNode] = useState("");
  const [previewRefineBusy, setPreviewRefineBusy] = useState(false);
  const [previewRefineError, setPreviewRefineError] = useState("");

  useEffect(() => {
    hasImportedRef.current = false;
    graphFetchIdRef.current += 1;
    setAppliedSummary(null);
  }, [workflowId]);

  const loadGraph = useCallback(async () => {
    const fetchId = ++graphFetchIdRef.current;
    const res = await fetch(`/api/visual-playbooks/workflows/${workflowId}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (fetchId !== graphFetchIdRef.current) return;
    if (!res.ok) return;
    if (hasImportedRef.current) return;
    setEntryNodeKey(data.workflow?.entry_node_key || "start");
    const { nodes: n, edges: e } = mapApiToFlow(data.nodes || [], data.edges || [], new Set());
    setNodes(n);
    setEdges(e);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setImportIncompleteWarning(false);
  }, [workflowId, setNodes, setEdges]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  /** New preview: block stale server graph only; do not set hasImported until Apply. */
  useEffect(() => {
    if (!pendingPreview) return;
    graphFetchIdRef.current += 1;
    setAppliedSummary(null);
    setPreviewRefineError("");
  }, [pendingPreview?.nonce]);

  const previewRefineLocked = workflowImportBusy || previewRefineBusy;

  const handlePreviewRefine = useCallback(
    async (modifier: WorkflowRefineModifier) => {
      if (previewRefineLocked || !pendingPreview) return;
      const baseGraph = pendingPreview.graph;
      setPreviewRefineBusy(true);
      setPreviewRefineError("");
      try {
        const res = await fetch("/api/visual-playbooks/workflows/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refineFromGraph: baseGraph, modifier })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPreviewRefineError(String(data.error || `Refine failed (${res.status})`));
          return;
        }
        if (!data.graph) {
          setPreviewRefineError("Server returned no workflow.");
          return;
        }
        replacePendingPreview({
          graph: data.graph as ImportedWorkflowGraph,
          summary: data.summary != null ? String(data.summary) : null
        });
      } finally {
        setPreviewRefineBusy(false);
      }
    },
    [previewRefineLocked, pendingPreview, replacePendingPreview]
  );

  const updateNodeMessagePrompt = useCallback(
    (nodeId: string, messagePrompt: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, messagePrompt } } : n))
      );
    },
    [setNodes]
  );

  const playbookEditValue = useMemo(
    () => ({ isAdmin, updateNodeMessagePrompt }),
    [isAdmin, updateNodeMessagePrompt]
  );

  const applyImportedGraphToCanvas = useCallback(
    (g: ImportedWorkflowGraph, summaryForPanel: string | null) => {
      graphFetchIdRef.current += 1;
      hasImportedRef.current = true;
      const incomplete = g.nodes.length < 2 || g.edges.length < 1;
      setImportIncompleteWarning(incomplete);
      setEntryNodeKey(g.entryNodeKey);
      const { nodes: n, edges: e } = mapApiToFlow(
        g.nodes.map((row) => ({
          node_key: row.node_key,
          node_type: row.node_type,
          position_x: row.position_x,
          position_y: row.position_y,
          message_prompt: row.message_prompt,
          condition_type: row.condition_type,
          condition_value: row.condition_value,
          actions: row.actions
        })),
        g.edges,
        new Set()
      );
      const focusId = n.some((node) => node.id === "start") ? "start" : g.entryNodeKey;
      const withSelection = n.map((node) => ({
        ...node,
        selected: node.id === focusId,
        className: "playbook-node-import-ease"
      }));
      setNodes(withSelection);
      setEdges(e);
      setSelectedId(focusId);
      setSelectedEdgeId(null);
      setHighlightKeys(new Set());
      setTestLog([]);
      setLastCurrentNode("");
      setTestInput("");
      setTestSessionId(crypto.randomUUID());
      setAppliedSummary(summaryForPanel?.trim() || null);
      window.setTimeout(() => {
        const target = getNode(focusId);
        if (target) {
          void fitView({
            nodes: [{ id: focusId }],
            duration: 420,
            padding: 0.38,
            maxZoom: 1.25
          });
        } else {
          void fitView({ duration: 420, padding: 0.28 });
        }
      }, 48);
      window.setTimeout(() => {
        setNodes((prev) =>
          prev.map((node) =>
            node.className === "playbook-node-import-ease"
              ? { ...node, className: undefined }
              : node
          )
        );
      }, 620);
    },
    [setNodes, setEdges, fitView, getNode]
  );

  const handleApplyPreview = useCallback(() => {
    if (!pendingPreview) return;
    applyImportedGraphToCanvas(pendingPreview.graph, pendingPreview.summary);
    onPreviewApplied();
  }, [pendingPreview, applyImportedGraphToCanvas, onPreviewApplied]);

  const summaryBullets = useMemo(
    () =>
      formatImportSummaryBullets(
        pendingPreview?.summary ?? appliedSummary ?? undefined
      ),
    [pendingPreview?.summary, appliedSummary]
  );

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, highlighted: highlightKeys.has(n.id) }
      }))
    );
  }, [highlightKeys, setNodes]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            id: `e-${c.source}-${c.target}-${Date.now()}`,
            label: "next",
            data: {
              conditionLabel: "next",
              matchType: "default" as EdgeMatchType,
              matchValue: "",
              sortOrder: eds.length
            }
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(DND_TYPE);
      if (!raw || !reactFlowWrapper.current) return;
      const nodeType = raw as VisualWorkflowNodeRow["node_type"];
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `node_${crypto.randomUUID().slice(0, 8)}`;
      const base: PlaybookRfData = {
        nodeKey: id,
        nodeType,
        messagePrompt:
          nodeType === "message"
            ? "Hi — quick question about your lease timeline. Reply YES if you want options."
            : "",
        conditionType: "any",
        conditionValue: "",
        actionsJson: nodeType === "action" ? '[{"type":"add_tag","value":"workflow"}]' : "[]"
      };
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: rfTypeFor(nodeType),
          position: pos,
          data: base
        }
      ]);
    },
    [screenToFlowPosition, setNodes]
  );

  const updateSelectedData = useCallback(
    (patch: Partial<PlaybookRfData>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [selectedId, setNodes]
  );

  const renameNodeKey = useCallback(
    (newKey: string) => {
      if (!selectedId || !newKey.trim() || newKey === selectedId) return;
      const nk = newKey.trim().replace(/\s+/g, "_");
      setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, id: nk, data: { ...n.data, nodeKey: nk } } : n)));
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          source: e.source === selectedId ? nk : e.source,
          target: e.target === selectedId ? nk : e.target
        }))
      );
      setSelectedId(nk);
      if (entryNodeKey === selectedId) setEntryNodeKey(nk);
    },
    [selectedId, entryNodeKey, setNodes, setEdges, setEntryNodeKey]
  );

  const saveGraph = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setSaveMsg("");
    const payload = flowToPayload(nodes, edges, entryNodeKey);
    const res = await fetch(`/api/visual-playbooks/workflows/${workflowId}/graph`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setSaving(false);
    if (!res.ok) {
      setSaveMsg("Save failed");
      return;
    }
    setSaveMsg("Saved");
    hasImportedRef.current = false;
    setTimeout(() => setSaveMsg(""), 2500);
    await loadGraph();
  };

  const runTest = async (opts: { reset?: boolean; userMessage?: string }) => {
    setTestLoading(true);
    const res = await fetch(`/api/visual-playbooks/workflows/${workflowId}/test`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testSessionId,
        reset: Boolean(opts.reset),
        userMessage: opts.userMessage ?? ""
      })
    });
    const data = await res.json().catch(() => ({}));
    setTestLoading(false);
    if (!res.ok) {
      setTestLog((l) => [...l, { role: "system", text: String(data.error || "Test failed") }]);
      return;
    }
    if (data.testSessionId) setTestSessionId(data.testSessionId);
    setLastCurrentNode(data.currentNodeKey || "");
    const hk = new Set<string>();
    for (const step of data.visitPath || []) {
      if (step.kind === "enter") hk.add(step.nodeKey);
      if (step.kind === "action") hk.add(step.nodeKey);
      if (step.kind === "message_out") hk.add(step.nodeKey);
    }
    if (data.currentNodeKey) hk.add(data.currentNodeKey);
    setHighlightKeys(hk);
    if (opts.reset) setTestLog([]);
    if (opts.userMessage) {
      setTestLog((l) => [...l, { role: "user", text: opts.userMessage! }]);
    }
    for (const m of data.assistantMessages || []) {
      if (m) setTestLog((l) => [...l, { role: "assistant", text: m }]);
    }
    if (data.error) {
      setTestLog((l) => [...l, { role: "system", text: data.error }]);
    }
  };

  const updateEdgeData = useCallback(
    (edgeId: string, patch: Record<string, unknown>) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edgeId) return e;
          const nextLabel = String(patch.conditionLabel ?? e.data?.conditionLabel ?? e.label ?? "next");
          return {
            ...e,
            label: nextLabel,
            data: { ...e.data, ...patch, conditionLabel: nextLabel }
          };
        })
      );
    },
    [setEdges]
  );

  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:w-56 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate/45">Add node</p>
          <p className="mt-0.5 text-xs text-slate/55">Drag onto the canvas</p>
        </div>
        <div className="flex flex-row gap-2 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
          {(
            [
              ["message", "Message", "AI speaks from script", "border-teal-200 bg-teal-50/80"],
              ["decision", "Decision", "Branch on reply", "border-amber-200 bg-amber-50/80"],
              ["action", "Action", "Update lead / tags", "border-slate-200 bg-slate/5"]
            ] as const
          ).map(([type, title, sub, cls]) => (
            <div
              key={type}
              draggable={isAdmin}
              onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, type)}
              className={`cursor-grab rounded-xl border px-3 py-2.5 shadow-sm active:cursor-grabbing ${cls}`}
            >
              <p className="text-sm font-semibold text-slate">{title}</p>
              <p className="text-[11px] text-slate/55">{sub}</p>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {summaryBullets.length > 0 ? (
          <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 lg:px-4">
            <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate/45">Workflow summary</p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs leading-snug text-slate/80">
                  {summaryBullets.map((line, i) => (
                    <li key={i} className="pl-0.5 marker:text-slate/40">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              {!pendingPreview && appliedSummary ? (
                <button
                  type="button"
                  onClick={() => setAppliedSummary(null)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-slate/55 hover:bg-slate/5 hover:text-slate"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {pendingPreview ? (
          <div className="shrink-0 border-b border-slate-200 bg-slate/5 px-3 py-2.5 lg:px-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate">Preview generated workflow</p>
                  <p className="mt-0.5 text-[10px] text-slate/45">
                    Violet highlight on a node = its message would change if you apply.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={previewRefineLocked}
                    onClick={() => void handlePreviewRefine("simplify")}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate/80 shadow-sm hover:bg-mist/80 disabled:opacity-50"
                  >
                    Simplify
                  </button>
                  <button
                    type="button"
                    disabled={previewRefineLocked}
                    onClick={() => void handlePreviewRefine("conversational")}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate/80 shadow-sm hover:bg-mist/80 disabled:opacity-50"
                  >
                    More conversational
                  </button>
                  <button
                    type="button"
                    disabled={previewRefineLocked}
                    onClick={() => void handlePreviewRefine("followups")}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate/80 shadow-sm hover:bg-mist/80 disabled:opacity-50"
                  >
                    Add follow-ups
                  </button>
                </div>
              </div>
              {previewRefineError ? (
                <p className="text-[11px] text-amber-900">{previewRefineError}</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-2">
                {previewRefineBusy ? (
                  <span className="mr-auto text-[11px] text-slate/50">Refining…</span>
                ) : null}
                <button
                  type="button"
                  disabled={previewRefineLocked}
                  onClick={onDiscardPreview}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate/80 shadow-sm hover:bg-mist/80 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={previewRefineLocked}
                  onClick={handleApplyPreview}
                  className="rounded-xl bg-slate px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  Apply to canvas
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="relative min-h-[420px] min-w-0 flex-1 lg:min-h-0" ref={reactFlowWrapper}>
          {workflowImportBusy ? (
            <div
              className="pointer-events-none absolute inset-0 z-[5] flex items-start justify-center bg-white/30 pt-6 backdrop-blur-[1px]"
              aria-live="polite"
            >
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate shadow-soft">
                Generating workflow…
              </span>
            </div>
          ) : null}
          <PlaybookPreviewDiffContext.Provider value={pendingPreview?.graph ?? null}>
            <PlaybookEditContext.Provider value={playbookEditValue}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={isAdmin ? onConnect : undefined}
              onDrop={isAdmin ? onDrop : undefined}
              onDragOver={onDragOver}
              nodeTypes={playbookNodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={isAdmin}
              nodesConnectable={isAdmin}
              elementsSelectable
              onSelectionChange={({ nodes: ns, edges: es }) => {
                setSelectedId(ns[0]?.id ?? null);
                setSelectedEdgeId(es[0]?.id ?? null);
              }}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedEdgeId(null);
              }}
              proOptions={{ hideAttribution: true }}
              className="bg-mist/50"
            >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-slate/[0.03]" />
          <Controls className="!rounded-xl !border !border-slate-200 !shadow-soft" />
          <MiniMap
            className="!rounded-xl !border !border-slate-200"
            nodeColor={(n) => {
              if (n.type === "playbookDecision") return "#fbbf24";
              if (n.type === "playbookAction") return "#94a3b8";
              return "#2dd4bf";
            }}
          />
          <Panel position="top-right" className="flex flex-wrap gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void saveGraph()}
                disabled={saving}
                className="rounded-xl bg-slate px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save workflow"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setTestOpen((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm hover:bg-mist/80"
            >
              Test workflow
            </button>
          </Panel>
          {saveMsg ? (
            <Panel position="top-center">
              <span className="rounded-full bg-mint/20 px-3 py-1 text-xs font-medium text-slate">{saveMsg}</span>
            </Panel>
          ) : null}
          {importIncompleteWarning ? (
            <Panel position="bottom-center" className="mb-14 max-w-md px-2">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 shadow-sm">
                <span className="min-w-0 flex-1">
                  This workflow may be incomplete. Please review before saving.
                </span>
                <button
                  type="button"
                  onClick={() => setImportIncompleteWarning(false)}
                  className="shrink-0 rounded-lg px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100"
                >
                  Dismiss
                </button>
              </div>
            </Panel>
          ) : null}
            </ReactFlow>
            </PlaybookEditContext.Provider>
          </PlaybookPreviewDiffContext.Provider>
        </div>
      </div>

      <aside className="flex w-full max-h-[40vh] shrink-0 flex-col border-t border-slate-200 bg-white lg:h-auto lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
        {testOpen ? (
          <div className="flex min-h-0 flex-1 flex-col border-b border-slate-100 lg:border-b-0 lg:max-h-[50%]">
            <div className="border-b border-slate-100 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate/50">Test conversation</p>
              <p className="text-[11px] text-slate/45">Simulated path highlights nodes on the canvas.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
              {testLog.length === 0 ? (
                <p className="text-xs text-slate/50">Press Start, then type as the lead.</p>
              ) : (
                testLog.map((line, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-2 py-1.5 text-xs ${
                      line.role === "user"
                        ? "ml-4 bg-slate text-white"
                        : line.role === "assistant"
                          ? "mr-4 bg-mint/15 text-slate"
                          : "bg-amber-50 text-amber-900"
                    }`}
                  >
                    {line.text}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 p-3">
              <p className="mb-1 text-[10px] uppercase text-slate/45">Current node: {lastCurrentNode || "—"}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={() => void runTest({ reset: true })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate hover:bg-mist"
                >
                  Start / reset
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const t = testInput.trim();
                      if (!t || testLoading) return;
                      setTestInput("");
                      void runTest({ userMessage: t });
                    }
                  }}
                  placeholder="Lead message…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={testLoading || !testInput.trim()}
                  onClick={() => {
                    const t = testInput.trim();
                    setTestInput("");
                    void runTest({ userMessage: t });
                  }}
                  className="rounded-lg bg-mint px-3 py-1.5 text-xs font-medium text-white"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selectedEdge ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate/45">Edge</p>
              <label className="block text-xs text-slate/70">
                Label
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={String(selectedEdge.data?.conditionLabel ?? selectedEdge.label ?? "")}
                  onChange={(e) =>
                    updateEdgeData(selectedEdge.id, { conditionLabel: e.target.value })
                  }
                  disabled={!isAdmin}
                />
              </label>
              <label className="block text-xs text-slate/70">
                Match type
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={String(selectedEdge.data?.matchType ?? "default")}
                  onChange={(e) =>
                    updateEdgeData(selectedEdge.id, { matchType: e.target.value as EdgeMatchType })
                  }
                  disabled={!isAdmin}
                >
                  {MATCH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate/70">
                Match value (keywords comma-separated for keyword_any)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={String(selectedEdge.data?.matchValue ?? "")}
                  onChange={(e) => updateEdgeData(selectedEdge.id, { matchValue: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
            </div>
          ) : selected ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate/45">Node</p>
              <label className="block text-xs text-slate/70">
                Node key
                <input
                  key={selected.id}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm"
                  defaultValue={selected.data.nodeKey}
                  onBlur={(e) => renameNodeKey(e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate/70">
                <input
                  type="radio"
                  checked={entryNodeKey === selected.id}
                  onChange={() => setEntryNodeKey(selected.id)}
                  disabled={!isAdmin}
                />
                Entry node
              </label>
              {selected.data.nodeType === "message" || selected.data.nodeType === "decision" ? (
                <label className="block text-xs text-slate/70">
                  Message prompt (message nodes — AI renders this script only)
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    rows={5}
                    value={selected.data.messagePrompt}
                    onChange={(e) => updateSelectedData({ messagePrompt: e.target.value })}
                    disabled={!isAdmin}
                  />
                </label>
              ) : null}
              {selected.data.nodeType === "decision" ? (
                <>
                  <label className="block text-xs text-slate/70">
                    Condition type
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={selected.data.conditionType}
                      onChange={(e) => updateSelectedData({ conditionType: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </label>
                  <label className="block text-xs text-slate/70">
                    Condition value
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={selected.data.conditionValue}
                      onChange={(e) => updateSelectedData({ conditionValue: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </label>
                </>
              ) : null}
              {selected.data.nodeType === "action" ? (
                <label className="block text-xs text-slate/70">
                  Actions (JSON array)
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                    rows={8}
                    value={selected.data.actionsJson}
                    onChange={(e) => updateSelectedData({ actionsJson: e.target.value })}
                    disabled={!isAdmin}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate/55">Select a node or edge to edit. Drag new nodes from the left.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Inner() {
  const [workflows, setWorkflows] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [activeBusy, setActiveBusy] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [workflowImportBusy, setWorkflowImportBusy] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingWorkflowPreview | null>(null);

  const handleDiscardPreview = useCallback(() => setPendingPreview(null), []);
  const handlePreviewApplied = useCallback(() => setPendingPreview(null), []);
  const replacePendingPreview = useCallback(
    (next: { graph: ImportedWorkflowGraph; summary: string | null }) => {
      setPendingPreview({
        nonce: Date.now(),
        graph: next.graph,
        summary: next.summary?.trim() ? next.summary.trim() : null
      });
    },
    []
  );
  const handleWorkflowImported = useCallback((graph: ImportedWorkflowGraph, summary?: string | null) => {
    setPendingPreview({
      nonce: Date.now(),
      graph,
      summary: typeof summary === "string" && summary.trim() ? summary.trim() : null
    });
  }, []);

  useEffect(() => {
    setPendingPreview(null);
  }, [workflowId]);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.user?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/visual-playbooks/workflows", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setListError(
          res.status === 401
            ? "Sign in again to load workflows."
            : String(data.error || `Could not load workflows (${res.status}).`)
        );
        setWorkflows([]);
        setWorkflowId(null);
        return;
      }
      setListError("");
      const list = data.workflows || [];
      setWorkflows(list);
      setWorkflowId((prev) => prev ?? list[0]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createWorkflow = async () => {
    setActionError("");
    setActionOk("");
    setCreateBusy(true);
    const res = await fetch("/api/visual-playbooks/workflows", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Workflow ${workflows.length + 1}` })
    });
    const data = await res.json().catch(() => ({}));
    setCreateBusy(false);
    if (res.status === 401) {
      setActionError("You are not signed in.");
      return;
    }
    if (res.status === 403) {
      setActionError("Only admins can create workflows. Ask an admin to grant you admin in the CRM.");
      return;
    }
    if (!res.ok) {
      setActionError(String(data.error || `Create failed (${res.status}).`));
      return;
    }
    const w = data.workflow;
    if (w) {
      setWorkflows((prev) => [w, ...prev]);
      setWorkflowId(w.id);
      setActionOk("Workflow created.");
      setTimeout(() => setActionOk(""), 4000);
    } else {
      setActionError("Server returned no workflow.");
    }
  };

  const setActive = async () => {
    setActionError("");
    setActionOk("");
    if (!workflowId) {
      setActionError("Choose a workflow in the dropdown first, or create one.");
      return;
    }
    setActiveBusy(true);
    const patch = await fetch(`/api/visual-playbooks/workflows/${workflowId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true })
    });
    const patchData = await patch.json().catch(() => ({}));
    setActiveBusy(false);
    if (patch.status === 403) {
      setActionError("Only admins can set the active workflow.");
      return;
    }
    if (!patch.ok) {
      setActionError(String(patchData.error || `Update failed (${patch.status}).`));
      return;
    }
    const res = await fetch("/api/visual-playbooks/workflows", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setWorkflows(data.workflows || []);
      setActionOk("Active workflow updated.");
      setTimeout(() => setActionOk(""), 4000);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate/60">Loading…</div>;
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col rounded-2xl border border-slate-100 bg-white shadow-soft lg:min-h-[calc(100dvh-6rem)]">
      {listError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{listError}</div>
      ) : null}
      {actionError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{actionError}</div>
      ) : null}
      {actionOk ? (
        <div className="border-b border-mint/30 bg-mint/10 px-4 py-2 text-sm text-slate">{actionOk}</div>
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-slate">Visual playbook</h2>
          <p className="text-xs text-slate/55">Decision-tree workflows · OpenAI only renders fixed scripts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={workflowId || ""}
            onChange={(e) => setWorkflowId(e.target.value || null)}
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.is_active ? " (active)" : ""}
              </option>
            ))}
          </select>
          {isAdmin ? (
            <>
              <button
                type="button"
                disabled={!workflowId}
                onClick={() => setImportModalOpen(true)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate hover:bg-mist/80 disabled:opacity-50"
              >
                Import workflow
              </button>
              <button
                type="button"
                disabled={createBusy}
                onClick={() => void createWorkflow()}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate hover:bg-mist/80 disabled:opacity-50"
              >
                {createBusy ? "Creating…" : "New workflow"}
              </button>
              <button
                type="button"
                disabled={activeBusy || !workflowId}
                onClick={() => void setActive()}
                className="rounded-xl bg-mint px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {activeBusy ? "Saving…" : "Set active"}
              </button>
            </>
          ) : null}
        </div>
      </header>
      {!isAdmin ? (
        <p className="px-4 py-2 text-center text-sm text-amber-800 bg-amber-50">View only — admin can edit and save.</p>
      ) : null}
      {workflowId ? (
        <ReactFlowProvider>
          <BuilderCanvas
            workflowId={workflowId}
            isAdmin={isAdmin}
            pendingPreview={pendingPreview}
            onDiscardPreview={handleDiscardPreview}
            onPreviewApplied={handlePreviewApplied}
            replacePendingPreview={replacePendingPreview}
            workflowImportBusy={workflowImportBusy}
          />
        </ReactFlowProvider>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <p className="text-sm text-slate/60">No workflows yet.</p>
          {isAdmin ? (
            <button
              type="button"
              disabled={createBusy}
              onClick={() => void createWorkflow()}
              className="rounded-xl bg-slate px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createBusy ? "Creating…" : "Create first workflow"}
            </button>
          ) : (
            <p className="max-w-md text-center text-xs text-slate/55">
              You need an admin account to create workflows. Your user can still view this page if workflows exist.
            </p>
          )}
        </div>
      )}

      <ImportWorkflowModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleWorkflowImported}
        onBusyChange={setWorkflowImportBusy}
      />
    </div>
  );
}

export default function VisualPlaybookBuilder() {
  return <Inner />;
}
