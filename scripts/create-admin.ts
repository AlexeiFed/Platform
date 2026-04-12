/**
 * Создаёт или обновляет пользователя с ролью ADMIN (хеш пароля как в приложении).
 * На сервере: задайте DATABASE_URL и выполните из корня репозитория.
 *
 * Вариант 1 (предпочтительно — пароль не светится в ps aux):
 *   ADMIN_EMAIL=you@domain.ru ADMIN_PASSWORD='сложный_пароль' pnpm exec tsx scripts/create-admin.ts
 *
 * Вариант 2:
 *   pnpm exec tsx scripts/create-admin.ts you@domain.ru сложный_пароль
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? process.argv[2])?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3];
  const name = process.env.ADMIN_NAME?.trim() || "Администратор";

  if (!email || !password) {
    console.error(
      "Укажите email и пароль:\n" +
        "  ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm exec tsx scripts/create-admin.ts\n" +
        "  pnpm exec tsx scripts/create-admin.ts <email> <password>\n"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
    },
    update: {
      role: "ADMIN",
      passwordHash,
      name,
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`Готово: ${user.email} → роль ${user.role}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
