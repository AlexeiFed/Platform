import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { LiveRoomClient } from "@/components/live/live-room-client";
import { getLiveJoinToken } from "./actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
  if ("error" in join || !("data" in join) || !join.data) {
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

  const { token, role, room } = join.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className={tokens.typography.h2}>{event.title}</h1>
        <div className={`${tokens.typography.small} text-muted-foreground`}>
          Статус: {room.status === "LIVE" ? "в эфире" : room.status === "SCHEDULED" ? "ожидание" : "завершён"}
        </div>
      </div>
      <LiveRoomClient
        liveServerUrl={liveServerUrl}
        token={token}
        role={role}
        marathonEventId={eventId}
        afterEndRedirectHref={role === "HOST" ? `/learn/${courseSlug}/event/${eventId}` : undefined}
      />
    </div>
  );
}

