"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { isAuthenticated } from "@/lib/auth";

interface SidebarContextValue {
  toggle: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({ toggle: () => {} });

export function useSidebarToggle() {
  return useContext(SidebarContext).toggle;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <SidebarContext.Provider value={{ toggle: () => setSidebarOpen((o) => !o) }}>
      <div className="flex h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
