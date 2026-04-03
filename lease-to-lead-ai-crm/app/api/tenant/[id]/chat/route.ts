import { NextResponse } from "next/server";
import { getOrCreateChatForTenant } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

/** Returns or creates the primary chat row for pipeline → messaging handoff. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const chat = await getOrCreateChatForTenant(params.id);
  if (!chat) {
    return NextResponse.json({ error: "Chat unavailable (configure Supabase)" }, { status: 503 });
  }
  return NextResponse.json({ chat: { id: chat.id, tenant_id: chat.tenant_id, control_mode: chat.control_mode } });
}
