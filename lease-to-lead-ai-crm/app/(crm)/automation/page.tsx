"use client";

import { Badge } from "@/components/Badge";
import { BuyingPowerTooltip } from "@/components/BuyingPowerTooltip";
import { parseCreditRangeMid } from "@/lib/tenantFinancials";
import type { TenantView } from "@/lib/types";
import { useCrmData } from "@/lib/useCrmData";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function formatPreApproval(p: TenantView["preApprovalStatus"]) {
  if (p === "pre-qualified") return "Pre-qualified";
  if (p === "pre-approved") return "Pre-approved";
  return "None";
}

export default function AutomationEnginePage() {
  const { data, loading, engage } = useCrmData();
  const [modalTenantId, setModalTenantId] = useState<string | null>(null);
  const [modalMessages, setModalMessages] = useState<
    { id: string; content: string; direction: string; created_at: string; channel?: string | null }[]
  >([]);

  const modalTenant = data?.tenants.find((t) => t.id === modalTenantId) || null;

  const loadModalMessages = useCallback(async (tenantId: string) => {
    const res = await fetch(`/api/tenant/${tenantId}/messages?limit=120`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const raw = (json?.messages || []) as typeof modalMessages;
    setModalMessages([...raw].reverse());
  }, []);

  useEffect(() => {
    if (!modalTenantId) {
      setModalMessages([]);
      return;
    }
    let mounted = true;
    void loadModalMessages(modalTenantId);
    const id = setInterval(() => {
      if (mounted) void loadModalMessages(modalTenantId);
    }, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [modalTenantId, loadModalMessages]);

  if (loading || !data) {
    return <div className="rounded-2xl bg-white p-6 shadow-soft">Loading automation engine…</div>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-slate">Automation Engine</h2>
        <p className="text-sm text-slate/60">
          Stage-based nurture from awareness to urgency. Select a tenant for AI insights, timeline, and chat history.
        </p>
      </header>

      <div className="overflow-auto rounded-2xl border border-slate-100 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate/5 text-slate/70">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Automation stage</th>
              <th className="px-4 py-3">Lead stage</th>
              <th className="px-4 py-3">Last message</th>
              <th className="px-4 py-3">Next scheduled</th>
              <th className="px-4 py-3">Engagement</th>
              <th className="px-4 py-3">AI preview</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-slate-100 align-top hover:bg-slate/5">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setModalTenantId(tenant.id)}
                    className="text-left font-medium text-mint hover:underline"
                  >
                    {tenant.name}
                  </button>
                  <p className="text-xs text-slate/50">{tenant.email}</p>
                </td>
                <td className="px-4 py-3 text-slate/80">{tenant.automation_stage}</td>
                <td className="px-4 py-3 text-slate/80">{tenant.stage}</td>
                <td className="px-4 py-3 text-slate/70">{tenant.lastMessageSent}</td>
                <td className="px-4 py-3 text-slate/70">{tenant.nextScheduledMessage}</td>
                <td className="px-4 py-3 text-slate/70">{tenant.engagementStatus}</td>
                <td className="max-w-xs px-4 py-3 text-slate/60">{tenant.aiPreview}</td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <Badge label={tenant.status} />
                    <p className="text-xs text-slate/60">{tenant.consent_status ? "Consent: Yes" : "Consent: No"}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => engage(tenant.id, "Email")}
                        className="rounded-md bg-slate px-2 py-1 text-xs text-white"
                      >
                        Email
                      </button>
                      <button
                        onClick={() => engage(tenant.id, "SMS")}
                        className="rounded-md bg-mint px-2 py-1 text-xs text-white"
                      >
                        SMS
                      </button>
                      <button
                        onClick={() => engage(tenant.id, "AI Call")}
                        className="rounded-md bg-coral px-2 py-1 text-xs text-white"
                      >
                        AI
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalTenantId(null)}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate/5 px-4 py-3">
              <div>
                <h3 className="text-xl font-semibold text-slate">{modalTenant.name}</h3>
                <p className="text-sm text-slate/60">
                  {modalTenant.email} · {modalTenant.phone}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {modalTenant.chatId ? (
                  <Link
                    href={`/communication?chatId=${modalTenant.chatId}`}
                    className="rounded-lg bg-mint px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
                  >
                    Communication Dashboard
                  </Link>
                ) : null}
                <Link
                  href={`/tenants?focus=${encodeURIComponent(modalTenant.id)}`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate/80 hover:bg-white"
                >
                  Active Tenants
                </Link>
                <button
                  type="button"
                  onClick={() => setModalTenantId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate/70 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-5">
              <div className="space-y-4 border-b border-slate-100 p-4 lg:col-span-2 lg:border-b-0 lg:border-r">
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/45">AI insights</p>
                  <p className="mt-2 text-sm text-slate/80">{modalTenant.aiPreview}</p>
                  <p className="mt-2 text-sm text-slate/70">
                    Interest: <span className="capitalize font-medium text-slate">{modalTenant.interestLevel}</span> · Lead
                    score: <span className="font-medium text-slate">{modalTenant.leadScore}</span>
                  </p>
                </section>

                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/45">Financial snapshot</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-slate/50">Est. income</dt>
                      <dd>${modalTenant.displayAnnualIncome.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate/50">Est. credit</dt>
                      <dd>
                        {modalTenant.estimatedCreditScore}
                        {parseCreditRangeMid(modalTenant.creditScoreRange) == null ? " (est.)" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate/50">Buying power</dt>
                      <dd className="text-slate">
                        <BuyingPowerTooltip tenant={modalTenant} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate/50">Pre-approval</dt>
                      <dd>{formatPreApproval(modalTenant.preApprovalStatus)}</dd>
                    </div>
                  </dl>
                </section>

                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/45">Timeline</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate/80">
                    <li className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                      <span>Lease end</span>
                      <span className="text-slate">{new Date(modalTenant.leaseEndDate).toLocaleDateString()}</span>
                    </li>
                    <li className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                      <span>Months remaining</span>
                      <span className="text-slate">{modalTenant.monthsRemaining}</span>
                    </li>
                    <li className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                      <span>Last outbound</span>
                      <span className="text-right text-slate">{modalTenant.lastMessageSent}</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span>Next scheduled</span>
                      <span className="text-right text-slate">{modalTenant.nextScheduledMessage}</span>
                    </li>
                  </ul>
                </section>
              </div>

              <div className="flex min-h-[280px] flex-col bg-slate/5 p-4 lg:col-span-3">
                <p className="text-sm font-medium text-slate">Unified conversation</p>
                <p className="text-xs text-slate/50">SMS, email, and in-app messages in one thread.</p>
                <div className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-lg bg-white p-3">
                  {modalMessages.length === 0 ? (
                    <p className="text-sm text-slate/55">No messages yet.</p>
                  ) : (
                    modalMessages.map((m) => {
                      const inbound = m.direction === "inbound";
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[95%] rounded-lg px-3 py-2 text-sm ${inbound ? "ml-auto bg-slate text-white" : "bg-mist text-slate"}`}
                        >
                          {m.channel ? (
                            <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{m.channel}</p>
                          ) : null}
                          <p>{m.content}</p>
                          <p className={`mt-1 text-[11px] ${inbound ? "text-white/70" : "text-slate/55"}`}>
                            {new Date(m.created_at).toLocaleString()}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
