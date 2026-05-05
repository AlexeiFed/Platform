"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tokens } from "@/lib/design-tokens";
import { registerUserSchema } from "@/lib/validations/register-user";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const validated = registerUserSchema.safeParse(payload);
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? "Проверьте заполнение полей");
      setLoading(false);
      return;
    }

    const { email, password } = validated.data;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.data),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Ошибка регистрации");
      setLoading(false);
    } else {
      const loginResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginResult?.error) {
        setError("Аккаунт создан, но автоматический вход не сработал");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
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
            <label htmlFor="firstName" className={tokens.typography.label}>Имя</label>
            <Input
              id="firstName"
              name="firstName"
              placeholder="Ваше имя"
              autoComplete="given-name"
              required
              minLength={1}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className={tokens.typography.label}>Фамилия</label>
            <Input
              id="lastName"
              name="lastName"
              placeholder="Ваша фамилия"
              autoComplete="family-name"
              required
              minLength={1}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className={tokens.typography.label}>Email</label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className={tokens.typography.label}>Пароль</label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Минимум 8 символов"
              minLength={8}
              required
            />
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
