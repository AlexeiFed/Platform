import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const USER_ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        // Фиксируем время последнего успешного входа.
        await prisma.user.update({
          where: { id: user.id },
          data: { lastSignInAt: new Date(), lastActiveAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();

      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.lastActivitySyncAt = now;
        return token;
      }

      const userId = typeof token.id === "string" ? token.id : null;
      if (!userId) return token;

      const lastSync = typeof token.lastActivitySyncAt === "number" ? token.lastActivitySyncAt : 0;
      if (now - lastSync < USER_ACTIVITY_UPDATE_INTERVAL_MS) return token;

      // Middleware/Auth может выполняться в Edge runtime, там Prisma недоступна.
      if (process.env.NEXT_RUNTIME === "edge") {
        token.lastActivitySyncAt = now;
        return token;
      }

      try {
        await prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: new Date(now) },
        });
        token.lastActivitySyncAt = now;
      } catch (error) {
        console.error("[auth.jwt.lastActiveAt]", error);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
