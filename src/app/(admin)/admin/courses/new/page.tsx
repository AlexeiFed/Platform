"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { createProduct } from "../actions";

export default function NewCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productType, setProductType] = useState<"COURSE" | "MARATHON">("COURSE");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const result = await createProduct({
      title: fd.get("title") as string,
      type: (fd.get("type") as "COURSE" | "MARATHON") ?? "COURSE",
      description: fd.get("description") as string,
      price: Number(fd.get("price")) || undefined,
      currency: "RUB",
      published: false,
      startDate: (fd.get("startDate") as string) || undefined,
      durationDays: productType === "MARATHON" ? Number(fd.get("durationDays")) || undefined : undefined,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(`/admin/courses/${result.data?.id}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className={`${tokens.typography.h2} mb-6`}>Новый продукт</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>
            )}
            <div className="space-y-2">
              <label className={tokens.typography.label}>Название</label>
              <Input name="title" placeholder="Название курса или марафона" required />
            </div>
            <div className="space-y-2">
              <label className={tokens.typography.label}>Тип</label>
              <select
                name="type"
                value={productType}
                onChange={(e) => setProductType(e.target.value as "COURSE" | "MARATHON")}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="COURSE">Курс</option>
                <option value="MARATHON">Марафон</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className={tokens.typography.label}>Описание</label>
              <textarea
                name="description"
                placeholder="Описание продукта"
                className="flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={tokens.typography.label}>Цена (₽)</label>
                <Input name="price" type="number" min="0" placeholder="0 = бесплатно" />
              </div>
              <div className="space-y-2">
                <label className={tokens.typography.label}>Дата старта (для марафона)</label>
                <Input name="startDate" type="date" required={productType === "MARATHON"} />
              </div>
            </div>
            {productType === "MARATHON" && (
              <div className="space-y-2">
                <label className={tokens.typography.label}>Длительность марафона (дней)</label>
                <Input name="durationDays" type="number" min="1" defaultValue="22" required />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Создаём..." : "Создать"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
