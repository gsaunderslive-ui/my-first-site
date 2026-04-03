import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Ensures default company + empty playbook, and creates admin users from env
 * CRM_ADMIN_USERNAMES=comma,separated,lowercase
 * CRM_ADMIN_INITIAL_PASSWORD=shared initial password for any missing admin user
 */
export async function ensureCrmBootstrap(): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: companies } = await supabase.from("companies").select("id").limit(1);
  let companyId: string;
  if (!companies?.length) {
    const { data: ins, error } = await supabase
      .from("companies")
      .insert({ name: process.env.CRM_COMPANY_NAME || "Default Company" })
      .select("id")
      .single();
    if (error || !ins) {
      console.error("[crmBootstrap] company insert failed", error?.message);
      return;
    }
    companyId = ins.id as string;
    await supabase.from("company_playbooks").insert({ company_id: companyId, defaults: {}, source_overrides: {} });
  } else {
    companyId = (companies[0] as { id: string }).id;
  }

  const { data: pb } = await supabase.from("company_playbooks").select("company_id").eq("company_id", companyId).maybeSingle();
  if (!pb) {
    await supabase.from("company_playbooks").insert({ company_id: companyId, defaults: {}, source_overrides: {} });
  }

  const names = (process.env.CRM_ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const initialPwd = process.env.CRM_ADMIN_INITIAL_PASSWORD;
  if (!initialPwd || names.length === 0) return;

  const hash = await bcrypt.hash(initialPwd, 12);
  for (const username of names) {
    const { data: existing } = await supabase.from("crm_users").select("id").eq("username", username).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("crm_users").insert({
      username,
      password_hash: hash,
      is_admin: true,
      company_id: companyId,
      display_name: username,
      agent_role: "General",
      agent_status: "Active"
    });
    if (error) console.error("[crmBootstrap] admin insert failed", username, error.message);
  }
}

export async function getDefaultCompanyId(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("companies").select("id").limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
