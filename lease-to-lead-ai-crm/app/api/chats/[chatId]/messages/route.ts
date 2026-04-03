import { NextRequest, NextResponse } from "next/server";
import { getChatById, getMessagesByChatId, insertChatMessage } from "@/lib/chatDb";
import { sendSms } from "@/lib/twilio";

export async function GET(_: Request, { params }: { params: { chatId: string } }) {
  const chat = await getChatById(params.chatId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = await getMessagesByChatId(params.chatId);
  return NextResponse.json({ chat, messages });
}

export async function POST(request: NextRequest, { params }: { params: { chatId: string } }) {
  const body = await request.json().catch(() => ({}));
  const content = String(body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const chat = await getChatById(params.chatId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const tenant = (chat as any).tenants || {};
  const tenantPhone = String(tenant.phone || "").trim();

  const row = await insertChatMessage({
    chatId: params.chatId,
    tenantId: chat.tenant_id,
    content,
    direction: "outbound",
    sender: "human",
    status: "sent",
    metadata: { source: "human_manual_send" }
  });

  const delivery = tenantPhone ? await sendSms(tenantPhone, content) : { ok: false as const, reason: "Tenant phone missing" };
  return NextResponse.json({ ok: true, message: row, delivery });
}
