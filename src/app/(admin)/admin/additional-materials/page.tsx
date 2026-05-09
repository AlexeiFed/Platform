import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { AdditionalMaterialsManager } from "./additional-materials-manager";

export const dynamic = "force-dynamic";

export default async function AdditionalMaterialsAdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") redirect("/dashboard");

  const allowedProductIds =
    session.user.role === "CURATOR"
      ? (
          await prisma.productCurator.findMany({
            where: { curatorId: session.user.id },
            select: { productId: true },
          })
        ).map((x) => x.productId)
      : null;

  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(allowedProductIds ? { id: { in: allowedProductIds } } : {}) },
    select: { id: true, title: true, type: true },
    orderBy: { title: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Доп. материалы</h1>
        <p className={tokens.typography.body}>
          Загрузка в S3, привязка к курсу или марафону. Для PDF создаётся обложка по первой странице. Дата
          видимости — с начала выбранного дня (UTC); если поле пустое, материал виден сразу.
        </p>
      </div>
      <AdditionalMaterialsManager products={products} initialProductId={products[0]?.id ?? null} />
    </div>
  );
}
