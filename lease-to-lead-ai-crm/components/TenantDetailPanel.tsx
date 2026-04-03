"use client";

import { TenantView } from "@/lib/types";

export function TenantDetailPanel({
  tenant,
  onSend,
  onSimulateEngagement,
  onConsentChange,
  recentChatMessages
}: {
  tenant: TenantView;
  onSend: (channel: "Email" | "SMS" | "AI Call") => void;
  onSimulateEngagement: () => void;
  onConsentChange: (value: boolean) => void;
  recentChatMessages?: { id: string; content: string; direction: "outbound" | "inbound"; created_at: string }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate">{tenant.name}</h3>
          <p className="text-sm text-slate/60">
            {tenant.email} · {tenant.phone}
          </p>
        </div>
        <div className="w-36">
          <div className="mb-1 flex items-center justify-between text-xs text-slate/60">
            <span>Lead Score</span>
            <span>{tenant.engagement_score}</span>
          </div>
          <div className="h-2 rounded-full bg-mist">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber to-coral"
              style={{ width: `${Math.min(100, (tenant.engagement_score / 12) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate/70">
        <p>Stage: <span className="font-semibold text-slate">{tenant.stage}</span></p>
        <p className="mt-1">Score: <span className="font-semibold text-slate">{tenant.engagement_score}</span></p>
        <p className="mt-1">Consent Status: <span className="font-semibold text-slate">{tenant.consent_status ? "Opted In" : "Opted Out"}</span></p>
      </div>

      <div className="mt-4 rounded-xl bg-slate/5 p-3 text-sm text-slate/80">
        <p className="font-medium text-slate">AI Message Preview</p>
        <p className="mt-1">{tenant.aiPreview}</p>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate/80">
        <input
          type="checkbox"
          checked={tenant.consent_status}
          onChange={(e) => onConsentChange(e.target.checked)}
        />
        I agree to be contacted via SMS, email, and phone
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onSend("Email")}
          className="rounded-lg bg-slate px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Send Email
        </button>
        <button
          onClick={() => onSend("SMS")}
          className="rounded-lg bg-mint px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
        >
          Send SMS
        </button>
        <button
          onClick={() => onSend("AI Call")}
          className="rounded-lg bg-coral px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Trigger AI Call
        </button>
        <button
          onClick={onSimulateEngagement}
          className="rounded-lg bg-amber px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Simulate Engagement
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-slate">Message Timeline</p>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {!recentChatMessages || recentChatMessages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate/60">
              No simulated messages yet.
            </div>
          ) : (
            recentChatMessages.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate">{item.direction === "outbound" ? "Outbound SMS" : "Inbound Reply"}</span>
                  <span className="text-xs text-slate/50">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-slate/60">{item.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
