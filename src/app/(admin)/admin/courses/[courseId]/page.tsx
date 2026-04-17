import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Badge } from "@/components/ui/badge";
import { CourseEditor } from "./course-editor";
import { TariffsAndCriteriaEditor } from "./tariffs-and-criteria-editor";
import type { ContentBlock } from "./course-editor";
import type { LandingBlock } from "@/types/landing";

type Props = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseEditorPage({ params }: Props) {
  const { courseId } = await params;

  const product = await prisma.product.findUnique({
    where: { id: courseId },
    include: {
      marathonEvents: {
        orderBy: [{ dayOffset: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      },
      lessons: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { submissions: true } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      },
      tariffs: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!product) notFound();

  const { lessons: _lessons, tariffs: productTariffs, ...productData } = product;
  void _lessons;
  const serializedProduct = {
    id: productData.id,
    type: productData.type,
    title: productData.title,
    slug: productData.slug,
    description: productData.description,
    rules: productData.rules ?? null,
    coverUrl: productData.coverUrl,
    price: productData.price ? Number(productData.price) : null,
    currency: productData.currency,
    paymentFormUrl: productData.paymentFormUrl,
    published: productData.published,
    startDate: productData.startDate?.toISOString() ?? null,
    durationDays: productData.durationDays ?? null,
    createdAt: productData.createdAt.toISOString(),
    updatedAt: productData.updatedAt.toISOString(),
    deletedAt: productData.deletedAt?.toISOString() ?? null,
    enabledCriteria: productData.enabledCriteria,
    landingBlocks: (productData.landingBlocks as LandingBlock[] | null) ?? [],
  };

  const serializedTariffs = productTariffs.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: t.currency,
    sortOrder: t.sortOrder,
    published: t.published,
    criteria: t.criteria,
  }));

  const serializedMarathonEvents = product.marathonEvents.map((event) => ({
    ...event,
    blocks: event.blocks,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }));

  const serializedLessons = product.lessons.map((l) => ({
    ...l,
    blocks: (l.blocks as ContentBlock[] | null) ?? null,
    homeworkEnabled: l.homeworkEnabled,
    homeworkQuestions: (l.homeworkQuestions as string[] | null) ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    unlockDate: l.unlockDate?.toISOString() ?? null,
    attachments: l.attachments.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={tokens.typography.h2}>{product.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
              {product.type === "COURSE" ? "Курс" : "Марафон"}
            </Badge>
            <Badge variant={product.published ? "success" : "outline"}>
              {product.published ? "Опубликован" : "Черновик"}
            </Badge>
          </div>
        </div>
      </div>

      <div id="admin-section-criteria">
        <TariffsAndCriteriaEditor
          productId={product.id}
          initialEnabled={productData.enabledCriteria}
          tariffs={serializedTariffs}
        />
      </div>

      <CourseEditor
        product={serializedProduct}
        lessons={serializedLessons}
        marathonEvents={serializedMarathonEvents}
      />
    </div>
  );
}
