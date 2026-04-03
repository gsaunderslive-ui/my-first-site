import type { LeadStatus, Tenant } from "@/lib/types";

const LEAD_STATUSES: LeadStatus[] = ["Cold", "Warm", "Hot", "Converted"];

/** STEP 3 — Seed `lead_data` from the live tenant row before each engine step. */
export function buildLeadDataFromTenant(tenant: Tenant): Record<string, unknown> {
  return {
    name: tenant.name,
    tenantId: tenant.id,
    phone: tenant.phone,
    rent: tenant.rentAmount,
    status: tenant.status,
    preApprovalStatus: tenant.preApprovalStatus,
    leadScore: tenant.leadScore,
    estimatedIncome: tenant.estimatedIncome,
    estimatedBuyingPower: tenant.estimatedBuyingPower,
    creditScoreRange: tenant.creditScoreRange
  };
}

/**
 * STEP 6 — Push workflow session `lead_data` back onto the in-memory tenant for persistence.
 * (Tags stay in session only until a `tenants` column exists.)
 */
export function applyLeadDataToTenant(tenant: Tenant, leadData: Record<string, unknown>): void {
  const st = leadData.status;
  if (typeof st === "string" && LEAD_STATUSES.includes(st as LeadStatus)) {
    tenant.status = st as LeadStatus;
  }

  if (leadData.assignedAgent === true) {
    tenant.assignedAgent = true;
    if (typeof leadData.assignedAgentName === "string") tenant.assignedAgentName = leadData.assignedAgentName;
    if (typeof leadData.assignedAgentEmail === "string") tenant.assignedAgentEmail = leadData.assignedAgentEmail;
  }

  const hours = leadData.nextFollowupHours;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    tenant.automationIntervalHours = Math.round(hours);
    tenant.nextScheduledMessage = `Workflow follow-up in ~${Math.round(hours)}h`;
  }
}
