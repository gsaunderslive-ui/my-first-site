"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** @deprecated Use `/follow-up` */
export default function HotLeadsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = window.location.search.replace(/^\?/, "");
    router.replace(q ? `/follow-up?${q}` : "/follow-up");
  }, [router]);

  return (
    <div className="rounded-2xl bg-white p-6 text-sm text-slate/70 shadow-soft">
      Redirecting to Follow Up…
    </div>
  );
}
