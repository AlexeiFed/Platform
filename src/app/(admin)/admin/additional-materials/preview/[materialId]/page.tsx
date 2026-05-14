import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { PdfPages } from "@/components/shared/pdf-pages";
import { getAdditionalMaterialStaffPreview } from "../../actions";

type Props = {
  params: Promise<{ materialId: string }>;
};

export default async function AdditionalMaterialStaffPreviewPage({ params }: Props) {
  const { materialId } = await params;
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") {
    redirect("/dashboard");
  }

  const res = await getAdditionalMaterialStaffPreview(materialId);
  if (!res.success) {
    if (res.error === "Не найдено" || res.error === "Некорректный id") notFound();
    redirect("/admin/additional-materials");
  }

  const hasImages = res.previewImageUrls.length > 0;
  const subtitle = hasImages
    ? `Готовые страницы (${res.previewImageUrls.length}).`
    : res.pdfFallbackUrl
      ? "Страницы не сгенерированы — ниже предпросмотр PDF (как у студента без кэша)."
      : "Нет PDF для предпросмотра.";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <Button variant="outline" size="sm" asChild>
        <Link href="/admin/additional-materials" aria-label="Назад к дополнительным материалам">
          <ArrowLeft className="mr-2 h-4 w-4" />
          К списку материалов
        </Link>
      </Button>

      <div>
        <h1 className={tokens.typography.h2}>{res.title}</h1>
        <p className={tokens.typography.small}>{subtitle}</p>
      </div>

      {hasImages ? (
        <div className="space-y-3">
          {res.previewImageUrls.map((url, idx) => (
            <div key={url} className="overflow-hidden rounded-lg border border-border bg-background">
              <Image
                src={url}
                alt={`Страница ${idx + 1}`}
                width={1600}
                height={2200}
                className="block h-auto w-full"
                loading={idx < 2 ? "eager" : "lazy"}
                fetchPriority={idx === 0 ? "high" : "auto"}
                unoptimized
              />
            </div>
          ))}
        </div>
      ) : null}

      {!hasImages && res.pdfFallbackUrl ? (
        <PdfPages url={res.pdfFallbackUrl} className="w-full" />
      ) : null}
    </div>
  );
}
