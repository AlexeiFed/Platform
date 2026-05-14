import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LiveRoomClient } from "@/components/live/live-room-client";
import { LiveHostControls } from "@/components/live/live-host-controls";
import { getAdminLiveJoinToken } from "../actions";
import { isMarathonLiveJoinAllowedToday } from "@/lib/marathon-live-broadcast";

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
    select: {
      id: true,
      title: true,
      type: true,
      dayOffset: true,
      scheduledAt: true,
      product: { select: { startDate: true } },
    },
  });
  if (!event || event.type !== "LIVE") notFound();

  const liveDayOk = isMarathonLiveJoinAllowedToday({
    dayOffset: event.dayOffset,
    scheduledAt: event.scheduledAt,
    productStartDate: event.product.startDate,
  }).ok;

  const join = await getAdminLiveJoinToken(eventId);
  if ("error" in join || !("data" in join) || !join.data) {
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

  const data = join.data;
  const roomStatus = data.room.status;

  const roomRecordings = await prisma.liveRoom.findUnique({
    where: { marathonEventId: eventId },
    select: {
      recordings: {
        where: { status: "READY", manifestUrl: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          manifestUrl: true,
          durationSec: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    },
  });

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

      <LiveHostControls eventId={eventId} status={roomStatus} joinDayAllowed={liveDayOk} />

      <LiveRoomClient
        liveServerUrl={liveServerUrl}
        token={data.token}
        role="HOST"
        marathonEventId={eventId}
        afterEndRedirectHref="/admin/live"
      />

      {roomRecordings?.recordings?.length ? (
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className={tokens.typography.h4}>Записи эфира (S3)</div>
          <ul className="mt-3 space-y-2">
            {roomRecordings.recordings.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {r.createdAt.toLocaleString("ru-RU")}
                  {typeof r.durationSec === "number" ? ` · ${r.durationSec} с` : null}
                  {r.sizeBytes != null ? ` · ${(Number(r.sizeBytes) / (1024 * 1024)).toFixed(1)} МБ` : null}
                </span>
                {r.manifestUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={r.manifestUrl} target="_blank" rel="noopener noreferrer">
                      Открыть видео
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

