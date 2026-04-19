"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { cn, lessonsLabel } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { DuplicateProductButton } from "./duplicate-product-button";
import { DeleteProductButton } from "./delete-product-button";

export type ProductListRowProps = {
  productId: string;
  title: string;
  coverUrl: string | null;
  type: "COURSE" | "MARATHON";
  published: boolean;
  lessonsCount: number;
  enrollmentsCount: number;
};

export function ProductListRow({
  productId,
  title,
  coverUrl,
  type: productType,
  published,
  lessonsCount,
  enrollmentsCount,
}: ProductListRowProps) {
  const router = useRouter();
  const editorHref = `/admin/courses/${productId}`;

  function openEditor() {
    router.push(editorHref);
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div
          role="link"
          tabIndex={0}
          aria-label={`Открыть редактор: ${title}`}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-md outline-none transition-colors hover:bg-muted/60",
            tokens.radius.sm,
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          onClick={openEditor}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openEditor();
            }
          }}
        >
          {coverUrl && (
            <img src={coverUrl} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0">
            <h3 className="truncate font-medium">{title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={productType === "COURSE" ? "default" : "secondary"} className="text-xs">
                {productType === "COURSE" ? "Курс" : "Марафон"}
              </Badge>
              <Badge variant={published ? "success" : "outline"} className="text-xs">
                {published ? "Опубликован" : "Черновик"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {lessonsLabel(lessonsCount)} · {enrollmentsCount} студентов
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <DuplicateProductButton productId={productId} />
          <Button variant="ghost" size="icon" asChild>
            <Link href={editorHref} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <DeleteProductButton productId={productId} title={title} enrollmentsCount={enrollmentsCount} />
        </div>
      </CardContent>
    </Card>
  );
}
