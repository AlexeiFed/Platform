import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { PdfPages } from "@/components/shared/pdf-pages";
import { getAdditionalMaterialPdfViewerUrl } from "../actions";

type Props = {
  params: Promise<{ courseSlug: string; materialId: string }>;
};

export default async function AdditionalMaterialPdfViewerPage({ params }: Props) {
  const { courseSlug, materialId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const res = await getAdditionalMaterialPdfViewerUrl(courseSlug, materialId);
  if (!res.success) {
    if (res.error === "Курс не найден") notFound();
    if (res.error === "Просмотр доступен только для PDF") notFound();
    redirect(`/learn/${courseSlug}/additional-materials`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}/additional-materials`} aria-label="Назад к материалам">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К списку
          </Link>
        </Button>
      </div>

      <div className="hidden md:block">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/learn/${courseSlug}/additional-materials`} aria-label="Назад к дополнительным материалам">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К доп. материалам
          </Link>
        </Button>
      </div>

      <div>
        <h1 className={tokens.typography.h2}>{res.title}</h1>
        <p className={tokens.typography.small}>Просмотр PDF в браузере (как страницы в уроке).</p>
      </div>

      <PdfPages url={res.url} className="w-full" />
    </div>
  );
}
