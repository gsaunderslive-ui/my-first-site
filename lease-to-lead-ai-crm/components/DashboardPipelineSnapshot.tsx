"use client";

import Link from "next/link";
import type { TenantView } from "@/lib/types";

type Props = {
  tenants: TenantView[];
};

function isHot(t: TenantView) {
  return t.stage === "HOT" || t.status === "Hot";
}

function isWarm(t: TenantView) {
  return t.stage === "WARM" || t.status === "Warm";
}

/**
 * Action-oriented snapshot derived from live tenant data (not navigation duplicates).
 */
export function DashboardPipelineSnapshot({ tenants }: Props) {
  const hot = tenants.filter(isHot).length;
  const warm = tenants.filter(isWarm).length;
  const noConsent = tenants.filter((t) => !t.consent_status).length;
  const leaseSoon = tenants.filter((t) => t.monthsRemaining <= 6).length;
  const automationOff = tenants.filter((t) => !t.automationEnabled).length;
  const highScore = tenants.filter((t) => t.leadScore >= 60).length;

  const items = [
    {
      label: "Hot & warm",
      value: hot + warm,
      detail: `${hot} hot · ${warm} warm`,
      hint: "Best candidates for timely follow-up.",
      href: "/communication",
      cta: "Open messaging"
    },
    {
      label: "Strong scores (60+)",
      value: highScore,
      detail: "Lead score threshold",
      hint: "Worth a personal touch or playbook tune-up.",
      href: "/tenants",
      cta: "View pipeline"
    },
    {
      label: "Lease ≤6 months",
      value: leaseSoon,
      detail: "Buying-window timing",
      hint: "Natural moment to discuss purchase options.",
      href: "/tenants",
      cta: "View pipeline"
    },
    {
      label: "Consent not on file",
      value: noConsent,
      detail: "Before SMS automation",
      hint: "Confirm opt-in before heavy outreach.",
      href: "/tenants",
      cta: "View pipeline"
    },
    {
      label: "Automation paused",
      value: automationOff,
      detail: "Per-tenant setting",
      hint: "Re-enable or adjust cadence where appropriate.",
      href: "/automation",
      cta: "Automation"
    }
  ];

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate">Pipeline snapshot</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate/60">
            Live counts from your tenant list—use them to decide where to focus. Sidebar links stay the same; this is
            only insight.
          </p>
        </div>
        <p className="text-xs text-slate/45">{tenants.length} tenants in portfolio</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col rounded-2xl border border-slate-100 bg-slate/5 p-4 transition hover:border-mint/30 hover:bg-white"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate/45">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-slate">{item.value}</p>
            <p className="mt-0.5 text-xs text-slate/55">{item.detail}</p>
            <p className="mt-2 flex-1 text-sm text-slate/65">{item.hint}</p>
            <Link
              href={item.href}
              className="mt-3 inline-flex text-sm font-medium text-mint/90 hover:text-teal-700"
            >
              {item.cta} →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
