"use client";

import { formatLeadCurrency, statusPillClass } from "@/lib/leadDashboardUtils";
import type { TenantView } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ChatMsg = {
  id: string;
  content: string;
  direction: string;
  created_at: string;
  sender?: string;
};

type WfSummary = {
  workflowName: string;
  currentNodeKey: string;
  progressDisplay: string;
  lastTransition: string | null;
  sessionUpdatedAt: string;
} | null;

type AgentOption = { name: string; email: string; specialty?: string; role?: string };

export function LeadDetailSlideOver({
  tenant,
  open,
  onClose,
  isAdmin,
  onRefresh,
  assignToAgent,
  saveReminder
}: {
  tenant: TenantView | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  assignToAgent: (
    tenantId: string,
    agent: { name: string; email: string; specialty?: string; source?: string }
  ) => Promise<void>;
  saveReminder: (tenantId: string, date: string, time: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [wfSummary, setWfSummary] = useState<WfSummary>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgentEmail, setSelectedAgentEmail] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    if (!tenant?.id || !open) return;
    let cancelled = false;
    setLoadingChat(true);
    Promise.all([
      fetch(`/api/tenant/${tenant.id}/messages?limit=100`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/tenant/${tenant.id}/workflow-status`, { credentials: "include" }).then((r) => r.json())
    ])
      .then(([msgJson, wfJson]) => {
        if (cancelled) return;
        const raw = (msgJson?.messages || []) as ChatMsg[];
        setMessages([...raw].reverse());
        setWfSummary(wfJson?.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setWfSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, open]);

  useEffect(() => {
    if (!assignOpen) return;
    fetch("/api/agents", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.agents || []) as AgentOption[];
        setAgents(list);
        if (list[0]?.email) setSelectedAgentEmail(list[0].email);
      })
      .catch(() => setAgents([]));
  }, [assignOpen]);

  const handleMarkHot = async () => {
    if (!tenant) return;
    setActionBusy("hot");
    try {
      const r = await fetch(`/api/tenant/${tenant.id}/mark-hot`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        showToast(String(j?.error || "Could not update status"));
        return;
      }
      showToast("Lead marked as Hot");
      await onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleRestartWorkflow = async () => {
    if (!tenant) return;
    setActionBusy("restart");
    try {
      const r = await fetch(`/api/tenant/${tenant.id}/restart-visual-workflow`, {
        method: "POST",
        credentials: "include"
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(String(j?.error || "Restart failed"));
        return;
      }
      showToast("Visual workflow session cleared");
      const wf = await fetch(`/api/tenant/${tenant.id}/workflow-status`, { credentials: "include" }).then((x) =>
        x.json()
      );
      setWfSummary(wf?.summary ?? null);
      await onRefresh();
    } finally {
      setActionBusy(null);
    }
  };

  const handleAssign = async () => {
    if (!tenant) return;
    const agent = agents.find((a) => a.email === selectedAgentEmail);
    if (!agent?.name || !agent.email) {
      showToast("Select an agent");
      return;
    }
    setActionBusy("assign");
    try {
      await assignToAgent(tenant.id, {
        name: agent.name,
        email: agent.email,
        specialty: agent.role || agent.specialty,
        source: "Lead Dashboard"
      });
      showToast(`Assigned to ${agent.name}`);
      setAssignOpen(false);
      await onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleSchedule = async () => {
    if (!tenant || !reminderDate.trim() || !reminderTime.trim()) {
      showToast("Pick a date and time");
      return;
    }
    setActionBusy("schedule");
    try {
      await saveReminder(tenant.id, reminderDate, reminderTime);
      showToast("Follow-up scheduled");
      setScheduleOpen(false);
      setReminderDate("");
      setReminderTime("");
      await onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setActionBusy(null);
    }
  };

  const historyFallback =
    tenant?.messageHistory?.slice(0, 12).map((m) => ({
      id: m.id,
      content: m.content,
      direction: "outbound",
      created_at: m.timestamp,
      sender: "campaign"
    })) ?? [];

  const chatLines =
    messages.length > 0
      ? messages
      : historyFallback.map((m) => ({
          ...m,
          direction: m.sender === "campaign" ? "outbound" : m.direction
        }));

  if (!tenant) return null;

  return (
    <>
      <div
        role="presentation"
        className={`fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[min(100vw,28rem)] flex-col border-l border-zinc-200/80 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.03),-24px_0_48px_-12px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Lead</p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-zinc-900">{tenant.name}</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">
              {tenant.email} · {tenant.phone}
            </p>
            <span
              className={`mt-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPillClass(tenant.status)}`}
            >
              {tenant.status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <section className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">Key stats</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500">Rent</dt>
                <dd className="font-medium text-zinc-900">{formatLeadCurrency(tenant.rentAmount)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Est. income</dt>
                <dd className="font-medium text-zinc-900">{formatLeadCurrency(tenant.displayAnnualIncome)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Months left</dt>
                <dd className="font-medium text-zinc-900">{tenant.monthsRemaining}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Buying power</dt>
                <dd className="font-semibold text-emerald-700">{formatLeadCurrency(tenant.estimatedBuyingPower)}</dd>
              </div>
            </dl>
          </section>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              Assign agent
            </button>
            {isAdmin ? (
              <button
                type="button"
                disabled={actionBusy === "restart"}
                onClick={() => void handleRestartWorkflow()}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
              >
                Restart workflow
              </button>
            ) : null}
            <button
              type="button"
              disabled={actionBusy === "hot" || tenant.status === "Hot"}
              onClick={() => void handleMarkHot()}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              Mark hot
            </button>
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Schedule follow-up
            </button>
            {tenant.chatId ? (
              <Link
                href={`/communication?chatId=${tenant.chatId}`}
                className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
              >
                Open thread
              </Link>
            ) : null}
          </div>

          <section className="mt-6 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">Workflow status</p>
            {wfSummary ? (
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-zinc-500">Playbook</dt>
                  <dd className="font-medium text-zinc-900">{wfSummary.workflowName}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Progress</dt>
                  <dd className="text-[15px] font-medium leading-snug tracking-tight text-zinc-900">
                    {wfSummary.progressDisplay || wfSummary.workflowName}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Last transition</dt>
                  <dd className="text-zinc-700">{wfSummary.lastTransition ?? "—"}</dd>
                </div>
                <p className="text-xs text-zinc-400">Updated {new Date(wfSummary.sessionUpdatedAt).toLocaleString()}</p>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                No active visual playbook session yet. Send an SMS or receive an inbound message to start the graph.
              </p>
            )}
          </section>

          <section className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">Conversation</p>
            <div className="mt-3 max-h-[min(40vh,22rem)] space-y-2 overflow-y-auto rounded-2xl border border-zinc-100 bg-zinc-50/80 p-3">
              {loadingChat ? (
                <p className="py-8 text-center text-sm text-zinc-400">Loading messages…</p>
              ) : chatLines.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No messages yet.</p>
              ) : (
                chatLines.map((m) => {
                  const inbound = m.direction === "inbound";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${inbound ? "justify-end" : "justify-start"} transition-opacity duration-200`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          inbound
                            ? "bg-zinc-900 text-white"
                            : "border border-zinc-200/80 bg-white text-zinc-800 shadow-sm"
                        }`}
                      >
                        <p>{m.content}</p>
                        <p className={`mt-1 text-[10px] ${inbound ? "text-white/60" : "text-zinc-400"}`}>
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {messages.length === 0 && historyFallback.length > 0 ? (
              <p className="mt-2 text-xs text-zinc-400">Showing recent campaign history until chat messages exist.</p>
            ) : null}
          </section>
        </div>

        {toast ? (
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">
            {toast}
          </div>
        ) : null}
      </aside>

      {assignOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-zinc-900">Assign agent</h3>
            <label className="mt-4 block text-sm text-zinc-600">
              Agent
              {agents.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                  No active agents found. Add team members under Settings → Team.
                </p>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  value={selectedAgentEmail}
                  onChange={(e) => setSelectedAgentEmail(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.email} value={a.email}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              )}
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === "assign" || agents.length === 0}
                onClick={() => void handleAssign()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-zinc-900">Schedule follow-up</h3>
            <div className="mt-4 grid gap-3">
              <label className="block text-sm text-zinc-600">
                Date
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
              </label>
              <label className="block text-sm text-zinc-600">
                Time
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === "schedule"}
                onClick={() => void handleSchedule()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
