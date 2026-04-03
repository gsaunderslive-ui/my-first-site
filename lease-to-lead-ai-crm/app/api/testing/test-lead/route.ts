import { NextRequest, NextResponse } from "next/server";
import { createOrResetTestTenant } from "@/lib/services/testLead";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "Graham Saunders").trim();
  const phone = String(body.phone || "508-808-3249").trim();

  const result = await createOrResetTestTenant({ name, phone });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }

  return NextResponse.json(result);
}
