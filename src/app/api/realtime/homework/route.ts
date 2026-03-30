import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { onEvent } from "@/lib/realtime";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const submissionId = url.searchParams.get("submissionId") || null;
  const lessonId = url.searchParams.get("lessonId") || null;
  const userId = url.searchParams.get("userId") || null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (payload: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // keepalive for proxies
      const keepAlive = setInterval(() => controller.enqueue(enc.encode(`: ping\n\n`)), 15000);

      const off = onEvent((evt) => {
        if (evt.type !== "homework") return;
        if (submissionId && evt.submissionId !== submissionId) return;
        if (lessonId && evt.lessonId !== lessonId) return;
        if (userId && evt.userId !== userId) return;
        send(evt);
      });

      // Do not send initial data event: it can trigger refresh during router init (Next.js dev).

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        off();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

