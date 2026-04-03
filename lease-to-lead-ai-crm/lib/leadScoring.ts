import type { PreApprovalStatus } from "./tenantFinancials";

export type LeadTier = "Cold" | "Warm" | "Hot";

/**
 * Spec: +30 recent response, +25 buying convo, +20 high buying power, +15 pre-approved/q,
 * +10 multiple interactions, -20 no response 7+ days.
 * Tier: cold <40, warm 40–69, hot >=70.
 */
export function computeNumericLeadScore(input: {
  lastInteractionAt: Date | null;
  preApprovalStatus: PreApprovalStatus;
  estimatedBuyingPower: number;
  cohortBuyingPowerMedian: number;
  totalInteractions: number;
  hasBuyingIntentSignal: boolean;
}): number {
  let score = 0;

  const now = Date.now();
  const last = input.lastInteractionAt ? input.lastInteractionAt.getTime() : 0;
  const daysSince = last ? (now - last) / (1000 * 60 * 60 * 24) : 999;

  if (!input.lastInteractionAt || daysSince >= 7) {
    score -= 20;
  } else {
    score += 30;
  }

  if (input.hasBuyingIntentSignal) {
    score += 25;
  }

  const med = input.cohortBuyingPowerMedian || 1;
  if (input.estimatedBuyingPower >= med * 1.15) {
    score += 20;
  }

  if (input.preApprovalStatus === "pre-qualified" || input.preApprovalStatus === "pre-approved") {
    score += 15;
  }

  if (input.totalInteractions >= 3) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function tierFromScore(score: number): LeadTier {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}
