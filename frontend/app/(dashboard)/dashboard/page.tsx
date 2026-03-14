"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Chip } from "@heroui/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  reportsApi, invoicesApi, remindersApi, quotationsApi, receiptsApi, prospectsApi,
} from "@/lib/api";
import { formatCurrency, formatDate, statusColor } from "@/lib/utils";
import { Invoice, Reminder } from "@/types";
import { Topbar } from "@/components/ui/Topbar";
import { getUser } from "@/lib/auth";
import { FileText, Receipt, TrendingUp, Users, DollarSign, AlertCircle } from "lucide-react";

// ─── shared KPI card ──────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon, color = "default",
}: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string;
}) {
  const bg: Record<string, string> = {
    default: "bg-white", success: "bg-green-50", danger: "bg-red-50", warning: "bg-yellow-50", primary: "bg-blue-50",
  };
  return (
    <Card className={`${bg[color] ?? "bg-white"} shadow-sm`}>
      <CardBody className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {icon && <div className="text-gray-300 ml-3 shrink-0">{icon}</div>}
        </div>
      </CardBody>
    </Card>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-MY", { month: "short", year: "2-digit" });
}

// ─── SALES DASHBOARD (staff role) ────────────────────────────────────────────
function SalesDashboard({ userName }: { userName: string }) {
  const [month, setMonth] = useState(currentMonth());
  const last6 = getLastNMonths(6);

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["quotations", "list", month],
    queryFn: () => quotationsApi.list({ month, limit: 200 }),
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["invoices", "list", month],
    queryFn: () => invoicesApi.list({ month, limit: 200 }),
  });

  const { data: receipts = [] } = useQuery<any[]>({
    queryKey: ["receipts", "list", month],
    queryFn: () => receiptsApi.list({ month, limit: 200 }),
  });

  const { data: prospects = [] } = useQuery<any[]>({
    queryKey: ["prospects"],
    queryFn: () => prospectsApi.list(),
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["reminders", "upcoming"],
    queryFn: () => remindersApi.list({ filter: "upcoming" }),
  });

  // 6-month trend using invoice summaries
  const trendQueries = useQueries({
    queries: last6.map((m) => ({
      queryKey: ["invoices", "summary", m],
      queryFn: () => invoicesApi.summary(m),
    })),
  });

  // ── computed KPIs ─────────────────────────────────────────────────────────
  const qtTotal = quotations.length;
  const qtValue = quotations.reduce((s: number, q: any) => s + (q.total ?? 0), 0);
  const qtAccepted = quotations.filter((q: any) => q.status === "accepted").length;
  const qtConvRate = qtTotal > 0 ? Math.round((qtAccepted / qtTotal) * 100) : 0;

  const invTotal = invoices.length;
  const invBilled = invoices.reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const invPaid = invoices.reduce((s: number, i: any) => s + (i.amount_paid ?? 0), 0);
  const invOutstanding = invoices.reduce((s: number, i: any) => s + (i.balance_due ?? 0), 0);
  const invOverdue = invoices.filter((i: any) => i.status === "overdue").length;

  const recTotal = receipts.length;
  const recAmount = receipts.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  const activeProspects = prospects.filter(
    (p: any) => !p.is_converted && !["won", "lost"].includes(p.stage)
  ).length;
  const pipelineValue = prospects
    .filter((p: any) => !p.is_converted && !["won", "lost"].includes(p.stage))
    .reduce((s: number, p: any) => s + (p.expected_value ?? 0), 0);

  // 6-month chart data
  const trendData = last6.map((m, i) => ({
    period: monthLabel(m),
    billed: trendQueries[i].data?.total_billed ?? 0,
    paid: trendQueries[i].data?.total_paid ?? 0,
  }));

  // recent invoices (unpaid first)
  const recentInvoices = [...invoices]
    .sort((a: any, b: any) => (b.balance_due ?? 0) - (a.balance_due ?? 0))
    .slice(0, 6);

  return (
    <div>
      <Topbar title="My Dashboard" />
      <div className="p-4 sm:p-6 space-y-5">

        {/* Header + Month picker */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Welcome back, {userName.split(" ")[0]}</h2>
            <p className="text-sm text-gray-400">Your sales performance overview</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* KPI — Quotations */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText size={12} /> Quotations
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Sent" value={String(qtTotal)} sub={formatCurrency(qtValue)} />
            <KpiCard label="Accepted" value={String(qtAccepted)} color="success" sub={`${qtConvRate}% conversion`} />
            <KpiCard label="Pending" value={String(quotations.filter((q: any) => q.status === "sent").length)} color="warning" />
            <KpiCard label="Rejected / Expired" value={String(quotations.filter((q: any) => ["rejected", "expired"].includes(q.status)).length)} color="danger" />
          </div>
        </div>

        {/* KPI — Invoices */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <DollarSign size={12} /> Invoices
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Invoiced" value={String(invTotal)} sub={formatCurrency(invBilled)} />
            <KpiCard label="Collected" value={formatCurrency(invPaid)} color="success" sub={`${invTotal > 0 ? Math.round((invPaid / invBilled) * 100) : 0}% of billed`} />
            <KpiCard label="Outstanding" value={formatCurrency(invOutstanding)} color="warning" />
            <KpiCard label="Overdue" value={String(invOverdue)} color="danger" sub="Needs follow-up" />
          </div>
        </div>

        {/* KPI — Receipts & Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Receipt size={12} /> Receipts
            </p>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Receipts Issued" value={String(recTotal)} />
              <KpiCard label="Total Collected" value={formatCurrency(recAmount)} color="success" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users size={12} /> Pipeline
            </p>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Active Prospects" value={String(activeProspects)} color="primary" />
              <KpiCard label="Pipeline Value" value={formatCurrency(pipelineValue)} color="primary" />
            </div>
          </div>
        </div>

        {/* Trend chart */}
        <Card className="shadow-sm">
          <CardHeader className="pb-0">
            <h3 className="font-semibold text-sm">Invoice Trend — Last 6 Months</h3>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `RM ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n === "billed" ? "Billed" : "Collected"]} />
                <Bar dataKey="billed" fill="#1a1a2e" radius={[3, 3, 0, 0]} name="billed" />
                <Bar dataKey="paid" fill="#22c55e" radius={[3, 3, 0, 0]} name="paid" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-[#1a1a2e] inline-block" /> Billed</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Collected</span>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recent Invoices */}
          <Card className="shadow-sm">
            <CardHeader>
              <h3 className="font-semibold text-sm">Invoices This Month</h3>
            </CardHeader>
            <CardBody className="p-0">
              {recentInvoices.length === 0 ? (
                <p className="text-gray-400 text-sm px-5 pb-4">No invoices this month</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentInvoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-800">{inv.invoice_number}</p>
                        <p className="text-xs text-gray-400">{inv.client?.company_name ?? "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${inv.balance_due > 0 ? "text-warning-600" : "text-gray-800"}`}>
                          {formatCurrency(inv.total)}
                        </p>
                        <Chip size="sm" variant="flat" color={statusColor(inv.status) as any} className="text-[10px] h-4 mt-0.5">
                          {inv.status}
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Upcoming Reminders */}
          <Card className="shadow-sm">
            <CardHeader>
              <h3 className="font-semibold text-sm">Upcoming Reminders</h3>
            </CardHeader>
            <CardBody>
              {reminders.length === 0 ? (
                <p className="text-gray-400 text-sm">No upcoming reminders</p>
              ) : (
                <div className="space-y-3">
                  {reminders.slice(0, 6).map((r: Reminder) => (
                    <div key={r.id} className="flex items-start gap-3 text-sm">
                      <Chip size="sm" color={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "default"} variant="flat">
                        {r.priority}
                      </Chip>
                      <div>
                        <p className="font-medium text-gray-800">{r.title}</p>
                        <p className="text-xs text-gray-400">Due {formatDate(r.due_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── COMPANY DASHBOARD (admin / manager) ─────────────────────────────────────
function CompanyDashboard() {
  const { data: revenueData } = useQuery({
    queryKey: ["reports", "revenue", "month"],
    queryFn: () => reportsApi.revenue({ group_by: "month" }),
  });

  const { data: overdueData } = useQuery({
    queryKey: ["reports", "overdue"],
    queryFn: reportsApi.overdue,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices", "recent"],
    queryFn: () => invoicesApi.list({ limit: 5 }),
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["reminders", "upcoming"],
    queryFn: () => remindersApi.list({ filter: "upcoming" }),
  });

  const chartData = revenueData?.data ?? [];
  const overdueInvoices = overdueData?.invoices ?? [];
  const totalOverdue = overdueInvoices.reduce(
    (sum: number, inv: { balance_due: number }) => sum + inv.balance_due, 0
  );

  return (
    <div>
      <Topbar title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Revenue (This Month)" value={formatCurrency(chartData[chartData.length - 1]?.total ?? 0)} />
          <KpiCard label="Outstanding Invoices" value={formatCurrency(totalOverdue)} color="warning" />
          <KpiCard label="Overdue Invoices" value={String(overdueInvoices.length)} sub="Require immediate attention" color="danger" />
          <KpiCard label="Upcoming Reminders" value={String(reminders.length)} />
        </div>

        <Card className="shadow-sm">
          <CardHeader><h3 className="font-semibold">Revenue — Last 6 Months</h3></CardHeader>
          <CardBody>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} />
                  <Bar dataKey="total" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">No revenue data yet</div>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader><h3 className="font-semibold text-danger">Overdue Invoices</h3></CardHeader>
            <CardBody>
              {overdueInvoices.length === 0 ? (
                <p className="text-gray-400 text-sm">No overdue invoices</p>
              ) : (
                <div className="space-y-3">
                  {overdueInvoices.slice(0, 5).map((inv: any) => (
                    <div key={inv.invoice_id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="text-gray-500 ml-2">{inv.client}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-danger">{formatCurrency(inv.balance_due)}</div>
                        <div className="text-xs text-gray-400">{inv.days_overdue}d overdue</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="shadow-sm">
            <CardHeader><h3 className="font-semibold">Upcoming Reminders</h3></CardHeader>
            <CardBody>
              {reminders.length === 0 ? (
                <p className="text-gray-400 text-sm">No upcoming reminders</p>
              ) : (
                <div className="space-y-3">
                  {reminders.slice(0, 5).map((r: Reminder) => (
                    <div key={r.id} className="flex items-start gap-3 text-sm">
                      <Chip size="sm" color={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "default"} variant="flat">
                        {r.priority}
                      </Chip>
                      <div>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-gray-400 text-xs">Due {formatDate(r.due_date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT — picks which dashboard to show ────────────────────────────────────
export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState("User");

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? "staff");
    setUserName(u?.name ?? "User");
  }, []);

  if (role === null) return null;

  return role === "staff"
    ? <SalesDashboard userName={userName} />
    : <CompanyDashboard />;
}
