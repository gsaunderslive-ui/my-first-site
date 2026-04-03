"use client";

import { LeadDetailSlideOver } from "@/components/leads/LeadDetailSlideOver";
import {
  computeLeadDashboardKpis,
  formatLeadCurrency,
  formatPreApprovalLabel,
  nextActionLabel,
  sortLeads,
  statusPillClass,
  type LeadSortMode
} from "@/lib/leadDashboardUtils";
import type { TenantView } from "@/lib/types";
import { useCrmData } from "@/lib/useCrmData";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const navLinks = [
  { href: "/", label: "Lead Dashboard" },
  { href: "/communication", label: "Messages" },
  { href: "/automation", label: "Automation" },
  { href: "/follow-up", label: "Follow up" }
];

function useKpiCountUp(end: number, durationMs = 720) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(end * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(end);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, durationMs]);
  return value;
}

function KpiCard({
  label,
  value,
  sub,
  subSecondary
}: {
  label: string;
  value: string;
  sub?: string;
  subSecondary?: string;
}) {
  return (
    <div className="group rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.08)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-10px_rgba(15,23,42,0.12)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
      {subSecondary ? <p className="mt-0.5 text-xs text-zinc-400">{subSecondary}</p> : null}
    </div>
  );
}

export function LeadDashboardView() {
  const { data, loading, refresh, assignToAgent, saveReminder } = useCrmData();
  const pathname = usePathname();
  const [selected, setSelected] = useState<TenantView | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [me, setMe] = useState<{ username: string; isAdmin: boolean } | null>(null);
  const [sortMode, setSortMode] = useState<LeadSortMode>("priority");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.user?.username) setMe({ username: j.user.username, isAdmin: Boolean(j.user.isAdmin) });
      })
      .catch(() => setMe(null));
  }, []);

  const kpis = useMemo(() => (data?.tenants ? computeLeadDashboardKpis(data.tenants) : null), [data?.tenants]);

  const hotAnimated = useKpiCountUp(kpis?.hotLeads ?? 0);
  const pipelineAnimated = useKpiCountUp(Math.round(kpis?.pipelineValue ?? 0));
  const convoAnimated = useKpiCountUp(kpis?.activeConversations ?? 0);
  const readyAnimated = useKpiCountUp(kpis?.conversionReady ?? 0);

  const sortedTenants = useMemo(() => {
    if (!data?.tenants) return [];
    return sortLeads(data.tenants, sortMode);
  }, [data?.tenants, sortMode]);

  const openPanel = useCallback((t: TenantView) => {
    setSelected(t);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  useEffect(() => {
    if (!selected?.id || !data?.tenants) return;
    const next = data.tenants.find((t) => t.id === selected.id);
    if (next) setSelected(next);
  }, [data?.tenants, selected?.id]);

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-zinc-100 bg-white text-sm text-zinc-500 shadow-sm">
        Loading leads…
      </div>
    );
  }

  const hasLeads = data.tenants.length > 0;
  const commissionAnimated = pipelineAnimated * 0.03;

  return (
    <div className="min-w-0">
      <header className="sticky top-0 z-30 -mx-4 mb-8 border-b border-zinc-200/70 bg-white/85 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          {me ? (
            <div className="flex items-center gap-3 text-sm text-zinc-500">
              <span className="truncate">
                <span className="text-zinc-400">Signed in as</span>{" "}
                <span className="font-medium text-zinc-800">{me.username}</span>
              </span>
              {me.isAdmin ? (
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  Admin
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Lead Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Pipeline overview and lead roster. Select a row to review details, conversation, and playbook state.
          </p>
        </div>

        {kpis ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Hot leads" value={String(hotAnimated)} sub="Status = Hot" />
            <KpiCard
              label="Est. pipeline value"
              value={formatLeadCurrency(pipelineAnimated)}
              sub="Sum of estimated buying power"
              subSecondary={`Est. commission (3%): ${formatLeadCurrency(commissionAnimated)}`}
            />
            <KpiCard label="Active conversations" value={String(convoAnimated)} sub="Leads with a chat thread" />
            <KpiCard
              label="Conversion ready"
              value={String(readyAnimated)}
              sub="Pre-approved / qualified or Hot+"
            />
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.1)]">
          <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">All leads</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{data.tenants.length} records</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="shrink-0 text-xs font-medium text-zinc-400">Sort by</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as LeadSortMode)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="priority">Priority</option>
                <option value="buying_power">Buying power</option>
                <option value="lease_ending">Lease ending soon</option>
              </select>
            </label>
          </div>

          {!hasLeads ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="rounded-full bg-zinc-100 p-4 text-zinc-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <p className="mt-5 text-sm font-medium text-zinc-800">No leads yet</p>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                When tenants are added to your pipeline, they will appear here with buying power, status, and suggested
                next actions.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/80">
                    <th className="whitespace-nowrap px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Months left
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Rent
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Est. buying power
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Pre-approved
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Next action
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Last activity
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTenants.map((t) => {
                    const isSelected = panelOpen && selected?.id === t.id;
                    return (
                      <tr
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openPanel(t)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPanel(t);
                          }
                        }}
                        className={`cursor-pointer border-b border-zinc-50 transition-colors duration-150 hover:bg-zinc-50/90 focus-visible:bg-zinc-100 focus-visible:outline-none ${
                          isSelected ? "bg-emerald-50/45 hover:bg-emerald-50/60" : ""
                        }`}
                      >
                        <td
                          className={`border-l-[3px] px-5 py-3.5 font-medium text-zinc-900 ${
                            isSelected ? "border-l-emerald-600" : "border-l-transparent"
                          }`}
                        >
                          {t.name}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-zinc-600">{t.monthsRemaining}</td>
                        <td className="px-4 py-3.5 tabular-nums text-zinc-600">{formatLeadCurrency(t.rentAmount)}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-emerald-800 ring-1 ring-emerald-200/70">
                            {formatLeadCurrency(t.estimatedBuyingPower)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPillClass(t.status)}`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-600">{formatPreApprovalLabel(t.preApprovalStatus)}</td>
                        <td className="px-4 py-3.5 text-sm font-medium text-zinc-800">{nextActionLabel(t)}</td>
                        <td className="px-4 py-3.5 text-zinc-500">
                          {t.lastInteractionAt ? new Date(t.lastInteractionAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-zinc-400">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
                            View
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <LeadDetailSlideOver
        tenant={selected}
        open={panelOpen}
        onClose={closePanel}
        isAdmin={Boolean(me?.isAdmin)}
        onRefresh={refresh}
        assignToAgent={assignToAgent}
        saveReminder={saveReminder}
      />
    </div>
  );
}
