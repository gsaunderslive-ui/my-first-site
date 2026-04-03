"use client";

import { Badge } from "@/components/Badge";
import { BuyingPowerTooltip } from "@/components/BuyingPowerTooltip";
import { useCrmData } from "@/lib/useCrmData";
import { parseCreditRangeMid, type PreApprovalStatus } from "@/lib/tenantFinancials";
import type { TenantView } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LS_SORT = "crm-active-tenants-sort";
const LS_FILTERS = "crm-active-tenants-filters";

type SortKey =
  | "name"
  | "monthsInLease"
  | "monthsRemaining"
  | "rentAmount"
  | "displayAnnualIncome"
  | "estimatedCreditScore"
  | "status"
  | "preApprovalStatus"
  | "estimatedBuyingPower"
  | "lastInteractionAt"
  | "leadScore";

type SortDir = "asc" | "desc";

type Filters = {
  search: string;
  status: string;
  preApproval: string;
  monthsMin: string;
  monthsMax: string;
};

const defaultFilters: Filters = {
  search: "",
  status: "Any",
  preApproval: "Any",
  monthsMin: "",
  monthsMax: ""
};

function formatPreApproval(p: PreApprovalStatus) {
  if (p === "pre-qualified") return "Pre-qualified";
  if (p === "pre-approved") return "Pre-approved";
  return "None";
}

function preApprovalSortKey(p: PreApprovalStatus) {
  if (p === "none") return 0;
  if (p === "pre-qualified") return 1;
  return 2;
}

