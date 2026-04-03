import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/apiAuth";
import { isSimulateTenantInboundEnabled } from "@/lib/simulateInbound";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ user: null, features: { simulateTenantInbound: false } });
  }
  return NextResponse.json({
    user: { username: session.username, isAdmin: session.isAdmin },
    features: { simulateTenantInbound: isSimulateTenantInboundEnabled() }
  });
}
