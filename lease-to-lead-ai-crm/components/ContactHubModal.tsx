"use client";

import { useMemo, useState } from "react";
import { TenantView } from "@/lib/types";

type ActionType = "none" | "call" | "sms" | "email" | "schedule";

function relativeTime(dateIso?: string) {
  if (!dateIso) return "No recent interaction";
  const ms = Date.now() - new Date(dateIso).getTime();
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function recommendation(tenant: TenantView) {
  const last = tenant.messageHistory[0];
  if (!last) {
    return { action: "Call", label: "Recommended: Call (best first touch)", confidence: "Medium" };
  }
  if (last.channel === "SMS") {
    return { action: "Text", label: "Recommended: Send Text (highest response likelihood)", confidence: "High" };
  }
  if (last.channel === "Email" && last.outcome === "Clicked") {
    return { action: "Email", label: "Recommended: Send Email (active intent detected)", confidence: "High" };
  }
  return { action: "Call", label: "Recommended: Call (human follow-up advised)", confidence: "Medium" };
}

function prefillMessage(name: string) {
  return `Hey ${name.split(" ")[0]}, I saw you were checking out homes in your area. Would you be interested in seeing what you could qualify for?`;
}

export function ContactHubModal({
  lead,
  isOpen,
  onClose,
  onSendAction,
  onSaveReminder
}: {
  lead: TenantView | null;
  isOpen: boolean;
  onClose: () => void;
  onSendAction: (type: "call" | "sms" | "email") => Promise<void>;
  onSaveReminder: (date: string, time: string) => Promise<void>;
}) {
  const [activeAction, setActiveAction] = useState<ActionType>("none");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const rec = useMemo(() => (lead ? recommendation(lead) : null), [lead]);

  if (!isOpen || !lead) return null;

  const lastInteraction = lead.messageHistory[0]
    ? `${lead.messageHistory[0].outcome} ${lead.messageHistory[0].channel} ${relativeTime(lead.messageHistory[0].timestamp)}`
    : "No engagement yet";

  const preferredMethod = lead.messageHistory[0]?.channel || "Not set";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl animate-riseIn overflow-auto rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-slate">{lead.name}</h3>
            <p className="mt-1 text-sm text-slate/60">Contact Hub</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate/70 hover:bg-slate/5">Close</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate/10 px-3 py-1 text-xs font-semibold text-slate">{lead.status}</span>
              <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-semibold text-mint">Score {lead.engagement_score}</span>
              <span className="rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-amber">{lead.monthsRemaining} months remaining</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate/5 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate/50">Email</p>
                <p className="mt-1 text-sm text-slate">{lead.email}</p>
              </div>
              <div className="rounded-xl bg-slate/5 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate/50">Phone</p>
                <p className="mt-1 text-sm text-slate">{lead.phone}</p>
              </div>
              <div className="rounded-xl bg-slate/5 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate/50">Preferred Contact</p>
                <p className="mt-1 text-sm text-slate">{preferredMethod}</p>
              </div>
              <div className="rounded-xl bg-slate/5 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate/50">Last Interaction</p>
                <p className="mt-1 text-sm text-slate">{lastInteraction}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-mint/30 bg-mint/5 p-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.14em] text-mint">Suggested Action</p>
            <p className="mt-2 text-sm font-semibold text-slate">{rec?.label}</p>
            <p className="mt-2 inline-block rounded-full bg-white px-2 py-1 text-xs text-mint">
              Confidence: {rec?.confidence}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button onClick={() => setActiveAction("call")} className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
            <p className="text-xl">📞</p>
            <p className="mt-2 font-semibold text-slate">Call Now</p>
          </button>
          <button onClick={() => { setActiveAction("sms"); setMessage(prefillMessage(lead.name)); }} className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
            <p className="text-xl">💬</p>
            <p className="mt-2 font-semibold text-slate">Send SMS</p>
          </button>
          <button onClick={() => { setActiveAction("email"); setMessage(prefillMessage(lead.name)); }} className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
            <p className="text-xl">✉️</p>
            <p className="mt-2 font-semibold text-slate">Send Email</p>
          </button>
          <button onClick={() => setActiveAction("schedule")} className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
            <p className="text-xl">📅</p>
            <p className="mt-2 font-semibold text-slate">Schedule Later</p>
          </button>
        </div>

        {activeAction === "call" ? (
          <div className="mt-5 rounded-2xl border border-slate-100 p-4">
            <p className="text-sm text-slate/70">Ready to call {lead.phone}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={async () => { await onSendAction("call"); onClose(); }} className="rounded-lg bg-slate px-3 py-2 text-sm font-medium text-white">Start Call (Simulated)</button>
              <button onClick={() => setActiveAction("none")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : null}

        {activeAction === "sms" || activeAction === "email" ? (
          <div className="mt-5 rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate">Message Composer</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  await onSendAction(activeAction === "sms" ? "sms" : "email");
                  onClose();
                }}
                className="rounded-lg bg-mint px-3 py-2 text-sm font-medium text-white"
              >
                Send
              </button>
              <button onClick={() => setActiveAction("none")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : null}

        {activeAction === "schedule" ? (
          <div className="mt-5 rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate">Schedule Reminder</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  if (!date || !time) return;
                  await onSaveReminder(date, time);
                  onClose();
                }}
                className="rounded-lg bg-coral px-3 py-2 text-sm font-medium text-white"
              >
                Save Reminder
              </button>
              <button onClick={() => setActiveAction("none")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