function SortHeader({
  label,
  active,
  dir,
  onClick
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1 text-left font-medium text-slate/70 hover:text-slate"
    >
      {label}
      {active ? <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

export type ActiveTenantsWorkspaceProps = {
  variant?: "page" | "embedded";
  /** Combined view: selecting a row opens that tenant’s chat in the messaging panel */
  onSelectTenantForMessaging?: (tenant: TenantView) => void | Promise<void>;
  messagingTenantId?: string | null;
  hideCommunicationDashboardLink?: boolean;
};

export function ActiveTenantsWorkspace({
  variant = "page",
  onSelectTenantForMessaging,
  messagingTenantId = null,
  hideCommunicationDashboardLink = false
}: ActiveTenantsWorkspaceProps) {
  const { data, loading, engage, simulateEngagement, updateConsent, refresh } = useCrmData();
  const router = useRouter();
  const embedded = variant === "embedded";

  const [sortKey, setSortKey] = useState<SortKey>("leadScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [hydrated, setHydrated] = useState(false);

  const [modalTenantId, setModalTenantId] = useState<string | null>(null);
  const [modalMessages, setModalMessages] = useState<
    { id: string; content: string; direction: string; created_at: string; channel?: string | null }[]
  >([]);

  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsSendAndOpenComms, setSmsSendAndOpenComms] = useState(!embedded);
  const [simulateTenantInboundEnabled, setSimulateTenantInboundEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setSimulateTenantInboundEnabled(Boolean(d?.features?.simulateTenantInbound));
        setIsAdmin(Boolean(d?.user?.isAdmin));
      })
      .catch(() => {
        setSimulateTenantInboundEnabled(false);
        setIsAdmin(false);
      });
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_SORT);
      if (s) {
        const parsed = JSON.parse(s) as { key?: SortKey; dir?: SortDir };
        if (parsed.key) setSortKey(parsed.key);
        if (parsed.dir) setSortDir(parsed.dir);
      }
      const f = localStorage.getItem(LS_FILTERS);
      if (f) {
        const parsed = JSON.parse(f) as Partial<Filters>;
        setFilters((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_SORT, JSON.stringify({ key: sortKey, dir: sortDir }));
  }, [sortKey, sortDir, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_FILTERS, JSON.stringify(filters));
  }, [filters, hydrated]);

  const filtered = useMemo(() => {
    if (!data?.tenants) return [];
    const q = filters.search.trim().toLowerCase();
    return data.tenants.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (filters.status !== "Any" && t.status !== filters.status) return false;
      if (filters.preApproval !== "Any" && t.preApprovalStatus !== filters.preApproval) return false;
      const minM = filters.monthsMin === "" ? null : Number(filters.monthsMin);
      const maxM = filters.monthsMax === "" ? null : Number(filters.monthsMax);
      if (minM != null && Number.isFinite(minM) && t.monthsRemaining < minM) return false;
      if (maxM != null && Number.isFinite(maxM) && t.monthsRemaining > maxM) return false;
      return true;
    });
  }, [data?.tenants, filters]);

  const sortedRows = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "monthsInLease":
          cmp = a.monthsInLease - b.monthsInLease;
          break;
        case "monthsRemaining":
          cmp = a.monthsRemaining - b.monthsRemaining;
          break;
        case "rentAmount":
          cmp = a.rentAmount - b.rentAmount;
          break;
        case "displayAnnualIncome":
          cmp = a.displayAnnualIncome - b.displayAnnualIncome;
          break;
        case "estimatedCreditScore":
          cmp = a.estimatedCreditScore - b.estimatedCreditScore;
          break;
        case "status":
          cmp = String(a.status).localeCompare(String(b.status));
          break;
        case "preApprovalStatus":
          cmp = preApprovalSortKey(a.preApprovalStatus) - preApprovalSortKey(b.preApprovalStatus);
          break;
        case "estimatedBuyingPower":
          cmp = a.estimatedBuyingPower - b.estimatedBuyingPower;
          break;
        case "lastInteractionAt": {
          const ta = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
          const tb = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "leadScore":
        default:
          cmp = a.leadScore - b.leadScore;
      }
      return cmp * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const modalTenant = useMemo(
    () => sortedRows.find((t) => t.id === modalTenantId) || null,
    [sortedRows, modalTenantId]
  );

  const modalIndex = modalTenant ? sortedRows.findIndex((t) => t.id === modalTenant.id) : -1;
  const prevTenant = modalIndex > 0 ? sortedRows[modalIndex - 1] : null;
  const nextTenant = modalIndex >= 0 && modalIndex < sortedRows.length - 1 ? sortedRows[modalIndex + 1] : null;

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
    }, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [modalTenantId, loadModalMessages]);

  useEffect(() => {
    if (!data?.tenants?.length) return;
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const focus = sp.get("focus");
    if (focus && data.tenants.some((t) => t.id === focus)) {
      setModalTenantId(focus);
    }
  }, [data?.tenants]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" || key === "preApprovalStatus" ? "asc" : "desc");
    }
  }

  function triggerToast(message: string) {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }

  async function sendChannel(channel: "Email" | "SMS" | "AI Call", openCommsAfterSms = true) {
    if (!modalTenant) return;

    try {
      const result = await engage(modalTenant.id, channel);
      if (result?.event?.blocked) {
        triggerToast(`Message blocked: ${result.event.reason || "Unknown reason"}`);
        return;
      }

      if (channel === "SMS" && result?.event?.chat_id && openCommsAfterSms) {
        triggerToast("Message sent successfully");
        const q = `/communication?chatId=${result.event.chat_id}&sent=1`;
        if (embedded) router.replace(q);
        else router.push(q);
        return;
      }

      if (result?.event?.reason === "No response") {
        triggerToast(`${channel} sent. No response yet.`);
        return;
      }

      triggerToast(`${channel} sent successfully.`);
      void loadModalMessages(modalTenant.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      triggerToast(`Send failed: ${message}`);
    }
  }

  function handleSend(channel: "Email" | "SMS" | "AI Call") {
    if (channel === "SMS") {
      setSmsModalOpen(true);
      return;
    }
    void sendChannel(channel, false);
  }

  async function restartVisualWorkflowForTenant(tenantId: string) {
    try {
      const r = await fetch(`/api/tenant/${tenantId}/restart-visual-workflow`, {
        method: "POST",
        credentials: "include"
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        triggerToast(data.error || "Could not restart visual workflow");
        return;
      }
      await refresh();
      triggerToast("Visual workflow restarted. Next SMS uses a fresh playbook session.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      triggerToast(`Restart failed: ${message}`);
    }
  }

  if (loading || !data) {
    return <div className="rounded-2xl bg-white p-6 shadow-soft">Loading active tenants…</div>;
  }

  return (
    <div className="max-w-full min-w-0 space-y-4">
      {embedded ? (
        <div className="rounded-xl border border-slate-100 bg-white/90 px-3 py-2">
          <p className="text-sm font-semibold text-slate">Active Tenants</p>
          <p className="text-xs text-slate/55">
            Click a <span className="font-medium text-mint">name</span> for the full profile. Click elsewhere on the row to select
            that conversation in the panel.
          </p>
        </div>
      ) : (
        <header>
          <h2 className="text-2xl font-semibold text-slate">Active Tenants</h2>
          <p className="text-sm text-slate/60">
            Buyers in your pipeline — sort, filter, and open full profiles with unified conversation history.
          </p>
        </header>
      )}

      {showToast ? (
        <div className="fixed bottom-5 right-5 z-[60] rounded-lg bg-slate px-4 py-2 text-sm text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
        <p className="text-sm font-medium text-slate">Search &amp; settings</p>
        <p className="text-xs text-slate/50">Filters and column sort are saved in this browser.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-sm text-slate/70">
            Search name
            <input
              className="ml-2 rounded-md border border-slate-200 px-2 py-1"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Contains…"
            />
          </label>
          <label className="text-sm text-slate/70">
            Status
            <select
              className="ml-2 rounded-md border border-slate-200 px-2 py-1"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option>Any</option>
              <option>Cold</option>
              <option>Warm</option>
              <option>Hot</option>
              <option>Converted</option>
            </select>
          </label>
          <label className="text-sm text-slate/70">
            Pre-approval
            <select
              className="ml-2 rounded-md border border-slate-200 px-2 py-1"
              value={filters.preApproval}
              onChange={(e) => setFilters((f) => ({ ...f, preApproval: e.target.value }))}
            >
              <option>Any</option>
              <option value="none">None</option>
              <option value="pre-qualified">Pre-qualified</option>
              <option value="pre-approved">Pre-approved</option>
            </select>
          </label>
          <label className="text-sm text-slate/70">
            Min mo. remaining
            <input
              type="number"
              min={0}
              className="ml-2 w-16 rounded-md border border-slate-200 px-2 py-1"
              value={filters.monthsMin}
              onChange={(e) => setFilters((f) => ({ ...f, monthsMin: e.target.value }))}
            />
          </label>
          <label className="text-sm text-slate/70">
            Max mo. remaining
            <input
              type="number"
              min={0}
              className="ml-2 w-16 rounded-md border border-slate-200 px-2 py-1"
              value={filters.monthsMax}
              onChange={(e) => setFilters((f) => ({ ...f, monthsMax: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="self-end rounded-md border border-slate-200 px-3 py-1 text-sm text-slate/70 hover:bg-slate/5"
            onClick={() => setFilters(defaultFilters)}
          >
            Reset filters
          </button>
        </div>
      </div>

      <div
        className={`overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-soft ${embedded ? "max-h-[min(70vh,720px)] overflow-y-auto" : ""}`}
      >
        <table className="min-w-[1220px] text-left text-sm">
          <thead className="bg-slate/5 text-slate/70">
            <tr>
              <th className="px-3 py-3">
                <SortHeader label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Mo. in lease"
                  active={sortKey === "monthsInLease"}
                  dir={sortDir}
                  onClick={() => toggleSort("monthsInLease")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Mo. remaining"
                  active={sortKey === "monthsRemaining"}
                  dir={sortDir}
                  onClick={() => toggleSort("monthsRemaining")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader label="Rent" active={sortKey === "rentAmount"} dir={sortDir} onClick={() => toggleSort("rentAmount")} />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Est. income"
                  active={sortKey === "displayAnnualIncome"}
                  dir={sortDir}
                  onClick={() => toggleSort("displayAnnualIncome")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Est. credit"
                  active={sortKey === "estimatedCreditScore"}
                  dir={sortDir}
                  onClick={() => toggleSort("estimatedCreditScore")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Pre-app."
                  active={sortKey === "preApprovalStatus"}
                  dir={sortDir}
                  onClick={() => toggleSort("preApprovalStatus")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Buying power"
                  active={sortKey === "estimatedBuyingPower"}
                  dir={sortDir}
                  onClick={() => toggleSort("estimatedBuyingPower")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Last touch"
                  active={sortKey === "lastInteractionAt"}
                  dir={sortDir}
                  onClick={() => toggleSort("lastInteractionAt")}
                />
              </th>
              <th className="px-3 py-3">
                <SortHeader
                  label="Lead score"
                  active={sortKey === "leadScore"}
                  dir={sortDir}
                  onClick={() => toggleSort("leadScore")}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((tenant) => (
              <tr
                key={tenant.id}
                onClick={() => {
                  if (embedded && onSelectTenantForMessaging) {
                    void onSelectTenantForMessaging(tenant);
                    return;
                  }
                  setModalTenantId(tenant.id);
                }}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate/5 ${
                  messagingTenantId === tenant.id ? "bg-mint/10" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalTenantId(tenant.id);
                    }}
                    className="text-left font-medium text-mint hover:underline"
                  >
                    {tenant.name}
                  </button>
                </td>
                <td className="px-3 py-3 text-slate/70">{tenant.monthsInLease}</td>
                <td className="px-3 py-3 text-slate/70">{tenant.monthsRemaining}</td>
                <td className="px-3 py-3 text-slate/70">${tenant.rentAmount.toLocaleString()}</td>
                <td className="px-3 py-3 text-slate/70">
                  ${tenant.displayAnnualIncome.toLocaleString()}
                  {tenant.estimatedIncome <= 0 ? (
                    <span className="ml-1 text-[10px] text-slate/45" title="Estimated from rent × 3 (annualized)">
                      (est.)
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-slate/70">
                  {tenant.estimatedCreditScore}
                  {parseCreditRangeMid(tenant.creditScoreRange) == null ? (
                    <span className="ml-1 text-[10px] text-slate/45" title="Estimated from behavior">
                      (est.)
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Badge label={tenant.status} />
                </td>
                <td className="px-3 py-3 text-slate/70">{formatPreApproval(tenant.preApprovalStatus)}</td>
                <td
                  className="relative px-3 py-3 text-slate/70"
                  onClick={embedded ? (e) => e.stopPropagation() : undefined}
                >
                  <BuyingPowerTooltip tenant={tenant} />
                </td>
                <td className="px-3 py-3 text-slate/70">
                  {tenant.lastInteractionAt ? new Date(tenant.lastInteractionAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-3 font-medium text-slate">{tenant.leadScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/45 p-3"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalTenantId(null)}
        >
          <div
            className="my-auto flex max-h-[min(92vh,100dvh-1.5rem)] w-full max-w-[min(64rem,calc(100vw-1.5rem))] min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate/5 px-4 py-3">
              <div className="flex min-w-0 shrink items-center gap-2">
                <button
                  type="button"
                  disabled={!prevTenant}
                  onClick={() => prevTenant && setModalTenantId(prevTenant.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate/80 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={!nextTenant}
                  onClick={() => nextTenant && setModalTenantId(nextTenant.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate/80 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
              <h3 className="min-w-0 flex-1 break-words text-center text-lg font-semibold text-slate">
                {modalTenant.name}
              </h3>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {hideCommunicationDashboardLink && modalTenant.chatId ? (
                  <span className="text-xs text-slate/55">Use the panel for modes, automation, and sends — chat history is below.</span>
                ) : modalTenant.chatId ? (
                  <Link
                    href={`/communication?chatId=${modalTenant.chatId}`}
                    className="rounded-lg bg-mint px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600"
                  >
                    Open in Communication Dashboard
                  </Link>
                ) : (
                  <span className="text-xs text-slate/50">No thread yet — send SMS to start</span>
                )}
                <button
                  type="button"
                  onClick={() => setModalTenantId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate/70 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TenantModalBody
                tenant={modalTenant}
                onSend={handleSend}
                onSimulateEngagement={() => simulateEngagement(modalTenant.id)}
                onConsentChange={(v) => updateConsent(modalTenant.id, v)}
                messages={modalMessages}
                simulateTenantInboundEnabled={simulateTenantInboundEnabled}
                isAdmin={isAdmin}
                onRestartVisualWorkflow={() => restartVisualWorkflowForTenant(modalTenant.id)}
                onSimulateInboundSuccess={async () => {
                  await loadModalMessages(modalTenant.id);
                  await refresh();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {smsModalOpen && modalTenant ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft">
            <h3 className="text-lg font-semibold text-slate">Send SMS</h3>
            <p className="mt-1 text-sm text-slate/70">
              Send an SMS to {modalTenant.name} and optionally open the Communication Dashboard.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate/80">
              <input
                type="checkbox"
                checked={smsSendAndOpenComms}
                onChange={(e) => setSmsSendAndOpenComms(e.target.checked)}
              />
              Open Communication Dashboard after sending
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSmsModalOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate/70 hover:bg-slate/5"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSmsModalOpen(false);
                  await sendChannel("SMS", smsSendAndOpenComms);
                }}
                className="rounded-md bg-mint px-3 py-2 text-sm text-white hover:bg-teal-600"
              >
                Send SMS
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TenantModalBody({
  tenant,
  onSend,
  onSimulateEngagement,
  onConsentChange,
  messages,
  simulateTenantInboundEnabled,
  isAdmin,
  onRestartVisualWorkflow,
  onSimulateInboundSuccess
}: {
  tenant: TenantView;
  onSend: (c: "Email" | "SMS" | "AI Call") => void;
  onSimulateEngagement: () => void;
  onConsentChange: (v: boolean) => void;
  messages: { id: string; content: string; direction: string; created_at: string; channel?: string | null }[];
  simulateTenantInboundEnabled: boolean;
  isAdmin: boolean;
  onRestartVisualWorkflow: () => void | Promise<void>;
  onSimulateInboundSuccess: () => void | Promise<void>;
}) {
  const [tenantTestReply, setTenantTestReply] = useState("");
  const [tenantSimulateLoading, setTenantSimulateLoading] = useState(false);
  const [restartVisualLoading, setRestartVisualLoading] = useState(false);
  const [simulateError, setSimulateError] = useState("");
  const simulateTextareaRef = useRef<HTMLTextAreaElement>(null);

  const chatId = tenant.chatId ?? null;

  async function sendSimulatedTenantReply() {
    if (!chatId || !tenantTestReply.trim() || tenantSimulateLoading) return;
    setTenantSimulateLoading(true);
    setSimulateError("");
    const res = await fetch(`/api/chats/${chatId}/simulate-inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: tenantTestReply.trim() })
    });
    const data = await res.json().catch(() => ({}));
    setTenantSimulateLoading(false);
    if (!res.ok) {
      setSimulateError(String(data.error || "Could not simulate tenant reply"));
      return;
    }
    setTenantTestReply("");
    await onSimulateInboundSuccess();
    await new Promise((r) => setTimeout(r, 400));
    await onSimulateInboundSuccess();
    simulateTextareaRef.current?.focus();
  }

  function handleSimulateKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    void sendSimulatedTenantReply();
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-slate-100 p-4">
          <p className="text-xs uppercase tracking-wide text-slate/45">Profile</p>
          <p className="mt-1 text-sm text-slate/70">
            {tenant.email} · {tenant.phone}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate/50">Months in lease</dt>
              <dd className="font-medium text-slate">{tenant.monthsInLease}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Months remaining on lease</dt>
              <dd className="font-medium text-slate">{tenant.monthsRemaining}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Rent</dt>
              <dd className="font-medium text-slate">${tenant.rentAmount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Est. annual income</dt>
              <dd className="font-medium text-slate">${tenant.displayAnnualIncome.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Est. credit</dt>
              <dd className="font-medium text-slate">{tenant.estimatedCreditScore}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Pre-approval</dt>
              <dd className="font-medium text-slate">{formatPreApproval(tenant.preApprovalStatus)}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Est. buying power</dt>
              <dd className="font-medium text-slate">
                <BuyingPowerTooltip tenant={tenant} />
              </dd>
            </div>
            <div>
              <dt className="text-slate/50">Lead score</dt>
              <dd className="font-medium text-slate">{tenant.leadScore}</dd>
            </div>
            <div>
              <dt className="text-slate/50">Last interaction</dt>
              <dd className="font-medium text-slate">
                {tenant.lastInteractionAt ? new Date(tenant.lastInteractionAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-100 p-4">
          <p className="text-xs uppercase tracking-wide text-slate/45">AI preview</p>
          <p className="mt-2 text-sm text-slate/80">{tenant.aiPreview}</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate/80">
          <input type="checkbox" checked={tenant.consent_status} onChange={(e) => onConsentChange(e.target.checked)} />
          Consent to SMS, email, and phone
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSend("Email")}
            className="rounded-lg bg-slate px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => onSend("SMS")}
            className="rounded-lg bg-mint px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            SMS
          </button>
          <button
            type="button"
            onClick={() => onSend("AI Call")}
            className="rounded-lg bg-coral px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            AI call
          </button>
          <button
            type="button"
            onClick={onSimulateEngagement}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate/80"
          >
            Simulate engagement
          </button>
          {isAdmin ? (
            <button
              type="button"
              disabled={restartVisualLoading}
              title="Deletes visual playbook session rows for this tenant so the next SMS starts from the workflow entry."
              onClick={() => {
                setRestartVisualLoading(true);
                void Promise.resolve(onRestartVisualWorkflow()).finally(() => setRestartVisualLoading(false));
              }}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {restartVisualLoading ? "Restarting…" : "Restart visual workflow"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[320px] min-w-0 flex-col rounded-xl border border-slate-100 bg-slate/5 p-4">
        <p className="text-sm font-medium text-slate">Conversation (SMS / email / in-app)</p>
        <p className="text-xs text-slate/50">Synced with Communication Dashboard — updates every few seconds while this modal is open.</p>
        <div className="mt-3 min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg bg-white p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate/55">No messages yet.</p>
          ) : (
            messages.map((m) => {
              const inbound = m.direction === "inbound";
              return (
                <div
                  key={m.id}
                  className={`max-w-[min(100%,20rem)] break-words rounded-lg px-3 py-2 text-sm sm:max-w-[85%] ${inbound ? "ml-auto bg-slate text-white" : "mr-auto bg-mist text-slate"}`}
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

        {simulateTenantInboundEnabled ? (
          <div className="mt-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">Testing only</p>
            <p className="mt-1 text-xs text-amber-900/70">
              Pretend you are the tenant: same path as inbound SMS. With <code className="rounded bg-white/80 px-0.5 text-[10px]">OPENAI_API_KEY</code> set,
              you get a model-written reply in the thread (Fully Automated = sent; AI-Assisted = draft). Off in production unless{" "}
              <code className="rounded bg-white/80 px-0.5 text-[10px]">CRM_SIMULATE_INBOUND_ENABLED=true</code>.
            </p>
            <p className="mt-1 text-[11px] text-amber-900/60">Press Enter to send · Shift+Enter for a new line</p>
            {!chatId ? (
              <p className="mt-2 text-xs text-amber-900/80">Send SMS once to create a thread, then you can simulate replies here.</p>
            ) : null}
            {simulateError ? <p className="mt-2 text-xs text-red-700">{simulateError}</p> : null}
            <textarea
              ref={simulateTextareaRef}
              value={tenantTestReply}
              onChange={(e) => setTenantTestReply(e.target.value)}
              onKeyDown={handleSimulateKeyDown}
              placeholder="Type the tenant’s message…"
              rows={3}
              disabled={!chatId || tenantSimulateLoading}
              className="mt-2 w-full resize-y rounded-md border border-amber-200/80 bg-white px-3 py-2 text-sm text-slate disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="button"
              disabled={tenantSimulateLoading || !tenantTestReply.trim() || !chatId}
              onClick={() => void sendSimulatedTenantReply()}
              className="mt-2 w-full rounded-md bg-amber-800 px-3 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tenantSimulateLoading ? "Applying…" : "Send as tenant (simulate inbound)"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
