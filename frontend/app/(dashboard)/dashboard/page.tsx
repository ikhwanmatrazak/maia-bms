"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Chip } from "@heroui/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { reportsApi, invoicesApi, remindersApi } from "@/lib/api";
import { formatCurrency, formatDate, statusColor } from "@/lib/utils";
import { Invoice, Reminder } from "@/types";
import { Topbar } from "@/components/ui/Topbar";

function KpiCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    default: "bg-white",
    success: "bg-green-50",
    danger: "bg-red-50",
    warning: "bg-yellow-50",
  };
  return (
    <Card className={`${colors[color] ?? "bg-white"} shadow-sm`}>
      <CardBody className="p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
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
    (sum: number, inv: { balance_due: number }) => sum + inv.balance_due,
    0
  );

  return (
    <div>
      <Topbar title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Revenue (This Month)"
            value={formatCurrency(
              chartData[chartData.length - 1]?.total ?? 0
            )}
          />
          <KpiCard
            label="Outstanding Invoices"
            value={formatCurrency(totalOverdue)}
            color="warning"
          />
          <KpiCard
            label="Overdue Invoices"
            value={String(overdueInvoices.length)}
            sub="Require immediate attention"
            color="danger"
          />
          <KpiCard
            label="Upcoming Reminders"
            value={String(reminders.length)}
          />
        </div>

        {/* Revenue Chart */}
        <Card className="shadow-sm">
          <CardHeader>
            <h3 className="font-semibold">Revenue — Last 6 Months</h3>
          </CardHeader>
          <CardBody>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                  />
                  <Bar dataKey="total" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                No revenue data yet
              </div>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Overdue Invoices */}
          <Card className="shadow-sm">
            <CardHeader>
              <h3 className="font-semibold text-danger">Overdue Invoices</h3>
            </CardHeader>
            <CardBody>
              {overdueInvoices.length === 0 ? (
                <p className="text-gray-400 text-sm">No overdue invoices</p>
              ) : (
                <div className="space-y-3">
                  {overdueInvoices.slice(0, 5).map((inv: { invoice_id: number; invoice_number: string; client: string; days_overdue: number; balance_due: number }) => (
                    <div
                      key={inv.invoice_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="text-gray-500 ml-2">{inv.client}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-danger">
                          {formatCurrency(inv.balance_due)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {inv.days_overdue}d overdue
                        </div>
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
              <h3 className="font-semibold">Upcoming Reminders</h3>
            </CardHeader>
            <CardBody>
              {reminders.length === 0 ? (
                <p className="text-gray-400 text-sm">No upcoming reminders</p>
              ) : (
                <div className="space-y-3">
                  {reminders.slice(0, 5).map((r: Reminder) => (
                    <div key={r.id} className="flex items-start gap-3 text-sm">
                      <Chip
                        size="sm"
                        color={
                          r.priority === "high"
                            ? "danger"
                            : r.priority === "medium"
                            ? "warning"
                            : "default"
                        }
                        variant="flat"
                      >
                        {r.priority}
                      </Chip>
                      <div>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-gray-400 text-xs">
                          Due {formatDate(r.due_date)}
                        </div>
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
