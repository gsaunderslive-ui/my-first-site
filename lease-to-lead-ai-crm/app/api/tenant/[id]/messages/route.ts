import { NextResponse } from "next/server";
import { getRecentMessagesByTenantId } from "@/lib/chatDb";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("limit") || "80");
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 80;
  const messages = await getRecentMessagesByTenantId(params.id, limit);
  return NextResponse.json({ messages });
}
