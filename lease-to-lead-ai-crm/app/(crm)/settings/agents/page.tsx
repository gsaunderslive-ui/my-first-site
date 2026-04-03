"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AgentRole = "Buyer Specialist" | "Listing Agent" | "General";
type AgentStatus = "Active" | "Inactive";

type TeamMember = {
  id: string;
  username: string;
  is_admin: boolean;
  display_name: string | null;
  email: string | null;
  agent_role: AgentRole;
  agent_status: AgentStatus;
};

type AgentSettings = {
  autoAssignEligibleLeads: boolean;
  priority: "High" | "Medium" | "Low";
};

const emptyForm = {
  username: "",
  password: "",
  display_name: "",
  email: "",
  role: "General" as AgentRole,
  status: "Active" as AgentStatus,
  is_admin: false
};

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function displayName(m: TeamMember) {
  return (m.display_name && m.display_name.trim()) || m.username;
}

export default function TeamSettingsPage() {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<AgentSettings>({
    autoAssignEligibleLeads: false,
    priority: "Medium"
  });

  const [newMember, setNewMember] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState({
    display_name: "",
    email: "",
    role: "General" as AgentRole,
    status: "Active" as AgentStatus,
    is_admin: false,
    password: ""
  });
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    const [meRes, settingsRes] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/agents/settings", { cache: "no-store" })
    ]);

    const meJson = (await meRes.json()) as { user?: { isAdmin?: boolean } };
    const admin = Boolean(meJson.user?.isAdmin);
    setIsAdmin(admin);

    const settingsJson = (await settingsRes.json()) as { settings: AgentSettings };
    setSettings(settingsJson.settings || { autoAssignEligibleLeads: false, priority: "Medium" });

    if (admin) {
      const usersRes = await fetch("/api/users", { credentials: "include", cache: "no-store" });
      const usersJson = (await usersRes.json()) as { users: TeamMember[] };
      setMembers(usersJson.users || []);
    } else {
      setMembers([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [members]
  );

  async function addMember(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!newMember.username.trim() || newMember.password.length < 8) {
      setError("Username and password (8+ characters) are required.");
      return;
    }
    if (newMember.email.trim() && !validEmail(newMember.email.trim())) {
      setError("Please enter a valid email or leave it blank.");
      return;
    }

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        username: newMember.username.trim(),
        password: newMember.password,
        display_name: newMember.display_name.trim() || undefined,
        email: newMember.email.trim() || null,
        agent_role: newMember.role,
        agent_status: newMember.status,
        isAdmin: newMember.is_admin
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data.error || "Failed to create user"));
      return;
    }
    setNewMember(emptyForm);
    await loadAll();
  }

  async function saveEdit() {
    if (!editingId) return;
    setError("");
    if (editMember.email.trim() && !validEmail(editMember.email.trim())) {
      setError("Please enter a valid email or leave it blank.");
      return;
    }

    const body: Record<string, unknown> = {
      display_name: editMember.display_name.trim() || undefined,
      email: editMember.email.trim() ? editMember.email.trim().toLowerCase() : null,
      agent_role: editMember.role,
      agent_status: editMember.status,
      is_admin: editMember.is_admin
    };
    if (editMember.password.trim().length > 0) {
      if (editMember.password.length < 8) {
        setError("New password must be at least 8 characters.");
        return;
      }
      body.password = editMember.password;
    }

    const res = await fetch(`/api/users/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data.error || "Failed to save"));
      return;
    }

    setEditingId(null);
    setEditMember({
      display_name: "",
      email: "",
      role: "General",
      status: "Active",
      is_admin: false,
      password: ""
    });
    await loadAll();
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this team member and their CRM login?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data.error || "Failed to delete"));
      return;
    }
    setEditingId(null);
    await loadAll();
  }

  async function toggleStatus(id: string, status: AgentStatus) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ agent_status: status })
    });
    await loadAll();
  }

  async function updateSettings(next: Partial<AgentSettings>) {
    const payload = { ...settings, ...next };
    setSettings(payload);
    await fetch("/api/agents/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  if (!ready) {
    return <p className="text-slate/60">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h2 className="text-2xl font-semibold text-slate">Team &amp; logins</h2>
        <p className="mt-1 text-sm text-slate/60">
          Each person has one CRM login. Roster fields (name, email, role, status) control lead assignment. Only admins
          can create or edit accounts.
        </p>
      </header>

      {!isAdmin ? (
        <p className="rounded-xl border border-slate-200 bg-slate/5 px-4 py-3 text-sm text-slate/70">
          Logins and roster are managed by an admin. You can still adjust assignment preferences below.
        </p>
      ) : null}

      {isAdmin ? (
        <>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h3 className="text-lg font-semibold text-slate">Team</h3>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate/5 text-slate/70">
              <tr>
                <th className="px-3 py-2">Login</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs text-slate/80">{m.username}</td>
                  <td className="px-3 py-2 font-medium text-slate">{displayName(m)}</td>
                  <td className="px-3 py-2 text-slate/70">{m.email || "—"}</td>
                  <td className="px-3 py-2 text-slate/70">{m.agent_role}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleStatus(m.id, m.agent_status === "Active" ? "Inactive" : "Active")}
                      className={`rounded-full px-2 py-1 text-xs ${
                        m.agent_status === "Active" ? "bg-mint/15 text-mint" : "bg-slate/10 text-slate/60"
                      }`}
                    >
                      {m.agent_status}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {m.is_admin ? (
                      <span className="rounded-full bg-mint/20 px-2 py-0.5 text-xs text-slate">Yes</span>
                    ) : (
                      <span className="text-slate/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditMember({
                            display_name: displayName(m),
                            email: m.email || "",
                            role: m.agent_role,
                            status: m.agent_status,
                            is_admin: m.is_admin,
                            password: ""
                          });
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate/70"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        className="rounded-md border border-coral/40 px-2 py-1 text-xs text-coral"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={addMember}
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft"
        >
          <h3 className="text-lg font-semibold text-slate">Add team member</h3>
          <p className="mt-1 text-xs text-slate/50">Creates a CRM login. Add an email so they appear in lead assignment.</p>
          <div className="mt-3 space-y-3">
            <input
              value={newMember.username}
              onChange={(e) => setNewMember((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="Login (username)"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              value={newMember.password}
              onChange={(e) => setNewMember((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <input
              value={newMember.display_name}
              onChange={(e) => setNewMember((prev) => ({ ...prev, display_name: e.target.value }))}
              placeholder="Display name (optional, defaults to login)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newMember.email}
              onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Work email (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={newMember.role}
              onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value as AgentRole }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option>Buyer Specialist</option>
              <option>Listing Agent</option>
              <option>General</option>
            </select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate/60">Roster status</span>
              <select
                value={newMember.status}
                onChange={(e) => setNewMember((prev) => ({ ...prev, status: e.target.value as AgentStatus }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate/80">
              <input
                type="checkbox"
                checked={newMember.is_admin}
                onChange={(e) => setNewMember((prev) => ({ ...prev, is_admin: e.target.checked }))}
              />
              Admin (can manage team, playbook, and users)
            </label>
            <button type="submit" className="rounded-lg bg-slate px-3 py-2 text-sm font-medium text-white">
              Add team member
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <h3 className="text-lg font-semibold text-slate">Edit team member</h3>
            {editingId ? (
              <div className="mt-3 space-y-3">
                <input
                  value={editMember.display_name}
                  onChange={(e) => setEditMember((prev) => ({ ...prev, display_name: e.target.value }))}
                  placeholder="Display name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={editMember.email}
                  onChange={(e) => setEditMember((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <select
                  value={editMember.role}
                  onChange={(e) => setEditMember((prev) => ({ ...prev, role: e.target.value as AgentRole }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option>Buyer Specialist</option>
                  <option>Listing Agent</option>
                  <option>General</option>
                </select>
                <select
                  value={editMember.status}
                  onChange={(e) => setEditMember((prev) => ({ ...prev, status: e.target.value as AgentStatus }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-slate/80">
                  <input
                    type="checkbox"
                    checked={editMember.is_admin}
                    onChange={(e) => setEditMember((prev) => ({ ...prev, is_admin: e.target.checked }))}
                  />
                  Admin
                </label>
                <input
                  type="password"
                  value={editMember.password}
                  onChange={(e) => setEditMember((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="New password (optional)"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} className="rounded-lg bg-mint px-3 py-2 text-sm font-medium text-white">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditMember({
                        display_name: "",
                        email: "",
                        role: "General",
                        status: "Active",
                        is_admin: false,
                        password: ""
                      });
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate/60">Select someone from the table to edit profile or reset password.</p>
            )}
          </div>
        </div>
      </section>
        </>
      ) : null}

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
        <h3 className="text-lg font-semibold text-slate">Assignment settings</h3>
        <div className="mt-3 space-y-3 text-sm text-slate/70">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.autoAssignEligibleLeads}
              onChange={(e) => updateSettings({ autoAssignEligibleLeads: e.target.checked })}
            />
            Auto-assign eligible leads
          </label>

          <label className="block">
            Priority
            <select
              value={settings.priority}
              onChange={(e) => updateSettings({ priority: e.target.value as AgentSettings["priority"] })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>
        </div>
      </section>

      {error ? <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
    </div>
  );
}
