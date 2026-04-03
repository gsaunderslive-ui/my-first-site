"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UsersSettingsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/agents");
  }, [router]);
  return <p className="text-slate/60">Redirecting to Team…</p>;
}
