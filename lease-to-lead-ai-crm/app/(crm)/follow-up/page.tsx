"use client";

import { useCrmData } from "@/lib/useCrmData";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

function nextAction(t: { interestLevel: string; leadScore: number; status: string }) {
  if (t.leadScore >= 75) return { label: "Schedule showing", kind: "showing" as const };
  if (t.leadScore >= 55) return { label: "Book consultation call", kind: "call" as const };
  return { label: "Send follow-up message", kind: "message" as const };
}

export default function FollowUpPage() {
  const { data, loading } = useCrmData();
  const router = useRouter();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openConversation = useCallback(
    async (tenantId: string, existingChatId: string | null | undefined) => {
      setOpeningId(tenantId);
      try {
        let chatId = existingChatId ?? null;
        if (!chatId) {
          const res = await fetch(`/api/tenant/${tenantId}/chat`, { cache: "no-store" });
          const j = await res.json().catch(() => ({}));
          chatId = (j?.chat?.id as string | undefined) ?? null;
        }
        if (chatId) {
          router.push(`/communication?chatId=${encodeURIComponent(chatId)}`);
        } else {
          router.push("/communication");
        }
      } finally {
        setOpeningId(null);
      }
    },
    [router]
  );

  const rows = useMemo(() => {
    if (!data?.tenants) return [];
    return data.tenants.filter(
      (t) =>
        t.interestLevel !== "low" &&
        (t.status === "Warm" || t.status === "Hot" || t.leadScore >= 40 || t.engagement_score > 3)
    );
  }, [data?.tenants]);

  if (loading || !data) {
    return <div className="rounded-2xl bg-white p-6 shadow-soft">Loading follow-up queue…</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl bg-gradient-to-r from-slate to-slate-700 p-5 text-white shadow-soft">
        <h2 className="text-2xl font-semibold">Follow Up</h2>
        <p className="text-sm text-white/80">
          Tenants who need the next step based on engagement, readiness, and lead score.
        </p>
      </header>

      <div className="overflow-auto rounded-2xl border border-slate-100 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate/5 text-slate/70">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Last interaction</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Lead score</th>
              <th className="px-4 py-3">Suggested next action</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate/60">
                  No follow-ups right now. Engage tenants from Active Tenants to build this queue.
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                const na = nextAction(t);
                const busy = openingId === t.id;
                return (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate/5">
                    <td className="px-4 py-3 font-medium text-slate">{t.name}</td>
                    <td className="px-4 py-3 text-slate/70">
                      {t.lastInteractionAt ? new Date(t.lastInteractionAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate/80">{t.interestLevel}</td>
                    <td className="px-4 py-3">{t.leadScore}</td>
                    <td className="px-4 py-3 text-slate/80">{na.label}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openConversation(t.id, t.chatId)}
                        className="text-left text-mint hover:underline disabled:cursor-wait disabled:opacity-60"
                      >
                        {busy ? "Opening…" : "Conversation"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
