import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice } from "@/lib/utils";
import { EnrollButton } from "./enroll-button";

type Props = {
  params: Promise<{ productSlug: string }>;
};

export default async function ProductDetailsPage({ params }: Props) {
  const { productSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: productSlug, deletedAt: null },
    include: { _count: { select: { lessons: true } } },
  });

  if (!product || !product.published) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
          {product.type === "COURSE" ? "Курс" : "Марафон"}
        </Badge>
        <h1 className={`${tokens.typography.h2} mt-2`}>{product.title}</h1>
        {product.description && <p className={`${tokens.typography.body} mt-2`}>{product.description}</p>}
      </div>

      <Card className={tokens.shadow.card}>
        <CardHeader>
          <CardTitle>Детали</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Уроков</span>
            <span className="font-medium">{product._count.lessons}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Цена</span>
            <span className="font-semibold">
              {product.price ? formatPrice(Number(product.price), product.currency) : "Бесплатно"}
            </span>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/catalog">Назад</Link>
          </Button>
          {enrollment ? (
            <Button asChild>
              <Link href={`/learn/${product.slug}`}>Открыть</Link>
            </Button>
          ) : (
            <EnrollButton productId={product.id} productSlug={product.slug} />
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

