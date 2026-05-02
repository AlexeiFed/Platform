import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateMarathonProgress } from "../src/lib/marathon-progress";
import { ALL_PRODUCT_CRITERIA } from "../src/lib/product-criteria";

const prisma = new PrismaClient();

type LessonSeed = {
  key: string;
  title: string;
  blocks: Array<{ id: string; type: "text" | "video" | "image"; content: string }>;
};

type EventSeed = {
  title: string;
  description?: string;
  type: "INFO" | "TRAINING" | "NUTRITION" | "PROCEDURE" | "BONUS" | "LIVE" | "RESULT";
  track?: "ALL" | "HOME" | "GYM";
  dayOffset: number;
  weekNumber?: number | null;
  lessonKey?: string;
  blocks?: Array<{ id: string; type: "text" | "video" | "image"; content: string }>;
};

const MARATHON_SLUG = "weight-loss-marathon-2-0-2026";

const richTextBlock = (id: string, title: string, paragraphs: string[]) => ({
  id,
  type: "text" as const,
  content: `
    <h2>${title}</h2>
    ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
  `,
});

const lessons: LessonSeed[] = [
  {
    key: "wk1-home-mon",
    title: "Неделя 1: домашняя тренировка (понедельник)",
    blocks: [
      richTextBlock("wk1-home-mon-text", "Домашняя тренировка", [
        "Низкоударная жиросжигающая тренировка на всё тело с акцентом на включение лимфотока и мягкий старт.",
        "Работай в комфортном темпе, следи за дыханием и отмечай самочувствие после занятия.",
      ]),
    ],
  },
  {
    key: "wk1-gym-mon",
    title: "Неделя 1: тренировка в зале (понедельник)",
    blocks: [
      richTextBlock("wk1-gym-mon-text", "Зал: старт недели", [
        "Силовая база на всё тело с умеренной нагрузкой и контролем техники.",
        "Основная задача: включить мышцы и дать метаболический импульс без перегруза.",
      ]),
    ],
  },
  {
    key: "wk1-nutrition",
    title: "Неделя 1: питание и энергетический баланс",
    blocks: [
      richTextBlock("wk1-nutrition-text", "Понимание питания и энергетического баланса", [
        "Что такое калории, КБЖУ и почему не работает хаотичное ограничение еды.",
        "Как питание влияет на гормональный фон, восстановление и повседневную энергию.",
      ]),
    ],
  },
  {
    key: "wk1-home-wed",
    title: "Неделя 1: домашняя тренировка (среда)",
    blocks: [
      richTextBlock("wk1-home-wed-text", "Домашняя тренировка", [
        "Продолжаем мягкое жиросжигание, подключаем мышцы кора и ягодицы.",
        "После тренировки добавь прогулку и контроль питьевого режима.",
      ]),
    ],
  },
  {
    key: "wk1-gym-wed",
    title: "Неделя 1: тренировка в зале (среда)",
    blocks: [
      richTextBlock("wk1-gym-wed-text", "Зал: рабочая середина недели", [
        "Работаем на технику базовых движений и умеренную силовую выносливость.",
        "Контроль отдыха между подходами: не дольше 60-90 секунд.",
      ]),
    ],
  },
  {
    key: "wk1-home-fri",
    title: "Неделя 1: домашняя тренировка (пятница)",
    blocks: [
      richTextBlock("wk1-home-fri-text", "Домашняя тренировка", [
        "Финиш недели: круговая работа без прыжков для закрепления темпа.",
        "Сфокусируйся на качестве движения и дыхании.",
      ]),
    ],
  },
  {
    key: "wk1-gym-fri",
    title: "Неделя 1: тренировка в зале (пятница)",
    blocks: [
      richTextBlock("wk1-gym-fri-text", "Зал: завершение недели", [
        "Комбинация силовых и интервальных блоков для тонуса и расхода энергии.",
        "После тренировки оцени нагрузку по шкале самочувствия.",
      ]),
    ],
  },
  {
    key: "wk1-bonus",
    title: "Неделя 1: вакуум, восстановление и анализы",
    blocks: [
      richTextBlock("wk1-bonus-text", "Дополнительные материалы недели 1", [
        "Техника вакуум для плоского живота, рекомендации по восстановлению и питьевому режиму.",
        "Список анализов крови и рекомендации, что подготовить к следующей неделе.",
      ]),
    ],
  },
  {
    key: "wk2-home-mon",
    title: "Неделя 2: домашняя тренировка (понедельник)",
    blocks: [
      richTextBlock("wk2-home-mon-text", "Домашняя тренировка", [
        "Переходим к более плотной работе на нижнюю часть тела и кор.",
        "Следи за амплитудой и не теряй ритм между упражнениями.",
      ]),
    ],
  },
  {
    key: "wk2-gym-mon",
    title: "Неделя 2: тренировка в зале (понедельник)",
    blocks: [
      richTextBlock("wk2-gym-mon-text", "Зал: прогрессия нагрузки", [
        "Увеличиваем рабочий объём и следим за техникой на базе.",
        "При необходимости снижай вес, если техника плывёт.",
      ]),
    ],
  },
  {
    key: "wk2-nutrition",
    title: "Неделя 2: конструктор рациона Б/Ж/У",
    blocks: [
      richTextBlock("wk2-nutrition-text", "Конструктор рациона", [
        "Как собирать питание под себя без жёстких схем и вечных запретов.",
        "Разбираем разнообразие, профилактику срывов и пример меню на месяц.",
      ]),
    ],
  },
  {
    key: "wk2-home-wed",
    title: "Неделя 2: домашняя тренировка (среда)",
    blocks: [
      richTextBlock("wk2-home-wed-text", "Домашняя тренировка", [
        "Работа на тонус и повышение общей выносливости.",
        "Добавь короткую растяжку после основной части.",
      ]),
    ],
  },
  {
    key: "wk2-gym-wed",
    title: "Неделя 2: тренировка в зале (среда)",
    blocks: [
      richTextBlock("wk2-gym-wed-text", "Зал: середина второй недели", [
        "Комбинация силовых упражнений и коротких ускорений между подходами.",
        "Следим за техникой и восстановлением между сессиями.",
      ]),
    ],
  },
  {
    key: "wk2-home-fri",
    title: "Неделя 2: домашняя тренировка (пятница)",
    blocks: [
      richTextBlock("wk2-home-fri-text", "Домашняя тренировка", [
        "Фиксируем темп недели: интервальная схема без перегруза суставов.",
        "Смотри на качество выполнения и стабильный пульс.",
      ]),
    ],
  },
  {
    key: "wk2-gym-fri",
    title: "Неделя 2: тренировка в зале (пятница)",
    blocks: [
      richTextBlock("wk2-gym-fri-text", "Зал: завершение второй недели", [
        "Упор на форму, контроль техники и дозированную интенсивность.",
        "Подумай, какие упражнения дались легче, а какие требуют адаптации.",
      ]),
    ],
  },
  {
    key: "wk2-bonus",
    title: "Неделя 2: растяжка и консультация по БАДам",
    blocks: [
      richTextBlock("wk2-bonus-text", "Дополнительные материалы недели 2", [
        "Растяжка для восстановления, улучшения кровотока и самочувствия.",
        "Как подойти к теме БАДов без хаоса и что действительно стоит обсуждать со специалистом.",
      ]),
    ],
  },
  {
    key: "wk3-home-mon",
    title: "Неделя 3: домашняя тренировка (понедельник)",
    blocks: [
      richTextBlock("wk3-home-mon-text", "Домашняя тренировка", [
        "Закрепляем форму: работа на всё тело с контролем техники и темпа.",
        "Главная цель недели — стабилизация результата.",
      ]),
    ],
  },
  {
    key: "wk3-gym-mon",
    title: "Неделя 3: тренировка в зале (понедельник)",
    blocks: [
      richTextBlock("wk3-gym-mon-text", "Зал: неделя закрепления", [
        "Сохраняем рабочий объём и концентрируемся на чистом движении.",
        "Не форсируй веса, приоритет — сохранить качество.",
      ]),
    ],
  },
  {
    key: "wk3-nutrition",
    title: "Неделя 3: питание в реальной жизни",
    blocks: [
      richTextBlock("wk3-nutrition-text", "Питание в реальной жизни", [
        "Как питаться, если ты работаешь, путешествуешь или тренируешься вечером.",
        "Разбираем выбор продуктов вне дома, чтение состава и предварительное планирование без стресса.",
      ]),
    ],
  },
  {
    key: "wk3-home-wed",
    title: "Неделя 3: домашняя тренировка (среда)",
    blocks: [
      richTextBlock("wk3-home-wed-text", "Домашняя тренировка", [
        "Поддерживаем тонус и не бросаем активность после первых результатов.",
        "Сфокусируйся на плавном темпе и аккуратной технике.",
      ]),
    ],
  },
  {
    key: "wk3-gym-wed",
    title: "Неделя 3: тренировка в зале (среда)",
    blocks: [
      richTextBlock("wk3-gym-wed-text", "Зал: закрепление", [
        "Рабочая сессия для поддержания объёмов и общего тонуса.",
        "Оцени, что возьмёшь в свою постоянную программу после марафона.",
      ]),
    ],
  },
  {
    key: "wk3-home-fri",
    title: "Неделя 3: домашняя тренировка (пятница)",
    blocks: [
      richTextBlock("wk3-home-fri-text", "Домашняя тренировка", [
        "Финальная домашняя сессия на закрепление результата.",
        "Контроль самочувствия и лёгкое восстановление после занятия обязательны.",
      ]),
    ],
  },
  {
    key: "wk3-gym-fri",
    title: "Неделя 3: тренировка в зале (пятница)",
    blocks: [
      richTextBlock("wk3-gym-fri-text", "Зал: финальная тренировка", [
        "Финальный тренировочный блок марафона без перегруза и с фокусом на устойчивый результат.",
        "Запиши свои рабочие параметры и ощущения после марафона.",
      ]),
    ],
  },
  {
    key: "wk3-bonus",
    title: "Неделя 3: поддержка результата и план после марафона",
    blocks: [
      richTextBlock("wk3-bonus-text", "Что делать дальше", [
        "Как сохранить результат, не сорваться и встроить систему в обычную жизнь.",
        "Минимальный план на следующие 4 недели после марафона.",
      ]),
    ],
  },
  {
    key: "final-live",
    title: "Финальный эфир и разбор результатов",
    blocks: [
      richTextBlock("final-live-text", "Финал марафона", [
        "Разбор результатов, ответы на вопросы, рекомендации на следующий этап и поддержка после завершения потока.",
        "Зафиксируй личные выводы: что сработало лучше всего и что переносишь в обычную жизнь.",
      ]),
    ],
  },
];

