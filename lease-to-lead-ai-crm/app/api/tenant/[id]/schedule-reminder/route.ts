import { NextRequest, NextResponse } from "next/server";
import { scheduleReminder } from "@/lib/services/tenantWorkflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const date = String(body.date || "").trim();
  const time = String(body.time || "").trim();

  if (!date || !time) {
    return NextResponse.json({ error: "date and time are required" }, { status: 400 });
  }

  const result = await scheduleReminder(params.id, date, time);
  if (!result) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
