import type { PlaybookDefaults, SourceOverrides } from "./playbookSchema";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[key];
    const bv = base[key];
    if (pv === undefined) continue;
    if (isPlainObject(pv) && isPlainObject(bv as unknown)) {
      out[key] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>) as T[keyof T];
    } else {
      out[key] = pv as T[keyof T];
    }
  }
  return out;
}

/**
 * sectionPath: "defaults" (merge into defaults) or "source_overrides.<key>" e.g. source_overrides.website
 * proposedJson: string JSON object to deep-merge into that branch
 */
export function applyPlaybookProposal(
  defaults: PlaybookDefaults,
  source_overrides: SourceOverrides,
  sectionPath: string,
  proposedJson: string
): { defaults: PlaybookDefaults; source_overrides: SourceOverrides } | { error: string } {
  let patch: unknown;
  try {
    patch = JSON.parse(proposedJson);
  } catch {
    return { error: "Invalid JSON in proposed_content" };
  }
  if (!isPlainObject(patch)) return { error: "Proposal must be a JSON object" };

  if (sectionPath === "defaults") {
    return {
      defaults: deepMerge(defaults as unknown as Record<string, unknown>, patch) as PlaybookDefaults,
      source_overrides
    };
  }
  const prefix = "source_overrides.";
  if (sectionPath.startsWith(prefix)) {
    const sourceKey = sectionPath.slice(prefix.length).split(".")[0];
    if (!sourceKey) return { error: "Invalid source_overrides path" };
    const prev = (source_overrides[sourceKey as keyof SourceOverrides] || {}) as Record<string, unknown>;
    const merged = deepMerge(prev, patch as Record<string, unknown>) as Partial<PlaybookDefaults>;
    return {
      defaults,
      source_overrides: { ...source_overrides, [sourceKey]: merged }
    };
  }
  return { error: 'section_path must be "defaults" or "source_overrides.<source>"' };
}
