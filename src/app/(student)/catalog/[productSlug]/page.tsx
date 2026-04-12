import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice } from "@/lib/utils";
import { isProductPubliclyVisible } from "@/lib/product-visibility";
import { isPaidProduct } from "@/lib/product-payment";
import { EnrollButton } from "./enroll-button";

type Props = {
  params: Promise<{ productSlug: string }>;
  searchParams: Promise<{ payment?: string }>;
};

export default async function ProductDetailsPage({ params, searchParams }: Props) {
  const { productSlug } = await params;
  const { payment: paymentQuery } = await searchParams;
  const session = await auth();

  const product = await prisma.product.findUnique({
    where: { slug: productSlug, deletedAt: null },
    select: {
      id: true,
      type: true,
      title: true,
      slug: true,
      description: true,
      price: true,
      currency: true,
      published: true,
      startDate: true,
      durationDays: true,
      paymentFormUrl: true,
      deletedAt: true,
      _count: { select: { lessons: true } },
    },
  });

  if (!product || !isProductPubliclyVisible(product)) notFound();

  const enrollment =
    session?.user?.id != null
      ? await prisma.enrollment.findUnique({
          where: { userId_productId: { userId: session.user.id, productId: product.id } },
        })
      : null;

  const loginWithReturn = `/login?callbackUrl=${encodeURIComponent(`/catalog/${product.slug}`)}`;
  const yoomoneyCheckoutEnabled = Boolean(process.env.YOOMONEY_WALLET_RECEIVER?.trim());

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {paymentQuery === "yoomoney_ok" ? (
        <p className={`${tokens.typography.small} rounded-lg border border-primary/30 bg-primary/5 px-3 py-2`}>
          Если оплату в ЮMoney вы завершили, подождите несколько секунд и нажмите «Проверить доступ». Если закрыли
          оплату без перевода — вернитесь на страницу оплаты и нажмите «Оплату не завершил».
        </p>
      ) : null}
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
          {product.type === "MARATHON" && product.startDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Старт</span>
              <span className="font-medium">
                {new Intl.DateTimeFormat("ru-RU").format(product.startDate)}
              </span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/catalog">Назад</Link>
          </Button>
          {!session ? (
            <Button asChild>
              <Link href={loginWithReturn}>Войти, чтобы записаться</Link>
            </Button>
          ) : enrollment ? (
            <Button asChild>
              <Link href={`/learn/${product.slug}`}>Открыть</Link>
            </Button>
          ) : (
            <EnrollButton
              productId={product.id}
              productSlug={product.slug}
              requiresPayment={isPaidProduct(product.price)}
              paymentFormUrl={product.paymentFormUrl}
              yoomoneyCheckoutEnabled={yoomoneyCheckoutEnabled}
            />
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

