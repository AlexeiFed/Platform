"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { submitCuratorFeedbackMessage } from "./actions";

export const FeedbackForm = ({ enrollmentId }: { enrollmentId: string }) => {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    const content = text.trim();
    if (!content || loading) return;
    setLoading(true);
    setError("");
    const res = await submitCuratorFeedbackMessage({ enrollmentId, content });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setText("");
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ваше сообщение куратору…"
        rows={4}
        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        aria-label="Текст обратной связи"
      />
      <Button type="button" onClick={onSubmit} disabled={loading || !text.trim()}>
        {loading ? "Отправка…" : "Отправить"}
      </Button>
      {error ? <p className={`${tokens.typography.small} text-destructive`}>{error}</p> : null}
    </div>
  );
};
