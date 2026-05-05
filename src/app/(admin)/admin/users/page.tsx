import { prisma } from "@/lib/prisma";
import { tokens } from "@/lib/design-tokens";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateCuratorForm } from "./create-curator-form";
import {
  UsersListWithFilters,
  type AdminUserListItem,
} from "./users-list-with-filters";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");

  const users = await prisma.user.findMany({
    include: {
      _count: { select: { enrollments: true, submissions: true } },
      curatedProducts: { select: { productId: true } },
      enrollments: {
        select: {
          productId: true,
          tariffId: true,
          tariff: {
            select: {
              name: true,
            },
          },
        },
      },
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

  const listUsers: AdminUserListItem[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    registrationLabel: formatDate(user.createdAt),
    _count: user._count,
    curatedProducts: user.curatedProducts,
    enrollments: user.enrollments,
  }));

  return (
    <div className="space-y-6">
      <h1 className={tokens.typography.h2}>Пользователи</h1>

      <CreateCuratorForm />

      <UsersListWithFilters users={listUsers} products={products} />
    </div>
  );
}
