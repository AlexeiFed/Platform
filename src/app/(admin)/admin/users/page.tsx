import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateCuratorForm } from "./create-curator-form";
import { CuratorProductsForm } from "./curator-products-form";
import { GrantAccessForm } from "./grant-access-form";
import { UserRoleForm } from "./user-role-form";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");

  const users = await prisma.user.findMany({
    include: {
      _count: { select: { enrollments: true, submissions: true } },
      curatedProducts: { select: { productId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rawProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      tariffs: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, price: true, currency: true, published: true },
      },
    },
    orderBy: { title: "asc" },
  });

  // Сериализация Decimal → number для передачи в клиентские компоненты
  const products = rawProducts.map((p) => ({
    id: p.id,
    title: p.title,
    tariffs: p.tariffs.map((t) => ({
      id: t.id,
      name: t.name,
      price: Number(t.price),
      currency: t.currency,
      published: t.published,
    })),
  }));

  const roleLabels: Record<string, string> = {
    ADMIN: "Админ",
    CURATOR: "Куратор",
    USER: "Студент",
  };

  const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
    ADMIN: "default",
    CURATOR: "secondary",
    USER: "outline",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={tokens.typography.h2}>Пользователи</h1>
        <div className="text-sm text-muted-foreground">Всего: {users.length}</div>
      </div>

      <CreateCuratorForm />

      <div className="space-y-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <Link href={`/admin/users/${user.id}`} className="flex min-w-0 flex-1 items-center gap-4 rounded-lg transition-colors hover:bg-accent/40">
                <Avatar>
                  <AvatarImage src={user.avatarUrl ?? undefined} />
                  <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 px-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{user.name ?? "Без имени"}</p>
                    <Badge variant={roleVariants[user.role]} className="text-xs">
                      {roleLabels[user.role]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {user.role === "CURATOR"
                      ? `Назначено продуктов: ${user.curatedProducts.length} · ДЗ: ${user._count.submissions} · Регистрация: ${formatDate(user.createdAt)}`
                      : `Зачислений: ${user._count.enrollments} · ДЗ: ${user._count.submissions} · Регистрация: ${formatDate(user.createdAt)}`}
                  </p>
                </div>
              </Link>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <UserRoleForm userId={user.id} currentRole={user.role} />
                {user.role === "CURATOR" && (
                  <CuratorProductsForm
                    userId={user.id}
                    assignedProductIds={user.curatedProducts.map((item) => item.productId)}
                    products={products}
                  />
                )}
                {user.role === "USER" && <GrantAccessForm userId={user.id} products={products} />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
