/** Empty playbook template — company default + keys for source overrides (website, referral, portal, other). */
export const PLAYBOOK_SOURCE_KEYS = ["website", "referral", "portal", "other"] as const;

/** SMS sent by lease-elapsed automation (`processLead`). Edited in Company playbook → Lease automation tree. */
export type LeaseTimelinePlaybook = {
  /** Elapsed &lt; 3 full months into lease */
  welcome?: string;
  /** 3–5 months elapsed (uses {{elapsedMonths}}, {{rent}}, {{remainingMonths}}, {{name}}) */
  elapsed3to5?: string;
  /** 6–7 months elapsed */
  elapsed6to7?: string;
  /** 8+ months elapsed, estimated credit under 600 */
  elapsed8creditLow?: string;
  /** 8+ months elapsed, credit 600+ */
  elapsed8creditOk?: string;
  /** 9+ months elapsed */
  elapsed9?: string;
  /** 10+ months elapsed */
  elapsed10plus?: string;
  /** If true, OpenAI may rewrite workflow SMS; if false/omit, your text is sent exactly (after placeholders). */
  useOpenAiPolish?: boolean;
};

/** Auto-replies after inbound SMS (`handleIncomingReply`). Last matching credit rule wins after BUY/YES. */
export type InboundRepliesPlaybook = {
  defaultReply?: string;
  afterBuy?: string;
  afterYes?: string;
  creditBelow600?: string;
  creditAbove660?: string;
};

export type PlaybookDefaults = {
  brandVoice?: { companyShortName?: string; tone?: string; wordsToAvoid?: string; disclosures?: string };
  opening?: { sms?: string; emailSubject?: string; emailBody?: string };
  qualification?: { justLooking?: string; rentVsBuy?: string; timeline?: string; budget?: string; notSureQualify?: string };
  objections?: {
    notReady?: string;
    rentingEasier?: string;
    ratesHigh?: string;
    needPartner?: string;
    listingsOnly?: string;
  };
  handoff?: { whenToStopAi?: string; handoffMessage?: string; internalNote?: string };
  scheduling?: { defaultCta?: string; bookingUrl?: string; businessHours?: string };
  compliance?: { optOutSms?: string; optOutEmail?: string; fairHousing?: string };
  followUpCadence?: { day1?: string; day3?: string; day7?: string; whenQuiet?: string };
  escalation?: { notifyWhen?: string };
  leaseTimeline?: LeaseTimelinePlaybook;
  inboundReplies?: InboundRepliesPlaybook;
};

export type SourceOverrides = Partial<Record<(typeof PLAYBOOK_SOURCE_KEYS)[number], Partial<PlaybookDefaults>>>;

export function emptyPlaybookDefaults(): PlaybookDefaults {
  return {
    brandVoice: {},
    opening: {},
    qualification: {},
    objections: {},
    handoff: {},
    scheduling: {},
    compliance: {},
    followUpCadence: {},
    escalation: {},
    leaseTimeline: {},
    inboundReplies: {}
  };
}
