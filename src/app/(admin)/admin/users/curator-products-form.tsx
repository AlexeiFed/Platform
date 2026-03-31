"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toggleCuratorProduct } from "./actions";

type Props = {
  userId: string;
  assignedProductIds: string[];
  products: { id: string; title: string }[];
};

export function CuratorProductsForm({
  userId,
  assignedProductIds,
  products,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);

  async function handleToggle(productId: string) {
    setLoadingProductId(productId);
    await toggleCuratorProduct(userId, productId);
    setLoadingProductId(null);
    router.refresh();
  }

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
        Курсы куратора
      </Button>

      {open && (
        <div className="absolute right-0 top-12 z-50 max-h-72 w-72 overflow-y-auto rounded-lg border bg-popover p-2 shadow-lg">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Назначение курсов / марафонов
          </div>
          <div className="space-y-1">
            {products.map((product) => {
              const assigned = assignedProductIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleToggle(product.id)}
                  disabled={loadingProductId === product.id}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${assigned ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
                >
                  <span className="truncate pr-3">{product.title}</span>
                  <span className="text-xs">
                    {assigned ? "Назначен" : "Назначить"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
