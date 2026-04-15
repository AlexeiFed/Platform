/**
 * /catalog/[productSlug]/page.tsx
 * Публичная страница-лендинг курса или марафона.
 * Рендерит блоки лендинга (если заданы) + секцию с тарифами и CTA.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { formatPrice, lessonsLabel } from "@/lib/utils";
import { isProductPubliclyVisible } from "@/lib/product-visibility";
import { isProductPaidForCatalog, getProductMinPrice } from "@/lib/product-tariff-pricing";
import { PRODUCT_CRITERION_LABELS } from "@/lib/product-criteria";
import { EnrollButton } from "./enroll-button";
import { LandingRenderer } from "./landing-renderer";
import type { LandingBlock } from "@/types/landing";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2 } from "lucide-react";

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
      coverUrl: true,
      price: true,
      currency: true,
      published: true,
      startDate: true,
      durationDays: true,
      paymentFormUrl: true,
      landingBlocks: true,
      deletedAt: true,
      _count: { select: { lessons: true } },
      tariffs: {
        where: { published: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        select: { id: true, name: true, price: true, currency: true, criteria: true },
      },
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

  const paid = await isProductPaidForCatalog(product.id);
  const minPrice = await getProductMinPrice(product.id);

  const tariffOptions = product.tariffs.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: t.currency,
    criteria: t.criteria,
  }));

  const landingBlocks = (product.landingBlocks as LandingBlock[] | null) ?? [];
  const hasLanding = landingBlocks.length > 0;
  const hasHeroBlock = hasLanding && landingBlocks[0]?.type === "hero";
  const shouldShowTariffs = tariffOptions.length > 0 && !enrollment;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">

      {/* === Уведомление об оплате ЮMoney === */}
      {paymentQuery === "yoomoney_ok" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Если оплату в ЮMoney вы завершили, подождите несколько секунд и нажмите «Проверить доступ». Если закрыли
          оплату без перевода — вернитесь на страницу оплаты и нажмите «Оплату не завершил».
        </div>
      )}

      {/* === Hero секция (если нет hero-блока в лендинге — показываем дефолтный) === */}
      {!hasHeroBlock && (
        <div className="relative rounded-2xl overflow-hidden">
          {product.coverUrl ? (
            <div className="relative min-h-[280px] sm:min-h-[380px] flex items-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.coverUrl}
                alt={product.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
              <div className="relative z-10 p-6 sm:p-10 space-y-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant={product.type === "COURSE" ? "default" : "secondary"} className="bg-white/20 text-white border-white/30">
                    {product.type === "COURSE" ? "Курс" : "Марафон"}
                  </Badge>
                  <Badge variant="outline" className="border-white/30 text-white/90 bg-white/10">
                    {lessonsLabel(product._count.lessons)}
                  </Badge>
                </div>
                <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight drop-shadow">
                  {product.title}
                </h1>
                {product.description && (
                  <p className="text-base sm:text-lg text-white/85 max-w-2xl drop-shadow">
                    {product.description}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-primary/10 via-background to-muted rounded-2xl border p-6 sm:p-10 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
                  {product.type === "COURSE" ? "Курс" : "Марафон"}
                </Badge>
                <Badge variant="outline">{lessonsLabel(product._count.lessons)}</Badge>
              </div>
              <h1 className={`${tokens.typography.h1} text-foreground`}>{product.title}</h1>
              {product.description && (
                <p className="text-lg text-muted-foreground max-w-2xl">{product.description}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* === Блоки лендинга === */}
      {hasLanding && <LandingRenderer blocks={landingBlocks} />}

      {/* === Краткие характеристики (всегда показываем если нет лендинга или в дополнение) === */}
      {!hasLanding && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-muted/40 p-4 text-center space-y-1">
            <BookOpen className="h-5 w-5 text-primary mx-auto" />
            <p className="text-lg font-bold">{product._count.lessons}</p>
            <p className="text-xs text-muted-foreground">уроков</p>
          </div>
          {product.type === "MARATHON" && product.durationDays && (
            <div className="rounded-xl border bg-muted/40 p-4 text-center space-y-1">
              <CalendarDays className="h-5 w-5 text-primary mx-auto" />
              <p className="text-lg font-bold">{product.durationDays}</p>
              <p className="text-xs text-muted-foreground">дней</p>
            </div>
          )}
          {product.type === "MARATHON" && product.startDate && (
            <div className="rounded-xl border bg-muted/40 p-4 text-center space-y-1">
              <CalendarDays className="h-5 w-5 text-orange-500 mx-auto" />
              <p className="text-base font-bold">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(product.startDate)}</p>
              <p className="text-xs text-muted-foreground">старт</p>
            </div>
          )}
          {tariffOptions.length === 0 && (
            <div className="rounded-xl border bg-muted/40 p-4 text-center space-y-1">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
              <p className="text-lg font-bold">
                {minPrice ? formatPrice(minPrice.price, minPrice.currency) : "Бесплатно"}
              </p>
              <p className="text-xs text-muted-foreground">стоимость</p>
            </div>
          )}
        </div>
      )}

      {/* === Тарифы === */}
      {shouldShowTariffs && (
        <section className="space-y-4" aria-labelledby="catalog-tariffs-heading">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 id="catalog-tariffs-heading" className={tokens.typography.h3}>
              Выберите тариф
            </h2>
            {!session && (
              <Button asChild variant="outline" size="sm">
                <Link href={loginWithReturn}>Войти, чтобы оплатить</Link>
              </Button>
            )}
          </div>

          {session ? (
            <EnrollButton
              productId={product.id}
              productSlug={product.slug}
              requiresPayment={paid}
              paymentFormUrl={product.paymentFormUrl}
              yoomoneyCheckoutEnabled={yoomoneyCheckoutEnabled}
              tariffs={tariffOptions}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {tariffOptions.map((t) => (
                <Card key={t.id} className="relative overflow-hidden border-2 hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-xl">{t.name}</CardTitle>
                      <p className="text-xl font-bold text-primary shrink-0">{formatPrice(t.price, t.currency)}</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Входит в тариф</p>
                    <ul className="space-y-2">
                      {t.criteria.map((c) => (
                        <li key={c} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          {PRODUCT_CRITERION_LABELS[c]}
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="w-full mt-4">
                      <Link href={loginWithReturn}>Войти и записаться</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* === CTA блок (кнопки действия) === */}
      <div className="flex flex-wrap gap-3 items-center">
        <Button asChild variant="outline">
          <Link href="/catalog">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Все программы
          </Link>
        </Button>

        {!session ? (
          <Button asChild size="lg">
            <Link href={loginWithReturn}>Войти, чтобы записаться</Link>
          </Button>
        ) : enrollment ? (
          <Button asChild size="lg">
            <Link href={`/learn/${product.slug}`}>Открыть программу →</Link>
          </Button>
        ) : !paid && tariffOptions.length === 0 ? (
          <EnrollButton
            productId={product.id}
            productSlug={product.slug}
            requiresPayment={paid}
            paymentFormUrl={product.paymentFormUrl}
            yoomoneyCheckoutEnabled={yoomoneyCheckoutEnabled}
            tariffs={tariffOptions}
          />
        ) : null}
      </div>
    </div>
  );
}
