import { z } from "zod";

/** Регистрация студента: имя + фамилия сохраняются в User.name одной строкой */
export const registerUserSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Напишите имя — без него мы не сможем обращаться к вам по человечески.")
    .max(80, "Имя получилось очень длинным. Сократите до 80 символов."),
  lastName: z
    .string()
    .trim()
    .min(1, "Напишите фамилию — она нужна, чтобы мы узнавали вас в списках.")
    .max(80, "Фамилия получилась очень длинной. Сократите до 80 символов."),
  email: z
    .string()
    .trim()
    .min(1, "Укажите электронную почту — на неё мы отправляем доступ и уведомления.")
    .email(
      "Похоже, в адресе почты ошибка. Должно быть так: что-то@домен.ru — проверьте буквы, символ «собака» @ и точку в домене.",
    ),
  password: z
    .string()
    .min(
      8,
      "Пароль слишком короткий — нужно минимум 8 символов. Добавьте буквы или цифры.",
    )
    .max(128, "Пароль слишком длинный. Используйте не больше 128 символов."),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const buildRegisteredFullName = (firstName: string, lastName: string) =>
  `${firstName.trim()} ${lastName.trim()}`.trim();

/** Собирает понятный текст из ошибок Zod (на случай нескольких полей сразу). */
export const formatRegisterSchemaIssues = (issues: z.core.$ZodIssue[]) => {
  if (issues.length === 0) return "Проверьте поля формы и попробуйте ещё раз.";
  if (issues.length === 1) return issues[0].message;
  return issues.map((i) => i.message).join(" ");
};
