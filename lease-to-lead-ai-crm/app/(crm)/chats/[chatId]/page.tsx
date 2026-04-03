"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatIdPage({ params }: { params: { chatId: string } }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/communication?chatId=${params.chatId}`);
  }, [params.chatId, router]);

  return null;
}
