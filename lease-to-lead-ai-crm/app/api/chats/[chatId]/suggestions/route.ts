import { NextRequest, NextResponse } from "next/server";
import { getChatById } from "@/lib/chatDb";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { chatId: string } }) {
  const body = await request.json().catch(() => ({}));
  const lastInbound = String(body.lastInbound || "").trim();

  const chat = await getChatById(params.chatId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const tenantId = chat.tenant_id;
  const supabase = getSupabaseAdmin();
  let tenantName = "";
  if (supabase) {
    const { data } = await supabase.from("tenants").select("name").eq("id", tenantId).limit(1).maybeSingle();
    tenantName = String((data as { name?: string } | null)?.name || "");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = [
      `Thanks for your message — happy to help with next steps on buying, ${tenantName.split(" ")[0] || "there"}.`,
      "I can share a quick affordability snapshot and timeline. Want me to?",
      "Reply YES if you’d like a short checklist for financing and home search."
    ];
    return NextResponse.json({ ok: true, suggestions: fallback, source: "fallback" });
  }

  const client = new OpenAI({ apiKey });
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Write exactly 3 short SMS replies. Separate them with the delimiter ||| on one line. No numbering. Max 320 chars each."
        },
        {
          role: "user",
          content: `Tenant name: ${tenantName}\nLast inbound message:\n${lastInbound || "(empty)"}`
        }
      ],
      max_output_tokens: 220
    });

    const text = response.output_text?.trim() || "";
    const suggestions = text
      .split("|||")
      .map((s) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    if (suggestions.length >= 3) {
      return NextResponse.json({ ok: true, suggestions: suggestions.slice(0, 3), source: "openai" });
    }
  } catch {
    // fall through
  }

  const fallback = [
    "Thanks — I can walk you through options. Want a quick affordability check?",
    "Happy to help. Should I send a short buyer checklist?",
    "Reply YES and I’ll share next steps tailored to your timeline."
  ];
  return NextResponse.json({ ok: true, suggestions: fallback, source: "fallback" });
}
