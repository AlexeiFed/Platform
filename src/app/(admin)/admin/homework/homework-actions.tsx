"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X, SendHorizonal } from "lucide-react";
import { reviewHomework, sendChatMessage } from "./actions";

export function HomeworkActions({
  submissionId,
  currentStatus,
}: {
  submissionId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleReview(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    await reviewHomework(submissionId, status);
    setLoading(false);
    router.refresh();
  }

  async function handleSend() {
    const text = msg.trim();
    if (!text || loading) return;
    setLoading(true);
    await sendChatMessage(submissionId, text);
    setMsg("");
    setLoading(false);
    router.refresh();
  }

  if (currentStatus === "APPROVED") return null;

  return (
    <div className="shrink-0 w-[260px] space-y-2">
      <div className="flex items-center gap-1">
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
          aria-label="На доработку"
          title="На доработку"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
      </div>

      <div className="flex gap-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Сообщение студенту..."
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" size="icon" variant="outline" onClick={handleSend} disabled={loading || !msg.trim()}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
