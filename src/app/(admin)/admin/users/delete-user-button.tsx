"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDeletion } from "@/lib/confirm-deletion";
import { deleteUser } from "./actions";

export function DeleteUserButton({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (
      !confirmDeletion(
        `Удалить пользователя ${userEmail}?\n\nБудут удалены его доступы к курсам/марафонам и связанные данные.`,
      )
    ) {
      return;
    }

    setLoading(true);
    const res = await deleteUser(userId);
    setLoading(false);

    if (res && "error" in res && res.error) {
      // confirmDeletion использует native confirm; чтобы не тянуть тосты — просто alert.
      // Это админская операция, важнее не потерять сообщение об ошибке.
      window.alert(res.error);
      return;
    }

    router.refresh();
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      onClick={() => void handleDelete()}
      disabled={loading}
    >
      {loading ? "Удаляем..." : "Удалить"}
    </Button>
  );
}

