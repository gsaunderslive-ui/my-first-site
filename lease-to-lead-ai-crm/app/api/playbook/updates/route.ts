import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { CRM_DEV_SESSION_USER_ID } from "@/lib/crmConstants";
import { getPlaybookForCompany, savePlaybook } from "@/lib/playbookDb";
import { applyPlaybookProposal } from "@/lib/playbookMerge";
import {
  createPlaybookUpdate,
  getPlaybookUpdateById,
  listPlaybookUpdates,
  setPlaybookUpdateStatus
} from "@/lib/playbookUpdatesDb";
import { resolveCompanyIdForSession } from "@/lib/sessionCompany";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || "pending") as "pending" | "approved" | "rejected" | "all";
  const items = await listPlaybookUpdates(companyId, status);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) {
    return NextResponse.json({ error: "No company configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "propose") {
    const sectionPath = String(body.sectionPath || "").trim();
    const proposedContent = String(body.proposedContent || "");
    if (!sectionPath || !proposedContent) {
      return NextResponse.json({ error: "sectionPath and proposedContent required" }, { status: 400 });
    }
    const proposerId = session.sub === CRM_DEV_SESSION_USER_ID ? null : session.sub;
    const created = await createPlaybookUpdate({
      companyId,
      userId: proposerId,
      sectionPath,
      proposedContent
    });
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: created.id });
  }

  if (action === "approve" || action === "reject") {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const reviewerNote = body.reviewerNote != null ? String(body.reviewerNote) : null;

    const row = await getPlaybookUpdateById(id, companyId);
    if (!row || row.status !== "pending") {
      return NextResponse.json({ error: "Update not found or not pending" }, { status: 404 });
    }

    if (action === "reject") {
      const ok = await setPlaybookUpdateStatus(id, companyId, "rejected", reviewerNote);
      if (!ok) return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const current = await getPlaybookForCompany(companyId);
    const applied = applyPlaybookProposal(current.defaults, current.source_overrides, row.section_path, row.proposed_content);
    if ("error" in applied) {
      return NextResponse.json({ error: applied.error }, { status: 400 });
    }
    const saved = await savePlaybook(companyId, applied.defaults, applied.source_overrides);
    if (!saved) return NextResponse.json({ error: "Failed to save playbook" }, { status: 500 });
    const ok = await setPlaybookUpdateStatus(id, companyId, "approved", reviewerNote);
    if (!ok) return NextResponse.json({ error: "Failed to mark approved" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
