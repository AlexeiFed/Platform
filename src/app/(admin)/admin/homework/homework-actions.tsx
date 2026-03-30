"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, MessageCircle } from "lucide-react";
import { reviewHomework } from "./actions";

export function HomeworkActions({
  submissionId,
  currentStatus,
}: {
  submissionId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleReview(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    await reviewHomework(submissionId, status);
    setLoading(false);
  }

  if (currentStatus === "APPROVED") return null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleReview("APPROVED")}
        disabled={loading}
        className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
        aria-label="Принять"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleReview("REJECTED")}
        disabled={loading}
        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
        aria-label="Отклонить"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