const events: EventSeed[] = [
  {
    title: "Доступ в закрытый чат марафона",
    type: "INFO",
    dayOffset: 0,
    weekNumber: 0,
    blocks: [richTextBlock("prep-chat", "Закрытый чат марафона", [
      "Сразу после бронирования участник получает доступ в чат потока, где идут организационные сообщения и поддержка.",
      "Внутри чата фиксируются дедлайны, объявления и ответы на базовые вопросы.",
    ])],
  },
  {
    title: "Организационная информация",
    type: "INFO",
    dayOffset: 0,
    weekNumber: 0,
    blocks: [richTextBlock("prep-org", "Организационный этап", [
      "Как устроен марафон, где смотреть контент, когда открываются активности и как отслеживать свой прогресс.",
    ])],
  },
  {
    title: "Оплата и подтверждение участия",
    type: "INFO",
    dayOffset: 0,
    weekNumber: 0,
    blocks: [richTextBlock("prep-pay", "Оплата", [
      "Фиксация оплаты, подтверждение участия и проверка доступа ко всем материалам потока.",
    ])],
  },
  {
    title: "Анкета участника",
    type: "INFO",
    dayOffset: 0,
    weekNumber: 0,
    blocks: [richTextBlock("prep-form", "Анкета участника", [
      "Стартовая анкета помогает собрать исходные данные, цели, ограничения и текущее состояние участника.",
    ])],
  },
  { title: "Тренировка дома", description: "Запуск первой недели и мягкий старт жиросжигания.", type: "TRAINING", track: "HOME", dayOffset: 1, weekNumber: 1, lessonKey: "wk1-home-mon" },
  { title: "Тренировка в зале", description: "Зал: старт первой недели.", type: "TRAINING", track: "GYM", dayOffset: 1, weekNumber: 1, lessonKey: "wk1-gym-mon" },
  { title: "Питание: понимание энергетического баланса", description: "Что такое КБЖУ, калорийность и влияние питания на самочувствие.", type: "NUTRITION", track: "ALL", dayOffset: 2, weekNumber: 1, lessonKey: "wk1-nutrition" },
  { title: "Тренировка дома", description: "Середина первой недели.", type: "TRAINING", track: "HOME", dayOffset: 3, weekNumber: 1, lessonKey: "wk1-home-wed" },
  { title: "Тренировка в зале", description: "Середина первой недели.", type: "TRAINING", track: "GYM", dayOffset: 3, weekNumber: 1, lessonKey: "wk1-gym-wed" },
  {
    title: "Процедуры недели 1",
    description: "LPG-массаж, роликовый массаж, баротренажёр и прессотерапия по индивидуальному графику.",
    type: "PROCEDURE",
    track: "ALL",
    dayOffset: 4,
    weekNumber: 1,
    blocks: [richTextBlock("wk1-procedure", "Процедуры недели 1", [
      "На первой неделе запускается курс Интенсив Плюс и Экспресс-похудение.",
      "Конкретные даты прохождения процедур назначаются индивидуально.",
    ])],
  },
  { title: "Тренировка дома", description: "Финиш первой недели.", type: "TRAINING", track: "HOME", dayOffset: 5, weekNumber: 1, lessonKey: "wk1-home-fri" },
  { title: "Тренировка в зале", description: "Финиш первой недели.", type: "TRAINING", track: "GYM", dayOffset: 5, weekNumber: 1, lessonKey: "wk1-gym-fri" },
  { title: "Дополнительно: вакуум, восстановление, анализы", description: "Материалы недели 1.", type: "BONUS", track: "ALL", dayOffset: 6, weekNumber: 1, lessonKey: "wk1-bonus" },
  { title: "Тренировка дома", description: "Старт второй недели.", type: "TRAINING", track: "HOME", dayOffset: 8, weekNumber: 2, lessonKey: "wk2-home-mon" },
  { title: "Тренировка в зале", description: "Старт второй недели.", type: "TRAINING", track: "GYM", dayOffset: 8, weekNumber: 2, lessonKey: "wk2-gym-mon" },
  { title: "Питание: конструктор рациона Б/Ж/У", description: "Как собрать питание под себя и не сорваться.", type: "NUTRITION", track: "ALL", dayOffset: 9, weekNumber: 2, lessonKey: "wk2-nutrition" },
  { title: "Тренировка дома", description: "Середина второй недели.", type: "TRAINING", track: "HOME", dayOffset: 10, weekNumber: 2, lessonKey: "wk2-home-wed" },
  { title: "Тренировка в зале", description: "Середина второй недели.", type: "TRAINING", track: "GYM", dayOffset: 10, weekNumber: 2, lessonKey: "wk2-gym-wed" },
  {
    title: "Процедуры недели 2",
    description: "Точечный лифтинг, горячие обёртывания, роликовый массаж, LPG и прессотерапия.",
    type: "PROCEDURE",
    track: "ALL",
    dayOffset: 11,
    weekNumber: 2,
    blocks: [richTextBlock("wk2-procedure", "Процедуры недели 2", [
      "Курс процедур продолжается по индивидуальному графику участника.",
      "Следи за восстановлением и не пропускай фиксацию прохождений.",
    ])],
  },
  { title: "Тренировка дома", description: "Финиш второй недели.", type: "TRAINING", track: "HOME", dayOffset: 12, weekNumber: 2, lessonKey: "wk2-home-fri" },
  { title: "Тренировка в зале", description: "Финиш второй недели.", type: "TRAINING", track: "GYM", dayOffset: 12, weekNumber: 2, lessonKey: "wk2-gym-fri" },
  { title: "Дополнительно: растяжка и консультация по БАДам", description: "Материалы недели 2.", type: "BONUS", track: "ALL", dayOffset: 13, weekNumber: 2, lessonKey: "wk2-bonus" },
  { title: "Тренировка дома", description: "Старт третьей недели.", type: "TRAINING", track: "HOME", dayOffset: 15, weekNumber: 3, lessonKey: "wk3-home-mon" },
  { title: "Тренировка в зале", description: "Старт третьей недели.", type: "TRAINING", track: "GYM", dayOffset: 15, weekNumber: 3, lessonKey: "wk3-gym-mon" },
  { title: "Питание: в реальной жизни", description: "Как питаться на работе, в поездках и без стресса.", type: "NUTRITION", track: "ALL", dayOffset: 16, weekNumber: 3, lessonKey: "wk3-nutrition" },
  { title: "Тренировка дома", description: "Середина третьей недели.", type: "TRAINING", track: "HOME", dayOffset: 17, weekNumber: 3, lessonKey: "wk3-home-wed" },
  { title: "Тренировка в зале", description: "Середина третьей недели.", type: "TRAINING", track: "GYM", dayOffset: 17, weekNumber: 3, lessonKey: "wk3-gym-wed" },
  {
    title: "Процедуры недели 3",
    description: "Завершение основного курса процедур и фиксация результата.",
    type: "PROCEDURE",
    track: "ALL",
    dayOffset: 18,
    weekNumber: 3,
    blocks: [richTextBlock("wk3-procedure", "Процедуры недели 3", [
      "Если не все процедуры пройдены в срок марафона, их можно завершить после финала.",
      "На этой неделе важно зафиксировать результат и субъективные изменения самочувствия.",
    ])],
  },
  { title: "Тренировка дома", description: "Финальная домашняя тренировка.", type: "TRAINING", track: "HOME", dayOffset: 19, weekNumber: 3, lessonKey: "wk3-home-fri" },
  { title: "Тренировка в зале", description: "Финальная тренировка в зале.", type: "TRAINING", track: "GYM", dayOffset: 19, weekNumber: 3, lessonKey: "wk3-gym-fri" },
  { title: "Поддержка результата после марафона", description: "План на следующий этап и удержание результата.", type: "BONUS", track: "ALL", dayOffset: 20, weekNumber: 3, lessonKey: "wk3-bonus" },
  { title: "Финальный эфир с ответами на вопросы", description: "Онлайн-эфир и подведение итогов марафона.", type: "LIVE", track: "ALL", dayOffset: 21, weekNumber: 3, lessonKey: "final-live" },
  {
    title: "Разбор результатов и рекомендации",
    description: "Что делать дальше, как сохранить результат и не откатиться назад.",
    type: "RESULT",
    track: "ALL",
    dayOffset: 21,
    weekNumber: 3,
    blocks: [richTextBlock("final-result", "Результаты марафона", [
      "Разбор прогресса по процедурам, питанию, тренировкам и поведенческим изменениям.",
      "Рекомендации по сохранению результата после завершения марафона.",
    ])],
  },
];

