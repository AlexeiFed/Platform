import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { UpgradeTariffPicker } from "./upgrade-tariff-picker";

type Props = { params: Promise<{ courseSlug: string }> };

export default async function TariffUpgradePage({ params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true, title: true },
  });
  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    include: {
      tariff: { select: { id: true, name: true, price: true, currency: true, sortOrder: true } },
    },
  });
  if (!enrollment) redirect("/catalog");

  const tariffs = await prisma.productTariff.findMany({
    where: { productId: product.id, published: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    select: { id: true, name: true, price: true, currency: true, criteria: true, sortOrder: true },
  });

  const fromNum = Number(enrollment.tariff.price);
  const upgrades = tariffs.filter((t) => t.sortOrder > enrollment.tariff.sortOrder);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Апгрейд тарифа</h1>
        <p className={`${tokens.typography.body} mt-2`}>{product.title}</p>
        <p className={`${tokens.typography.small} mt-1`}>
          Текущий тариф: <span className="font-medium">{enrollment.tariff.name}</span> —{" "}
          {formatPrice(fromNum, enrollment.tariff.currency)}
        </p>
      </div>

      {upgrades.length === 0 ? (
        <Card>
          <CardContent className={`${tokens.spacing.card} text-sm text-muted-foreground`}>
            Нет тарифов выше вашего уровня. Обратитесь в поддержку или к администратору.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Выберите новый тариф</CardTitle>
          </CardHeader>
          <CardContent>
            <UpgradeTariffPicker
              enrollmentId={enrollment.id}
              options={upgrades.map((t) => ({
                id: t.id,
                name: t.name,
                price: Number(t.price),
                currency: t.currency,
                criteria: t.criteria,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
