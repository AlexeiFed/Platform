import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { listStudentAdditionalMaterials } from "./actions";
import { AdditionalMaterialsStudent } from "./additional-materials-student";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ courseSlug: string }> };

export default async function AdditionalMaterialsStudentPage({ params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const res = await listStudentAdditionalMaterials(courseSlug);
  if (!res.success) {
    if (res.error === "Курс не найден") notFound();
    redirect("/catalog");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору курса">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К обзору
          </Link>
        </Button>
      </div>

      <div>
        <h1 className={tokens.typography.h2}>Доп. материалы</h1>
        <p className={tokens.typography.small}>Файлы для скачивания на устройство.</p>
      </div>

      <AdditionalMaterialsStudent courseSlug={courseSlug} materials={res.data} />
    </div>
  );
}
