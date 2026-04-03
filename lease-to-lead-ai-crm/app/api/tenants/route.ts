import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/services/tenantWorkflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getSnapshot());
}
