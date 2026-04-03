"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { usePlaybookEdit } from "./PlaybookEditContext";
import { usePreviewMessageDiff } from "./PlaybookPreviewDiffContext";

export type PlaybookRfData = {
  nodeKey: string;
  nodeType: "message" | "decision" | "action";
  messagePrompt: string;
  conditionType: string;
  conditionValue: string;
  actionsJson: string;
  highlighted?: boolean;
};

const shell =
  "min-w-[200px] max-w-[260px] rounded-2xl border-2 px-3 py-2.5 shadow-sm transition-[box-shadow,transform] duration-200";

/** Subtle cue when pending preview would change this node's message (skipped during test highlight). */
const previewMsgDiffClass = "ring-1 ring-inset ring-violet-400/50 bg-violet-50/35";

function Highlight({ active }: { active?: boolean }) {
  return active ? " ring-2 ring-mint ring-offset-2 ring-offset-white shadow-soft scale-[1.02]" : "";
}

function InlineMessagePrompt({
  nodeId,
  value,
  className,
  placeholder,
  minRows = 2
}: {
  nodeId: string;
  value: string;
  className?: string;
  placeholder?: string;
  minRows?: number;
}) {
  const ctx = usePlaybookEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (ctx?.isAdmin) {
      ctx.updateNodeMessagePrompt(nodeId, draft.trim());
    }
    setEditing(false);
  };

  if (!ctx?.isAdmin) {
    return (
      <p className={className} title={value || undefined}>
        {value || placeholder || "—"}
      </p>
    );
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={minRows}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        className={`${className ?? ""} mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate shadow-inner focus:border-mint focus:outline-none focus:ring-1 focus:ring-mint/30`}
      />
    );
  }

  return (
    <p
      role="button"
      tabIndex={0}
      title="Click to edit message"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
      className={`${className ?? ""} cursor-text rounded-md text-left outline-none ring-mint/40 hover:bg-slate/5 focus-visible:ring-2`}
    >
      {value || <span className="text-slate/40">{placeholder || "—"}</span>}
    </p>
  );
}

export function PlaybookMessageNode(props: NodeProps) {
  const d = props.data as PlaybookRfData;
  const previewMsgDiff =
    usePreviewMessageDiff(props.id, d.messagePrompt) && !d.highlighted;
  return (
    <div
      className={`${shell} border-teal-500/40 bg-white ${Highlight({ active: d.highlighted })}${previewMsgDiff ? ` ${previewMsgDiffClass}` : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-teal-500" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600">Message</p>
      <p className="mt-1 line-clamp-3 text-xs font-medium text-slate">{d.nodeKey}</p>
      <InlineMessagePrompt
        nodeId={props.id}
        value={d.messagePrompt}
        placeholder="Tap to add script"
        minRows={3}
        className="line-clamp-4 text-[11px] text-slate/60"
      />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-teal-500" />
    </div>
  );
}

export function PlaybookDecisionNode(props: NodeProps) {
  const d = props.data as PlaybookRfData;
  const previewMsgDiff =
    usePreviewMessageDiff(props.id, d.messagePrompt) && !d.highlighted;
  return (
    <div
      className={`${shell} border-amber-500/50 bg-amber-50/90 ${Highlight({ active: d.highlighted })}${previewMsgDiff ? ` ${previewMsgDiffClass}` : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-amber-500" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Decision</p>
      <p className="mt-1 text-xs font-medium text-slate">{d.nodeKey}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800/70">Question / prompt</p>
      <InlineMessagePrompt
        nodeId={props.id}
        value={d.messagePrompt}
        placeholder="Tap to edit question"
        minRows={2}
        className="text-[11px] text-slate/70"
      />
      <p className="mt-1 text-[11px] text-slate/60">
        {d.conditionType}: {d.conditionValue || "—"}
      </p>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-amber-500" />
    </div>
  );
}

export function PlaybookActionNode(props: NodeProps) {
  const d = props.data as PlaybookRfData;
  const previewMsgDiff =
    usePreviewMessageDiff(props.id, d.messagePrompt) && !d.highlighted;
  let actionCount = 0;
  try {
    const a = JSON.parse(d.actionsJson || "[]");
    actionCount = Array.isArray(a) ? a.length : 0;
  } catch {
    actionCount = 0;
  }
  return (
    <div
      className={`${shell} border-slate-300 bg-slate/5 ${Highlight({ active: d.highlighted })}${previewMsgDiff ? ` ${previewMsgDiffClass}` : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate/70">Action</p>
      <p className="mt-1 text-xs font-medium text-slate">{d.nodeKey}</p>
      <p className="mt-1 text-[11px] text-slate/55">{actionCount} action(s)</p>
      {d.messagePrompt.trim() ? (
        <>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate/50">Note</p>
          <InlineMessagePrompt nodeId={props.id} value={d.messagePrompt} minRows={2} className="text-[11px] text-slate/60" />
        </>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate" />
    </div>
  );
}

export const playbookNodeTypes = {
  playbookMessage: PlaybookMessageNode,
  playbookDecision: PlaybookDecisionNode,
  playbookAction: PlaybookActionNode
};
