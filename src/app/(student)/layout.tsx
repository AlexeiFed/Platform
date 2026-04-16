"use client";

import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";
import { CourseNavProvider } from "@/components/shared/course-nav-context";
import { useState } from "react";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <CourseNavProvider>
      <div className="flex min-h-screen">
        <Sidebar variant="student" />
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed left-0 top-0 z-50 flex h-full min-h-0 w-64 flex-col overflow-hidden bg-card">
              <Sidebar variant="student" mobileDrawer onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </CourseNavProvider>
  );
}
