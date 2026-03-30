import Link from "next/link";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/design-tokens";
import { GraduationCap, BookOpen, Trophy, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className={`${tokens.spacing.page} flex items-center justify-between h-16`}>
          <Link href="/" className="flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">LearnHub</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/catalog">Каталог</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Войти</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className={`${tokens.spacing.page} ${tokens.spacing.section} text-center`}>
          <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Образовательная платформа
              <br />
              <span className="text-primary">нового поколения</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Курсы и марафоны с проверкой домашних заданий, персональной обратной связью и удобным мобильным приложением.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild>
                <Link href="/catalog">Смотреть каталог</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/register">Начать обучение</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className={`${tokens.spacing.page} ${tokens.spacing.section}`}>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: BookOpen,
                title: "Курсы и марафоны",
                description: "Линейное прогрессирование или привязка к датам — выбирайте формат обучения.",
              },
              {
                icon: Trophy,
                title: "Домашние задания",
                description: "Сдавайте ДЗ и получайте обратную связь от кураторов в личном чате.",
              },
              {
                icon: Users,
                title: "Мобильное приложение",
                description: "Добавьте на главный экран и учитесь где угодно. Работает offline.",
              },
            ].map((feature) => (
              <div key={feature.title} className="text-center space-y-3 p-6">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className={tokens.typography.h4}>{feature.title}</h3>
                <p className={tokens.typography.body}>{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t mt-auto">
        <div className={`${tokens.spacing.page} py-6 text-center`}>
          <p className={tokens.typography.small}>© 2026 LearnHub. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
}
