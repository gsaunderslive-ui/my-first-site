import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { isSimulateTenantInboundEnabled } from "@/lib/simulateInbound";
import { simulateTenantInboundForChat } from "@/lib/store";

export async function POST(request: NextRequest, { params }: { params: { chatId: string } }) {
  if (!isSimulateTenantInboundEnabled()) {
    return NextResponse.json(
      {
        error:
          "Simulated tenant replies are disabled. Set CRM_SIMULATE_INBOUND_ENABLED=true on the server, or use local development (npm run dev)."
      },
      { status: 403 }
    );
  }

  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => ({}));
  const content = String(body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const result = await simulateTenantInboundForChat(params.chatId, content);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason || "Failed" }, { status: 400 });
  }

  return NextResponse.json(result);
}
