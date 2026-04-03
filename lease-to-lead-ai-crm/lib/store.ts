import { seedTenants } from "./mockData";
import {
  Activity,
  Channel,
  Engagement,
  LeadStage,
  MessageEvent,
  NotificationItem,
  Snapshot,
  Stage,
  Tenant,
  TenantView
} from "./types";
import { calculateStage, updateScore } from "./leadEngine";
import { generateRandomEngagementEvent, normalizeEventType } from "./integrations/ylopo";
import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  formatWorkflowMessage,
  generateSimulateInboundAssistantReply,
  generateTenantMessage,
  isOpenAiEnabled
} from "./openai";
import { isTwilioDemoMode, normalizePhone, sendSms } from "./twilio";
import { getDefaultCompanyId } from "./crmBootstrap";
import {
  getChatById,
  getChatIdsByTenantIds,
  getOrCreateChatForTenant,
  insertChatMessage,
  insertWorkflowEvent,
  setChatControlMode
} from "./chatDb";
import { interpolatePlaybookSms } from "./playbookInterpolate";
import { emptyPlaybookDefaults, type PlaybookDefaults } from "./playbookSchema";
import { getPlaybookForCompany } from "./playbookDb";
import { mergeAutomationPlaybookDefaults } from "./playbookStarter";
import { handleIncomingReply, processLead } from "./workflowEngine";
import { buildTenantViews, medianBuyingPower } from "./tenantEnrichment";
import { tryEngageOpenVisualPlaybook, tryInboundVisualPlaybook } from "./visualPlaybook/smsIntegration";

type Store = {
  tenants: Tenant[];
  activities: Activity[];
  notifications: NotificationItem[];
};

type TenantRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  lease_start_date: string;
  lease_end_date: string;
  rent_amount: number;
  estimated_income: number;
  credit_score_range: string;
  status: Tenant["status"];
  stage: LeadStage;
  engagement_score: number;
  consent_status: boolean;
  lead_score: number;
  assigned_agent: boolean;
  assigned_agent_name: string | null;
  assigned_agent_email: string | null;
  last_message_sent: string;
  next_scheduled_message: string;
  engagement_status: Engagement;
  pre_approval_status?: string | null;
  estimated_credit_score?: number | null;
  estimated_buying_power?: number | null;
  last_interaction_at?: string | null;
  automation_enabled?: boolean | null;
  automation_interval_hours?: number | null;
};

type MessageEventRow = {
  id: string;
  tenant_id: string;
  timestamp: string;
  channel: Channel;
  action: string;
  outcome: Engagement;
  score_delta: number;
  content: string;
  external_id: string | null;
};

const store: Store = {
  tenants: [],
  activities: [],
  notifications: []
};

let initialized = false;
let initializePromise: Promise<void> | null = null;
const demoConversationTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
let demoStartupResetDone = false;

function statusFromLeadStage(stage: LeadStage): Tenant["status"] {
  if (stage === "HOT") return "Hot";
  if (stage === "WARM") return "Warm";
  if (stage === "CONVERTED") return "Converted";
  return "Cold";
}

export function monthsRemaining(leaseEndDate: string) {
  const now = new Date();
  const end = new Date(leaseEndDate);
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, months + (end.getDate() >= now.getDate() ? 0 : -1));
}

export function stageForMonths(months: number): Stage {
  if (months >= 6) return "Awareness";
  if (months >= 4) return "Consideration";
  if (months === 3) return "Intent";
  if (months === 2) return "Action";
  return "Urgency";
}

export function personalizedMessage(tenant: Tenant, stage: Stage) {
  const firstName = tenant.name.split(" ")[0];
  return `Hi ${firstName}, you're currently paying $${tenant.rentAmount.toLocaleString()} in rent. Based on your profile, you may qualify to own a home nearby for a similar monthly cost.`;
}

function randomOutcome(channel: Channel): Engagement {
  const roll = Math.random();
  if (channel === "AI Call") {
    if (roll > 0.7) return "Replied";
    if (roll > 0.4) return "Clicked";
    return "No Response";
  }
  if (channel === "SMS") {
    if (roll > 0.72) return "Replied";
    if (roll > 0.45) return "Clicked";
    return "No Response";
  }
  if (roll > 0.8) return "Replied";
  if (roll > 0.5) return "Clicked";
  if (roll > 0.2) return "Opened";
  return "No Response";
}

function toEventType(outcome: Engagement) {
  if (outcome === "Opened") return "open";
  if (outcome === "Clicked") return "click";
  if (outcome === "Replied") return "reply";
  return null;
}

function scoreDeltaFromEvent(eventType: "open" | "click" | "reply") {
  if (eventType === "open") return 1;
  if (eventType === "click") return 3;
  return 5;
}

function rowToTenant(row: TenantRow, messageHistory: MessageEvent[]): Tenant {
  const pre = String((row as any).pre_approval_status || "none").toLowerCase();
  const preApproval =
    pre === "pre-approved" || pre === "preapproved"
      ? ("pre-approved" as const)
      : pre === "pre-qualified" || pre === "prequalified"
        ? ("pre-qualified" as const)
        : ("none" as const);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    leaseStartDate: row.lease_start_date,
    leaseEndDate: row.lease_end_date,
    rentAmount: row.rent_amount,
    estimatedIncome: row.estimated_income,
    creditScoreRange: row.credit_score_range,
    status: row.status,
    stage: row.stage,
    engagement_score: row.engagement_score,
    consent_status: row.consent_status,
    leadScore: row.lead_score,
    assignedAgent: row.assigned_agent,
    assignedAgentName: row.assigned_agent_name || "",
    assignedAgentEmail: row.assigned_agent_email || "",
    lastMessageSent: row.last_message_sent,
    nextScheduledMessage: row.next_scheduled_message,
    engagementStatus: row.engagement_status,
    messageHistory,
    preApprovalStatus: preApproval,
    estimatedCreditScore: Number((row as any).estimated_credit_score) || 0,
    estimatedBuyingPower: Number((row as any).estimated_buying_power) || 0,
    lastInteractionAt: (row as any).last_interaction_at ? String((row as any).last_interaction_at) : null,
    automationEnabled: (row as any).automation_enabled !== false,
    automationIntervalHours:
      (row as any).automation_interval_hours != null ? Number((row as any).automation_interval_hours) : 72
  };
}

