"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { isAuthenticated, getUser } from "@/lib/auth";

interface SidebarContextValue {
  toggle: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({ toggle: () => {} });

export function useSidebarToggle() {
  return useContext(SidebarContext).toggle;
}

// Routes that require specific roles. First matching prefix wins.
// super_admin always bypasses all checks.
const ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/analytics",    roles: ["admin"] },
  { prefix: "/payments",     roles: ["admin", "manager"] },
  { prefix: "/credit-notes", roles: ["admin", "manager"] },
  { prefix: "/expenses",     roles: ["admin", "manager"] },
  { prefix: "/reports",      roles: ["admin", "manager"] },
  { prefix: "/settings",     roles: ["admin"] },
  { prefix: "/admin",        roles: [] }, // super_admin only — empty = no regular role allowed
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    const user = getUser();
    if (!user) return;
    if (user.is_super_admin) return; // super admin can go anywhere

    const rule = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
    if (rule && !rule.roles.includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

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
