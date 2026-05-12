"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

type ProductOption = { id: string; title: string; type: "COURSE" | "MARATHON" };

const typeLabel = (t: ProductOption["type"]) => (t === "MARATHON" ? "Марафон" : "Курс");

export const GradesProductSelect = ({
  products,
  selectedProductId,
}: {
  products: ProductOption[];
  selectedProductId: string | null;
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="space-y-2">
      <label htmlFor="grades-product" className={tokens.typography.label}>
        Курс / марафон
      </label>
      <select
        id="grades-product"
        className={cn(
          "flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        value={selectedProductId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          const next = new URLSearchParams(searchParams.toString());
          if (id) next.set("productId", id);
          else next.delete("productId");
          const qs = next.toString();
          router.push(`/admin/grades${qs ? `?${qs}` : ""}`);
        }}
        aria-label="Выбор курса или марафона для таблицы оценок"
      >
        <option value="" disabled={products.length > 0}>
          {products.length === 0 ? "Нет доступных продуктов" : "Выберите продукт"}
        </option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {typeLabel(p.type)} · {p.title}
          </option>
        ))}
      </select>
    </div>
  );
};
