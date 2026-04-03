"use client";

import { ActiveTenantsWorkspace } from "@/components/ActiveTenantsWorkspace";
import type { TenantView } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ChatItem = {
  id: string;
  tenant_id: string;
  control_mode: "ai" | "human";
  created_at: string;
  last_message: string | null;
  tenants?: { name?: string | null; phone?: string | null } | null;
};

export default function CommunicationDashboardPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState("");
  const [error, setError] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [queryChatId, setQueryChatId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [automationHours, setAutomationHours] = useState(72);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sent = params.get("sent");
    setQueryChatId(params.get("chatId"));
    if (sent === "1") {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchChats() {
      const res = await fetch("/api/chats", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!mounted) return;
      if (!res.ok) {
        setError(String(json?.error || `Failed to load chats (${res.status})`));
        return;
      }

      const nextChats = (json?.chats || []) as ChatItem[];
      setChats(nextChats);

      const fromQuery = queryChatId;
      const first = nextChats[0]?.id || null;
      const keepCurrent = selectedChatId && nextChats.some((item) => item.id === selectedChatId) ? selectedChatId : null;
      const nextSelected =
        keepCurrent || (fromQuery && nextChats.some((item) => item.id === fromQuery) ? fromQuery : first);
      setSelectedChatId(nextSelected);
    }

    void fetchChats();
    const interval = setInterval(() => {
      void fetchChats();
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [queryChatId, selectedChatId]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) || null;

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/chats", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setChats((json?.chats || []) as ChatItem[]);
  }, []);

  const openTenantChat = useCallback(
    async (tenant: TenantView) => {
      let cid = tenant.chatId ?? null;
      if (!cid) {
        const res = await fetch(`/api/tenant/${tenant.id}/chat`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return;
        cid = j?.chat?.id ?? null;
      }
      if (!cid) return;
      setSelectedChatId(cid);
      setQueryChatId(cid);
      router.replace(`/communication?chatId=${cid}`);
      await refreshChats();
    },
    [router, refreshChats]
  );

  const fetchSuggestions = useCallback(
    async (chatId: string, lastInbound: string) => {
      const res = await fetch(`/api/chats/${chatId}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastInbound })
      });
      const json = await res.json().catch(() => ({}));
      if (json?.suggestions) setSuggestions(json.suggestions as string[]);
    },
    []
  );

  /** Loads messages in the background only to refresh AI-assisted suggestions (no duplicate thread on screen). */
  const refreshAssistedSuggestions = useCallback(async () => {
    if (!selectedChatId) return;
    const res = await fetch(`/api/chats/${selectedChatId}/messages`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(json?.error || `Failed to sync thread (${res.status})`));
      setSuggestions([]);
      return;
    }
    setError("");
    type M = { direction: string; content: string };
    const nextMessages = (json?.messages || []) as M[];
    const chatRow = (json?.chat as ChatItem | undefined) || chats.find((c) => c.id === selectedChatId);
    if (chatRow?.control_mode === "human") {
      const lastIn = [...nextMessages].reverse().find((m) => m.direction === "inbound");
      if (selectedChatId && lastIn?.content) void fetchSuggestions(selectedChatId, lastIn.content);
    } else {
      setSuggestions([]);
    }
  }, [selectedChatId, chats, fetchSuggestions]);

  useEffect(() => {
    if (!selectedChatId) {
      setSuggestions([]);
      return;
    }

    let mounted = true;
    async function tick() {
      if (!mounted) return;
      await refreshAssistedSuggestions();
    }
    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedChatId, refreshAssistedSuggestions]);

  useEffect(() => {
    if (!selectedChatId) return;
    (async () => {
      const res = await fetch("/api/tenants", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const t = (json?.tenants || []).find((x: { id: string }) => x.id === selectedChat?.tenant_id);
      if (t) {
        setAutomationEnabled(t.automationEnabled !== false);
        setAutomationHours(t.automationIntervalHours ?? 72);
      }
    })();
  }, [selectedChatId, selectedChat?.tenant_id]);

  async function toggleControlMode(chatId: string, next: "ai" | "human") {
    setActionLoading(true);
    const res = await fetch(`/api/chats/${chatId}/control`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ control_mode: next })
    });
    if (!res.ok) {
      setActionLoading(false);
      return;
    }

    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, control_mode: next } : chat)));
    setActionLoading(false);
  }

  async function sendManualMessage() {
    if (!selectedChatId || !manualMessage.trim()) return;
    const res = await fetch(`/api/chats/${selectedChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: manualMessage.trim() })
    });
    if (!res.ok) return;

    setManualMessage("");
    await refreshAssistedSuggestions();
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === selectedChatId ? { ...chat, last_message: manualMessage.trim() } : chat
      )
    );
  }

  async function sendAutomatedMessageNow() {
    if (!selectedChat) return;
    setActionLoading(true);
    const res = await fetch(`/api/tenant/${selectedChat.tenant_id}/engage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "SMS" })
    });
    if (res.ok) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
    setActionLoading(false);
  }

  async function saveAutomation() {
    if (!selectedChat) return;
    await fetch(`/api/tenant/${selectedChat.tenant_id}/automation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automation_enabled: automationEnabled,
        automation_interval_hours: automationHours
      })
    });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }

  const modeLabel = selectedChat?.control_mode === "ai" ? "Fully Automated" : "AI-Assisted";

  return (
    <div className="space-y-4">
      {showToast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate px-4 py-2 text-sm text-white shadow-lg">
          Updated successfully
        </div>
      ) : null}

      <header>
        <h2 className="text-2xl font-semibold text-slate">Active Tenants &amp; Communication</h2>
        <p className="text-sm text-slate/70">
          Wide pipeline table: click a row to choose whose thread you are controlling. Click a name for the full profile and
          message history. Modes and sends use the slim panel on the right.
        </p>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex min-w-0 max-w-full flex-col gap-4 xl:flex-row xl:items-stretch">
        <section className="min-w-0 flex-1 overflow-x-auto">
          <ActiveTenantsWorkspace
            variant="embedded"
            onSelectTenantForMessaging={openTenantChat}
            messagingTenantId={selectedChat?.tenant_id ?? null}
            hideCommunicationDashboardLink
          />
        </section>

        <aside className="w-full min-w-0 shrink-0 xl:sticky xl:top-4 xl:w-72 xl:max-w-full xl:self-start">
          <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          {!selectedChatId ? (
            <p className="text-sm text-slate/60">
              Select a tenant <span className="font-medium text-slate">row</span> (not the name) to attach messaging controls
              here.
            </p>
          ) : null}
          {chats.length === 0 && !selectedChatId ? (
            <p className="mb-3 text-xs text-slate/50">No SMS threads yet — pick a tenant row or open a name and send SMS.</p>
          ) : null}
          {selectedChat ? (
            <div className="mb-3 space-y-3">
              <div className="border-b border-slate-100 pb-3">
                <p className="text-[11px] uppercase tracking-wide text-slate/45">Active thread</p>
                <p className="mt-1 font-semibold text-slate">{selectedChat.tenants?.name || "Tenant"}</p>
                {selectedChat.tenants?.phone ? (
                  <p className="text-xs text-slate/55">{selectedChat.tenants.phone}</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm text-slate/70">
                  Mode: <span className="font-semibold text-slate">{modeLabel}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={actionLoading || selectedChat.control_mode === "ai"}
                    onClick={() => toggleControlMode(selectedChat.id, "ai")}
                    className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate/70 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fully Automated
                  </button>
                  <button
                    disabled={actionLoading || selectedChat.control_mode === "human"}
                    onClick={() => toggleControlMode(selectedChat.id, "human")}
                    className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate/70 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    AI-Assisted
                  </button>
                  <button
                    disabled={actionLoading || !automationEnabled}
                    onClick={sendAutomatedMessageNow}
                    className="rounded-md bg-mint px-3 py-1 text-sm text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Run automation now
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-slate-200 p-3">
                <p className="text-sm font-medium text-slate">AI automation</p>
                <label className="mt-2 flex items-center gap-2 text-sm text-slate/80">
                  <input
                    type="checkbox"
                    checked={automationEnabled}
                    onChange={(e) => setAutomationEnabled(e.target.checked)}
                  />
                  Enable scheduled automation
                </label>
                <label className="mt-2 block text-sm text-slate/70">
                  Interval (hours)
                  <input
                    type="number"
                    min={6}
                    max={168}
                    className="ml-2 w-24 rounded border border-slate-200 px-2 py-1"
                    value={automationHours}
                    onChange={(e) => setAutomationHours(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  onClick={saveAutomation}
                  className="mt-2 rounded-md bg-slate px-3 py-1 text-sm text-white hover:bg-slate-800"
                >
                  Save automation settings
                </button>
                <p className="mt-1 text-xs text-slate/50">
                  Lease-based triggers can be extended in Automation Engine. Manual overrides always apply.
                </p>
              </div>
            </div>
          ) : null}

          {selectedChat?.control_mode === "human" && suggestions.length > 0 ? (
            <div className="mb-3 rounded-lg bg-slate/5 p-3">
              <p className="text-sm font-medium text-slate">Suggested replies</p>
              <div className="mt-2 flex flex-col gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setManualMessage(s)}
                    className="break-words rounded-lg border border-slate-200 bg-white p-2 text-left text-sm text-slate/80 hover:bg-slate/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedChatId && selectedChat ? (
            <p className="mb-3 text-xs text-slate/50">
              Message history and <span className="font-medium text-slate/65">testing (simulate tenant)</span> are in the tenant
              profile (click a name on the left). This panel keeps modes, automation, and assisted replies in sync.
            </p>
          ) : null}

          {selectedChat?.control_mode === "human" ? (
            <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                placeholder="Edit AI draft or type your message, then send..."
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={sendManualMessage}
                className="shrink-0 rounded-md bg-slate px-3 py-2 text-sm text-white hover:bg-slate-800 sm:self-end"
              >
                Send
              </button>
            </div>
          ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