function tenantToRow(tenant: Tenant): TenantRow {
  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone,
    lease_start_date: tenant.leaseStartDate,
    lease_end_date: tenant.leaseEndDate,
    rent_amount: tenant.rentAmount,
    estimated_income: tenant.estimatedIncome,
    credit_score_range: tenant.creditScoreRange,
    status: tenant.status,
    stage: tenant.stage,
    engagement_score: tenant.engagement_score,
    consent_status: tenant.consent_status,
    lead_score: tenant.leadScore,
    assigned_agent: tenant.assignedAgent,
    assigned_agent_name: tenant.assignedAgentName || null,
    assigned_agent_email: tenant.assignedAgentEmail || null,
    last_message_sent: tenant.lastMessageSent,
    next_scheduled_message: tenant.nextScheduledMessage,
    engagement_status: tenant.engagementStatus,
    pre_approval_status: tenant.preApprovalStatus,
    estimated_credit_score: tenant.estimatedCreditScore || null,
    estimated_buying_power: tenant.estimatedBuyingPower || null,
    last_interaction_at: tenant.lastInteractionAt,
    automation_enabled: tenant.automationEnabled,
    automation_interval_hours: tenant.automationIntervalHours
  };
}

function eventRowToMessageEvent(row: MessageEventRow): MessageEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    channel: row.channel,
    action: row.action,
    outcome: row.outcome,
    scoreDelta: row.score_delta,
    content: row.content
  };
}

function messageEventToRow(tenantId: string, event: MessageEvent, externalId?: string): MessageEventRow {
  return {
    id: event.id,
    tenant_id: tenantId,
    timestamp: event.timestamp,
    channel: event.channel,
    action: event.action,
    outcome: event.outcome,
    score_delta: event.scoreDelta,
    content: event.content,
    external_id: externalId || null
  };
}

function initializeTenantState(tenant: Tenant) {
  const baseStage = calculateStage(tenant.leaseEndDate) as LeadStage;
  const wasHot = tenant.engagement_score > 5;
  tenant.stage = wasHot ? "HOT" : baseStage;
  tenant.status = statusFromLeadStage(tenant.stage);
  tenant.leadScore = tenant.engagement_score;
  tenant.engagementStatus = tenant.engagementStatus || "No Response";
}

function loadFallbackStore() {
  const tenants = seedTenants();
  tenants.forEach(initializeTenantState);

  store.tenants = tenants;
  store.activities = [
    { id: "a1", timestamp: new Date().toISOString(), text: "John clicked email: First-Time Buyer Guide" },
    { id: "a2", timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(), text: "Sarah replied YES to SMS campaign" },
    { id: "a3", timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(), text: "Marcus opened affordability email" }
  ];
  store.notifications = [
    { id: "n1", timestamp: new Date().toISOString(), text: "New lead generated from urgency campaign" },
    { id: "n2", timestamp: new Date(Date.now() - 1000 * 60 * 11).toISOString(), text: "Tenant clicked mortgage calculator link" }
  ];
}

async function persistTenant(tenant: Tenant) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("tenants").upsert(tenantToRow(tenant));
  if (error) {
    console.error("[store] persistTenant failed", { tenantId: tenant.id, error: error.message });
  }
}

async function persistTenants(tenants: Tenant[]) {
  const supabase = getSupabaseAdmin();
  if (!supabase || tenants.length === 0) return;

  const { error } = await supabase.from("tenants").upsert(tenants.map(tenantToRow));
  if (error) {
    console.error("[store] persistTenants failed", { count: tenants.length, error: error.message });
  }
}

async function persistMessageEvent(tenantId: string, event: MessageEvent, externalId?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("message_events").insert(messageEventToRow(tenantId, event, externalId));
}

async function pushActivity(text: string) {
  const activity: Activity = {
    id: `a-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    text
  };

  store.activities.unshift(activity);
  store.activities = store.activities.slice(0, 20);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("activities").insert(activity);
  }
}

async function pushNotification(text: string) {
  const notification: NotificationItem = {
    id: `n-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    text
  };

  store.notifications.unshift(notification);
  store.notifications = store.notifications.slice(0, 8);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("notifications").insert(notification);
  }
}

async function triggerAutomation(tenant: Tenant, reason: "created" | "updated") {
  if (!tenant.consent_status) {
    await pushActivity(`${tenant.name} has no consent. Automation skipped.`);
    return;
  }

  const autoStage = stageForMonths(monthsRemaining(tenant.leaseEndDate));
  tenant.lastMessageSent = `Email + SMS (${reason}) - ${autoStage}`;
  tenant.nextScheduledMessage = `${autoStage} follow-up in 3 days`;
  await pushActivity(`Automation sent to ${tenant.name}: mock email + SMS (${reason})`);
}

