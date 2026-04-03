import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const enabled = isSupabaseEnabled();
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = getSupabaseAdmin();

  if (!enabled || !supabase) {
    return NextResponse.json({
      ok: false,
      enabled,
      hasUrl,
      hasServiceRole,
      error: "Supabase env vars are missing or invalid"
    });
  }

  const [{ count: tenantsCount, error: tenantsErr }, { count: chatsCount, error: chatsErr }, { count: messagesCount, error: messagesErr }] =
    await Promise.all([
      supabase.from("tenants").select("*", { head: true, count: "exact" }),
      supabase.from("chats").select("*", { head: true, count: "exact" }),
      supabase.from("messages").select("*", { head: true, count: "exact" })
    ]);

  return NextResponse.json({
    ok: !tenantsErr && !chatsErr && !messagesErr,
    enabled: true,
    hasUrl,
    hasServiceRole,
    counts: {
      tenants: tenantsCount ?? null,
      chats: chatsCount ?? null,
      messages: messagesCount ?? null
    },
    tableErrors: {
      tenants: tenantsErr?.message || null,
      chats: chatsErr?.message || null,
      messages: messagesErr?.message || null
    }
  });
}
