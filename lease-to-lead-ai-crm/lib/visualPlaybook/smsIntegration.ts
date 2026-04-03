/**
 * STEP 4–5–6–7 — Wire visual playbook engine to live SMS (inbound + engage opening).
 */

import { getDefaultCompanyId } from "@/lib/crmBootstrap";
import type { Tenant } from "@/lib/types";
import { buildGraph, playbookHandleUserMessage, playbookStartOrResume } from "./engine";
import {
  getActiveVisualWorkflow,
  getOrCreateTenantWorkflowSession,
  loadWorkflowGraph,
  upsertSessionState
} from "./db";
import { applyLeadDataToTenant, buildLeadDataFromTenant } from "./tenantSync";

export type VisualSmsTryResult =
  | { mode: "legacy" }
  | {
      mode: "visual";
      ok: boolean;
      assistantMessages: string[];
      error?: string;
      currentNodeKey?: string;
    };

async function loadActiveGraph(companyId: string) {
  const active = await getActiveVisualWorkflow(companyId);
  if (!active) return null;
  const loaded = await loadWorkflowGraph(companyId, active.id);
  if (!loaded) return null;
  return { active, loaded };
}

/**
 * STEP 4 & 5 — Inbound user text: cold thread runs start (opening) then consumes this message;
 * returning user runs edge evaluation only.
 */
export async function tryInboundVisualPlaybook(params: {
  tenant: Tenant;
  userMessage: string;
}): Promise<VisualSmsTryResult> {
  const companyId = await getDefaultCompanyId();
  if (!companyId) return { mode: "legacy" };

  const bundle = await loadActiveGraph(companyId);
  if (!bundle) return { mode: "legacy" };

  const { active, loaded } = bundle;
  const seed = buildLeadDataFromTenant(params.tenant);
  const session = await getOrCreateTenantWorkflowSession(companyId, active.id, params.tenant.id, seed);
  if (!session) {
    return { mode: "visual", ok: false, assistantMessages: [], error: "Could not load workflow session" };
  }

  session.lead_data = { ...session.lead_data, ...seed };
  const graph = buildGraph(loaded.workflow, loaded.nodes, loaded.edges);

  const pathLen = session.visit_path?.length ?? 0;
  let combined: Awaited<ReturnType<typeof playbookHandleUserMessage>>;

  if (pathLen === 0) {
    const start = await playbookStartOrResume(graph, session);
    if (start.error) {
      await upsertSessionState(session);
      return {
        mode: "visual",
        ok: false,
        assistantMessages: start.assistantMessages,
        error: start.error,
        currentNodeKey: start.currentNodeKey
      };
    }
    combined = await playbookHandleUserMessage(graph, session, params.userMessage);
  } else {
    combined = await playbookHandleUserMessage(graph, session, params.userMessage);
  }

  applyLeadDataToTenant(params.tenant, session.lead_data);
  await upsertSessionState(session);

  if (combined.error) {
    return {
      mode: "visual",
      ok: false,
      assistantMessages: combined.assistantMessages,
      error: combined.error,
      currentNodeKey: combined.currentNodeKey
    };
  }

  return {
    mode: "visual",
    ok: true,
    assistantMessages: combined.assistantMessages,
    currentNodeKey: combined.currentNodeKey
  };
}

/**
 * STEP 5 — First outbound from “Send SMS” / engage when the tenant has never started this workflow session.
 */
export async function tryEngageOpenVisualPlaybook(params: { tenant: Tenant }): Promise<VisualSmsTryResult> {
  const companyId = await getDefaultCompanyId();
  if (!companyId) return { mode: "legacy" };

  const bundle = await loadActiveGraph(companyId);
  if (!bundle) return { mode: "legacy" };

  const { active, loaded } = bundle;
  const seed = buildLeadDataFromTenant(params.tenant);
  const session = await getOrCreateTenantWorkflowSession(companyId, active.id, params.tenant.id, seed);
  if (!session) {
    return { mode: "visual", ok: false, assistantMessages: [], error: "Could not load workflow session" };
  }

  if (session.visit_path && session.visit_path.length > 0) {
    return { mode: "legacy" };
  }

  session.lead_data = { ...session.lead_data, ...seed };
  const graph = buildGraph(loaded.workflow, loaded.nodes, loaded.edges);
  const start = await playbookStartOrResume(graph, session);

  applyLeadDataToTenant(params.tenant, session.lead_data);
  await upsertSessionState(session);

  if (start.error) {
    return {
      mode: "visual",
      ok: false,
      assistantMessages: start.assistantMessages,
      error: start.error,
      currentNodeKey: start.currentNodeKey
    };
  }

  return {
    mode: "visual",
    ok: true,
    assistantMessages: start.assistantMessages,
    currentNodeKey: start.currentNodeKey
  };
}
