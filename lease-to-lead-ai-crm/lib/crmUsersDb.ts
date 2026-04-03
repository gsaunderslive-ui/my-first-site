import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "./supabaseAdmin";
import type { AgentRole, AgentStatus } from "./teamTypes";
import { parseAgentRole, parseAgentStatus } from "./teamTypes";

export type CrmUserRow = {
  id: string;
  username: string;
  password_hash: string;
  is_admin: boolean;
  company_id: string | null;
  display_name: string | null;
  email: string | null;
  agent_role: AgentRole;
  agent_status: AgentStatus;
};

export type CrmTeamMemberPublic = {
  id: string;
  username: string;
  is_admin: boolean;
  company_id: string | null;
  display_name: string | null;
  email: string | null;
  agent_role: AgentRole;
  agent_status: AgentStatus;
};

/** Shape used by Assign Agent modal and GET /api/agents */
export type AgentApiRecord = {
  id: string;
  name: string;
  email: string;
  role: AgentRole;
  status: AgentStatus;
};

function rowToPublic(data: Record<string, unknown>): CrmTeamMemberPublic {
  return {
    id: String(data.id),
    username: String(data.username),
    is_admin: Boolean(data.is_admin),
    company_id: (data.company_id as string | null) ?? null,
    display_name: (data.display_name as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    agent_role: parseAgentRole(data.agent_role),
    agent_status: parseAgentStatus(data.agent_status)
  };
}

function rowToCrmUserRow(data: Record<string, unknown>): CrmUserRow {
  const pub = rowToPublic(data);
  return {
    ...pub,
    password_hash: String(data.password_hash || "")
  };
}

export async function getCrmUserByUsername(username: string): Promise<CrmUserRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("crm_users").select("*").eq("username", username).maybeSingle();
  if (error || !data) return null;
  return rowToCrmUserRow(data as Record<string, unknown>);
}

export async function getCrmUserById(id: string): Promise<CrmUserRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("crm_users").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return rowToCrmUserRow(data as Record<string, unknown>);
}

export async function verifyCrmPassword(row: CrmUserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, row.password_hash);
}

export async function createCrmUser(input: {
  username: string;
  password: string;
  is_admin: boolean;
  company_id: string | null;
  display_name?: string | null;
  email?: string | null;
  agent_role?: AgentRole;
  agent_status?: AgentStatus;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const password_hash = await bcrypt.hash(input.password, 12);
  const display_name =
    input.display_name != null && String(input.display_name).trim() !== ""
      ? String(input.display_name).trim()
      : input.username.trim().toLowerCase();
  const email =
    input.email != null && String(input.email).trim() !== "" ? String(input.email).trim().toLowerCase() : null;
  const agent_role = input.agent_role ?? "General";
  const agent_status = input.agent_status ?? "Active";

  const { data, error } = await supabase
    .from("crm_users")
    .insert({
      username: input.username.trim().toLowerCase(),
      password_hash,
      is_admin: input.is_admin,
      company_id: input.company_id,
      display_name,
      email,
      agent_role,
      agent_status
    })
    .select("id")
    .single();
  if (error) {
    if (String(error.message).includes("duplicate") || error.code === "23505") {
      return { ok: false, error: "Username already exists" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id as string };
}

export async function listCrmUsersForCompany(companyId: string | null): Promise<CrmTeamMemberPublic[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let q = supabase
    .from("crm_users")
    .select("id, username, is_admin, company_id, display_name, email, agent_role, agent_status")
    .order("username");
  if (companyId) {
    q = q.eq("company_id", companyId);
  }
  const { data } = await q;
  return (data || []).map((r) => rowToPublic(r as Record<string, unknown>));
}

/** Active roster with email for lead assignment UI */
export async function listAgentsForAssignment(companyId: string | null): Promise<AgentApiRecord[]> {
  const members = await listCrmUsersForCompany(companyId);
  return members
    .filter((m) => m.agent_status === "Active" && m.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email))
    .map((m) => ({
      id: m.id,
      name: (m.display_name && m.display_name.trim()) || m.username,
      email: m.email as string,
      role: m.agent_role,
      status: m.agent_status
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateCrmUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const password_hash = await bcrypt.hash(newPassword, 12);
  const { error } = await supabase.from("crm_users").update({ password_hash }).eq("id", userId);
  return !error;
}

export async function updateCrmTeamMember(
  userId: string,
  input: Partial<{
    display_name: string | null;
    email: string | null;
    agent_role: AgentRole;
    agent_status: AgentStatus;
    is_admin: boolean;
  }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const patch: Record<string, unknown> = {};
  if (input.display_name !== undefined) patch.display_name = input.display_name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.agent_role !== undefined) patch.agent_role = input.agent_role;
  if (input.agent_status !== undefined) patch.agent_status = input.agent_status;
  if (input.is_admin !== undefined) patch.is_admin = input.is_admin;
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await supabase.from("crm_users").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCrmUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const { error } = await supabase.from("crm_users").delete().eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
