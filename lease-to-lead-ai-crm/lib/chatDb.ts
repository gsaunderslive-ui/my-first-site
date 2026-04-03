import { getSupabaseAdmin } from "./supabaseAdmin";

export type ChatDirection = "outbound" | "inbound";

export type ChatRow = {
  id: string;
  tenant_id: string;
  control_mode: "ai" | "human";
  created_at: string;
  last_message: string | null;
};

export type ChatMessageRow = {
  id: string;
  chat_id: string;
  tenant_id: string;
  content: string;
  direction: ChatDirection;
  sender: "ai" | "human";
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** First chat id per tenant (for deep links to Communication Dashboard). */
export async function getChatIdsByTenantIds(tenantIds: string[]): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();
  if (!supabase || tenantIds.length === 0) return {};

  const { data, error } = await supabase.from("chats").select("id, tenant_id, created_at").in("tenant_id", tenantIds);

  if (error || !data?.length) {
    if (error) console.warn("[chatDb] getChatIdsByTenantIds", error.message);
    return {};
  }

  const byTenant: Record<string, { id: string; created_at: string }[]> = {};
  for (const row of data as { id: string; tenant_id: string; created_at: string }[]) {
    const tid = row.tenant_id;
    if (!byTenant[tid]) byTenant[tid] = [];
    byTenant[tid].push({ id: row.id, created_at: row.created_at });
  }

  const map: Record<string, string> = {};
  for (const tid of Object.keys(byTenant)) {
    const sorted = byTenant[tid].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    map[tid] = sorted[0].id;
  }
  return map;
}

export async function getOrCreateChatForTenant(tenantId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: existing, error: existingError } = await supabase
    .from("chats")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    console.error("[chatDb] failed to fetch existing chat", { tenantId, error: existingError.message });
    return null;
  }

  if (existing) {
    console.log("[chatDb] existing chat found", { tenantId, chatId: existing.id });
    return existing as ChatRow;
  }

  const row: ChatRow = {
    id: `chat-${crypto.randomUUID()}`,
    tenant_id: tenantId,
    control_mode: "ai",
    created_at: new Date().toISOString(),
    last_message: null
  };

  let { data, error } = await supabase.from("chats").insert(row).select("*").single();
  if (error && error.message.toLowerCase().includes("control_mode")) {
    console.warn("[chatDb] control_mode column missing on create; retrying legacy insert");
    const legacyInsert = await supabase
      .from("chats")
      .insert({
        id: row.id,
        tenant_id: row.tenant_id,
        created_at: row.created_at,
        last_message: row.last_message
      })
      .select("*")
      .single();
    data = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (error || !data) {
    console.error("[chatDb] failed to create chat", { tenantId, error: error?.message || "Unknown insert failure" });
    return null;
  }

  console.log("[chatDb] chat created", { tenantId, chatId: data.id });
  return {
    ...(data as any),
    control_mode: (String((data as any).control_mode || "ai").toLowerCase() === "human" ? "human" : "ai")
  } as ChatRow;
}

export async function insertChatMessage(input: {
  chatId: string;
  tenantId: string;
  content: string;
  direction: ChatDirection;
  sender?: "ai" | "human";
  status?: string;
  metadata?: Record<string, unknown>;
  messageChannel?: "sms" | "email" | "in_app";
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const row: ChatMessageRow & { channel?: string } = {
    id: `msg-${crypto.randomUUID()}`,
    chat_id: input.chatId,
    tenant_id: input.tenantId,
    content: input.content,
    direction: input.direction,
    sender: input.sender || (input.direction === "outbound" ? "ai" : "human"),
    status: input.status || "sent",
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
    channel: input.messageChannel || "sms"
  };

  const { error: messageError } = await supabase.from("messages").insert(row as any);
  if (messageError) {
    console.error("[chatDb] failed to insert message", { chatId: input.chatId, tenantId: input.tenantId, error: messageError.message });
    return null;
  }

  const { error: chatUpdateError } = await supabase
    .from("chats")
    .update({ last_message: input.content })
    .eq("id", input.chatId);
  if (chatUpdateError) {
    console.error("[chatDb] failed to update last_message", { chatId: input.chatId, error: chatUpdateError.message });
  }
  return row;
}

export async function getChats() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const primaryQuery = await supabase.from("chats").select("*");
  let chats = primaryQuery.data as Record<string, unknown>[] | null;
  let chatsError = primaryQuery.error;

  if (chatsError) {
    console.error("[chatDb] failed to fetch chats", { error: chatsError.message });
    return [];
  }

  const normalizedChats = (chats || [])
    .map((row) => {
      const id = String((row.id as string) || "");
      const tenantId = String((row.tenant_id as string) || (row.tenantId as string) || "");
      if (!id) return null;
      return {
        id,
        tenant_id: tenantId || "__unknown_tenant__",
        control_mode: (String(row.control_mode || "ai").toLowerCase() === "human" ? "human" : "ai") as "ai" | "human",
        created_at: String((row.created_at as string) || new Date().toISOString()),
        last_message: row.last_message ? String(row.last_message) : null
      };
    })
    .filter(Boolean) as ChatRow[];

  const sortedChats = normalizedChats.sort((a, b) => {
    const left = new Date(a.created_at).getTime();
    const right = new Date(b.created_at).getTime();
    return right - left;
  });

  const tenantIds = Array.from(new Set(sortedChats.map((item) => item.tenant_id)));
  let tenantMap = new Map<string, { name: string | null; phone: string | null }>();

  if (tenantIds.length) {
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, phone")
      .in("id", tenantIds);
    if (tenantsError) {
      console.error("[chatDb] failed to hydrate tenant names for chats", { error: tenantsError.message });
    }

    tenantMap = new Map(
      (tenants || []).map((item) => [item.id as string, { name: (item as any).name || null, phone: (item as any).phone || null }])
    );
  }

  const hydrated = sortedChats.map((chat) => ({
    ...chat,
    tenants: tenantMap.has(chat.tenant_id) ? tenantMap.get(chat.tenant_id) : null
  }));

  console.log("[chatDb] chats fetched", { count: hydrated.length });
  return hydrated;
}

