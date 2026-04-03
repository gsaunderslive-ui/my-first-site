"use client";

import { useCallback, useEffect, useState } from "react";
import { Channel, Snapshot } from "./types";

export function useCrmData() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tenants", { cache: "no-store" });
    const json = (await res.json()) as Snapshot;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const engage = useCallback(
    async (tenantId: string, channel: Channel) => {
      const res = await fetch(`/api/tenant/${tenantId}/engage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json?.error || `Engage failed (${res.status})`));
      }

      await refresh();
      return json;
    },
    [refresh]
  );

  const assign = useCallback(
    async (tenantId: string, type: "assign" | "schedule") => {
      await fetch(`/api/tenant/${tenantId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      await refresh();
    },
    [refresh]
  );

  const simulateEngagement = useCallback(
    async (tenantId: string) => {
      await fetch(`/api/tenant/${tenantId}/simulate-engagement`, { method: "POST" });
      await refresh();
    },
    [refresh]
  );

  const updateConsent = useCallback(
    async (tenantId: string, consent_status: boolean) => {
      await fetch(`/api/tenant/${tenantId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_status })
      });
      await refresh();
    },
    [refresh]
  );

  const saveReminder = useCallback(
    async (tenantId: string, date: string, time: string) => {
      await fetch(`/api/tenant/${tenantId}/schedule-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time })
      });
      await refresh();
    },
    [refresh]
  );

  const assignToAgent = useCallback(
    async (
      tenantId: string,
      agent: { name: string; email: string; specialty?: string; source?: string }
    ) => {
      await fetch(`/api/tenant/${tenantId}/assign-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent)
      });
      await refresh();
    },
    [refresh]
  );

  return {
    data,
    loading,
    refresh,
    engage,
    assign,
    simulateEngagement,
    updateConsent,
    saveReminder,
    assignToAgent
  };
}
