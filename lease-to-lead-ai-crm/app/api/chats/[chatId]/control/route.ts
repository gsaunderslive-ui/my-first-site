import { NextRequest, NextResponse } from "next/server";
import { setChatControlMode } from "@/lib/chatDb";

export async function PATCH(request: NextRequest, { params }: { params: { chatId: string } }) {
  const body = await request.json().catch(() => ({}));
  const mode = String(body.control_mode || "").trim().toLowerCase();

  if (mode !== "ai" && mode !== "human") {
    return NextResponse.json({ error: "control_mode must be ai or human" }, { status: 400 });
  }

  const chat = await setChatControlMode(params.chatId, mode as "ai" | "human");
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, chat });
}
