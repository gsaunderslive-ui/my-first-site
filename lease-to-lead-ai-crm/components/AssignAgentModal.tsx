"use client";

import { useEffect, useMemo, useState } from "react";
import { TenantView } from "@/lib/types";

type Agent = {
  id: string;
  name: string;
  email: string;
  role: "Buyer Specialist" | "Listing Agent" | "General";
  status: "Active" | "Inactive";
};

function sourceForLead(lead: TenantView) {
  const sources = ["Website (IDX Search)", "Ylopo Campaign", "Manual Entry"];
  const idx = Number(lead.id.replace(/\D/g, "")) % sources.length;
  return sources[idx];
}

function confidenceForLead(score: number) {
  if (score >= 8) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function recentActivityLine(lead: TenantView) {
  const recent = lead.messageHistory[0];
  if (!recent) return "No activity yet";
  return `${recent.outcome} ${recent.channel} campaign`;
}

function recommendedAction(lead: TenantView) {
  const recent = lead.messageHistory[0];
  if (!recent) return "call";
  if (recent.channel === "SMS") return "text";
  if (recent.channel === "Email") return "email";
  return "call";
}

function emailPreview(lead: TenantView, agent: Agent) {
  const source = sourceForLead(lead);
  const recent = recentActivityLine(lead);
  const viewed = (Number(lead.id.replace(/\D/g, "")) % 4) + 1;
  const nextAction = recommendedAction(lead);

  return {
    subject: `New Buyer Lead Assigned - ${lead.name}`,
    body: `Hi ${agent.name},

You have been assigned a new lead from Lease-to-Lead AI CRM.

Lead Details:
- Name: ${lead.name}
- Email: ${lead.email}
- Phone: ${lead.phone}
- Stage: ${lead.status}
- Engagement Score: ${lead.engagement_score}

Source:
${source}

Recent Activity:
- ${recent}
- Viewed ${viewed} properties

Recommended Action:
This lead has shown strong interest. Suggested next step is to ${nextAction} within the next 24 hours.

Please reach out as soon as possible.

- Lease-to-Lead AI CRM`
  };
}

export function AssignAgentModal({
  lead,
  isOpen,
  onClose,
  onAssign
}: {
  lead: TenantView | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign: (
    agent: { name: string; email: string; specialty?: string; source?: string },
    source: string
  ) => Promise<void>;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualEmailError, setManualEmailError] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");

  const selectedAgent = agents.find((a) => a.email === selectedEmail) || null;
  const source = lead ? sourceForLead(lead) : "Manual Entry";
  const confidence = lead ? confidenceForLead(lead.engagement_score) : "Medium";
  const activeAgents = agents.filter((a) => a.status === "Active");

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const res = await fetch("/api/agents", { cache: "no-store", credentials: "include" });
      const json = (await res.json()) as { agents: Agent[] };
      setAgents(json.agents || []);
    })();
  }, [isOpen]);

  const manualEmailValid =
    manualEmail.trim().length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim());

  const effectiveAgent =
    manualEmail.trim().length > 0
      ? {
          name: manualEmail.trim().split("@")[0].replace(/[._-]/g, " ") || "External Agent",
          email: manualEmail.trim(),
          role: "General" as const,
          status: "Active" as const,
          id: "manual"
        }
      : selectedAgent;

  const preview = useMemo(() => {
    if (!lead || !effectiveAgent) return null;
    return emailPreview(lead, effectiveAgent);
  }, [lead, effectiveAgent]);

  if (!isOpen || !lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl animate-riseIn overflow-auto rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-slate">Assign Lead to Agent</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate/70 hover:bg-slate/5"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft lg:col-span-2">
            <p className="mb-3 text-sm font-semibold text-slate">Select Agent</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeAgents.map((agent) => {
                const active = selectedEmail === agent.email;
                return (
                  <button
                    key={agent.email}
                    onClick={() => {
                      setSelectedEmail(agent.email);
                      setSuccess("");
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-mint bg-mint/10 shadow-soft"
                        : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-soft"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate text-sm font-semibold text-white">
                        {agent.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate">{agent.name}</p>
                        <p className="text-xs text-slate/60">{agent.email}</p>
                      </div>
                    </div>
                    <p className="mt-2 inline-block rounded-full bg-slate/10 px-2 py-1 text-xs text-slate/70">
                      {agent.role}
                    </p>
                    {active ? <p className="mt-2 text-xs font-semibold text-mint">✓ Selected</p> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate/5 p-3">
              <p className="text-sm font-medium text-slate">Or enter email manually</p>
              <input
                value={manualEmail}
                onChange={(e) => {
                  setManualEmail(e.target.value);
                  setManualEmailError("");
                }}
                placeholder="Enter agent email..."
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate/50">Use if agent is not listed</p>
              {!manualEmailValid || manualEmailError ? (
                <p className="mt-1 text-xs text-coral">
                  {manualEmailError || "Please enter a valid email format."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-slate">Lead Summary</p>
            <div className="mt-3 space-y-2 text-sm text-slate/70">
              <p>Name: <span className="font-medium text-slate">{lead.name}</span></p>
              <p>Email: <span className="font-medium text-slate">{lead.email}</span></p>
              <p>Phone: <span className="font-medium text-slate">{lead.phone}</span></p>
              <p>Stage: <span className="font-medium text-slate">{lead.status}</span></p>
              <p>Engagement Score: <span className="font-medium text-slate">{lead.engagement_score}</span></p>
              <p>Last Interaction: <span className="font-medium text-slate">{recentActivityLine(lead)}</span></p>
              <p>Source: <span className="font-medium text-slate">{source}</span></p>
              <p className="mt-2 inline-block rounded-full bg-coral/10 px-2 py-1 text-xs font-semibold text-coral">
                High Intent: {confidence}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-mint/30 bg-mint/5 p-4">
          <p className="text-sm font-semibold text-slate">Email Preview</p>
          {preview ? (
            <div className="mt-3 rounded-xl border border-mint/20 bg-white p-4 text-sm text-slate/80">
              <p className="font-semibold text-slate">Subject: {preview.subject}</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans">{preview.body}</pre>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate/60">Select an agent to generate the assignment email.</p>
          )}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            disabled={!effectiveAgent || sending}
            onClick={async () => {
              if (!effectiveAgent) return;
              if (!manualEmailValid) {
                setManualEmailError("Please enter a valid email format.");
                return;
              }
              setSending(true);
              await onAssign(
                {
                  name: effectiveAgent.name,
                  email: effectiveAgent.email,
                  specialty: effectiveAgent.role
                },
                source
              );
              setSuccess(`Lead successfully assigned to ${effectiveAgent.name}`);
              setSending(false);
            }}
            className="rounded-lg bg-slate px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : "Assign & Send"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate/70 hover:bg-slate/5"
          >
            Cancel
          </button>
          {success ? <p className="text-sm font-medium text-mint">{success}</p> : null}
        </div>
      </div>
    </div>
  );
}
