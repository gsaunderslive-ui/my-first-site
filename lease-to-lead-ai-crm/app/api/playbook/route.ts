import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/apiAuth";
import { getPlaybookForCompany, savePlaybook } from "@/lib/playbookDb";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";
import type { PlaybookDefaults, SourceOverrides } from "@/lib/playbookSchema";
import { emptyPlaybookDefaults } from "@/lib/playbookSchema";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) {
    return NextResponse.json({
      defaults: emptyPlaybookDefaults(),
      source_overrides: {} as SourceOverrides
    });
  }
  const playbook = await getPlaybookForCompany(companyId);
  return NextResponse.json(playbook);
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) {
    return NextResponse.json({ error: "No company configured. Run bootstrap / apply schema." }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const defaults = body.defaults as PlaybookDefaults | undefined;
  const source_overrides = body.source_overrides as SourceOverrides | undefined;
  if (!defaults || typeof defaults !== "object" || !source_overrides || typeof source_overrides !== "object") {
    return NextResponse.json({ error: "Body must include defaults and source_overrides objects" }, { status: 400 });
  }
  const mergedDefaults = { ...emptyPlaybookDefaults(), ...defaults };
  const ok = await savePlaybook(companyId, mergedDefaults, source_overrides);
  if (!ok) return NextResponse.json({ error: "Save failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
