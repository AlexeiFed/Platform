import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const userPassword = await bcrypt.hash("user1234", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@learnhub.ru" },
    update: {},
    create: {
      email: "admin@learnhub.ru",
      name: "Админ",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const curator = await prisma.user.upsert({
    where: { email: "curator@learnhub.ru" },
    update: {},
    create: {
      email: "curator@learnhub.ru",
      name: "Куратор Иван",
      passwordHash: userPassword,
      role: "CURATOR",
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@learnhub.ru" },
    update: {},
    create: {
      email: "student@learnhub.ru",
      name: "Студент Мария",
      passwordHash: userPassword,
      role: "USER",
    },
  });

  const course = await prisma.product.upsert({
    where: { slug: "web-development-basics" },
    update: {},
    create: {
      title: "Основы веб-разработки",
      slug: "web-development-basics",
      type: "COURSE",
      description: "Изучите HTML, CSS и JavaScript с нуля. Идеальный курс для начинающих разработчиков.",
      price: 4990,
      published: true,
    },
  });

  const marathon = await prisma.product.upsert({
    where: { slug: "30-days-javascript" },
    update: {},
    create: {
      title: "30 дней JavaScript",
      slug: "30-days-javascript",
      type: "MARATHON",
      description: "Марафон по JavaScript: каждый день новое задание в течение месяца.",
      price: 2990,
      published: true,
      startDate: new Date("2026-04-01"),
    },
  });

  const lessons = [
    { title: "Введение в HTML", content: "<h2>Что такое HTML?</h2><p>HTML — это язык разметки для создания веб-страниц.</p>", order: 1 },
    { title: "CSS основы", content: "<h2>Стилизация страниц</h2><p>CSS позволяет задавать внешний вид элементов.</p>", order: 2 },
    { title: "JavaScript: первые шаги", content: "<h2>Переменные и типы данных</h2><p>Начнём с основ JavaScript.</p>", order: 3, unlockRule: "AFTER_HOMEWORK_APPROVAL" as const },
    { title: "DOM и события", content: "<h2>Работа с DOM</h2><p>Научимся управлять элементами страницы.</p>", order: 4, unlockRule: "AFTER_HOMEWORK_APPROVAL" as const },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { productId_slug: { productId: course.id, slug: lesson.title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s]+/g, "-") } },
      update: {},
      create: {
        productId: course.id,
        title: lesson.title,
        slug: lesson.title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s]+/g, "-"),
        content: lesson.content,
        order: lesson.order,
        unlockRule: lesson.unlockRule ?? "IMMEDIATELY",
        published: true,
      },
    });
  }

  await prisma.enrollment.upsert({
    where: { userId_productId: { userId: student.id, productId: course.id } },
    update: {},
    create: {
      userId: student.id,
      productId: course.id,
    },
  });

  console.log("Seed completed:");
  console.log(`  Admin: admin@learnhub.ru / admin123`);
  console.log(`  Curator: curator@learnhub.ru / user1234`);
  console.log(`  Student: student@learnhub.ru / user1234`);
  console.log(`  Course: ${course.title}`);
  console.log(`  Marathon: ${marathon.title}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
