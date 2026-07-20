"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUser } from "@/lib/auth";
import { X, ChevronDown } from "lucide-react";

// roles: which roles can see this item. undefined = all roles.
// permission: key used in user.permissions array to grant access. undefined = no permission gate.
const navGroups = [
  {
    label: "Overview",
    roles: ["admin", "manager"],
    permission: "dashboard",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
    items: [
      { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager"], permission: "dashboard" },
      { href: "/analytics", label: "Analytics", roles: ["admin"], permission: "analytics" },
    ],
  },
  {
    label: "CRM",
    roles: ["admin", "manager"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    items: [
      { href: "/clients", label: "Clients", permission: "clients" },
      { href: "/pipeline", label: "Pipeline", permission: "pipeline" },
    ],
  },
  {
    label: "Sales",
    roles: ["admin", "manager"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    items: [
      { href: "/quotations", label: "Quotations", permission: "quotations" },
      { href: "/invoices", label: "Invoices", permission: "invoices" },
      { href: "/receipts", label: "Receipts", permission: "receipts" },
    ],
  },
  {
    label: "Procurement",
    roles: ["admin", "manager"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
    items: [
      { href: "/products", label: "Products", permission: "products" },
      { href: "/purchase-orders", label: "Purchase Orders", permission: "purchase-orders" },
      { href: "/vendors", label: "Vendors", permission: "vendors" },
      { href: "/delivery-orders", label: "Delivery Orders", permission: "delivery-orders" },
    ],
  },
  {
    label: "Finance",
    roles: ["admin", "manager"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    items: [
      { href: "/payments", label: "Payments", permission: "payments" },
      { href: "/credit-notes", label: "Credit Notes", permission: "credit-notes" },
      { href: "/expenses", label: "Expenses", permission: "expenses" },
      { href: "/bills", label: "Bills (Payable)", permission: "bills" },
      { href: "/finance/bank", label: "Bank / Cash Flow", roles: ["admin"], permission: "finance-bank" },
      { href: "/finance/pnl", label: "P&L Statement", roles: ["admin"], permission: "finance-bank" },
      { href: "/reports", label: "Reports", permission: "reports" },
    ],
  },
  {
    label: "Projects",
    roles: ["admin", "manager"],
    permission: "projects",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />
      </svg>
    ),
    items: [
      { href: "/projects/dashboard", label: "Dashboard", roles: ["admin", "manager"], permission: "projects" },
      { href: "/projects", label: "All Projects", roles: ["admin", "manager"], permission: "projects" },
    ],
  },
  {
    label: "Calendar",
    roles: ["admin", "manager", "staff"],
    permission: "calendar",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
    items: [
      { href: "/calendar", label: "Shared Calendar", permission: "calendar" },
    ],
  },
  {
    label: "HR",
    roles: ["admin", "manager"],
    permission: "hr",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    items: [
      { href: "/hr", label: "HR Overview", roles: ["admin", "manager"], permission: "hr" },
      { href: "/hr/employees", label: "Employees", roles: ["admin", "manager"], permission: "hr-employees" },
      { href: "/hr/departments", label: "Departments", roles: ["admin", "manager"], permission: "hr-departments" },
      { href: "/hr/leave", label: "Leave", roles: ["admin", "manager"], permission: "hr-leave" },
      { href: "/hr/attendance", label: "Attendance", roles: ["admin", "manager"], permission: "hr-attendance" },
      { href: "/hr/payroll", label: "Payroll", roles: ["admin", "manager"], permission: "hr-payroll" },
      { href: "/hr/performance", label: "Performance", roles: ["admin", "manager"], permission: "hr-performance" },
      { href: "/hr/claims", label: "Claims", roles: ["admin", "manager"], permission: "hr-claims" },
    ],
  },
  {
    label: "General",
    roles: ["admin", "manager"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    items: [
      { href: "/my-profile", label: "My Profile", roles: ["admin", "manager"] },
      { href: "/my-card", label: "My Card", roles: ["admin", "manager"] },
      { href: "/my-claims", label: "My Claims", roles: ["admin", "manager"] },
      { href: "/reminders", label: "Reminders", roles: ["admin", "manager"], permission: "reminders" },
      { href: "/settings", label: "Settings", roles: ["admin"] },
      { href: "/settings/bugs", label: "Bug Reports", roles: ["admin"] },
    ],
  },
  {
    label: "My Workspace",
    roles: ["staff"],
    permission: undefined,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    items: [
      { href: "/staff-dashboard", label: "Dashboard", roles: ["staff"] },
      { href: "/my-profile", label: "My Profile", roles: ["staff"] },
      { href: "/my-card", label: "My Card", roles: ["staff"] },
      { href: "/my-claims", label: "My Claims", roles: ["staff"] },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const role: string = user?.role ?? "staff";
  const isSuperAdmin: boolean = user?.is_super_admin ?? false;
  const userPerms: string[] | null = user?.permissions ?? null;

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    if (isSuperAdmin || role === "admin") return true;
    if (!userPerms) return true; // no restriction set — allow by role only
    return userPerms.includes(perm);
  };

  // Filter groups and items based on role and permissions
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.roles || isSuperAdmin || item.roles.includes(role)) &&
          hasPermission((item as any).permission)
      ),
    }))
    .filter(
      (group) =>
        group.items.length > 0 &&
        (!group.roles || isSuperAdmin || group.roles.includes(role)) &&
        hasPermission((group as any).permission)
    );

  // Determine which group is active based on current path
  const getActiveGroup = () => {
    for (const group of visibleGroups) {
      for (const item of group.items) {
        if (pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))) {
          return group.label;
        }
      }
    }
    return "Overview";
  };

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set([getActiveGroup()]));

  // Auto-open group when navigating
  useEffect(() => {
    const active = getActiveGroup();
    setOpenGroups(prev => new Set([...prev, active]));
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const navContent = (
    <>
      <div className="px-4 h-14 border-b border-white/10 flex items-center justify-between shrink-0">
        <p className="text-sm font-semibold tracking-wide text-white">Ali Axis</p>
        <button
          onClick={onClose}
          className="lg:hidden p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {visibleGroups.map((group) => {
          const isGroupOpen = openGroups.has(group.label);
          const isGroupActive = group.items.some(
            item => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
          );

          return (
            <div key={group.label}>
              {/* Group header — clickable */}
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isGroupActive && !isGroupOpen
                    ? "text-white font-medium"
                    : "text-white/65 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className={isGroupActive ? "text-white" : "text-white/50"}>{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  size={14}
                  className={`text-white/30 transition-transform duration-200 ${isGroupOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Sub-items */}
              {isGroupOpen && (
                <div className="border-l border-white/10 ml-9 mb-1">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? "text-white font-medium bg-white/10"
                            : "text-white/55 hover:text-white hover:bg-white/8"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {user?.is_super_admin && (
          <div className="mt-1 border-t border-white/10 pt-1">
            <Link
              href="/admin"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-purple-600/40 text-white font-medium"
                  : "text-purple-300/70 hover:text-purple-200 hover:bg-purple-600/20"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
              </svg>
              Super Admin
            </Link>
          </div>
        )}
      </nav>
    </>
  );

  return (
    <>
      <aside className="hidden lg:flex w-60 h-screen sticky top-0 bg-[#1a1a2e] text-white flex-col shrink-0">
        {navContent}
      </aside>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-[#1a1a2e] text-white flex flex-col z-50 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </aside>
    </>
  );
}
