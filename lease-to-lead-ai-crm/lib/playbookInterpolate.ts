/** Replace {{placeholders}} in playbook SMS templates. */
export function interpolatePlaybookSms(
  template: string,
  ctx: {
    name?: string;
    elapsedMonths?: number;
    remainingMonths?: number;
    totalLeaseMonths?: number;
    rent?: number;
  }
): string {
  const firstName = (ctx.name || "").trim().split(/\s+/)[0] || "there";
  const rentFormatted = ctx.rent != null && Number.isFinite(ctx.rent) ? `$${Number(ctx.rent).toLocaleString()}` : "";
  return template
    .replace(/\{\{name\}\}/gi, ctx.name?.trim() || "there")
    .replace(/\{\{firstName\}\}/gi, firstName)
    .replace(/\{\{elapsedMonths\}\}/g, String(ctx.elapsedMonths ?? ""))
    .replace(/\{\{remainingMonths\}\}/g, String(ctx.remainingMonths ?? ""))
    .replace(/\{\{totalLeaseMonths\}\}/g, String(ctx.totalLeaseMonths ?? ""))
    .replace(/\{\{rent\}\}/g, rentFormatted);
}
