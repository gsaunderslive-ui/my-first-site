"use client";

import { createContext, useContext } from "react";
import type { ImportedWorkflowGraph } from "@/lib/visualPlaybook/workflowDocumentImport";

export const PlaybookPreviewDiffContext = createContext<ImportedWorkflowGraph | null>(null);

/** True when canvas node message differs from the pending preview for the same node_key. */
export function usePreviewMessageDiff(nodeId: string, canvasMessagePrompt: string): boolean {
  const preview = useContext(PlaybookPreviewDiffContext);
  if (!preview) return false;
  const row = preview.nodes.find((n) => n.node_key === nodeId);
  if (!row) return false;
  return row.message_prompt.trim() !== (canvasMessagePrompt || "").trim();
}