async function appendOutboundMessage(
  tenant: Tenant,
  channel: Channel,
  content: string,
  source: string,
  externalId?: string
) {
  const event: MessageEvent = {
    id: `m-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    channel,
    action: `${source} Outbound`,
    outcome: "No Response",
    scoreDelta: 0,
    content
  };

  tenant.messageHistory.unshift(event);
  tenant.messageHistory = tenant.messageHistory.slice(0, 30);
  await persistMessageEvent(tenant.id, event, externalId);

  return event;
}

async function applyEngagementEvent(tenant: Tenant, eventType: "open" | "click" | "reply", source: string) {
  const beforeStage = tenant.stage;
  tenant.engagement_score = updateScore(eventType, tenant.engagement_score);
  tenant.leadScore = tenant.engagement_score;

  const baseStage = calculateStage(tenant.leaseEndDate) as LeadStage;
  tenant.stage = tenant.engagement_score > 5 ? "HOT" : baseStage;
  tenant.status = statusFromLeadStage(tenant.stage);

  const autoStage = stageForMonths(monthsRemaining(tenant.leaseEndDate));
  const outcome: Engagement = eventType === "open" ? "Opened" : eventType === "click" ? "Clicked" : "Replied";
  const scoreDelta = scoreDeltaFromEvent(eventType);

  const event: MessageEvent = {
    id: `m-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    channel: source === "Ylopo" ? "Email" : "AI Call",
    action: `${source} Engagement`,
    outcome,
    scoreDelta,
    content: personalizedMessage(tenant, autoStage)
  };

  tenant.messageHistory.unshift(event);
  tenant.messageHistory = tenant.messageHistory.slice(0, 30);
  tenant.engagementStatus = outcome;

  await persistMessageEvent(tenant.id, event);
  await pushActivity(`${tenant.name} ${eventType} event from ${source}`);
  await triggerAutomation(tenant, "updated");

  if (tenant.stage === "HOT" && beforeStage !== "HOT") {
    await pushNotification(`New lead generated: ${tenant.name} is now HOT`);
  }

  await persistTenant(tenant);
  return event;
}

async function bootstrapFromSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    loadFallbackStore();
    return;
  }

  if (isTwilioDemoMode() && !demoStartupResetDone) {
    const { data: testTenantRows } = await supabase
      .from("tenants")
      .select("id")
      .like("id", "tenant-test-%")
      .limit(1000);
    const testTenantIds = (testTenantRows || []).map((row: any) => String(row.id));
    if (testTenantIds.length > 0) {
      await supabase.from("workflow_events").delete().in("tenant_id", testTenantIds);
      await supabase.from("messages").delete().in("tenant_id", testTenantIds);
      await supabase.from("chats").delete().in("tenant_id", testTenantIds);
    }
    demoStartupResetDone = true;
  }

  const [{ data: tenantRows, error: tenantError }, { data: eventRows }, { data: activities }, { data: notifications }] =
    await Promise.all([
      supabase.from("tenants").select("*").order("id", { ascending: true }),
      supabase.from("message_events").select("*").order("timestamp", { ascending: false }),
      supabase.from("activities").select("*").order("timestamp", { ascending: false }).limit(20),
      supabase.from("notifications").select("*").order("timestamp", { ascending: false }).limit(8)
    ]);

  if (tenantError) {
    loadFallbackStore();
    return;
  }

  if (!tenantRows || tenantRows.length === 0) {
    const seeded = seedTenants();
    seeded.forEach(initializeTenantState);
    store.tenants = seeded;
    store.activities = [];
    store.notifications = [];

    await persistTenants(seeded);
    await pushActivity("Seeded tenants into Supabase");
    await pushNotification("Supabase initialized with demo tenant data");
    return;
  }

  const expectedDemoCount = seedTenants().length;
  const existingIds = new Set((tenantRows as TenantRow[]).map((row) => row.id));
  const looksLikeDemoData =
    (tenantRows as TenantRow[]).every((row) => row.id.startsWith("tenant-")) ||
    (tenantRows as TenantRow[]).length === 0;
  if (looksLikeDemoData && tenantRows.length < expectedDemoCount) {
    const missing = seedTenants().filter((tenant) => !existingIds.has(tenant.id));
    if (missing.length > 0) {
      missing.forEach(initializeTenantState);
      await persistTenants(missing);
      const { data: refetchedRows } = await supabase
        .from("tenants")
        .select("*")
        .order("id", { ascending: true });
      if (refetchedRows) {
        tenantRows.splice(0, tenantRows.length, ...(refetchedRows as any));
      }
    }
  }

  const groupedEvents = new Map<string, MessageEvent[]>();
  for (const row of (eventRows || []) as MessageEventRow[]) {
    const messageEvent = eventRowToMessageEvent(row);
    const list = groupedEvents.get(row.tenant_id) || [];
    list.push(messageEvent);
    groupedEvents.set(row.tenant_id, list.slice(0, 30));
  }

  store.tenants = (tenantRows as TenantRow[]).map((row) => {
    const tenant = rowToTenant(row, groupedEvents.get(row.id) || []);
    initializeTenantState(tenant);
    return tenant;
  });
  store.activities = ((activities || []) as Activity[]).slice(0, 20);
  store.notifications = ((notifications || []) as NotificationItem[]).slice(0, 8);
}

async function ensureInitialized() {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    await bootstrapFromSupabase();
    initialized = true;
  })();

  return initializePromise;
}

async function automationPlaybook(): Promise<PlaybookDefaults> {
  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return mergeAutomationPlaybookDefaults(emptyPlaybookDefaults());
  }
  const { defaults } = await getPlaybookForCompany(companyId);
  return mergeAutomationPlaybookDefaults(defaults);
}

function workflowFormatOptions(playbook: PlaybookDefaults) {
  return { allowOpenAiPolish: playbook.leaseTimeline?.useOpenAiPolish === true };
}

function findTenantById(id: string) {
  return store.tenants.find((tenant) => tenant.id === id) || null;
}

function findTenantByPhone(phone: string) {
  const target = normalizePhone(phone);
  if (!target) return null;

  return (
    store.tenants.find((tenant) => {
      return normalizePhone(tenant.phone) === target;
    }) || null
  );
}

function clearDemoConversationTimers(tenantId: string) {
  const timers = demoConversationTimers.get(tenantId) || [];
  for (const timer of timers) {
    clearTimeout(timer);
  }
  demoConversationTimers.delete(tenantId);
}

