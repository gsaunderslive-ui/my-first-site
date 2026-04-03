import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const phone = String(request.nextUrl.searchParams.get("phone") || "508-808-3249").trim();
  const normalized = normalizePhone(phone);
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });
  }

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (tenantsError) {
    return NextResponse.json({ ok: false, error: tenantsError.message }, { status: 500 });
  }

  const matchedTenants = (tenants || []).filter((tenant) => normalizePhone(String((tenant as any).phone || "")) === normalized);
  const tenantIds = matchedTenants.map((tenant) => String((tenant as any).id));

  let chats: any[] = [];
  let messages: any[] = [];

  if (tenantIds.length > 0) {
    const { data: chatRows } = await supabase.from("chats").select("*").in("tenant_id", tenantIds);
    chats = chatRows || [];
    const chatIds = chats.map((chat) => String((chat as any).id));
    if (chatIds.length > 0) {
      const { data: messageRows } = await supabase
        .from("messages")
        .select("id, chat_id, tenant_id, direction, content, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false })
        .limit(50);
      messages = messageRows || [];
    }
  }

  return NextResponse.json({
    ok: true,
    input: { phone, normalized },
    matchedTenants,
    chats,
    recentMessages: messages
  });
}
