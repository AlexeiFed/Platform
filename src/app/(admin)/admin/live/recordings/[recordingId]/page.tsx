import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LessonVideoPlayer } from "@/components/shared/lesson-video-player";
import { getMarathonEventDate } from "@/lib/marathon-progress";
import { marathonDateKeyInZone } from "@/lib/marathon-live-broadcast";
import { getResolvedMarathonTimeZone } from "@/lib/marathon-time-zone";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ recordingId: string }>;
  searchParams: Promise<{ productId?: string; date?: string }>;
};

const marathonTz = getResolvedMarathonTimeZone();

function formatRuDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: marathonTz,
  }).format(d);
}

function formatRuTime(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: marathonTz,
  }).format(d);
}

function formatDuration(sec: number | null | undefined) {
  if (sec == null || sec < 1) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function formatSize(bytes: bigint | null | undefined) {
  if (bytes == null) return null;
  const mb = Number(bytes) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb.toFixed(1)} МБ`;
}

export default async function AdminLiveRecordingViewPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    redirect("/login");
  }

  const { recordingId } = await params;
  const { productId, date } = await searchParams;

  const allowedProductIds =
    session.user.role === "CURATOR"
      ? (
          await prisma.productCurator.findMany({
            where: { curatorId: session.user.id },
            select: { productId: true },
          })
        ).map((x) => x.productId)
      : null;

  const recording = await prisma.liveRoomRecording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      manifestUrl: true,
      durationSec: true,
      sizeBytes: true,
      createdAt: true,
      status: true,
      room: {
        select: {
          marathonEvent: {
            select: {
              id: true,
              title: true,
              type: true,
              dayOffset: true,
              scheduledAt: true,
              createdAt: true,
              productId: true,
              product: { select: { title: true, startDate: true, type: true } },
            },
          },
        },
      },
    },
  });

  if (!recording || recording.status !== "READY" || !recording.manifestUrl) {
    notFound();
  }

  const event = recording.room.marathonEvent;
  if (event.type !== "LIVE") notFound();

  if (allowedProductIds && !allowedProductIds.includes(event.productId)) {
    redirect("/admin/live/recordings");
  }

  const effectiveAt =
    event.scheduledAt ??
    (event.product.startDate
      ? getMarathonEventDate(event.product.startDate, event.dayOffset)
      : new Date(event.createdAt));

  const backParams = new URLSearchParams();
  if (productId) backParams.set("productId", productId);
  if (date) backParams.set("date", date);
  const backQs = backParams.toString();
  const backHref = backQs ? `/admin/live/recordings?${backQs}` : "/admin/live/recordings";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className={tokens.typography.h2}>{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{event.product.title}</Badge>
            <Badge variant="secondary">{event.product.type === "MARATHON" ? "Марафон" : "Курс"}</Badge>
          </div>
          <div className={`${tokens.typography.small} text-muted-foreground`}>
            {formatRuDate(effectiveAt)}
            {event.scheduledAt ? ` · ${formatRuTime(effectiveAt)}` : null}
            {formatDuration(recording.durationSec) ? ` · ${formatDuration(recording.durationSec)}` : null}
            {formatSize(recording.sizeBytes) ? ` · ${formatSize(recording.sizeBytes)}` : null}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            К списку записей
          </Link>
        </Button>
      </div>

      <LessonVideoPlayer src={recording.manifestUrl} title={`Запись: ${event.title}`} />

      <div className={`${tokens.typography.small} text-muted-foreground`}>
        Запись создана:{" "}
        {recording.createdAt.toLocaleString("ru-RU", { timeZone: marathonTz })}
        {" · "}
        Дата эфира: {marathonDateKeyInZone(effectiveAt)}
      </div>
    </div>
  );
}
