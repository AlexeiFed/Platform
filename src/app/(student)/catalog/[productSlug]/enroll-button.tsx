"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enrollToProduct } from "./actions";

export function EnrollButton({ productId, productSlug }: { productId: string; productSlug: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    const res = await enrollToProduct(productId);
    setLoading(false);

    if (res?.success) router.push(`/learn/${productSlug}`);
  }

  return (
    <Button onClick={onClick} disabled={loading}>
      {loading ? "Оформляем..." : "Записаться"}
    </Button>
  );
}