function scheduleDemoBuyerConversation(tenant: Tenant, messages: string[], intervalMs = 5000) {
  clearDemoConversationTimers(tenant.id);
  const timers: ReturnType<typeof setTimeout>[] = [];

  messages.forEach((message, index) => {
    const delay = intervalMs * (index + 1);
    const timer = setTimeout(() => {
      void handleTwilioInboundWebhook({
        from: tenant.phone,
        body: message,
        messageSid: `SM-DEMO-${tenant.id}-${Date.now()}-${index + 1}`
      });
    }, delay);
    timers.push(timer);
  });

  demoConversationTimers.set(tenant.id, timers);
}

export function getTenantViews(): TenantView[] {
  return buildTenantViews(store.tenants);
}

export async function getSnapshot(): Promise<Snapshot> {
  await ensureInitialized();

  const tenantViews = getTenantViews();
  const chatMap = await getChatIdsByTenantIds(tenantViews.map((t) => t.id));
  const tenantsWithChats: TenantView[] = tenantViews.map((t) => ({
    ...t,
    chatId: chatMap[t.id] ?? null
  }));

  const totalTenants = tenantsWithChats.length;
  const leadsGenerated = tenantsWithChats.filter((tenant) => tenant.engagement_score > 0).length;
  const activeBuyers = tenantsWithChats.filter((tenant) => tenant.status === "Hot" || tenant.status === "Converted").length;
  const converted = tenantsWithChats.filter((tenant) => tenant.status === "Converted").length;

  const funnel: Record<Stage, number> = {
    Awareness: tenantsWithChats.filter((tenant) => tenant.automation_stage === "Awareness").length,
    Consideration: tenantsWithChats.filter((tenant) => tenant.automation_stage === "Consideration").length,
    Intent: tenantsWithChats.filter((tenant) => tenant.automation_stage === "Intent").length,
    Action: tenantsWithChats.filter((tenant) => tenant.automation_stage === "Action").length,
    Urgency: tenantsWithChats.filter((tenant) => tenant.automation_stage === "Urgency").length
  };

  const cohortBuyingPowerMedian = medianBuyingPower(
    tenantsWithChats.map((t) => t.estimatedBuyingPower).filter((n) => n > 0)
  );

  return {
    tenants: tenantsWithChats,
    activities: store.activities,
    notifications: store.notifications,
    kpis: {
      totalTenants,
      leadsGenerated,
      activeBuyers,
      conversionRate: totalTenants > 0 ? Number(((converted / totalTenants) * 100).toFixed(1)) : 0
    },
    funnel,
    cohortBuyingPowerMedian
  };
}

