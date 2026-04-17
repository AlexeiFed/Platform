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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>Правила</h1>
        <p className={`${tokens.typography.small} mt-1`}>{product.title}</p>
      </div>

      {/* Рендер markdown без карточки-обёртки */}
      <div className="space-y-2 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold mt-5 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-semibold mt-4 mb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>,
            p: ({ children }) => <p className="leading-relaxed my-1">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-0.5">{children}</ul>,
            // Непрерывная нумерация: следующий ol продолжает счёт предыдущего
            ol: ({ children, start }) => {
              const s = typeof start === "number" ? start : olState.count + 1;
              // Считаем li-потомков для корректного сдвига счётчика
              const liCount = Children.toArray(children).filter((c) => isValidElement(c)).length;
              olState.count = s + (liCount || 1) - 1;
              return (
                <ol start={s} className="list-decimal pl-5 space-y-0.5">
                  {children}
                </ol>
              );
            },
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            ),
            // pre: старый контент с Tab (4 пробела) рендерится как code block — показываем как текст
            pre: ({ children }) => <div className="leading-relaxed">{children}</div>,
            code: ({ children }) => (
              <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>
            ),
            hr: () => <hr className="border-border my-4" />,
          }}
        >
          {product.rules}
        </ReactMarkdown>
      </div>
    </div>
  );
}
