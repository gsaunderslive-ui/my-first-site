"use client";

import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { LEASE_TO_LEAD_STARTER_DEFAULTS } from "@/lib/playbookStarter";
import type { PlaybookDefaults, SourceOverrides } from "@/lib/playbookSchema";
import { PLAYBOOK_SOURCE_KEYS, emptyPlaybookDefaults } from "@/lib/playbookSchema";

type Scope = "company" | (typeof PLAYBOOK_SOURCE_KEYS)[number];

function mergeLoaded(defaults: Partial<PlaybookDefaults> | undefined): PlaybookDefaults {
  const e = emptyPlaybookDefaults();
  return {
    brandVoice: { ...e.brandVoice, ...defaults?.brandVoice },
    opening: { ...e.opening, ...defaults?.opening },
    qualification: { ...e.qualification, ...defaults?.qualification },
    objections: { ...e.objections, ...defaults?.objections },
    handoff: { ...e.handoff, ...defaults?.handoff },
    scheduling: { ...e.scheduling, ...defaults?.scheduling },
    compliance: { ...e.compliance, ...defaults?.compliance },
    followUpCadence: { ...e.followUpCadence, ...defaults?.followUpCadence },
    escalation: { ...e.escalation, ...defaults?.escalation },
    leaseTimeline: { ...e.leaseTimeline, ...defaults?.leaseTimeline },
    inboundReplies: { ...e.inboundReplies, ...defaults?.inboundReplies }
  };
}