export async function engageTenant(id: string, channel: Channel) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  const playbook = await automationPlaybook();
  const fmtOpts = workflowFormatOptions(playbook);

  if (!tenant.consent_status) {
    await pushNotification(`Messaging blocked for ${tenant.name}. Consent is disabled.`);
    return {
      blocked: true,
      reason: "No consent"
    };
  }

  const autoStage = stageForMonths(monthsRemaining(tenant.leaseEndDate));
  const workflow = processLead(tenant, playbook);
  let usedVisualEngageOpen = false;
  let engageVisualNodeKey: string | undefined;
  const draft =
    channel === "SMS"
      ? await (async () => {
          const v = await tryEngageOpenVisualPlaybook({ tenant });
          if (v.mode === "visual" && v.ok && v.assistantMessages.length > 0) {
            usedVisualEngageOpen = true;
            engageVisualNodeKey = v.currentNodeKey;
            return {
              text: v.assistantMessages.join("\n\n"),
              source: "visual_playbook" as const
            };
          }
          return formatWorkflowMessage(tenant, workflow.template, workflow.workflowStage, fmtOpts);
        })()
      : await generateTenantMessage(tenant, autoStage);
  let chatId: string | null = null;
  let chatControlMode: "ai" | "human" = "ai";

  let smsDelivery: Awaited<ReturnType<typeof sendSms>> | null = null;
  if (channel === "SMS") {
    const shouldResetTestConversation = isTwilioDemoMode() && tenant.id.startsWith("tenant-test-");
    if (shouldResetTestConversation) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        await supabase.from("workflow_events").delete().eq("tenant_id", tenant.id);
        await supabase.from("messages").delete().eq("tenant_id", tenant.id);
        await supabase.from("chats").delete().eq("tenant_id", tenant.id);
      }
      tenant.messageHistory = [];
      clearDemoConversationTimers(tenant.id);
    }

    const chat = await getOrCreateChatForTenant(tenant.id);
    chatId = chat?.id || null;
    chatControlMode = chat?.control_mode || "ai";
    if (!chatId) {
      await pushNotification(`Chat creation failed for ${tenant.name}. Message was not sent.`);
      return {
        blocked: true,
        reason: "Chat creation failed in Supabase"
      };
    }

    const inserted = await insertChatMessage({
      chatId,
      tenantId: tenant.id,
      content: draft.text,
      direction: "outbound",
      sender: "ai",
      status: chatControlMode === "human" ? "draft" : "sent",
      metadata:
        chatControlMode === "human"
          ? {
              source: usedVisualEngageOpen ? "engage_visual_open_assisted" : "engage_sms_assisted",
              draft: true,
              playbook_template_key: usedVisualEngageOpen ? "visual_playbook.open" : workflow.playbookTemplateKey
            }
          : {
              source: usedVisualEngageOpen ? "engage_visual_open" : "engage_sms",
              playbook_template_key: usedVisualEngageOpen ? "visual_playbook.open" : workflow.playbookTemplateKey
            },
      messageChannel: "sms"
    });
    if (!inserted) {
      await pushNotification(`Message save failed for ${tenant.name}. SMS skipped.`);
      return {
        blocked: true,
        reason: "Message insert failed in Supabase"
      };
    }

    if (chatControlMode === "human") {
      smsDelivery = {
        ok: true,
        sid: `DRAFT_${crypto.randomUUID()}`,
        to: normalizePhone(tenant.phone),
        status: "draft",
        mode: "demo" as const
      };
      await pushNotification(`AI draft saved for ${tenant.name} (AI-Assisted). Send from Communication Dashboard.`);
    } else {
      smsDelivery = await sendSms(tenant.phone, draft.text);
      if (!smsDelivery.ok) {
        await pushNotification(`SMS delivery failed for ${tenant.name}: ${smsDelivery.reason}`);
      } else if (smsDelivery.mode === "demo") {
        await pushActivity(`Demo SMS simulated for ${tenant.name} (${smsDelivery.to})`);
      }
    }

    tenant.lastInteractionAt = new Date().toISOString();

    await insertWorkflowEvent({
      tenantId: tenant.id,
      eventType: usedVisualEngageOpen ? "visual_playbook_open" : "timeline_trigger",
      metadata: usedVisualEngageOpen
        ? { playbook_template_key: "visual_playbook.open", current_node_key: engageVisualNodeKey ?? null }
        : {
            trigger: workflow.trigger,
            workflow_stage: workflow.workflowStage,
            elapsed_months: workflow.elapsedMonths,
            remaining_months: workflow.remainingMonths,
            playbook_template_key: workflow.playbookTemplateKey
          }
    });
  }

  const outbound = await appendOutboundMessage(
    tenant,
    channel,
    draft.text,
    channel === "SMS" ? (isTwilioDemoMode() ? "Twilio Demo" : "Twilio") : "Automation",
    smsDelivery && smsDelivery.ok ? smsDelivery.sid : undefined
  );

  tenant.lastMessageSent = `${channel}${
    draft.source === "openai" ? " (OpenAI)" : draft.source === "visual_playbook" ? " (Visual)" : " (Template)"
  }`;
  tenant.nextScheduledMessage = `${channel} follow-up in 4 days`;

  const isGrahamDemoConversation =
    channel === "SMS" &&
    Boolean(chatId) &&
    smsDelivery?.ok &&
    smsDelivery.mode === "demo" &&
    tenant.name.trim().toLowerCase() === "graham saunders";
  if (isGrahamDemoConversation) {
    scheduleDemoBuyerConversation(
      tenant,
      [
        "BUY",
        "YES",
        "I can put about 5% down and my credit is around 680.",
        "Can we look at homes under 450k in my area?"
      ],
      5000
    );

    await pushActivity(`Demo buyer conversation scheduled for ${tenant.name} with 5-second intervals`);
    await persistTenant(tenant);
    return {
      blocked: false,
      outbound,
      delivery: smsDelivery,
      chat_id: chatId,
      demo_conversation: true
    };
  }

  const outcome =
    channel === "SMS" && smsDelivery?.ok && smsDelivery.mode === "demo"
      ? "Replied"
      : randomOutcome(channel);
  const eventType = toEventType(outcome);

  if (!eventType) {
    tenant.engagementStatus = "No Response";
    await persistTenant(tenant);
    await pushActivity(`${tenant.name} did not respond to ${channel}`);

    return {
      blocked: false,
      reason: "No response",
      outbound,
      delivery: smsDelivery,
      chat_id: chatId
    };
  }

  if (channel === "SMS" && eventType === "reply" && chatId) {
    const simulatedInboundText = "Yes, I am interested. Can you share details?";
    await insertChatMessage({
      chatId,
      tenantId: tenant.id,
      content: simulatedInboundText,
      direction: "inbound"
    });

    const replyOutcome = handleIncomingReply(tenant, simulatedInboundText, playbook);
    const replyInterpolated = interpolatePlaybookSms(replyOutcome.nextTemplate, {
      name: tenant.name,
      rent: tenant.rentAmount
    });
    await insertWorkflowEvent({
      tenantId: tenant.id,
      eventType: "reply",
      metadata: {
        source: "simulated_reply",
        raw_message: simulatedInboundText,
        workflow_stage: replyOutcome.workflowStage,
        route: replyOutcome.route,
        tags: replyOutcome.tags,
        playbook_template_key: replyOutcome.playbookTemplateKey
      }
    });

    if (chatControlMode === "ai") {
      const next = await formatWorkflowMessage(tenant, replyInterpolated, replyOutcome.workflowStage, fmtOpts);
      await insertChatMessage({
        chatId,
        tenantId: tenant.id,
        content: next.text,
        direction: "outbound",
        sender: "ai",
        status: "sent",
        metadata: {
          source: "workflow_auto_reply_simulated",
          playbook_template_key: replyOutcome.playbookTemplateKey
        }
      });
    }
  }

  const event = await applyEngagementEvent(tenant, eventType, channel);
  return {
    blocked: false,
    outbound,
    event,
    delivery: smsDelivery,
    chat_id: chatId
  };
}

export async function simulateYlopoEngagement(id: string) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  const eventType = generateRandomEngagementEvent() as "open" | "click" | "reply";
  return applyEngagementEvent(tenant, eventType, "Ylopo");
}

export async function updateTenantAutomation(
  id: string,
  input: { automationEnabled?: boolean; automationIntervalHours?: number | null }
) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;
  if (typeof input.automationEnabled === "boolean") {
    tenant.automationEnabled = input.automationEnabled;
  }
  if (input.automationIntervalHours !== undefined) {
    tenant.automationIntervalHours = input.automationIntervalHours;
  }
  await persistTenant(tenant);
  return { ok: true as const };
}

export async function updateConsentStatus(id: string, consent: boolean) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  tenant.consent_status = consent;
  await pushActivity(`${tenant.name} consent status updated: ${consent ? "opt-in" : "opt-out"}`);

  if (!consent) {
    tenant.nextScheduledMessage = "Messaging disabled (opt-out)";
  } else {
    await triggerAutomation(tenant, "updated");
  }

  await persistTenant(tenant);
  return { ok: true, consent_status: tenant.consent_status };
}

