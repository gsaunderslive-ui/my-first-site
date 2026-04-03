"use client";

import { useEffect } from "react";

/**
 * Signs the user out when the browser tab/window is closed or they leave the site,
 * but tries not to sign out on a normal reload (keyboard shortcuts only).
 *
 * Limitation: reload using only the browser toolbar/menu (no F5 / Ctrl+R / Cmd+R)
 * still looks like "leaving" the page, so it may sign you out too.
 */
export function TabCloseLogout() {
  useEffect(() => {
    const RELOAD_KEY = "crm_reload_intent";

    const markReloadIntent = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "f5") {
        sessionStorage.setItem(RELOAD_KEY, "1");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "r") {
        sessionStorage.setItem(RELOAD_KEY, "1");
      }
    };

    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      if (sessionStorage.getItem(RELOAD_KEY) === "1") {
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }
      void fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true
      }).catch(() => {});
    };

    window.addEventListener("keydown", markReloadIntent);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("keydown", markReloadIntent);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
