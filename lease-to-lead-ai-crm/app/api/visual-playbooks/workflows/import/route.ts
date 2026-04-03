import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { assertFileSizeAllowed, extractTextFromUpload } from "@/lib/visualPlaybook/extractDocumentText";
import {
  generateWorkflowFromDocumentText,
  generateWorkflowRefinement,
  parseImportRefinementBody
} from "@/lib/visualPlaybook/workflowDocumentImport";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const contentType = request.headers.get("content-type") || "";
  let documentText = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");

    if (file instanceof File && file.size > 0) {
      const sizeErr = assertFileSizeAllowed(file.size);
      if (sizeErr?.ok === false) {
        return NextResponse.json({ error: sizeErr.error }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractTextFromUpload(buffer, file.name || "upload", file.type || "");
      if (!extracted.ok) {
        return NextResponse.json({ error: extracted.error }, { status: 400 });
      }
      documentText = extracted.text;
    } else if (typeof pasted === "string" && pasted.trim()) {
      documentText = pasted.trim();
    } else {
      return NextResponse.json(
        { error: "Add a file (.pdf, .docx, .txt) or paste playbook text." },
        { status: 400 }
      );
    }
  } else {
    const body = await request.json().catch(() => ({}));
    const refined = parseImportRefinementBody(body);
    if (refined.ok) {
      const result = await generateWorkflowRefinement(refined.graph, refined.modifier);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
      return NextResponse.json({
        graph: result.graph,
        summary: result.summary ?? null
      });
    }

    const textBody = body as { text?: string };
    if (typeof textBody.text === "string" && textBody.text.trim()) {
      documentText = textBody.text.trim();
    } else {
      return NextResponse.json(
        { error: 'Send JSON { "text": "..." }, refinement body, or multipart form.' },
        { status: 400 }
      );
    }
  }

  const result = await generateWorkflowFromDocumentText(documentText);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    graph: result.graph,
    summary: result.summary ?? null
  });
}
