import { NextRequest, NextResponse } from "next/server";
import { getAgentsFallback } from "@/lib/agentData";
import { getDefaultCompanyId } from "@/lib/crmBootstrap";
import { getSessionFromRequest } from "@/lib/apiAuth";
import { listAgentsForAssignment } from "@/lib/crmUsersDb";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ agents: getAgentsFallback() });
  }
  const session = await getSessionFromRequest(request);
  let companyId: string | null = null;
  if (session) {
    companyId = await resolveCompanyIdForSession(session);
  }
  if (!companyId) {
    companyId = await getDefaultCompanyId();
  }
  const agents = await listAgentsForAssignment(companyId);
  return NextResponse.json({ agents });
}
