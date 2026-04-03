import mammoth from "mammoth";

export type ExtractResult = { ok: true; text: string } | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function extractTextFromUpload(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<ExtractResult> {
  const lower = filename.toLowerCase();
  const type = mime.toLowerCase();

  try {
    if (lower.endsWith(".txt") || type === "text/plain") {
      const text = buffer.toString("utf8");
      return { ok: true, text };
    }

    if (lower.endsWith(".pdf") || type === "application/pdf") {
      const mod = await import("pdf-parse");
      const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text?: string }> }).default ?? mod;
      const data = await (pdfParse as (b: Buffer) => Promise<{ text?: string }>)(buffer);
      const text = String(data.text || "").trim();
      if (!text) {
        return { ok: false, error: "No text could be extracted from the PDF (it may be image-only)." };
      }
      return { ok: true, text };
    }

    if (
      lower.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const text = String(result.value || "").trim();
      const warn = result.messages?.map((m) => m.message).join("; ");
      if (!text) {
        return { ok: false, error: warn || "No text could be extracted from the Word document." };
      }
      return { ok: true, text };
    }

    return {
      ok: false,
      error: "Unsupported file type. Use .pdf, .docx, or .txt."
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read file.";
    return { ok: false, error: msg };
  }
}

export function assertFileSizeAllowed(size: number): ExtractResult | null {
  if (size > MAX_BYTES) {
    return { ok: false, error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` };
  }
  return null;
}
