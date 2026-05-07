import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { LiveRoomClient } from "@/components/live/live-room-client";
import { getLiveJoinToken } from "./actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LiveSpeakerRequest } from "./live-speaker-request";
import { LiveSpeakerRequestsHost } from "./live-speaker-requests-host";

type Props = {
  params: Promise<{ courseSlug: string; eventId: string }>;
};

export default async function LivePage({ params }: Props) {
  const { courseSlug, eventId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true, slug: true, type: true },
  });
  if (!product || product.type !== "MARATHON") notFound();

  const event = await prisma.marathonEvent.findUnique({
    where: { id: eventId },
    select: { id: true, productId: true, type: true, title: true, published: true },
  });
  if (!event || event.productId !== product.id || !event.published) notFound();

  const join = await getLiveJoinToken(eventId);
  if ("error" in join && join.error) {
    redirect(`/learn/${courseSlug}/event/${eventId}`);
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
          <Link href={`/learn/${courseSlug}/event/${eventId}`}>Назад</Link>
        </Button>
      </div>
    );
  }

  const { token, role, room } = (join as any).data as {
    token: string;
    role: "HOST" | "SPEAKER" | "VIEWER";
    room: { status: "SCHEDULED" | "LIVE" | "ENDED" };
  };
  const participant = (join as any).data.participant as {
    role: "HOST" | "SPEAKER" | "VIEWER";
    speakerRequestedAt: string | null;
    speakerApprovedAt: string | null;
  };

  const canProduce = role === "HOST" || role === "SPEAKER";
  const isHost = role === "HOST";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className={tokens.typography.h2}>{event.title}</h1>
        <div className={`${tokens.typography.small} text-muted-foreground`}>
          Статус: {room.status === "LIVE" ? "в эфире" : room.status === "SCHEDULED" ? "ожидание" : "завершён"}
        </div>
      </div>
      {!isHost ? (
        <LiveSpeakerRequest
          eventId={eventId}
          alreadyRequested={Boolean(participant?.speakerRequestedAt)}
          approved={Boolean(participant?.speakerApprovedAt)}
        />
      ) : (
        <LiveSpeakerRequestsHost eventId={eventId} />
      )}
      <LiveRoomClient liveServerUrl={liveServerUrl} token={token} canProduce={canProduce} />
    </div>
  );
}

