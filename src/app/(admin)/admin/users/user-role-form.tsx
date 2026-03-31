"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateUserRole } from "./actions";

type Props = {
  userId: string;
  currentRole: "ADMIN" | "CURATOR" | "USER";
};

export function UserRoleForm({ userId, currentRole }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRoleChange(nextRole: "CURATOR" | "USER") {
    if (currentRole === nextRole || loading) {
      return;
    }

    setLoading(true);
    await updateUserRole(userId, nextRole);
    router.refresh();
    setLoading(false);
  }

  if (currentRole === "ADMIN") {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant={currentRole === "CURATOR" ? "secondary" : "outline"}
        disabled={loading || currentRole === "CURATOR"}
        onClick={() => handleRoleChange("CURATOR")}
      >
        Сделать куратором
      </Button>
      <Button
        type="button"
        size="sm"
        variant={currentRole === "USER" ? "secondary" : "outline"}
        disabled={loading || currentRole === "USER"}
        onClick={() => handleRoleChange("USER")}
      >
        Сделать учеником
      </Button>
    </div>
  );
}
