/**
 * rules/page.tsx
 * Страница правил курса/марафона для студента.
 * Отображается в левом меню только если правила заданы администратором.
 * Контент рендерится из markdown с поддержкой форматирования и эмодзи.
 */
import { Children, isValidElement } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ScrollText } from "lucide-react";

// Всегда динамический рендер — отображает свежие данные после сохранения админом
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ courseSlug: string }>;
};

export default async function CourseRulesPage({ params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: { id: true, title: true, rules: true },
  });

  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_productId: { userId: session.user.id, productId: product.id },
    },
    select: { id: true },
  });

  if (!enrollment) redirect("/catalog");

  if (!product.rules?.trim()) redirect(`/learn/${courseSlug}`);

  // Closure для непрерывной нумерации ol через несколько списков
  const olState = { count: 0 };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору курса">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К обзору
          </Link>
        </Button>
      </div>
      {/* Eyebrow + title — минималистично, с иконкой-маркером раздела */}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <ScrollText className="h-3.5 w-3.5" aria-hidden />
          Правила
        </div>
        <h1 className={`${tokens.typography.h2} text-balance`}>{product.title}</h1>
      </header>

      <article className={`font-prose ${tokens.typography.prose} text-foreground/90`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mb-3 mt-8 text-2xl font-bold tracking-tight text-foreground first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-2 mt-7 border-b border-border pb-1.5 text-xl font-semibold tracking-tight text-foreground first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-1.5 mt-5 text-base font-semibold text-foreground">{children}</h3>
            ),
            p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            em: ({ children }) => <em className="italic">{children}</em>,
            ul: ({ children }) => (
              <ul className="my-3 space-y-1.5 pl-1 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.7em] [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:rounded-full [&_li]:before:bg-primary/70">
                {children}
              </ul>
            ),
            ol: ({ children, start }) => {
              const s = typeof start === "number" ? start : olState.count + 1;
              const liCount = Children.toArray(children).filter((c) => isValidElement(c)).length;
              olState.count = s + (liCount || 1) - 1;
              return (
                <ol
                  start={s}
                  className="my-3 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-primary"
                >
                  {children}
                </ol>
              );
            },
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-lg border-l-4 border-primary/60 bg-primary/5 px-4 py-3 text-foreground/80">
                {children}
              </blockquote>
            ),
            pre: ({ children }) => <div className="my-3">{children}</div>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
                {children}
              </code>
            ),
            hr: () => <hr className="my-6 border-border" />,
            a: ({ children, href }) => (
              <a
                href={href}
                className="font-medium text-primary underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
          }}
        >
          {product.rules}
        </ReactMarkdown>
      </article>
    </div>
  );
}
