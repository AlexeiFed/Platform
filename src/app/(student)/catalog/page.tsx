import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice, lessonsLabel } from "@/lib/utils";
import Link from "next/link";

export default async function CatalogPage() {
  const products = await prisma.product.findMany({
    where: { published: true, deletedAt: null },
    include: { _count: { select: { lessons: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Каталог</h1>
        <p className={tokens.typography.body}>Выберите курс или марафон для обучения</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id} className={tokens.shadow.card}>
            {product.coverUrl && (
              <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                <img
                  src={product.coverUrl}
                  alt={product.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
                  {product.type === "COURSE" ? "Курс" : "Марафон"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {lessonsLabel(product._count.lessons)}
                </span>
              </div>
              <CardTitle className="text-lg">{product.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{product.description}</p>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-between">
              <span className="text-lg font-bold">
                {product.price ? formatPrice(Number(product.price), product.currency) : "Бесплатно"}
              </span>
              <Button asChild size="sm">
                <Link href={`/catalog/${product.slug}`}>Подробнее</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}

        {products.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className={tokens.typography.body}>Пока нет доступных курсов</p>
          </div>
        )}
      </div>
    </div>
  );
}
