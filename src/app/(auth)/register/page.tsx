"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Ошибка регистрации");
      setLoading(false);
    } else {
      router.push("/login?registered=true");
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className={tokens.typography.h3}>Регистрация</CardTitle>
        <CardDescription>Создайте аккаунт для начала обучения</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>
          )}
          <div className="space-y-2">
            <label htmlFor="name" className={tokens.typography.label}>Имя</label>
            <Input id="name" name="name" placeholder="Ваше имя" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className={tokens.typography.label}>Email</label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className={tokens.typography.label}>Пароль</label>
            <Input id="password" name="password" type="password" placeholder="Минимум 8 символов" minLength={8} required />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Создаём..." : "Создать аккаунт"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-primary hover:underline">Войти</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
