"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { createCurator } from "./actions";

export function CreateCuratorForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const result = await createCurator({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    event.currentTarget.reset();
    setSuccess("Куратор создан");
    router.refresh();
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Новый куратор</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_auto]">
          <div className="space-y-2">
            <label htmlFor="curator-name" className={tokens.typography.label}>Имя</label>
            <Input id="curator-name" name="name" placeholder="Иван Петров" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="curator-email" className={tokens.typography.label}>Email</label>
            <Input id="curator-email" name="email" type="email" placeholder="curator@example.com" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="curator-password" className={tokens.typography.label}>Пароль</label>
            <Input id="curator-password" name="password" type="password" minLength={8} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Создаём..." : "Добавить"}
            </Button>
          </div>
        </form>

        {error && (
          <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {success && (
          <div className="mt-3 rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            {success}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
