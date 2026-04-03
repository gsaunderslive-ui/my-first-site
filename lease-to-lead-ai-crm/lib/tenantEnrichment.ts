import { computeNumericLeadScore, tierFromScore } from "./leadScoring";
import { annualIncomeFromTenant, estimateBuyingPower, estimateCreditScoreFromBehavior } from "./tenantFinancials";
import type { LeadStatus, Tenant, TenantView } from "./types";

function monthsLeft(leaseEndDate: string) {
  const now = new Date();
  const end = new Date(leaseEndDate);
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, months + (end.getDate() >= now.getDate() ? 0 : -1));
}

/** Full calendar months since lease start (mirrors monthsLeft day logic). */
function monthsElapsedSinceLeaseStart(leaseStartDate: string) {
  const start = new Date(leaseStartDate);
  if (!Number.isFinite(start.getTime())) return 0;
  const now = new Date();
  if (now < start) return 0;
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, months + (now.getDate() >= start.getDate() ? 0 : -1));
}

function autoStage(months: number) {
  if (months >= 6) return "Awareness" as const;
  if (months >= 4) return "Consideration" as const;
  if (months === 3) return "Intent" as const;
  if (months === 2) return "Action" as const;
  return "Urgency" as const;
}

function safePreview(tenant: Tenant, _stage: ReturnType<typeof autoStage>) {
  const firstName = tenant.name.split(" ")[0];
  return `Hi ${firstName}, you're currently paying $${tenant.rentAmount.toLocaleString()} in rent. Based on your profile, you may qualify to own a home nearby for a similar monthly cost.`;
}

export function medianBuyingPower(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function buyingIntentFromTenant(tenant: Tenant): boolean {
  const blob = `${tenant.lastMessageSent} ${tenant.messageHistory.map((m) => m.content).join(" ")}`.toLowerCase();
  return /buy|home|mortgage|pre-?approv|down payment|qualif|loan|house|purchase/.test(blob);
}

export function enrichTenantToView(tenant: Tenant, cohortBuyingPowerMedian: number): TenantView {
  const m = monthsLeft(tenant.leaseEndDate);
  const monthsIn = monthsElapsedSinceLeaseStart(tenant.leaseStartDate);
  const autoSt = autoStage(m);

  const displayAnnualIncome = annualIncomeFromTenant({
    estimatedIncome: tenant.estimatedIncome,
    rentAmount: tenant.rentAmount
  });

  const estimatedCreditScore =
    tenant.estimatedCreditScore > 0
      ? tenant.estimatedCreditScore
      : estimateCreditScoreFromBehavior({
          creditScoreRange: tenant.creditScoreRange,
          engagementScore: tenant.engagement_score
        });

  const estimatedBuyingPower =
    tenant.estimatedBuyingPower > 0
      ? tenant.estimatedBuyingPower
      : estimateBuyingPower({
          annualIncome: displayAnnualIncome,
          estimatedCreditScore,
          engagementSignals: tenant.engagement_score
        });

  const lastInteractionAt = tenant.lastInteractionAt ? new Date(tenant.lastInteractionAt) : null;
  const totalInteractions = tenant.messageHistory.length;

  const numericScore = computeNumericLeadScore({
    lastInteractionAt,
    preApprovalStatus: tenant.preApprovalStatus,
    estimatedBuyingPower,
    cohortBuyingPowerMedian: cohortBuyingPowerMedian || estimatedBuyingPower,
    totalInteractions,
    hasBuyingIntentSignal: buyingIntentFromTenant(tenant)
  });

  const tier = tierFromScore(numericScore);
  let status: LeadStatus = tier;
  if (tenant.status === "Converted") status = "Converted";

  const interestLevel: TenantView["interestLevel"] =
    numericScore >= 70 ? "high" : numericScore >= 40 ? "medium" : "low";

  return {
    ...tenant,
    status,
    leadScore: numericScore,
    estimatedCreditScore,
    estimatedBuyingPower,
    displayAnnualIncome,
    monthsInLease: monthsIn,
    monthsRemaining: m,
    automation_stage: autoSt,
    aiPreview: safePreview(tenant, autoSt),
    interestLevel
  };
}

export function buildTenantViews(tenants: Tenant[]): TenantView[] {
  const powers = tenants.map((t) =>
    t.estimatedBuyingPower > 0
      ? t.estimatedBuyingPower
      : estimateBuyingPower({
          annualIncome: annualIncomeFromTenant({ estimatedIncome: t.estimatedIncome, rentAmount: t.rentAmount }),
          estimatedCreditScore:
            t.estimatedCreditScore > 0
              ? t.estimatedCreditScore
              : estimateCreditScoreFromBehavior({ creditScoreRange: t.creditScoreRange, engagementScore: t.engagement_score }),
          engagementSignals: t.engagement_score
        })
  );
  const med = medianBuyingPower(powers);
  return tenants.map((t) => enrichTenantToView(t, med));
}
