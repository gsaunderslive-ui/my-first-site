"use client";

import { buyingPowerTooltipShort } from "@/lib/tenantFinancials";
import type { TenantView } from "@/lib/types";

export function BuyingPowerTooltip({ tenant }: { tenant: TenantView }) {
  const text = buyingPowerTooltipShort({
    annualIncome: tenant.displayAnnualIncome,
    estimatedCreditScore: tenant.estimatedCreditScore,
    engagementSignals: tenant.engagement_score
  });
  return (
    <span className="group relative inline-block max-w-full">
      <span title={text} className="cursor-help border-b border-dotted border-slate/35">
        ${tenant.estimatedBuyingPower.toLocaleString()}
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-[60] mt-1 hidden min-w-[12rem] max-w-[18rem] rounded-lg border border-slate-200 bg-white p-2 text-left text-[11px] leading-snug text-slate/75 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}