export async function scheduleReminder(id: string, date: string, time: string) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  const when = `${date} ${time}`.trim();
  tenant.nextScheduledMessage = `Call reminder: ${when}`;
  await pushActivity(`Reminder scheduled for ${tenant.name} at ${when}`);
  await pushNotification(`Call reminder saved for ${tenant.name}`);
  await persistTenant(tenant);

  return { ok: true, nextScheduledMessage: tenant.nextScheduledMessage };
}

export async function handleEngagementWebhook(leadId: string, eventType: string, meta?: { message?: string }) {
  await ensureInitialized();
  const tenant = findTenantById(leadId);
  if (!tenant) return null;

  const normalized = normalizeEventType(eventType) as "open" | "click" | "reply" | null;
  if (!normalized) return null;

  if (normalized === "reply" && String(meta?.message || "").trim().toUpperCase() === "STOP") {
    tenant.consent_status = false;
    tenant.nextScheduledMessage = "Messaging disabled (opt-out)";
    await pushNotification(`${tenant.name} replied STOP. Consent disabled.`);
    await pushActivity(`${tenant.name} opted out via STOP reply`);
    await persistTenant(tenant);
    return { ok: true, optOut: true };
  }

  return applyEngagementEvent(tenant, normalized, "Webhook");
}

export async function markTenantAsHot(id: string) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  tenant.stage = "HOT";
  tenant.status = "Hot";
  tenant.engagement_score = Math.max(tenant.engagement_score, 8);
  tenant.leadScore = tenant.engagement_score;
  await persistTenant(tenant);
  await pushActivity(`${tenant.name} marked as a hot lead from the dashboard`);
  await pushNotification(`${tenant.name} is now marked Hot`);
  return { ok: true };
}

export async function assignHotLead(id: string, type: "assign" | "schedule") {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  const firstName = tenant.name.split(" ")[0];

  if (type === "assign") {
    tenant.assignedAgent = true;
    await persistTenant(tenant);
    await pushActivity(`${firstName} assigned to a buyer specialist`);
    await pushNotification(`Agent assignment complete for ${tenant.name}`);
    return { ok: true, action: "assigned" };
  }

  await pushActivity(`Call scheduled with ${firstName} for purchase consultation`);
  await pushNotification(`Consultation call scheduled for ${tenant.name}`);
  return { ok: true, action: "scheduled" };
}

export async function assignLeadToAgent(
  id: string,
  agent: { name: string; email: string; specialty?: string; source?: string }
) {
  await ensureInitialized();
  const tenant = findTenantById(id);
  if (!tenant) return null;

  tenant.assignedAgent = true;
  tenant.assignedAgentName = agent.name;
  tenant.assignedAgentEmail = agent.email;
  await persistTenant(tenant);

  const recent = tenant.messageHistory[0];
  const recentLine = recent ? `${recent.outcome} ${recent.channel} campaign` : "No recent campaign interaction";

  await pushActivity(
    `${tenant.name} assigned to ${agent.name}. Simulated assignment email sent (${agent.source || "Manual Entry"}).`
  );
  await pushNotification(`Lead successfully assigned to ${agent.name}`);

  return {
    ok: true,
    assignedAgent: agent.name,
    assignedAgentEmail: agent.email,
    recentActivity: recentLine
  };
}

