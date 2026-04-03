import type { LeadStatus, TenantView } from "./types";
import type { PreApprovalStatus } from "./tenantFinancials";

export const LEAD_STALE_DAYS = 14;

export type LeadSortMode = "priority" | "buying_power" | "lease_ending";

export function formatLeadCurrency(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function formatPreApprovalLabel(p: PreApprovalStatus) {
  if (p === "pre-approved") return "Pre-approved";
  if (p === "pre-qualified") return "Pre-qualified";
  return "—";
}

export function statusPillClass(status: LeadStatus) {
  switch (status) {
    case "Hot":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
    case "Warm":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
    case "Converted":
      return "bg-teal-50 text-teal-800 ring-1 ring-teal-200/80";
    case "Cold":
    default:
      return "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/90";
  }
}

export function computeLeadDashboardKpis(tenants: TenantView[]) {
  const hotLeads = tenants.filter((t) => t.status === "Hot").length;
  const pipelineValue = tenants.reduce((sum, t) => sum + (Number(t.estimatedBuyingPower) || 0), 0);
  const estimatedCommission = pipelineValue * 0.03;
  const activeConversations = tenants.filter((t) => Boolean(t.chatId)).length;
  const conversionReady = tenants.filter(
    (t) =>
      t.preApprovalStatus === "pre-approved" ||
      t.preApprovalStatus === "pre-qualified" ||
      t.status === "Hot" ||
      t.status === "Converted"
  ).length;

  return { hotLeads, pipelineValue, estimatedCommission, activeConversations, conversionReady };
}

/** Lower rank = higher priority (Hot first). */
export function leadStatusPriorityRank(status: LeadStatus): number {
  switch (status) {
    case "Hot":
      return 0;
    case "Warm":
      return 1;
    case "Cold":
      return 2;
    case "Converted":
      return 3;
    default:
      return 2;
  }
}

export function compareLeadsByPriority(a: TenantView, b: TenantView): number {
  const pa = leadStatusPriorityRank(a.status);
  const pb = leadStatusPriorityRank(b.status);
  if (pa !== pb) return pa - pb;
  const ba = Number(a.estimatedBuyingPower) || 0;
  const bb = Number(b.estimatedBuyingPower) || 0;
  if (ba !== bb) return bb - ba;
  return a.monthsRemaining - b.monthsRemaining;
}

export function compareLeadsByBuyingPower(a: TenantView, b: TenantView): number {
  return (Number(b.estimatedBuyingPower) || 0) - (Number(a.estimatedBuyingPower) || 0);
}

export function compareLeadsByLeaseEndingSoon(a: TenantView, b: TenantView): number {
  return a.monthsRemaining - b.monthsRemaining;
}

export function sortLeads(tenants: TenantView[], mode: LeadSortMode): TenantView[] {
  const copy = [...tenants];
  switch (mode) {
    case "buying_power":
      copy.sort(compareLeadsByBuyingPower);
      break;
    case "lease_ending":
      copy.sort(compareLeadsByLeaseEndingSoon);
      break;
    case "priority":
    default:
      copy.sort(compareLeadsByPriority);
  }
  return copy;
}

export function isLeadStaleForFollowUp(t: TenantView): boolean {
  if (!t.lastInteractionAt) return true;
  const tMs = new Date(t.lastInteractionAt).getTime();
  if (!Number.isFinite(tMs)) return true;
  return Date.now() - tMs > LEAD_STALE_DAYS * 86400000;
}

/** Decision order: Hot → pre-approved → stale → monitor. */
export function nextActionLabel(t: TenantView): string {
  if (t.status === "Hot") return "Call now";
  if (t.preApprovalStatus === "pre-approved") return "Schedule showing";
  if (isLeadStaleForFollowUp(t)) return "Follow up";
  return "Monitor";
}
