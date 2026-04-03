"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLAYBOOK_SECTIONS,
  type PlaybookSectionKey,
  type ProposalScope,
  buildProposalPayload,
  describeStoredProposal
} from "@/lib/playbookFieldCatalog";
import { PLAYBOOK_SOURCE_KEYS } from "@/lib/playbookSchema";

type Item = {
  id: string;
  section_path: string;
  proposed_content: string;
  status: string;
  created_at: string;
};

export function PlaybookUpdatesPanel() {
  const [me, setMe] = useState<{ isAdmin: boolean } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [scope, setScope] = useState<ProposalScope>("defaults");
  const [sectionKey, setSectionKey] = useState<PlaybookSectionKey>("opening");
  const [fieldKey, setFieldKey] = useState("sms");
  const [proposalText, setProposalText] = useState("");

  const currentSection = useMemo(
    () => PLAYBOOK_SECTIONS.find((s) => s.section === sectionKey) ?? PLAYBOOK_SECTIONS[0],
    [sectionKey]
  );

  useEffect(() => {
    const keys = currentSection.fields.map((f) => f.key);
    if (!keys.includes(fieldKey)) {
      setFieldKey(keys[0] ?? "sms");
    }
  }, [currentSection, fieldKey]);

  const refresh = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/playbook/updates?status=pending", { credentials: "include" })
    ]);
    const j1 = await r1.json();
    setMe(j1.user ? { isAdmin: Boolean(j1.user.isAdmin) } : null);
    const j2 = await r2.json();
    setItems(j2.items || []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function propose() {
    setMsg(null);
    const trimmed = proposalText.trim();
    if (!trimmed) {
      setMsg("Add some suggested text before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const { sectionPath, proposedContent } = buildProposalPayload(scope, sectionKey, fieldKey, trimmed);
      const res = await fetch("/api/playbook/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "propose", sectionPath, proposedContent })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Could not submit proposal.");
        return;
      }
      setMsg("Proposal sent. An admin can approve it to update the live playbook.");
      setProposalText("");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(id: string) {
    setMsg(null);
    const res = await fetch("/api/playbook/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "approve", id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Could not approve.");
      return;
    }
    setMsg("Approved — the playbook is updated.");
    await refresh();
  }

  async function reject(id: string) {
    setMsg(null);
    const res = await fetch("/api/playbook/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "reject", id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Could not reject.");
      return;
    }
    setMsg("Proposal dismissed.");
    await refresh();
  }

  const selectedFieldMeta = currentSection.fields.find((f) => f.key === fieldKey);

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Playbook updates</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Suggest a change to one line in the playbook. Pick where it applies, which topic, then type the new wording.
          An admin reviews and approves — then it merges into the live playbook (same as Company playbook, no code
          required).
        </p>
      </header>

      {msg ? (
        <p className="rounded-xl border border-slate-200 bg-slate/5 px-4 py-3 text-sm text-slate-800">{msg}</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate">Suggest a change</h2>
        <p className="mt-1 text-sm text-slate/55">One topic at a time keeps reviews simple.</p>

        <div className="mt-5 flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate/5 p-2">
          <button
            type="button"
            onClick={() => setScope("defaults")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              scope === "defaults" ? "bg-slate text-white shadow-sm" : "text-slate/70 hover:bg-white"
            }`}
          >
            Company default
          </button>
          {PLAYBOOK_SOURCE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${
                scope === k ? "bg-mint/90 text-slate shadow-sm" : "text-slate/70 hover:bg-white"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate/50">
          {scope === "defaults"
            ? "Everyone sees this version unless a source override exists."
            : `Only leads tagged as “${scope}” would use this wording once approved.`}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate/50">Section</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate"
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value as PlaybookSectionKey)}
            >
              {PLAYBOOK_SECTIONS.map((s) => (
                <option key={s.section} value={s.section}>
                  {s.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate/45">{currentSection.description}</p>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate/50">Line to change</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
            >
              {currentSection.fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            {selectedFieldMeta?.hint ? (
              <p className="mt-1 text-xs text-slate/45">{selectedFieldMeta.hint}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate">Suggested new text</label>
          <textarea
            rows={6}
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
            placeholder="Type the wording you want an admin to approve…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate/90 shadow-inner outline-none transition focus:border-mint/50 focus:ring-2 focus:ring-mint/20"
          />
        </div>

        <button
          type="button"
          onClick={() => void propose()}
          disabled={submitting}
          className="mt-5 rounded-xl bg-mint px-5 py-2.5 text-sm font-semibold text-slate shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate">Waiting for review</h2>
        <p className="mt-1 text-sm text-slate/55">Admins can approve (applies to the playbook) or dismiss.</p>
        <ul className="mt-4 space-y-4">
          {items.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate/55">
              No proposals in the queue.
            </li>
          ) : null}
          {items.map((it) => {
            const d = describeStoredProposal(it.section_path, it.proposed_content);
            return (
              <li key={it.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate/5 px-4 py-3">
                  <p className="text-sm font-semibold text-slate">{d.headline}</p>
                  <p className="mt-0.5 text-xs text-slate/55">{d.subline}</p>
                  <p className="mt-2 text-[11px] text-slate/40">
                    Submitted {new Date(it.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-3 px-4 py-4">
                  {d.entries.map((e, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/45">{e.label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate/90">{e.text}</p>
                    </div>
                  ))}
                </div>
                {me?.isAdmin ? (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate/5 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void approve(it.id)}
                      className="rounded-lg bg-slate px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Approve & apply
                    </button>
                    <button
                      type="button"
                      onClick={() => void reject(it.id)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate/80 hover:bg-white"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate/50">
                    Only admins can approve or dismiss.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
