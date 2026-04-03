import type { PlaybookDefaults } from "./playbookSchema";
import { PLAYBOOK_SOURCE_KEYS } from "./playbookSchema";

export type PlaybookSectionKey = keyof PlaybookDefaults;

export type FieldDef = { key: string; label: string; hint?: string };

export type SectionDef = {
  section: PlaybookSectionKey;
  title: string;
  description: string;
  fields: FieldDef[];
};

/** Single source of truth for playbook section/field labels (playbook editor + update proposals). */
export const PLAYBOOK_SECTIONS: SectionDef[] = [
  {
    section: "brandVoice",
    title: "Brand voice",
    description: "How your team sounds.",
    fields: [
      { key: "companyShortName", label: "Short company name" },
      { key: "tone", label: "Tone" },
      { key: "wordsToAvoid", label: "Words to avoid" },
      { key: "disclosures", label: "Disclosures" }
    ]
  },
  {
    section: "opening",
    title: "Opening messages",
    description: "First SMS and email.",
    fields: [
      { key: "sms", label: "SMS opener", hint: "Placeholders like {{name}} ok if your tools support them." },
      { key: "emailSubject", label: "Email subject" },
      { key: "emailBody", label: "Email body" }
    ]
  },
  {
    section: "qualification",
    title: "Qualification",
    description: "Timeline, budget, intent.",
    fields: [
      { key: "justLooking", label: "They’re “just looking”" },
      { key: "rentVsBuy", label: "Rent vs buy" },
      { key: "timeline", label: "Timeline" },
      { key: "budget", label: "Budget / payment comfort" },
      { key: "notSureQualify", label: "Not sure if they qualify" }
    ]
  },
  {
    section: "objections",
    title: "Objections & rebuttals",
    description: "Pushback responses.",
    fields: [
      { key: "notReady", label: "Not ready" },
      { key: "rentingEasier", label: "Renting is easier" },
      { key: "ratesHigh", label: "Rates are too high" },
      { key: "needPartner", label: "Need spouse / partner" },
      { key: "listingsOnly", label: "Only wants listings" }
    ]
  },
  {
    section: "handoff",
    title: "Handoff to a human",
    description: "When to stop automation.",
    fields: [
      { key: "whenToStopAi", label: "When to hand off" },
      { key: "handoffMessage", label: "Handoff message to the lead" },
      { key: "internalNote", label: "Internal note (for your team)" }
    ]
  },
  {
    section: "scheduling",
    title: "Scheduling",
    description: "CTA and hours.",
    fields: [
      { key: "defaultCta", label: "Default call to action" },
      { key: "bookingUrl", label: "Booking link" },
      { key: "businessHours", label: "Business hours" }
    ]
  },
  {
    section: "compliance",
    title: "Compliance",
    description: "Opt-out and fair housing.",
    fields: [
      { key: "optOutSms", label: "SMS opt-out" },
      { key: "optOutEmail", label: "Email opt-out" },
      { key: "fairHousing", label: "Fair housing" }
    ]
  },
  {
    section: "followUpCadence",
    title: "Follow-up rhythm",
    description: "If someone goes quiet.",
    fields: [
      { key: "day1", label: "Day 1 follow-up" },
      { key: "day3", label: "Day 3 follow-up" },
      { key: "day7", label: "Day 7 follow-up" },
      { key: "whenQuiet", label: "When they’ve gone quiet" }
    ]
  },
  {
    section: "escalation",
    title: "Escalation",
    description: "When to escalate fast.",
    fields: [{ key: "notifyWhen", label: "When to escalate" }]
  },
  {
    section: "leaseTimeline",
    title: "Lease automation SMS",
    description: "Timeline decision tree for automated SMS.",
    fields: [
      { key: "welcome", label: "Welcome (under 3 mo)" },
      { key: "elapsed3to5", label: "3–5 months elapsed" },
      { key: "elapsed6to7", label: "6–7 months elapsed" },
      { key: "elapsed8creditLow", label: "8+ mo, credit under 600" },
      { key: "elapsed8creditOk", label: "8+ mo, credit 600+" },
      { key: "elapsed9", label: "9+ months" },
      { key: "elapsed10plus", label: "10+ months" },
      { key: "useOpenAiPolish", label: "Polish with OpenAI" }
    ]
  },
  {
    section: "inboundReplies",
    title: "Inbound SMS replies",
    description: "Auto-replies after tenant texts in.",
    fields: [
      { key: "defaultReply", label: "Default" },
      { key: "afterBuy", label: "Contains BUY" },
      { key: "afterYes", label: "Contains YES" },
      { key: "creditBelow600", label: "Credit under 600" },
      { key: "creditAbove660", label: "Credit over 660" }
    ]
  }
];

export function findFieldLabel(section: string, fieldKey: string): string | null {
  const sec = PLAYBOOK_SECTIONS.find((s) => s.section === section);
  const f = sec?.fields.find((x) => x.key === fieldKey);
  return f?.label ?? null;
}

export function findSectionTitle(section: string): string | null {
  return PLAYBOOK_SECTIONS.find((s) => s.section === section)?.title ?? null;
}

export type ProposalScope = "defaults" | (typeof PLAYBOOK_SOURCE_KEYS)[number];

export function buildProposalPayload(
  scope: ProposalScope,
  section: PlaybookSectionKey,
  fieldKey: string,
  text: string
): { sectionPath: string; proposedContent: string } {
  const patch: Record<string, Record<string, string>> = {
    [section]: { [fieldKey]: text }
  };
  const proposedContent = JSON.stringify(patch);
  if (scope === "defaults") {
    return { sectionPath: "defaults", proposedContent };
  }
  return { sectionPath: `source_overrides.${scope}`, proposedContent };
}

export type DisplayProposal = {
  headline: string;
  subline: string;
  entries: { label: string; text: string }[];
};

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Turn stored row into friendly copy for the UI. */
export function describeStoredProposal(sectionPath: string, proposedContent: string): DisplayProposal {
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(proposedContent) as Record<string, unknown>;
  } catch {
    return {
      headline: "Proposal",
      subline: sectionPath,
      entries: [{ label: "Content", text: proposedContent }]
    };
  }

  const scopeLabel =
    sectionPath === "defaults"
      ? "Applies to: Company default playbook"
      : sectionPath.startsWith("source_overrides.")
        ? `Applies to: ${capitalize(sectionPath.replace("source_overrides.", "").split(".")[0] || "")} leads only`
        : sectionPath;

  const entries: { label: string; text: string }[] = [];
  for (const [sec, val] of Object.entries(patch)) {
    const secTitle = findSectionTitle(sec) ?? sec;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [fk, tv] of Object.entries(val as Record<string, unknown>)) {
        const fl = findFieldLabel(sec, fk) ?? fk;
        entries.push({
          label: `${secTitle} → ${fl}`,
          text: typeof tv === "string" ? tv : JSON.stringify(tv, null, 2)
        });
      }
    } else if (typeof val === "string") {
      entries.push({ label: secTitle, text: val });
    }
  }

  const headline =
    entries.length === 1 ? entries[0].label : entries.length > 1 ? "Multiple fields in one proposal" : "Proposal";

  return {
    headline,
    subline: scopeLabel,
    entries: entries.length ? entries : [{ label: "Content", text: proposedContent }]
  };
}
