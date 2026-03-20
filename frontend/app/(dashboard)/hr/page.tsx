"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import Link from "next/link";
import {
  Users, CalendarCheck, Clock, TrendingUp, FileText, ClipboardList,
} from "lucide-react";

export default function HRDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["hr-stats"],
    queryFn: hrApi.getStats,
  });

  const cards = [
    {
      title: "Total Employees",
      value: stats?.total_employees ?? "—",
      sub: `${stats?.active_employees ?? 0} active`,
      icon: <Users size={20} />,
      color: "bg-blue-50 text-blue-600",
      href: "/hr/employees",
    },
    {
      title: "On Leave Today",
      value: stats?.on_leave_today ?? "—",
      sub: "Currently on approved leave",
      icon: <CalendarCheck size={20} />,
      color: "bg-orange-50 text-orange-600",
      href: "/hr/leave",
    },
    {
      title: "Pending Leave Approvals",
      value: stats?.pending_leave_approvals ?? "—",
      sub: "Awaiting your action",
      icon: <Clock size={20} />,
      color: "bg-yellow-50 text-yellow-600",
      href: "/hr/leave",
    },
    {
      title: "Pending Claims",
      value: stats?.pending_claims ?? "—",
      sub: "Awaiting approval",
      icon: <FileText size={20} />,
      color: "bg-purple-50 text-purple-600",
      href: "/hr/claims",
    },
  ];

  const quickLinks = [
    { href: "/hr/employees/new", label: "Add Employee", icon: <Users size={16} /> },
    { href: "/hr/leave", label: "Manage Leave", icon: <CalendarCheck size={16} /> },
    { href: "/hr/attendance", label: "Attendance", icon: <Clock size={16} /> },
    { href: "/hr/payroll", label: "Run Payroll", icon: <TrendingUp size={16} /> },
    { href: "/hr/claims", label: "Claims", icon: <FileText size={16} /> },
    { href: "/hr/performance", label: "Performance", icon: <ClipboardList size={16} /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Human Resources</h1>
        <p className="text-sm text-gray-500 mt-1">Manage employees, leave, payroll, and more</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.title} href={c.href} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{c.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
              </div>
              <div className={`p-2 rounded-lg ${c.color}`}>{c.icon}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors text-center"
            >
              <span className="text-gray-500">{l.icon}</span>
              <span className="text-xs font-medium text-gray-700">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Module overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">HR Modules</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              ["Employees", "/hr/employees", "Employee directory, profiles, documents"],
              ["Leave Management", "/hr/leave", "Applications, approvals, balances"],
              ["Attendance", "/hr/attendance", "Daily records, overtime tracking"],
              ["Payroll", "/hr/payroll", "Monthly runs, EPF/SOCSO/EIS/PCB"],
              ["Claims", "/hr/claims", "Expense & travel claim submissions"],
              ["Performance", "/hr/performance", "KPI tracking, reviews"],
            ].map(([label, href, desc]) => (
              <li key={href}>
                <Link href={href} className="flex justify-between items-center hover:text-blue-600 group">
                  <div>
                    <span className="font-medium">{label}</span>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <span className="text-gray-300 group-hover:text-blue-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Malaysian Statutory (Payroll)</h2>
          <ul className="space-y-3 text-sm">
            {[
              ["EPF (KWSP)", "Employee 11% · Employer 13%", "bg-blue-50 text-blue-700"],
              ["SOCSO (PERKESO)", "Employee 0.5% · Employer 1.75%", "bg-green-50 text-green-700"],
              ["EIS (SIP)", "Employee 0.2% · Employer 0.2%", "bg-yellow-50 text-yellow-700"],
              ["PCB (Income Tax)", "Progressive brackets per LHDN", "bg-red-50 text-red-700"],
            ].map(([label, detail, color]) => (
              <li key={label} className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                <span className="text-gray-500 text-xs">{detail}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-4">
            Capped: EPF on full salary · SOCSO RM5,000 · EIS RM4,000 insurable wage
          </p>
        </div>
      </div>
    </div>
  );
}
