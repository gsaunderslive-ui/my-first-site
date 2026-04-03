import type { PreApprovalStatus } from "./tenantFinancials";

export type LeadStatus = "Cold" | "Warm" | "Hot" | "Converted";
export type Stage = "Awareness" | "Consideration" | "Intent" | "Action" | "Urgency";
export type LeadStage = "COLD" | "WARM" | "HOT" | "CONVERTED";
export type Channel = "Email" | "SMS" | "AI Call";
export type Engagement = "Opened" | "Clicked" | "Replied" | "No Response";

export type MessageChannel = "sms" | "email" | "in_app";

export type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  leaseStartDate: string;
  leaseEndDate: string;
  rentAmount: number;
  estimatedIncome: number;
  creditScoreRange: string;
  status: LeadStatus;
  stage: LeadStage;
  engagement_score: number;
  consent_status: boolean;
  /** Numeric CRM lead score (0–100) driving Cold/Warm/Hot */
  leadScore: number;
  assignedAgent: boolean;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  lastMessageSent: string;
  nextScheduledMessage: string;
  engagementStatus: Engagement;
  messageHistory: MessageEvent[];
  preApprovalStatus: PreApprovalStatus;
  estimatedCreditScore: number;
  estimatedBuyingPower: number;
  lastInteractionAt: string | null;
  automationEnabled: boolean;
  automationIntervalHours: number | null;
};

export type MessageEvent = {
  id: string;
  timestamp: string;
  channel: Channel;
  action: string;
  outcome: Engagement;
  scoreDelta: number;
  content: string;
};

export type Activity = {
  id: string;
  timestamp: string;
  text: string;
};

export type NotificationItem = {
  id: string;
  timestamp: string;
  text: string;
};

export type TenantView = Tenant & {
  /** Full calendar months elapsed since lease start (0 if unknown or future start). */
  monthsInLease: number;
  monthsRemaining: number;
  automation_stage: Stage;
  aiPreview: string;
  /** Display annual income (actual or rent×3 estimate) */
  displayAnnualIncome: number;
  interestLevel: "low" | "medium" | "high";
  /** Supabase `chats.id` when a thread exists */
  chatId?: string | null;
};

export type Snapshot = {
  tenants: TenantView[];
  activities: Activity[];
  notifications: NotificationItem[];
  kpis: {
    totalTenants: number;
    leadsGenerated: number;
    activeBuyers: number;
    conversionRate: number;
  };
  funnel: Record<Stage, number>;
  /** Median buying power for cohort scoring */
  cohortBuyingPowerMedian: number;
};
