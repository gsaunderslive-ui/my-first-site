import { getSupabaseAdmin } from "./supabaseAdmin";
import type { PlaybookDefaults, SourceOverrides } from "./playbookSchema";
import { emptyPlaybookDefaults } from "./playbookSchema";

export async function getPlaybookForCompany(companyId: string): Promise<{
  defaults: PlaybookDefaults;
  source_overrides: SourceOverrides;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { defaults: emptyPlaybookDefaults(), source_overrides: {} };
  }
  const { data } = await supabase.from("company_playbooks").select("*").eq("company_id", companyId).maybeSingle();
  if (!data) {
    return { defaults: emptyPlaybookDefaults(), source_overrides: {} };
  }
  return {
    defaults: { ...emptyPlaybookDefaults(), ...(data.defaults as PlaybookDefaults) },
    source_overrides: (data.source_overrides as SourceOverrides) || {}
  };
}

export async function savePlaybook(
  companyId: string,
  defaults: PlaybookDefaults,
  source_overrides: SourceOverrides
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("company_playbooks").upsert(
    {
      company_id: companyId,
      defaults,
      source_overrides,
      updated_at: new Date().toISOString()
    },
    { onConflict: "company_id" }
  );
  return !error;
}
