"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const links = [
  { href: "/", label: "Lead Dashboard" },
  { href: "/communication", label: "Active Tenants & Messages" },
  { href: "/automation", label: "Automation Engine" },
  { href: "/follow-up", label: "Follow Up" }
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.user?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }, [router]);

  const settingsLinks = [
    { href: "/settings/agents", label: "Team" },
    { href: "/settings/visual-playbook", label: "Visual playbook" },
    { href: "/settings/workflows", label: "Company playbook (JSON)" },
    { href: "/settings/updates", label: "Playbook updates" },
    { href: "/settings/password", label: "Change password" }
  ];

  return (
    <aside className="flex h-full w-full max-w-[260px] flex-col border-r border-white/50 bg-white/80 px-5 py-6 backdrop-blur-sm">
      <div className="mb-8 rounded-2xl bg-slate px-4 py-4 text-white shadow-soft">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">Lease-to-Lead</p>
        <h1 className="mt-2 text-xl font-semibold">AI CRM</h1>
      </div>
      <nav className="space-y-2">
        {links.map((link) => {
          const active = path === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-mint/15 text-slate shadow-sm"
                  : "text-slate/70 hover:bg-white hover:text-slate"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-5">
        <div className="mb-3 border-t border-slate-200" />
        <p className="mb-2 px-1 text-[11px] uppercase tracking-[0.16em] text-slate/45">Settings</p>
        <nav className="space-y-1">
          {settingsLinks.map((link) => {
            const active = path === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-mint/15 text-slate shadow-sm"
                    : "text-slate/60 hover:bg-white hover:text-slate"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm font-medium text-slate/70 transition hover:bg-white hover:text-slate"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
