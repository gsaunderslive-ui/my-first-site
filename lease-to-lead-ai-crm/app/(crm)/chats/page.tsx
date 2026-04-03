"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Legacy route — forwards to Communication Dashboard */
export default function ChatsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = window.location.search.replace(/^\?/, "");
    router.replace(q ? `/communication?${q}` : "/communication");
  }, [router]);

  return (
    <div className="rounded-2xl bg-white p-6 text-sm text-slate/70 shadow-soft">
      Redirecting to Communication Dashboard…
    </div>
  );
}
