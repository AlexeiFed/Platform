import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils";
import { GrantAccessForm } from "./grant-access-form";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: {
      _count: { select: { enrollments: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

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
      <h1 className={tokens.typography.h2}>Пользователи</h1>

      <div className="space-y-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <Avatar>
                <AvatarImage src={user.avatarUrl ?? undefined} />
                <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{user.name ?? "Без имени"}</p>
                  <Badge variant={roleVariants[user.role]} className="text-xs">
                    {roleLabels[user.role]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Зачислений: {user._count.enrollments} · ДЗ: {user._count.submissions} · Регистрация: {formatDate(user.createdAt)}
                </p>
              </div>
              <GrantAccessForm userId={user.id} products={products} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
