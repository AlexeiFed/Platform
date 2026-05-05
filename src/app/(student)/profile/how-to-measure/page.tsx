import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const IMAGES_BASE = "/как делать замеры";

const MEASUREMENT_STEPS: { file: string; title: string }[] = [
  { file: "1.avif", title: "Обхват плеч" },
  { file: "2.avif", title: "Обхват над грудью" },
  { file: "3.avif", title: "Обхват под грудью" },
  { file: "4.avif", title: "Обхват талии" },
  { file: "5.avif", title: "Обхват бедер" },
  { file: "6.avif", title: "Обхват одного бедра" },
  { file: "7.avif", title: "Обхват голени" },
  { file: "8.avif", title: "Обхват руки для мужчин" },
  { file: "9.avif", title: "Обхват руки для женщин" },
];

export default async function HowToMeasurePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" className="-ml-2 mb-2 h-auto px-2 py-1.5 text-muted-foreground">
          <Link href="/profile">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Вернуться в профиль
          </Link>
        </Button>
        <h1 className={tokens.typography.h2}>Как делать замеры</h1>
        <p className={cn(tokens.typography.body, "mt-2")}>
          Следуйте подсказкам: сантиметровая лента плотно прилегает к телу, не перетягивайте.
        </p>
      </div>

      <ol className="list-none space-y-4 p-0">
        {MEASUREMENT_STEPS.map((step, index) => (
          <li key={step.file}>
            <Card
              className={cn(
                "overflow-hidden border bg-card text-card-foreground",
                tokens.radius.lg,
                tokens.shadow.card,
              )}
            >
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="text-xs font-medium text-muted-foreground">Шаг {index + 1}</span>
                  <p className={cn("mt-1 text-base font-semibold text-foreground sm:text-lg")}>
                    {step.title}
                  </p>
                </div>
                <div
                  className={cn(
                    "relative mx-auto w-full max-w-[200px] shrink-0 sm:mx-0 sm:max-w-[min(200px,40vw)]",
                    "aspect-square overflow-hidden",
                    tokens.radius.md,
                    "bg-muted ring-1 ring-border",
                  )}
                >
                  <Image
                    src={`${IMAGES_BASE}/${step.file}`}
                    alt={step.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 200px, 200px"
                    priority={index === 0}
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
