"use client";

import type { ImportedWorkflowGraph } from "@/lib/visualPlaybook/workflowDocumentImport";
import { useCallback, useState } from "react";

export function ImportWorkflowModal({
  open,
  onClose,
  onImported,
  onBusyChange
}: {
  open: boolean;
  onClose: () => void;
  onImported: (graph: ImportedWorkflowGraph, summary?: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const resetForm = useCallback(() => {
    setErr("");
    setText("");
  }, []);

  const submitJson = useCallback(async () => {
    setErr("");
    if (!text.trim()) {
      setErr("Paste your playbook text first.");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const res = await fetch("/api/visual-playbooks/workflows/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(String(data.error || `Request failed (${res.status})`));
        return;
      }
      if (data.graph) {
        onImported(data.graph as ImportedWorkflowGraph, data.summary ?? null);
        resetForm();
        onClose();
      } else {
        setErr("Server returned no workflow graph.");
      }
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }, [text, onImported, onClose, resetForm, onBusyChange]);

  const submitFile = useCallback(
    async (file: File | null) => {
      setErr("");
      if (!file || file.size === 0) {
        setErr("Choose a .pdf, .docx, or .txt file.");
        return;
      }
      setBusy(true);
      onBusyChange?.(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/visual-playbooks/workflows/import", {
          method: "POST",
          credentials: "include",
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(String(data.error || `Request failed (${res.status})`));
          return;
        }
        if (data.graph) {
          onImported(data.graph as ImportedWorkflowGraph, data.summary ?? null);
          resetForm();
          onClose();
        } else {
          setErr("Server returned no workflow graph.");
        }
      } finally {
        setBusy(false);
        onBusyChange?.(false);
      }
    },
    [onImported, onClose, resetForm, onBusyChange]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-workflow-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="import-workflow-title" className="text-lg font-semibold text-slate">
              Import workflow
            </h2>
            <p className="mt-1 text-sm text-slate/55">
              Upload a document or paste text. We&apos;ll generate a preview you can apply to the canvas, then use{" "}
              <span className="font-medium text-slate/80">Save workflow</span> to store in the database.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate/45 hover:bg-slate/5 hover:text-slate disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex rounded-xl border border-slate-200 p-0.5">
          {(
            [
              ["paste", "Paste text"],
              ["file", "Upload file"]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(key);
                setErr("");
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === key ? "bg-slate text-white shadow-sm" : "text-slate/70 hover:text-slate"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "paste" ? (
          <label className="mt-4 block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate/45">Playbook text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={10}
              placeholder="Paste your playbook, script, or decision-tree notes here…"
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate placeholder:text-slate/35 focus:border-mint focus:outline-none focus:ring-2 focus:ring-mint/20"
            />
          </label>
        ) : (
          <div className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate/45">File</span>
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-mist/30 px-4 py-10 transition hover:border-slate-300 hover:bg-mist/50">
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void submitFile(f);
                }}
              />
              <span className="text-sm font-medium text-slate">Choose PDF, Word, or text</span>
              <span className="mt-1 text-xs text-slate/50">Max 8 MB</span>
            </label>
          </div>
        )}

        {err ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{err}</p>
        ) : null}

        {mode === "paste" ? (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate/80 hover:bg-mist/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void submitJson()}
              className="rounded-xl bg-slate px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate preview"}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-slate/45">Selecting a file starts import automatically.</p>
        )}
      </div>
    </div>
  );
}
