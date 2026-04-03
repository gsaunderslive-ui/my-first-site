"use client";

import { useEffect, useState } from "react";
import { PlaybookEditor } from "@/components/PlaybookEditor";

export default function WorkflowsSettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setIsAdmin(Boolean(j.user?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  return <PlaybookEditor isAdmin={isAdmin} />;
}