export async function handleTwilioInboundWebhook(params: {
  from?: string;
  body?: string;
  messageSid?: string;
  /** Same processing as Twilio; use for CRM tester tool / scripts. */
  inboundSource?: string;
  /** When set (e.g. CRM simulate-inbound), attach messages to this chat if it belongs to the tenant. */
  chatId?: string;
}) {
  await ensureInitialized();
  const playbook = await automationPlaybook();
  const fmtOpts = workflowFormatOptions(playbook);

  const tenant = findTenantByPhone(String(params.from || ""));
  if (!tenant) {
    return { ok: false, reason: "Tenant not found for phone" };
  }

  const message = String(params.body || "").trim();
  if (!message) {
    return { ok: false, reason: "Missing body" };
  }

  const upper = message.toUpperCase();
  if (upper === "STOP") {
    tenant.consent_status = false;
    tenant.nextScheduledMessage = "Messaging disabled (opt-out)";
    await persistTenant(tenant);
    await pushNotification(`${tenant.name} replied STOP. Consent disabled.`);
    await pushActivity(`${tenant.name} opted out via Twilio STOP reply`);
    return { ok: true, optOut: true };
  }

  let chat = null as Awaited<ReturnType<typeof getOrCreateChatForTenant>>;
  if (params.chatId) {
    const byId = await getChatById(params.chatId);
    if (byId && byId.tenant_id === tenant.id) {
      chat = byId;
    }
  }
  if (!chat) {
    chat = await getOrCreateChatForTenant(tenant.id);
  }
  if (chat?.id) {
    await insertChatMessage({
      chatId: chat.id,
      tenantId: tenant.id,
      content: message,
      direction: "inbound",
      sender: "human",
      status: "replied",
      metadata: { source: params.inboundSource || "twilio_webhook", sid: params.messageSid || null }
    });
  }

  const visualInbound = await tryInboundVisualPlaybook({ tenant, userMessage: message });
  if (
    visualInbound.mode === "visual" &&
    visualInbound.ok &&
    visualInbound.assistantMessages.length > 0 &&
    chat?.id
  ) {
    tenant.lastInteractionAt = new Date().toISOString();
    await insertWorkflowEvent({
      tenantId: tenant.id,
      eventType: "visual_playbook_inbound",
      metadata: {
        raw_message: message,
        current_node_key: visualInbound.currentNodeKey ?? null,
        playbook_template_key: "visual_playbook.inbound"
      }
    });
    await persistTenant(tenant);

    for (const text of visualInbound.assistantMessages) {
      if (!text.trim()) continue;
      if (chat.control_mode === "ai") {
        await insertChatMessage({
          chatId: chat.id,
          tenantId: tenant.id,
          content: text,
          direction: "outbound",
          sender: "ai",
          status: "sent",
          metadata: {
            source: "visual_playbook",
            playbook_template_key: "visual_playbook.inbound"
          },
          messageChannel: "sms"
        });
        const sendResult = await sendSms(tenant.phone, text);
        if (!sendResult.ok) {
          await pushNotification(`Auto-reply send failed for ${tenant.name}: ${sendResult.reason}`);
        }
      } else {
        await insertChatMessage({
          chatId: chat.id,
          tenantId: tenant.id,
          content: text,
          direction: "outbound",
          sender: "ai",
          status: "draft",
          metadata: {
            source: "visual_playbook_draft",
            draft: true,
            playbook_template_key: "visual_playbook.inbound"
          },
          messageChannel: "sms"
        });
        await pushNotification(`AI-Assisted: visual playbook draft ready for ${tenant.name}.`);
      }
    }

    const outbound = await appendOutboundMessage(tenant, "SMS", message, "Twilio Inbound", params.messageSid);
    const event = await applyEngagementEvent(tenant, "reply", "Twilio");
    return { ok: true, outbound, event, visualPlaybook: true as const };
  }

  if (visualInbound.mode === "visual" && visualInbound.ok && visualInbound.assistantMessages.length === 0) {
    tenant.lastInteractionAt = new Date().toISOString();
    await insertWorkflowEvent({
      tenantId: tenant.id,
      eventType: "visual_playbook_inbound",
      metadata: {
        raw_message: message,
        current_node_key: visualInbound.currentNodeKey ?? null,
        silent_reply: true
      }
    });
    await persistTenant(tenant);
    const outbound = await appendOutboundMessage(tenant, "SMS", message, "Twilio Inbound", params.messageSid);
    const event = await applyEngagementEvent(tenant, "reply", "Twilio");
    return { ok: true, outbound, event, visualPlaybook: true as const };
  }

  if (visualInbound.mode === "visual" && !visualInbound.ok && visualInbound.error) {
    await pushActivity(`Visual playbook skipped for ${tenant.name}: ${visualInbound.error} — using JSON playbook.`);
  }

  const replyOutcome = handleIncomingReply(tenant, message, playbook);
  const replyInterpolated = interpolatePlaybookSms(replyOutcome.nextTemplate, {
    name: tenant.name,
    rent: tenant.rentAmount
  });
  await insertWorkflowEvent({
    tenantId: tenant.id,
    eventType: "reply",
    metadata: {
      raw_message: message,
      workflow_stage: replyOutcome.workflowStage,
      route: replyOutcome.route,
      tags: replyOutcome.tags,
      playbook_template_key: replyOutcome.playbookTemplateKey
    }
  });

  if (replyOutcome.workflowStage === "consideration") {
    tenant.stage = "WARM";
  } else if (replyOutcome.workflowStage === "qualification") {
    tenant.stage = "HOT";
  }
  tenant.lastInteractionAt = new Date().toISOString();
  await persistTenant(tenant);

  const useSimulateOpenAi =
    params.inboundSource === "crm_simulate_inbound" && isOpenAiEnabled();
  let replyBody = replyInterpolated;
  if (useSimulateOpenAi) {
    const ai = await generateSimulateInboundAssistantReply(
      tenant,
      message,
      replyOutcome.workflowStage,
      replyInterpolated
    );
    replyBody = ai.text;
  }
  const formatOpts = useSimulateOpenAi ? { allowOpenAiPolish: false as const } : fmtOpts;
  const next = await formatWorkflowMessage(tenant, replyBody, replyOutcome.workflowStage, formatOpts);

  if (chat?.id && chat.control_mode === "ai") {
    await insertChatMessage({
      chatId: chat.id,
      tenantId: tenant.id,
      content: next.text,
      direction: "outbound",
      sender: "ai",
      status: "sent",
      metadata: {
        source: "workflow_auto_reply",
        playbook_template_key: replyOutcome.playbookTemplateKey,
        ...(useSimulateOpenAi ? { simulate_openai_reply: true } : {})
      },
      messageChannel: "sms"
    });

    const sendResult = await sendSms(tenant.phone, next.text);
    if (!sendResult.ok) {
      await pushNotification(`Auto-reply send failed for ${tenant.name}: ${sendResult.reason}`);
    }
  } else if (chat?.id && chat.control_mode === "human") {
    await insertChatMessage({
      chatId: chat.id,
      tenantId: tenant.id,
      content: next.text,
      direction: "outbound",
      sender: "ai",
      status: "draft",
      metadata: {
        source: "workflow_assisted_draft",
        draft: true,
        playbook_template_key: replyOutcome.playbookTemplateKey,
        ...(useSimulateOpenAi ? { simulate_openai_reply: true } : {})
      },
      messageChannel: "sms"
    });
    await pushNotification(`AI-Assisted: draft reply ready for ${tenant.name}.`);
  }

  const outbound = await appendOutboundMessage(tenant, "SMS", message, "Twilio Inbound", params.messageSid);
  const event = await applyEngagementEvent(tenant, "reply", "Twilio");
  return { ok: true, outbound, event };
}

export async function handleTwilioStatusWebhook(params: {
  to?: string;
  messageStatus?: string;
  messageSid?: string;
  errorCode?: string;
}) {
  await ensureInitialized();

  const to = String(params.to || "").trim();
  const status = String(params.messageStatus || "").trim() || "unknown";
  const sid = String(params.messageSid || "").trim();
  const errorCode = String(params.errorCode || "").trim();

  const tenant = to ? findTenantByPhone(to) : null;
  const tenantName = tenant ? tenant.name : to || "unknown lead";
  const errorSuffix = errorCode ? ` (error ${errorCode})` : "";
  await pushActivity(`Twilio status ${status} for ${tenantName}${errorSuffix}${sid ? ` [${sid}]` : ""}`);

  return { ok: true };
}

