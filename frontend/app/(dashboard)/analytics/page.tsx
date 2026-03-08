"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { analyticsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { TrendingUp, TrendingDown, Users, CreditCard, AlertCircle, DollarSign, Activity } from "lucide-react";

function formatCurrency(val: number) {
  return "RM " + val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShort(val: number) {
  if (val >= 1_000_000) return "RM " + (val / 1_000_000).toFixed(1) + "M";
  if (val >= 1_000) return "RM " + (val / 1_000).toFixed(1) + "K";
  return "RM " + val.toFixed(0);
}

function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={15} />
        </div>
        <p className="text-xs text-gray-500 font-medium leading-tight">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          {trend === "up" && <TrendingUp size={11} className="text-success" />}
          {trend === "down" && <TrendingDown size={11} className="text-danger" />}
          {sub}
        </p>
      )}
    </div>
  );
}

const CYCLE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annual",
  one_time: "One-Time",
};

const CYCLE_COLOR: Record<string, string> = {
  monthly: "bg-primary/10 text-primary",
  quarterly: "bg-warning/10 text-warning",
  annually: "bg-success/10 text-success",
  one_time: "bg-gray-100 text-gray-500",
};

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: analyticsApi.summary,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div>
        <Topbar title="Analytics" />
        <div className="p-6 flex items-center justify-center h-64 text-gray-400 text-sm">
          Loading analytics...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Topbar title="Analytics" />
        <div className="p-6 flex items-center justify-center h-64 text-danger text-sm">
          Failed to load analytics. {(error as any)?.response?.data?.detail || (error as any)?.message || ""}
        </div>
      </div>
    );
  }

  const revenueChange = data.revenue_last_month > 0
    ? ((data.revenue_this_month - data.revenue_last_month) / data.revenue_last_month) * 100
    : null;

  return (
    <div>
      <Topbar title="Analytics" />
      <div className="p-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="MRR"
            value={formatShort(data.mrr)}
            sub="Monthly Recurring Revenue"
            icon={TrendingUp}
            color="bg-primary/10 text-primary"
          />
          <KpiCard
            label="ARR"
            value={formatShort(data.arr)}
            sub="Annual Recurring Revenue"
            icon={TrendingUp}
            color="bg-secondary/10 text-secondary"
          />
          <KpiCard
            label="Active Subscriptions"
            value={String(data.active_subscriptions)}
            sub="Currently active"
            icon={CreditCard}
            color="bg-warning/10 text-warning"
          />
          <KpiCard
            label="Active Clients"
            value={String(data.active_clients)}
            sub="Total active"
            icon={Users}
            color="bg-cyan-100 text-cyan-600"
          />
        </div>

        {/* EBITDA / P&L Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Revenue This Month"
            value={formatCurrency(data.revenue_this_month)}
            sub={revenueChange !== null ? `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}% vs last month` : "vs last month: —"}
            trend={revenueChange !== null ? (revenueChange >= 0 ? "up" : "down") : null}
            icon={DollarSign}
            color="bg-success/10 text-success"
          />
          <KpiCard
            label="Expenses This Month"
            value={formatCurrency(data.expenses_this_month)}
            sub="Total operating expenses"
            icon={TrendingDown}
            color="bg-danger/10 text-danger"
          />
          <KpiCard
            label="EBITDA This Month"
            value={formatCurrency(data.ebitda_this_month)}
            sub={`${data.ebitda_margin >= 0 ? "+" : ""}${data.ebitda_margin.toFixed(1)}% margin`}
            trend={data.ebitda_this_month >= 0 ? "up" : "down"}
            icon={Activity}
            color={data.ebitda_this_month >= 0 ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger"}
          />
          <KpiCard
            label="Overdue"
            value={formatShort(data.overdue_total)}
            sub={`${data.overdue_count} invoice${data.overdue_count !== 1 ? "s" : ""} overdue`}
            trend={data.overdue_count > 0 ? "down" : null}
            icon={AlertCircle}
            color={data.overdue_count > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}
          />
        </div>

        {/* Revenue & Expenses Trend */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Revenue vs Expenses</h3>
              <p className="text-xs text-gray-400 mt-0.5">Last 12 months</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRevenue)" />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#colorExpenses)" />
              <Area type="monotone" dataKey="profit" name="Profit" stroke="#22c55e" strokeWidth={2} fill="none" strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* MRR Trend */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">MRR Trend</h3>
            <p className="text-xs text-gray-400 mb-4">Last 6 months (based on current subscriptions)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.mrr_trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="mrr" name="MRR" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Subscription Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Subscription Breakdown</h3>
            <p className="text-xs text-gray-400 mb-4">Active subscriptions by billing cycle</p>
            {Object.keys(data.subscriptions_by_cycle).length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                No active subscriptions
              </div>
            ) : (
              <div className="space-y-3 mt-2">
                {Object.entries(data.subscriptions_by_cycle).map(([cycle, info]: [string, any]) => (
                  <div key={cycle} className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-24 text-center shrink-0 ${CYCLE_COLOR[cycle] ?? "bg-gray-100 text-gray-500"}`}>
                      {CYCLE_LABEL[cycle] ?? cycle}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">{info.count} subscription{info.count !== 1 ? "s" : ""}</span>
                        <span className="font-semibold text-gray-800">{formatCurrency(info.mrr)}/mo</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min((info.mrr / (data.mrr || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-medium">Total MRR</span>
                  <span className="font-bold text-gray-900">{formatCurrency(data.mrr)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-medium">Projected ARR</span>
                  <span className="font-bold text-primary">{formatCurrency(data.arr)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Outstanding Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Receivables Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Outstanding</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(data.outstanding_total)}</p>
              <p className="text-xs text-gray-400 mt-1">Across all unpaid invoices</p>
            </div>
            <div className={`rounded-xl p-4 ${data.overdue_count > 0 ? "bg-danger-50" : "bg-success-50"}`}>
              <p className="text-xs uppercase tracking-wide font-medium text-gray-500">Overdue</p>
              <p className={`text-2xl font-bold mt-1 ${data.overdue_count > 0 ? "text-danger" : "text-success"}`}>
                {formatCurrency(data.overdue_total)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{data.overdue_count} overdue invoice{data.overdue_count !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
