import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LiveRoomClient } from "@/components/live/live-room-client";
import { getAdminLiveJoinToken } from "../actions";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminLiveRoomPage({ params }: Props) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    redirect("/login");
  }

  const { eventId } = await params;

  const event = await prisma.marathonEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, type: true },
  });
  if (!event || event.type !== "LIVE") notFound();

  const join = await getAdminLiveJoinToken(eventId);
  if ("error" in join && join.error) {
    redirect("/admin/live");
  }

  const liveServerUrl = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;
  if (!liveServerUrl) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className={tokens.typography.h2}>Эфир</h1>
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className={`${tokens.typography.small} text-muted-foreground`}>
            LIVE сервер не настроен (нет `NEXT_PUBLIC_LIVE_SERVER_URL`).
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/live">Назад</Link>
        </Button>
      </div>
    );
  }

  const data = (join as any).data as {
    token: string;
    room: { status: "SCHEDULED" | "LIVE" | "ENDED" };
    productSlug?: string;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className={tokens.typography.h2}>{event.title}</h1>
          <div className={`${tokens.typography.small} text-muted-foreground`}>
            Админ-комната · статус:{" "}
            {data.room.status === "LIVE" ? "в эфире" : data.room.status === "SCHEDULED" ? "ожидание" : "завершён"}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/live">К списку эфиров</Link>
        </Button>
      </div>

      <LiveRoomClient liveServerUrl={liveServerUrl} token={data.token} role="HOST" />

      {data.productSlug ? (
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className={`${tokens.typography.small} text-muted-foreground`}>
            Ссылка для студентов (должна совпадать с этим эфиром)
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/learn/${data.productSlug}/event/${eventId}/live`}>Открыть как студент</Link>
            </Button>
            <div className="text-xs text-muted-foreground">eventId: {eventId}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

