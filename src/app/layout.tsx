// Корневой layout приложения. Подключает глобальные шрифты (Manrope для UI/заголовков,
// Inter для длинного текста), тему, провайдеры сессии и регистрацию service worker.
import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { SessionProvider } from "@/components/shared/session-provider";
import { SwRegister } from "@/components/shared/sw-register";

// Manrope — основной UI-шрифт: навигация, кнопки, заголовки. Отличная читаемость кириллицы.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "600", "700"],
});

// Inter — для длинных текстовых блоков (правила, описания уроков, markdown).
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-prose",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "LearnHub — Платформа обучения",
  description: "Курсы и марафоны для вашего развития",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${manrope.variable} ${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <SwRegister />
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