function getStr(obj: Record<string, unknown> | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

type PlaybookEditorProps = {
  isAdmin: boolean;
};

export function PlaybookEditor({ isAdmin }: PlaybookEditorProps) {
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState<PlaybookDefaults>(() => emptyPlaybookDefaults());
  const [sourceOverrides, setSourceOverrides] = useState<SourceOverrides>({});
  const [scope, setScope] = useState<Scope>("company");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pr = await fetch("/api/playbook", { credentials: "include" });
      const p = await pr.json();
      setDefaults(mergeLoaded(p.defaults));
      setSourceOverrides((p.source_overrides || {}) as SourceOverrides);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = useCallback(
    (section: keyof PlaybookDefaults, field: string, value: string) => {
      if (scope === "company") {
        setDefaults((d) => {
          const cur = (d[section] as Record<string, string | undefined>) || {};
          return { ...d, [section]: { ...cur, [field]: value } };
        });
        return;
      }
      const src = scope;
      setSourceOverrides((so) => {
        const prevPatch = (so[src] || {}) as Partial<PlaybookDefaults>;
        const prevSec = (prevPatch[section] as Record<string, string | undefined>) || {};
        return {
          ...so,
          [src]: {
            ...prevPatch,
            [section]: { ...prevSec, [field]: value }
          }
        };
      });
    },
    [scope]
  );

  const getValue = useCallback(
    (section: keyof PlaybookDefaults, field: string): string => {
      const baseRec = defaults[section] as Record<string, string | undefined> | undefined;
      const base = getStr(baseRec, field);
      if (scope === "company") return base;
      const patch = sourceOverrides[scope] as Partial<PlaybookDefaults> | undefined;
      const patchSec = patch?.[section] as Record<string, string | undefined> | undefined;
      if (patchSec && Object.prototype.hasOwnProperty.call(patchSec, field)) {
        return patchSec[field] ?? "";
      }
      return base;
    },
    [defaults, sourceOverrides, scope]
  );

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/playbook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ defaults, source_overrides: sourceOverrides })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Save failed");
        return;
      }
      setMessage("Saved.");
      setFocusedFieldId(null);
    } finally {
      setSaving(false);
    }
  }

  function applyStarter() {
    if (!isAdmin) return;
    if (scope !== "company") {
      setMessage("Starter text applies to Company default only—switch to that tab first.");
      return;
    }
    if (!confirm("Replace company default playbook text with the built-in lease-to-lead starter? You can still edit after.")) {
      return;
    }
    setDefaults(mergeLoaded(LEASE_TO_LEAD_STARTER_DEFAULTS));
    setMessage("Starter loaded—click Save playbook to store it.");
  }

  if (loading) {
    return <p className="text-slate-500">Loading playbook…</p>;
  }

  const scopeHint =
    scope === "company"
      ? "These lines are your main scripts for everyone."
      : `Optional tweaks for “${scope}” leads only. Leave a box empty to use the company default for that line.`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Company playbook</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Plain-language scripts for your automated lease-to-lead flow. Edit any box—no code. Use{" "}
          <span className="font-medium text-slate">Company default</span> for everyone, or pick a lead source to adjust
          wording for website vs referral vs portal visitors.
        </p>
      </header>

      {!isAdmin ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          View only. Ask an admin to change scripts.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setScope("company")}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            scope === "company" ? "bg-slate text-white shadow-sm" : "text-slate/70 hover:bg-slate/5"
          }`}
        >
          Company default
        </button>
        {PLAYBOOK_SOURCE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setScope(k)}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
              scope === k ? "bg-mint/90 text-slate shadow-sm" : "text-slate/70 hover:bg-slate/5"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate/60">{scopeHint}</p>

      {isAdmin && scope === "company" ? (
        <button
          type="button"
          onClick={applyStarter}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate/80 shadow-sm hover:bg-slate/5"
        >
          Load lease-to-lead starter text
        </button>
      ) : null}

      <div className="relative space-y-0">
        <PipelineSection
          step={1}
          title="Brand voice"
          description="How your team sounds in every message."
          isLast={false}
        >
          <Field
            id="bv-name"
            label="Short company name"
            hint='How you refer to yourselves in text (e.g. "our team" or your brand).'
            value={getValue("brandVoice", "companyShortName")}
            onChange={(v) => setField("brandVoice", "companyShortName", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
          />
          <Field
            id="bv-tone"
            label="Tone"
            hint="One or two sentences on voice and style."
            value={getValue("brandVoice", "tone")}
            onChange={(v) => setField("brandVoice", "tone", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="bv-avoid"
            label="Words to avoid"
            hint="Comma-separated phrases the AI should not use."
            value={getValue("brandVoice", "wordsToAvoid")}
            onChange={(v) => setField("brandVoice", "wordsToAvoid", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="bv-disc"
            label="Disclosures"
            hint="Short legal / fairness line if you use one."
            value={getValue("brandVoice", "disclosures")}
            onChange={(v) => setField("brandVoice", "disclosures", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
        </PipelineSection>

        <PipelineSection step={2} title="Opening messages" description="First SMS and email when you reach out." isLast={false}>
          <Field
            id="op-sms"
            label="SMS opener"
            hint="You can use placeholders like {{name}} or {{agent}} if your sending flow supports them."
            value={getValue("opening", "sms")}
            onChange={(v) => setField("opening", "sms", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={5}
          />
          <Field
            id="op-sub"
            label="Email subject"
            value={getValue("opening", "emailSubject")}
            onChange={(v) => setField("opening", "emailSubject", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
          />
          <Field
            id="op-body"
            label="Email body"
            value={getValue("opening", "emailBody")}
            onChange={(v) => setField("opening", "emailBody", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={8}
          />
        </PipelineSection>

        <PipelineSection
          step={3}
          title="Qualification"
          description="Replies when you’re learning timeline, budget, and intent."
          isLast={false}
        >
          <Field
            id="q-just"
            label="They’re “just looking”"
            value={getValue("qualification", "justLooking")}
            onChange={(v) => setField("qualification", "justLooking", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
          <Field
            id="q-rvb"
            label="Rent vs buy"
            value={getValue("qualification", "rentVsBuy")}
            onChange={(v) => setField("qualification", "rentVsBuy", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
          <Field
            id="q-time"
            label="Timeline"
            value={getValue("qualification", "timeline")}
            onChange={(v) => setField("qualification", "timeline", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="q-bud"
            label="Budget / payment comfort"
            value={getValue("qualification", "budget")}
            onChange={(v) => setField("qualification", "budget", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="q-ns"
            label="Not sure if they qualify"
            value={getValue("qualification", "notSureQualify")}
            onChange={(v) => setField("qualification", "notSureQualify", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
        </PipelineSection>

        <PipelineSection
          step={4}
          title="Objections & rebuttals"
          description="Short responses when someone pushes back."
          isLast={false}
        >
          <Field
            id="ob-nr"
            label="Not ready"
            value={getValue("objections", "notReady")}
            onChange={(v) => setField("objections", "notReady", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
          <Field
            id="ob-re"
            label="Renting is easier"
            value={getValue("objections", "rentingEasier")}
            onChange={(v) => setField("objections", "rentingEasier", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
          <Field
            id="ob-rate"
            label="Rates are too high"
            value={getValue("objections", "ratesHigh")}
            onChange={(v) => setField("objections", "ratesHigh", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
          <Field
            id="ob-part"
            label="Need spouse / partner"
            value={getValue("objections", "needPartner")}
            onChange={(v) => setField("objections", "needPartner", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="ob-list"
            label="Only wants listings"
            value={getValue("objections", "listingsOnly")}
            onChange={(v) => setField("objections", "listingsOnly", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
        </PipelineSection>

        <PipelineSection step={5} title="Handoff to a human" description="When to stop automation and what to say." isLast={false}>
          <Field
            id="ho-when"
            label="When to hand off"
            value={getValue("handoff", "whenToStopAi")}
            onChange={(v) => setField("handoff", "whenToStopAi", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="ho-msg"
            label="Handoff message to the lead"
            value={getValue("handoff", "handoffMessage")}
            onChange={(v) => setField("handoff", "handoffMessage", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="ho-int"
            label="Internal note (for your team)"
            value={getValue("handoff", "internalNote")}
            onChange={(v) => setField("handoff", "internalNote", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
        </PipelineSection>

        <PipelineSection step={6} title="Scheduling" description="Calls to action and hours." isLast={false}>
          <Field
            id="sch-cta"
            label="Default call to action"
            value={getValue("scheduling", "defaultCta")}
            onChange={(v) => setField("scheduling", "defaultCta", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="sch-url"
            label="Booking link"
            value={getValue("scheduling", "bookingUrl")}
            onChange={(v) => setField("scheduling", "bookingUrl", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
          />
          <Field
            id="sch-hr"
            label="Business hours"
            value={getValue("scheduling", "businessHours")}
            onChange={(v) => setField("scheduling", "businessHours", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
        </PipelineSection>

        <PipelineSection step={7} title="Compliance" description="Opt-out and fair housing lines." isLast={false}>
          <Field
            id="co-sms"
            label="SMS opt-out"
            value={getValue("compliance", "optOutSms")}
            onChange={(v) => setField("compliance", "optOutSms", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="co-em"
            label="Email opt-out"
            value={getValue("compliance", "optOutEmail")}
            onChange={(v) => setField("compliance", "optOutEmail", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="co-fh"
            label="Fair housing"
            value={getValue("compliance", "fairHousing")}
            onChange={(v) => setField("compliance", "fairHousing", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
        </PipelineSection>

        <PipelineSection step={8} title="Follow-up rhythm" description="Light touches if someone goes quiet." isLast={false}>
          <Field
            id="fu-d1"
            label="Day 1 follow-up"
            value={getValue("followUpCadence", "day1")}
            onChange={(v) => setField("followUpCadence", "day1", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="fu-d3"
            label="Day 3 follow-up"
            value={getValue("followUpCadence", "day3")}
            onChange={(v) => setField("followUpCadence", "day3", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="fu-d7"
            label="Day 7 follow-up"
            value={getValue("followUpCadence", "day7")}
            onChange={(v) => setField("followUpCadence", "day7", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="fu-q"
            label="When they’ve gone quiet"
            value={getValue("followUpCadence", "whenQuiet")}
            onChange={(v) => setField("followUpCadence", "whenQuiet", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
        </PipelineSection>

        <PipelineSection step={9} title="Escalation" description="When a human should take over fast." isLast={false}>
          <Field
            id="es-cal"
            label="When to escalate"
            value={getValue("escalation", "notifyWhen")}
            onChange={(v) => setField("escalation", "notifyWhen", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={4}
          />
        </PipelineSection>

        <PipelineSection
          step={10}
          title="Lease automation SMS (decision tree)"
          description="Messages when you run SMS automation (e.g. Engage / timeline). The app picks one row using lease dates: 10+ mo → 9+ → 8+ (credit split) → 6–7 → 3–5 → welcome. Use {{elapsedMonths}}, {{remainingMonths}}, {{totalLeaseMonths}}, {{rent}}, {{name}}."
          isLast={false}
        >
          {isAdmin && scope === "company" ? (
            <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate/5 p-3 text-sm text-slate/80">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(defaults.leaseTimeline?.useOpenAiPolish)}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    leaseTimeline: { ...d.leaseTimeline, useOpenAiPolish: e.target.checked }
                  }))
                }
              />
              <span>
                <span className="font-medium text-slate">Polish these messages with OpenAI</span> (off = send exactly
                what you type here, after placeholders). Also applies to inbound auto-replies below.
              </span>
            </label>
          ) : null}
          <Field
            id="lt-welcome"
            label="Welcome — under 3 full months into lease"
            value={getValue("leaseTimeline", "welcome")}
            onChange={(v) => setField("leaseTimeline", "welcome", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-3-5"
            label="3–5 months elapsed"
            hint="Shows real elapsed month count in {{elapsedMonths}}."
            value={getValue("leaseTimeline", "elapsed3to5")}
            onChange={(v) => setField("leaseTimeline", "elapsed3to5", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-6-7"
            label="6–7 months elapsed"
            value={getValue("leaseTimeline", "elapsed6to7")}
            onChange={(v) => setField("leaseTimeline", "elapsed6to7", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-8-low"
            label="8+ months, credit under 600 (estimated score or range)"
            value={getValue("leaseTimeline", "elapsed8creditLow")}
            onChange={(v) => setField("leaseTimeline", "elapsed8creditLow", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-8-ok"
            label="8+ months, credit 600+"
            value={getValue("leaseTimeline", "elapsed8creditOk")}
            onChange={(v) => setField("leaseTimeline", "elapsed8creditOk", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-9"
            label="9+ months elapsed"
            value={getValue("leaseTimeline", "elapsed9")}
            onChange={(v) => setField("leaseTimeline", "elapsed9", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
          <Field
            id="lt-10"
            label="10+ months elapsed"
            value={getValue("leaseTimeline", "elapsed10plus")}
            onChange={(v) => setField("leaseTimeline", "elapsed10plus", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={3}
          />
        </PipelineSection>

        <PipelineSection
          step={11}
          title="Inbound SMS replies (decision tree)"
          description="After the tenant texts back. Order: if message contains BUY → afterBuy; if YES → afterYes; then if credit under 600 → credit line; else if credit over 660 → lender line; else default. Credit uses estimated score if set, else range."
          isLast
        >
          <Field
            id="ir-def"
            label="Default (no keyword / mid credit)"
            value={getValue("inboundReplies", "defaultReply")}
            onChange={(v) => setField("inboundReplies", "defaultReply", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="ir-buy"
            label="Contains BUY"
            value={getValue("inboundReplies", "afterBuy")}
            onChange={(v) => setField("inboundReplies", "afterBuy", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="ir-yes"
            label="Contains YES"
            value={getValue("inboundReplies", "afterYes")}
            onChange={(v) => setField("inboundReplies", "afterYes", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="ir-c-low"
            label="Credit below 600 (wins over BUY/YES for final message)"
            value={getValue("inboundReplies", "creditBelow600")}
            onChange={(v) => setField("inboundReplies", "creditBelow600", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
          <Field
            id="ir-c-hi"
            label="Credit above 660"
            value={getValue("inboundReplies", "creditAbove660")}
            onChange={(v) => setField("inboundReplies", "creditAbove660", v)}
            disabled={!isAdmin}
            focusedFieldId={focusedFieldId}
            setFocusedFieldId={setFocusedFieldId}
            rows={2}
          />
        </PipelineSection>
      </div>

      {message ? (
        <p className="rounded-xl border border-slate-200 bg-slate/5 px-4 py-3 text-sm text-slate-700">{message}</p>
      ) : null}

      {isAdmin ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:left-[260px]">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate/60">Changes apply after you save.</p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-slate px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save playbook"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PipelineSection({
  step,
  title,
  description,
  isLast,
  children
}: {
  step: number;
  title: string;
  description: string;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex gap-4 pb-10">
      <div className="flex w-11 shrink-0 flex-col items-center">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint/25 text-sm font-bold text-slate shadow-sm ring-1 ring-mint/30">
          {step}
        </div>
        {!isLast ? <div className="mt-1 w-px flex-1 min-h-[2rem] bg-gradient-to-b from-mint/50 to-slate-200" /> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate">{title}</h2>
          <p className="mt-1 text-sm text-slate/55">{description}</p>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  rows = 3,
  focusedFieldId,
  setFocusedFieldId
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows?: number;
  focusedFieldId: string | null;
  setFocusedFieldId: Dispatch<SetStateAction<string | null>>;
}) {
  const active = focusedFieldId === id;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-mint/25">
      <label htmlFor={id} className="block text-sm font-medium text-slate">
        {label}
      </label>
      {hint ? <p className="mt-1 text-xs text-slate/50">{hint}</p> : null}
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocusedFieldId(id)}
        onBlur={() => setFocusedFieldId(null)}
        disabled={disabled}
        readOnly={disabled}
        className={`mt-3 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-relaxed text-slate/90 shadow-inner outline-none transition placeholder:text-slate/35 ${
          active ? "border-mint/50 ring-2 ring-mint/20" : "border-slate-200"
        } ${disabled ? "cursor-not-allowed bg-slate/5" : "bg-white hover:border-slate-300"}`}
        placeholder="Click to add or edit…"
      />
    </div>
  );
}