export async function createOrResetTestTenant(input: { name: string; phone: string }) {
  await ensureInitialized();

  const normalized = normalizePhone(input.phone);
  if (!normalized) {
    return { ok: false, reason: "Invalid phone number" } as const;
  }

  let tenant = findTenantByPhone(input.phone);
  if (!tenant) {
    const id = `tenant-test-${normalized.slice(-10)}`;
    const now = new Date();
    const leaseEnd = new Date(now);
    leaseEnd.setMonth(leaseEnd.getMonth() + 8);
    const leaseStart = new Date(leaseEnd);
    leaseStart.setMonth(leaseStart.getMonth() - 12);

    const rand = Math.floor(Math.random() * 1000);
    tenant = {
      id,
      name: input.name,
      email: `graham.test+${rand}@demo-resident.com`,
      phone: input.phone,
      leaseStartDate: leaseStart.toISOString(),
      leaseEndDate: leaseEnd.toISOString(),
      rentAmount: 1900 + Math.floor(Math.random() * 300),
      estimatedIncome: 76000 + Math.floor(Math.random() * 9000),
      creditScoreRange: "660-699",
      status: "Warm",
      stage: "WARM",
      engagement_score: 4,
      consent_status: true,
      leadScore: 4,
      assignedAgent: false,
      assignedAgentName: "",
      assignedAgentEmail: "",
      lastMessageSent: "",
      nextScheduledMessage: "",
      engagementStatus: "No Response",
      messageHistory: [],
      preApprovalStatus: "none",
      estimatedCreditScore: 0,
      estimatedBuyingPower: 0,
      lastInteractionAt: null,
      automationEnabled: true,
      automationIntervalHours: 72
    };
    store.tenants.unshift(tenant);
  } else {
    tenant.name = input.name;
    tenant.phone = input.phone;
    tenant.consent_status = true;
  }

  initializeTenantState(tenant);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, reason: "Supabase is not enabled in environment" } as const;
  }

  // Prefer full row shape; fallback to minimal safe row if tenant schema is older.
  let persisted = await supabase.from("tenants").upsert(tenantToRow(tenant));
  if (persisted.error) {
    console.warn("[store] full test-tenant upsert failed, retrying minimal shape", {
      tenantId: tenant.id,
      error: persisted.error.message
    });
    persisted = await supabase.from("tenants").upsert({
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      lease_start_date: tenant.leaseStartDate,
      lease_end_date: tenant.leaseEndDate,
      rent_amount: tenant.rentAmount,
      estimated_income: tenant.estimatedIncome,
      credit_score_range: tenant.creditScoreRange,
      status: tenant.status,
      stage: tenant.stage,
      engagement_score: tenant.engagement_score,
      consent_status: tenant.consent_status,
      lead_score: tenant.leadScore,
      assigned_agent: tenant.assignedAgent,
      last_message_sent: tenant.lastMessageSent,
      next_scheduled_message: tenant.nextScheduledMessage,
      engagement_status: tenant.engagementStatus
    } as any);
  }

  if (persisted.error) {
    return { ok: false, reason: `Failed to persist test tenant: ${persisted.error.message}` } as const;
  }

  const tenantExists = await supabase.from("tenants").select("id").eq("id", tenant.id).limit(1);
  if (tenantExists.error || !tenantExists.data || tenantExists.data.length === 0) {
    return { ok: false, reason: "Tenant was not found in Supabase after upsert" } as const;
  }

  if (isTwilioDemoMode()) {
    await supabase.from("workflow_events").delete().eq("tenant_id", tenant.id);
    await supabase.from("messages").delete().eq("tenant_id", tenant.id);
    await supabase.from("chats").delete().eq("tenant_id", tenant.id);
    tenant.messageHistory = [];
    clearDemoConversationTimers(tenant.id);
  }

  const chat = await getOrCreateChatForTenant(tenant.id);
  if (!chat?.id) {
    return { ok: false, reason: "Failed to create or load chat for test tenant" } as const;
  }
  await setChatControlMode(chat.id, "ai");
  clearDemoConversationTimers(tenant.id);

  return {
    ok: true as const,
    tenantId: tenant.id,
    chatId: chat?.id || null,
    name: tenant.name,
    phone: tenant.phone
  };
}

export async function startTestLeadConversation(input: {
  phone: string;
  messages?: string[];
  intervalMs?: number;
}) {
  await ensureInitialized();

  const tenant = findTenantByPhone(input.phone);
  if (!tenant) {
    return { ok: false, reason: "Tenant not found for phone" } as const;
  }

  const script =
    input.messages && input.messages.length > 0
      ? input.messages
      : ["BUY", "YES", "My credit is around 680 and I can put 5% down.", "What is my best next step?"];
  const intervalMs = Math.max(1000, Number(input.intervalMs || 5000));

  scheduleDemoBuyerConversation(tenant, script, intervalMs);
  await pushActivity(`Manual demo conversation started for ${tenant.name} (${script.length} messages, ${intervalMs}ms interval)`);

  return {
    ok: true as const,
    tenantId: tenant.id,
    messageCount: script.length,
    intervalMs
  };
}

/** Same code path as Twilio inbound (workflow, AI auto-reply or assisted draft). Gated in the API layer. */
export async function simulateTenantInboundForChat(chatId: string, body: string) {
  await ensureInitialized();
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    return { ok: false as const, reason: "Empty message" };
  }
  const chat = await getChatById(chatId);
  if (!chat?.tenant_id) {
    return { ok: false as const, reason: "Chat not found" };
  }
  const tenant = findTenantById(chat.tenant_id);
  if (!tenant) {
    return { ok: false as const, reason: "Tenant not loaded" };
  }
  if (!String(tenant.phone || "").trim()) {
    return { ok: false as const, reason: "Tenant has no phone" };
  }
  return handleTwilioInboundWebhook({
    from: tenant.phone,
    body: trimmed,
    messageSid: `SM-CRM-SIM-${Date.now()}`,
    inboundSource: "crm_simulate_inbound",
    chatId
  });
}
