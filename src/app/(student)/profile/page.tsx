/**
 * page.tsx — /profile
 * Страница профиля студента. Серверная обёртка: грузит пользователя,
 * фото прогресса, замеры и рендерит клиентский компонент.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tokens } from "@/lib/design-tokens";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [user, photos, measurements] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        weight: true,
        height: true,
      },
    }),
    prisma.userProgressPhoto.findMany({
      where: { userId: session.user.id },
      orderBy: [{ type: "asc" }, { position: "asc" }],
    }),
    prisma.userMeasurement.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "desc" },
    }),
  ]);

  if (!user) redirect("/login");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Профиль</h1>
        <p className={`${tokens.typography.body} mt-2 text-muted-foreground`}>
          Личные данные, фото прогресса и замеры
        </p>
      </div>

      <ProfileClient
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          weight: user.weight,
          height: user.height,
        }}
        photos={photos.map((p) => ({
          id: p.id,
          type: p.type,
          position: p.position,
          url: p.url,
        }))}
        measurements={measurements.map((m) => ({
          id: m.id,
          date: m.date.toISOString(),
          shoulders: m.shoulders,
          aboveChest: m.aboveChest,
          belowChest: m.belowChest,
          waist: m.waist,
          abdomen: m.abdomen,
          hips: m.hips,
          thighRight: m.thighRight,
          thighLeft: m.thighLeft,
          calfRight: m.calfRight,
          calfLeft: m.calfLeft,
          armRight: m.armRight,
          armLeft: m.armLeft,
        }))}
      />
    </div>
  );
}