const procedureTitles = [
  "LPG-массаж",
  "Роликовый массаж",
  "Баротренажёр",
  "Прессотерапия",
  "Точечный лифтинг",
  "Горячие обёртывания",
];

async function ensureDemoUsers() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const userPassword = await bcrypt.hash("user1234", 12);

  await prisma.user.upsert({
    where: { email: "admin@learnhub.ru" },
    update: {},
    create: {
      email: "admin@learnhub.ru",
      name: "Админ",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "curator@learnhub.ru" },
    update: {},
    create: {
      email: "curator@learnhub.ru",
      name: "Куратор Иван",
      passwordHash: userPassword,
      role: "CURATOR",
    },
  });

  return prisma.user.upsert({
    where: { email: "student@learnhub.ru" },
    update: {},
    create: {
      email: "student@learnhub.ru",
      name: "Студент Мария",
      passwordHash: userPassword,
      role: "USER",
    },
  });
}

async function main() {
  const student = await ensureDemoUsers();

  const product = await prisma.product.upsert({
    where: { slug: MARATHON_SLUG },
    update: {
      title: "Марафон похудения 2.0",
      type: "MARATHON",
      description: "Демо-реализация 3-недельного марафона похудения с календарём событий, процедурами и отдельным student UX.",
      price: 19990,
      currency: "RUB",
      published: true,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      durationDays: 22,
    },
    create: {
      title: "Марафон похудения 2.0",
      slug: MARATHON_SLUG,
      type: "MARATHON",
      description: "Демо-реализация 3-недельного марафона похудения с календарём событий, процедурами и отдельным student UX.",
      price: 19990,
      currency: "RUB",
      published: true,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      durationDays: 22,
    },
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { enabledCriteria: ALL_PRODUCT_CRITERIA },
  });

  let tariff = await prisma.productTariff.findFirst({
    where: { productId: product.id, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!tariff) {
    tariff = await prisma.productTariff.create({
      data: {
        productId: product.id,
        name: "Базовый",
        price: product.price ?? 0,
        currency: product.currency,
        sortOrder: 0,
        published: true,
        criteria: ALL_PRODUCT_CRITERIA,
      },
    });
  }

  await prisma.marathonEventCompletion.deleteMany({
    where: {
      enrollment: {
        productId: product.id,
      },
    },
  });
  await prisma.userMarathonProcedure.deleteMany({
    where: {
      enrollment: {
        productId: product.id,
      },
    },
  });
  await prisma.marathonEvent.deleteMany({
    where: { productId: product.id },
  });
  await prisma.lesson.deleteMany({
    where: { productId: product.id },
  });

  const enrollment = await prisma.enrollment.upsert({
    where: {
      userId_productId: {
        userId: student.id,
        productId: product.id,
      },
    },
    update: { tariffId: tariff.id },
    create: {
      userId: student.id,
      productId: product.id,
      tariffId: tariff.id,
    },
  });

  const lessonMap = new Map<string, { id: string; slug: string }>();

  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index];
    const createdLesson = await prisma.lesson.create({
      data: {
        productId: product.id,
        title: lesson.title,
        slug: lesson.key,
        order: index + 1,
        blocks: lesson.blocks,
        published: true,
      },
      select: {
        id: true,
        slug: true,
      },
    });

    lessonMap.set(lesson.key, createdLesson);
  }

  const createdEvents: Array<{ id: string; hasLesson: boolean }> = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const linkedLesson = event.lessonKey ? lessonMap.get(event.lessonKey) : null;

    const createdEvent = await prisma.marathonEvent.create({
      data: {
        productId: product.id,
        title: event.title,
        description: event.description ?? null,
        type: event.type,
        track: event.track ?? "ALL",
        dayOffset: event.dayOffset,
        weekNumber: event.weekNumber ?? null,
        position: index,
        blocks: event.blocks ?? undefined,
        published: true,
      },
      select: {
        id: true,
      },
    });

    if (linkedLesson) {
      await prisma.marathonEventLesson.create({
        data: {
          marathonEventId: createdEvent.id,
          lessonId: linkedLesson.id,
          position: 0,
        },
      });
    }

    createdEvents.push({ id: createdEvent.id, hasLesson: Boolean(linkedLesson) });
  }

  const procedureTypes = await Promise.all(
    procedureTitles.map((title) =>
      prisma.procedureType.upsert({
        where: { title },
        update: {},
        create: { title },
      })
    )
  );

  const procedureSlots = Array.from({ length: 35 }).map((_, index) => {
    const date = new Date("2026-02-02T10:00:00.000Z");
    date.setDate(date.getDate() + Math.floor(index / 2));

    return {
      procedureTypeId: procedureTypes[index % procedureTypes.length].id,
      scheduledAt: new Date(date),
      completedAt: index < 24 ? new Date(date) : null,
      notes:
        index < 24
          ? "Демо: процедура отмечена как пройденная."
          : "Демо: процедура назначена, но ещё без отметки выполнения.",
      position: index,
    };
  });

  await prisma.userMarathonProcedure.createMany({
    data: procedureSlots.map((slot) => ({
      enrollmentId: enrollment.id,
      ...slot,
    })),
  });

  const completionTargets = createdEvents.slice(0, 11);
  await prisma.marathonEventCompletion.createMany({
    data: completionTargets.map((event) => ({
      enrollmentId: enrollment.id,
      eventId: event.id,
      completedAt: new Date("2026-02-20T12:00:00.000Z"),
    })),
    skipDuplicates: true,
  });

  const progress = calculateMarathonProgress({
    events: createdEvents.map((event, index) => ({
      id: event.id,
      lessons: event.hasLesson
        ? [{ submissions: index < 8 ? [{ status: "APPROVED" as const }] : [] }]
        : [],
      completions: completionTargets.some((t) => t.id === event.id) ? [{ id: event.id }] : [],
    })),
    procedures: procedureSlots.map((slot) => ({
      completedAt: slot.completedAt,
    })),
  });

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      progress: progress.value,
    },
  });

  console.log("Created demo marathon:");
  console.log(`  Product: Марафон похудения 2.0`);
  console.log(`  Slug: ${MARATHON_SLUG}`);
  console.log(`  Product ID: ${product.id}`);
  console.log(`  Lessons: ${lessons.length}`);
  console.log(`  Events: ${createdEvents.length}`);
  console.log(`  Procedure types: ${procedureTypes.length}`);
  console.log(`  Student procedures: ${procedureSlots.length}`);
  console.log(`  Student progress: ${Math.round(progress.value * 100)}%`);
  console.log(`  Student login: student@learnhub.ru / user1234`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
