"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { getUser, clearAuth, getRefreshToken } from "@/lib/auth";
import { authApi } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/clients", label: "Clients", icon: "👥" },
  { href: "/quotations", label: "Quotations", icon: "📋" },
  { href: "/invoices", label: "Invoices", icon: "🧾" },
  { href: "/receipts", label: "Receipts", icon: "🧾" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/expenses", label: "Expenses", icon: "💰" },
  { href: "/reminders", label: "Reminders", icon: "🔔" },
  { href: "/reports", label: "Reports", icon: "📈" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore
      }
    }
    clearAuth();
    router.push("/login");
  };

  return (
    <aside className="w-64 min-h-screen bg-[#1a1a2e] text-white flex flex-col">
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-wide">MAIA BMS</h1>
        {user && (
          <p className="text-xs text-white/50 mt-0.5 capitalize">
            {user.name} · {user.role}
          </p>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-white/50 hover:text-white px-2 py-2 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
