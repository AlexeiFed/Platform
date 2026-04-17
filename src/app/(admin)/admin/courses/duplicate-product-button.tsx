/**
 * duplicate-product-button.tsx
 * Кнопка «Дублировать» курс/марафон в списке курсов.
 * Вызывает duplicateProduct server action, редиректит на новый продукт.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { duplicateProduct } from "./actions";

type Props = {
  productId: string;
};

export function DuplicateProductButton({ productId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateProduct(productId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/admin/courses/${result.newId}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        title="Дублировать"
        disabled={pending}
        onClick={handleDuplicate}
      >
        <Copy className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
