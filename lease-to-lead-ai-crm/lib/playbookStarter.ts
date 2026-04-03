import type { PlaybookDefaults } from "./playbookSchema";

/**
 * Sensible starting copy for a lease-to-lead / tenant-to-buyer automated workflow.
 * Shown as placeholders and "Reset to starter" — stored in DB only after save.
 */
export const LEASE_TO_LEAD_STARTER_DEFAULTS: PlaybookDefaults = {
  brandVoice: {
    companyShortName: "our team",
    tone: "Warm and professional—helpful, never pushy. Short sentences. Celebrate small steps toward homeownership.",
    wordsToAvoid: "Guarantee, desperate, cheap, you have to, today only (unless true)",
    disclosures: "We provide general information, not legal or financial advice. Equal housing opportunity."
  },
  opening: {
    sms: `Hi {{name}}, this is {{agent}} with [Company]. You lease at [Property]—we help renters explore buying when it makes sense. Reply YES if you'd like a quick, no-pressure text thread, or STOP to opt out.`,
    emailSubject: "Quick question about your lease and buying a home",
    emailBody: `Hi {{name}},

I'm reaching out because you're a resident at [Property]. Many renters are surprised by what they can qualify for—we help people compare renting vs. buying with simple, clear numbers.

If you'd like, reply with a good time for a 10-minute call or text thread. No obligation.

— {{agent}}
[Company]`
  },
  qualification: {
    justLooking: `Totally fine to browse. I can send 2–3 listings that fit your budget when you're ready, or we can pause until a later month.`,
    rentVsBuy: `A quick way to think about it: compare your monthly rent to an estimated mortgage payment (with taxes/insurance). We can run rough numbers together—no credit pull required for a first pass.`,
    timeline: `When would you ideally want to move if you bought? Even a range (6–12 months, 1–2 years) helps us tailor next steps.`,
    budget: `What monthly payment range feels comfortable—not the max you were approved for, but what you'd actually want to pay?`,
    notSureQualify: `No problem. We can start with a soft checklist: income range, savings for down payment, and credit in general terms. A lender can confirm details when you're ready.`
  },
  objections: {
    notReady: `Makes sense. We can stay in touch lightly—occasional market snapshots or one listing when it matches what you described. Tell me when to pause.`,
    rentingEasier: `Renting can be simpler month-to-month. Buying is a longer game—equity and stability often matter over 3–5+ years. We can compare side-by-side with real numbers when you want.`,
    ratesHigh: `Rates change. Many buyers focus on monthly payment and time in the home. We can model a few scenarios so you can decide what's worth it for you.`,
    needPartner: `Buying together is common. We can note what each person is comfortable sharing and keep both of you in the loop when you're ready.`,
    listingsOnly: `Happy to send listings. If you tell me beds/baths, area, and monthly payment comfort, I'll match closer options and skip the noise.`
  },
  handoff: {
    whenToStopAi: `Hand off to a human when the lead asks for a showing, pre-approval, specific legal/tax advice, or says they're ready to offer.`,
    handoffMessage: `I'm looping in {{agent}} who can pick this up with you directly. They'll text or call shortly.`,
    internalNote: `Lead source: [source]. Interest: [rent vs buy / timeline]. Next: [schedule call / send listings / nurture].`
  },
  scheduling: {
    defaultCta: `Would you prefer a quick call or text thread? Here are a few times that work: [slots].`,
    bookingUrl: "https://cal.example.com/your-booking-link",
    businessHours: "Mon–Fri 9–6, Sat 10–2 (local time)"
  },
  compliance: {
    optOutSms: `Reply STOP to opt out of SMS. Msg & data rates may apply.`,
    optOutEmail: `Unsubscribe link in email footer; we only send relevant follow-ups you asked for.`,
    fairHousing: `We follow fair housing law—we don't discriminate and we don't steer.`
  },
  followUpCadence: {
    day1: `Quick check-in: any questions from our last message? I'm here.`,
    day3: `Sharing one listing that fits what you mentioned—happy to adjust criteria.`,
    day7: `Gentle ping: still interested in comparing rent vs. buy, or should we check back next month?`,
    whenQuiet: `If we don't hear back, we'll space out to monthly market notes unless you say otherwise.`
  },
  escalation: {
    notifyWhen: `Escalate to a human if: angry tone, legal threat, fair housing concern, or repeated confusion after two clarifications.`
  },
  leaseTimeline: {
    welcome: `Welcome, {{name}}! I’ll send occasional updates to help you compare renting vs buying over your lease timeline.`,
    elapsed3to5: `You’re {{elapsedMonths}} months into your lease. With rent around {{rent}}, buying might be closer than expected.`,
    elapsed6to7: `We’re hosting a buyer seminar this month. Want me to send the registration link?`,
    elapsed8creditLow: `You can still prepare to buy. I can share a 90-day credit improvement plan if you want it.`,
    elapsed8creditOk: `Your profile is improving. Want a lender-precheck estimate with no commitment? Reply YES.`,
    elapsed9: `Quick check-in: are you still thinking about buying this year? Reply YES and I can map next steps.`,
    elapsed10plus: `Your lease is getting close to renewal. Want to review buy options before rates shift? Reply BUY to start.`,
    useOpenAiPolish: false
  },
  inboundReplies: {
    defaultReply: `Thanks for the reply. I can share next steps whenever you’re ready.`,
    afterBuy: `Great. I can send a quick buy-readiness checklist and timeline.`,
    afterYes: `Perfect. I’ll ask 2 quick questions to match you with the right path.`,
    creditBelow600: `Based on your profile, I recommend a credit improvement plan first. Want the 90-day guide?`,
    creditAbove660: `You look lender-ready. Want me to connect you with a lender precheck?`
  }
};

/** Deep-merge automation keys so saved playbooks pick up new starter lines for any missing field. */
export function mergeAutomationPlaybookDefaults(defaults: PlaybookDefaults): PlaybookDefaults {
  const s = LEASE_TO_LEAD_STARTER_DEFAULTS;
  return {
    ...defaults,
    leaseTimeline: { ...s.leaseTimeline, ...defaults.leaseTimeline },
    inboundReplies: { ...s.inboundReplies, ...defaults.inboundReplies }
  };
}
