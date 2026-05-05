"use client";

import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";
import { HeaderSlotProvider } from "@/lib/header-slot";
import { useState } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <HeaderSlotProvider>
    <div className="flex min-h-screen">
      <Sidebar variant="admin" />
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-card overflow-y-auto">
            <Sidebar variant="admin" mobileDrawer onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
    </HeaderSlotProvider>
  );
}
