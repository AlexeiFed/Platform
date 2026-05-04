"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false} refetchInterval={0}>
      {children}
    </NextAuthSessionProvider>
  );
}
