import { NextResponse } from "next/server";
import { getChats, revertStaleAssistedChats } from "@/lib/chatDb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await revertStaleAssistedChats();
  const chats: any[] = await getChats();

  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  return NextResponse.json(
    debug ? { chats, debug: { count: chats.length } } : { chats },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
