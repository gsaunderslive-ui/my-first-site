import { getSupabaseAdmin } from "./supabaseAdmin";

export type PlaybookUpdateRow = {
  id: string;
  company_id: string;
  proposed_by_user_id: string | null;
  section_path: string;
  proposed_content: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  created_at: string;
};

export async function listPlaybookUpdates(
  companyId: string,
  status: "pending" | "approved" | "rejected" | "all" = "pending"
): Promise<PlaybookUpdateRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let q = supabase.from("playbook_update_queue").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return [];
  return (data || []) as PlaybookUpdateRow[];
}

export async function createPlaybookUpdate(input: {
  companyId: string;
  userId: string | null;
  sectionPath: string;
  proposedContent: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const { data, error } = await supabase
    .from("playbook_update_queue")
    .insert({
      company_id: input.companyId,
      proposed_by_user_id: input.userId,
      section_path: input.sectionPath,
      proposed_content: input.proposedContent,
      status: "pending"
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

export async function setPlaybookUpdateStatus(
  id: string,
  companyId: string,
  status: "approved" | "rejected",
  reviewerNote?: string | null
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("playbook_update_queue")
    .update({ status, reviewer_note: reviewerNote ?? null })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "pending");
  return !error;
}

export async function getPlaybookUpdateById(
  id: string,
  companyId: string
): Promise<PlaybookUpdateRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("playbook_update_queue")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as PlaybookUpdateRow) || null;
}
