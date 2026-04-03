import { interpolatePlaybookSms } from "./playbookInterpolate";
import type { PlaybookDefaults } from "./playbookSchema";
import type { Tenant } from "./types";

function monthsBetween(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months + (end.getDate() >= start.getDate() ? 0 : -1));
}

function leaseProgressMonths(tenant: Tenant) {
  const now = new Date();
  const leaseStart = tenant.leaseStartDate || "";
  const leaseEnd = tenant.leaseEndDate || "";
  if (!leaseStart || !leaseEnd) {
    return { total: 12, elapsed: 0, remaining: 12 };
  }
  const total = Math.max(1, monthsBetween(leaseStart, leaseEnd));
  const elapsed = Math.min(total, monthsBetween(leaseStart, now.toISOString()));
  return { total, elapsed, remaining: Math.max(0, total - elapsed) };
}

function timelineStageFromElapsed(elapsed: number) {
  if (elapsed >= 10) return "action";
  if (elapsed >= 9) return "intent";
  if (elapsed >= 6) return "qualification";
  if (elapsed >= 3) return "consideration";
  return "awareness";
}

function normalizeCredit(tenant: Tenant) {
  if (tenant.estimatedCreditScore > 0) return tenant.estimatedCreditScore;
  const raw = tenant.creditScoreRange || "";
  const match = String(raw).match(/\d{3}/);
  return match ? Number(match[0]) : 620;
}

function monthlyRent(tenant: Tenant) {
  return tenant.rentAmount || 0;
}

export type ProcessLeadResult = {
  workflowStage: string;
  trigger: string;
  elapsedMonths: number;
  remainingMonths: number;
  template: string;
  /** Dot path for admin debugging / message metadata, e.g. leaseTimeline.elapsed3to5 */
  playbookTemplateKey: string;
};

export function processLead(tenant: Tenant, playbook: PlaybookDefaults): ProcessLeadResult {
  const { elapsed, remaining, total } = leaseProgressMonths(tenant);
  const credit = normalizeCredit(tenant);
  const rent = monthlyRent(tenant);
  const tl = playbook.leaseTimeline || {};
  const workflowStage = timelineStageFromElapsed(elapsed);

  let trigger = "standard";
  let rawTemplate = "";
  let playbookTemplateKey = "leaseTimeline.welcome";

  if (elapsed >= 10) {
    trigger = "month_10";
    playbookTemplateKey = "leaseTimeline.elapsed10plus";
    rawTemplate = tl.elapsed10plus || "";
  } else if (elapsed >= 9) {
    trigger = "month_9";
    playbookTemplateKey = "leaseTimeline.elapsed9";
    rawTemplate = tl.elapsed9 || "";
  } else if (elapsed >= 7.5) {
    trigger = "month_8_credit_split";
    if (credit < 600) {
      playbookTemplateKey = "leaseTimeline.elapsed8creditLow";
      rawTemplate = tl.elapsed8creditLow || "";
    } else {
      playbookTemplateKey = "leaseTimeline.elapsed8creditOk";
      rawTemplate = tl.elapsed8creditOk || "";
    }
  } else if (elapsed >= 6) {
    trigger = "month_6";
    playbookTemplateKey = "leaseTimeline.elapsed6to7";
    rawTemplate = tl.elapsed6to7 || "";
  } else if (elapsed >= 3) {
    trigger = "month_3";
    playbookTemplateKey = "leaseTimeline.elapsed3to5";
    rawTemplate = tl.elapsed3to5 || "";
  } else {
    trigger = "welcome";
    playbookTemplateKey = "leaseTimeline.welcome";
    rawTemplate = tl.welcome || "";
  }

  const template = interpolatePlaybookSms(rawTemplate, {
    name: tenant.name,
    elapsedMonths: elapsed,
    remainingMonths: remaining,
    totalLeaseMonths: total,
    rent
  });

  return {
    workflowStage,
    trigger,
    elapsedMonths: elapsed,
    remainingMonths: remaining,
    template,
    playbookTemplateKey
  };
}

export type IncomingReplyResult = {
  workflowStage: string;
  tags: string[];
  nextTemplate: string;
  eventType: string;
  route: string;
  playbookTemplateKey: string;
};

export function handleIncomingReply(tenant: Tenant, message: string, playbook: PlaybookDefaults): IncomingReplyResult {
  const text = String(message || "").trim().toUpperCase();
  const credit = normalizeCredit(tenant);
  const ir = playbook.inboundReplies || {};

  const result: IncomingReplyResult = {
    workflowStage: "awareness",
    tags: [],
    nextTemplate: ir.defaultReply || "",
    eventType: "reply",
    route: "nurture",
    playbookTemplateKey: "inboundReplies.defaultReply"
  };

  if (text.includes("BUY")) {
    result.workflowStage = "consideration";
    result.tags.push("Future_Buyer");
    result.nextTemplate = ir.afterBuy || result.nextTemplate;
    result.playbookTemplateKey = "inboundReplies.afterBuy";
  }

  if (text.includes("YES")) {
    result.workflowStage = "qualification";
    result.tags.push("Qualified_Interest");
    result.nextTemplate = ir.afterYes || result.nextTemplate;
    result.playbookTemplateKey = "inboundReplies.afterYes";
  }

  if (credit < 600) {
    result.route = "credit_repair";
    result.tags.push("Credit_Repair");
    result.nextTemplate = ir.creditBelow600 || result.nextTemplate;
    result.playbookTemplateKey = "inboundReplies.creditBelow600";
  } else if (credit > 660) {
    result.route = "lender_flow";
    result.tags.push("Lender_Ready");
    result.nextTemplate = ir.creditAbove660 || result.nextTemplate;
    result.playbookTemplateKey = "inboundReplies.creditAbove660";
  }

  return result;
}
