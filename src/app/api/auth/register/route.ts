import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  buildRegisteredFullName,
  formatRegisterSchemaIssues,
  registerUserSchema,
} from "@/lib/validations/register-user";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerUserSchema.safeParse(body);
    if (!parsed.success) {
      const msg = formatRegisterSchemaIssues(parsed.error.issues);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json(
        {
          error:
            "Этот email уже зарегистрирован. Нажмите «Войти» под формой и войдите в аккаунт — или укажите другую почту.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const name = buildRegisteredFullName(data.firstName, data.lastName);

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        error:
          "Сейчас регистрация не удалась на нашей стороне. Подождите минуту и попробуйте снова — или напишите нам в поддержку.",
      },
      { status: 500 },
    );
  }
}