export async function getChatById(chatId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: chatRows, error: chatError } = await supabase.from("chats").select("*").eq("id", chatId).limit(1);
  if (chatError) {
    console.error("[chatDb] failed to fetch chat by id", { chatId, error: chatError.message });
    return null;
  }
  const base = (chatRows || [])[0] as Record<string, unknown> | undefined;
  if (!base) return null;

  const tenantId = String((base.tenant_id as string) || (base.tenantId as string) || "");
  let tenantData: { name?: string | null; phone?: string | null } | null = null;
  if (tenantId) {
    const { data: tenantRows } = await supabase.from("tenants").select("name, phone").eq("id", tenantId).limit(1);
    tenantData = ((tenantRows || [])[0] as { name?: string | null; phone?: string | null } | undefined) || null;
  }

  return {
    id: String(base.id),
    tenant_id: tenantId,
    control_mode: (String(base.control_mode || "ai").toLowerCase() === "human" ? "human" : "ai") as "ai" | "human",
    created_at: String((base.created_at as string) || new Date().toISOString()),
    last_message: base.last_message ? String(base.last_message) : null,
    tenants: tenantData
  } as any;
}

export async function getMessagesByChatId(chatId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[chatDb] failed to fetch messages", { chatId, error: error.message });
    return [];
  }

  console.log("[chatDb] messages fetched", { chatId, count: (data || []).length });
  return (data || []) as ChatMessageRow[];
}

export async function setChatControlMode(chatId: string, mode: "ai" | "human") {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const patch: Record<string, unknown> = { control_mode: mode };
  if (mode === "human") {
    patch.last_human_interaction_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("chats")
    .update(patch)
    .eq("id", chatId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.message.toLowerCase().includes("control_mode")) {
      console.warn("[chatDb] control_mode column not available; returning chat unchanged", { chatId });
      const chat = await getChatById(chatId);
      return (chat as ChatRow | null) || null;
    }
    console.error("[chatDb] failed to set control mode", { chatId, mode, error: error.message });
    return null;
  }

  return (data as ChatRow | null) || null;
}

/** If assisted (human) mode and no human touch for 24h, revert to automated (ai). */
export async function revertStaleAssistedChats() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { reverted: 0 };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("chats")
    .select("id, last_human_interaction_at, control_mode")
    .eq("control_mode", "human");

  if (error || !rows?.length) return { reverted: 0 };

  let reverted = 0;
  for (const row of rows as { id: string; last_human_interaction_at?: string | null }[]) {
    const last = row.last_human_interaction_at ? new Date(row.last_human_interaction_at).getTime() : 0;
    if (last && last < new Date(cutoff).getTime()) {
      const { error: upErr } = await supabase.from("chats").update({ control_mode: "ai" }).eq("id", row.id);
      if (!upErr) reverted += 1;
    }
  }
  return { reverted };
}

export async function getRecentMessagesByTenantId(tenantId: string, limit = 2) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []) as ChatMessageRow[];
}

export async function insertWorkflowEvent(input: {
  tenantId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const row = {
    id: `wf-${crypto.randomUUID()}`,
    tenant_id: input.tenantId,
    event_type: input.eventType,
    metadata: input.metadata || {},
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("workflow_events").insert(row);
  if (error) {
    console.error("[chatDb] failed to insert workflow event", {
      tenantId: input.tenantId,
      eventType: input.eventType,
      error: error.message
    });
    return null;
  }
  return row;
}
