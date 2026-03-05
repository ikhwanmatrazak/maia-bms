"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Select, SelectItem, Chip } from "@heroui/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { reportsApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"revenue" | "overdue" | "expenses" | "pnl" | "tax">("revenue");
  const [pnlPeriod, setPnlPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");

  const { data: revenueData } = useQuery({
    queryKey: ["reports", "revenue"],
    queryFn: () => reportsApi.revenue({ group_by: "month" }),
    enabled: activeTab === "revenue",
  });

  const { data: overdueData } = useQuery({
    queryKey: ["reports", "overdue"],
    queryFn: reportsApi.overdue,
    enabled: activeTab === "overdue",
  });

  const { data: expensesData } = useQuery({
    queryKey: ["reports", "expenses"],
    queryFn: () => reportsApi.expenses({ group_by: "category" }),
    enabled: activeTab === "expenses",
  });

  const { data: pnlData } = useQuery({
    queryKey: ["reports", "pnl", pnlPeriod],
    queryFn: () => reportsApi.pnl({ period: pnlPeriod }),
    enabled: activeTab === "pnl",
  });

  const { data: taxData } = useQuery({
    queryKey: ["reports", "tax"],
    queryFn: reportsApi.taxSummary,
    enabled: activeTab === "tax",
  });

  const tabs = [
    { key: "revenue", label: "Revenue" },
    { key: "overdue", label: "Overdue" },
    { key: "expenses", label: "Expenses" },
    { key: "pnl", label: "P&L" },
    { key: "tax", label: "Tax Summary" },
  ] as const;

  return (
    <div>
      <Topbar title="Reports" />
      <div className="p-6 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={activeTab === t.key ? "solid" : "flat"}
              color={activeTab === t.key ? "primary" : "default"}
              
              onPress={() => setActiveTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Revenue */}
        {activeTab === "revenue" && (
          <Card className="shadow-sm">
            <CardHeader><h3 className="font-semibold">Revenue by Month</h3></CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueData?.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                  <Bar dataKey="total" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        {/* Overdue */}
        {activeTab === "overdue" && (
          <Card className="shadow-sm">
            <CardHeader>
              <h3 className="font-semibold">Overdue Invoices</h3>
              {overdueData && <Chip size="sm" color="danger" variant="flat" className="ml-2">{overdueData.total_overdue} overdue</Chip>}
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500">
                    <th className="pb-2">Invoice</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Due Date</th>
                    <th className="pb-2">Days Overdue</th>
                    <th className="pb-2">Aging</th>
                    <th className="pb-2 text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {(overdueData?.invoices ?? []).map((inv: { invoice_id: number; invoice_number: string; client: string; due_date: string; days_overdue: number; aging_bucket: string; balance_due: number; currency: string }) => (
                      <tr key={inv.invoice_id} className="border-b">
                        <td className="py-2 font-medium">{inv.invoice_number}</td>
                        <td className="py-2">{inv.client}</td>
                        <td className="py-2">{formatDate(inv.due_date)}</td>
                        <td className="py-2 text-danger">{inv.days_overdue} days</td>
                        <td className="py-2"><Chip size="sm" color="danger" variant="flat">{inv.aging_bucket}</Chip></td>
                        <td className="py-2 text-right font-medium">{formatCurrency(inv.balance_due, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Expenses */}
        {activeTab === "expenses" && (
          <Card className="shadow-sm">
            <CardHeader><h3 className="font-semibold">Expenses by Category</h3></CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={expensesData?.data ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="label" type="category" width={120} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} />
                  <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        {/* P&L */}
        {activeTab === "pnl" && (
          <Card className="shadow-sm">
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold">Profit & Loss</h3>
              <Select
                variant="bordered"
                size="sm"
                className="w-36"
                selectedKeys={[pnlPeriod]}
                onSelectionChange={(k) => setPnlPeriod(Array.from(k)[0] as typeof pnlPeriod)}
              >
                <SelectItem key="monthly">Monthly</SelectItem>
                <SelectItem key="quarterly">Quarterly</SelectItem>
                <SelectItem key="yearly">Yearly</SelectItem>
              </Select>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={pnlData?.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} name="Expenses" />
                  <Line type="monotone" dataKey="profit" stroke="#1a1a2e" strokeWidth={2} strokeDasharray="4 4" name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        {/* Tax Summary */}
        {activeTab === "tax" && (
          <Card className="shadow-sm">
            <CardHeader><h3 className="font-semibold">Tax Summary</h3></CardHeader>
            <CardBody>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500">
                  <th className="pb-2">Tax Rate</th>
                  <th className="pb-2 text-right">Total Collected</th>
                </tr></thead>
                <tbody>
                  {(taxData?.summary ?? []).map((item: { tax_rate: string; total_collected: number }) => (
                    <tr key={item.tax_rate} className="border-b">
                      <td className="py-2">{item.tax_rate}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.total_collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
