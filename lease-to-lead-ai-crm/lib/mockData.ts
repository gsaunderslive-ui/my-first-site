import { Tenant } from "./types";
import type { PreApprovalStatus } from "./tenantFinancials";

const names = [
  "John Carter", "Sarah Lin", "Marcus Reed", "Priya Shah", "Alicia Gomez", "Daniel Cho",
  "Nina Brooks", "Omar Khan", "Jasmine Bell", "Ethan Price", "Maya Patel", "Tyler Scott",
  "Emily Stone", "Victor Alvarez", "Leah Kim", "Noah Bennett", "Grace Yu", "Chris Jordan",
  "Hannah Lee", "Ryan Cooper", "Isabella Diaz", "Adam Nguyen", "Sofia Rossi", "Liam Parker"
];

const statuses: Tenant["status"][] = ["Cold", "Warm", "Cold", "Warm", "Cold", "Converted"];
const creditRanges = ["620-659", "660-699", "700-739", "740-780"];
const preApprovals: PreApprovalStatus[] = ["none", "none", "pre-qualified", "pre-approved", "none", "pre-qualified"];

function leaseDates(monthsRemaining: number) {
  const end = new Date();
  end.setMonth(end.getMonth() + monthsRemaining);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 12);
  return {
    leaseStartDate: start.toISOString(),
    leaseEndDate: end.toISOString()
  };
}

export function seedTenants(): Tenant[] {
  const monthPattern = [8, 6, 5, 4, 3, 2, 1, 7, 5, 2, 4, 3, 1, 6, 8, 2, 3, 5, 1, 4, 7, 2, 6, 3];

  return names.map((name, i) => {
    const months = monthPattern[i % monthPattern.length];
    const { leaseStartDate, leaseEndDate } = leaseDates(months);
    const firstName = name.split(" ")[0];
    const rentAmount = 1650 + (i % 8) * 130;
    const estimatedIncome = 52000 + (i % 7) * 8500;

    return {
      id: `tenant-${i + 1}`,
      name,
      email: `${firstName.toLowerCase()}.${i + 1}@demo-resident.com`,
      phone: `555-01${String(i + 10).padStart(2, "0")}`,
      leaseStartDate,
      leaseEndDate,
      rentAmount,
      estimatedIncome,
      creditScoreRange: creditRanges[i % creditRanges.length],
      status: statuses[i % statuses.length],
      stage: "COLD",
      engagement_score: i % 6,
      consent_status: i % 5 !== 0,
      leadScore: 0,
      assignedAgent: false,
      assignedAgentName: "",
      assignedAgentEmail: "",
      lastMessageSent: "Welcome nurture email",
      nextScheduledMessage: "Lease options summary",
      engagementStatus: "No Response",
      messageHistory: [],
      preApprovalStatus: preApprovals[i % preApprovals.length],
      estimatedCreditScore: 0,
      estimatedBuyingPower: 0,
      lastInteractionAt: new Date(Date.now() - (i % 10) * 86400000).toISOString(),
      automationEnabled: true,
      automationIntervalHours: 72
    };
  });
}
