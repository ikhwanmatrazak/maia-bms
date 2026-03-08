"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Select, SelectItem, Chip } from "@heroui/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { Download } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

type Tab = "revenue" | "overdue" | "expenses" | "pnl" | "tax" | "invoices" | "payments" | "clients";

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("revenue");
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
  const { data: invoicesData } = useQuery({
    queryKey: ["reports", "invoices"],
    queryFn: () => reportsApi.invoices(),
    enabled: activeTab === "invoices",
  });
  const { data: paymentsData } = useQuery({
    queryKey: ["reports", "payments"],
    queryFn: () => reportsApi.payments(),
    enabled: activeTab === "payments",
  });
  const { data: clientsData } = useQuery({
    queryKey: ["reports", "clients"],
    queryFn: reportsApi.clientSummary,
    enabled: activeTab === "clients",
  });

  const tabs = [
    { key: "revenue", label: "Revenue" },
    { key: "overdue", label: "Overdue" },
    { key: "expenses", label: "Expenses" },
    { key: "pnl", label: "P&L" },
    { key: "tax", label: "Tax Summary" },
    { key: "invoices", label: "Invoice List" },
    { key: "payments", label: "Payment List" },
    { key: "clients", label: "Client Summary" },
  ] as const;

  const handleDownload = () => {
    if (activeTab === "revenue" && revenueData) {
      downloadCSV(
        "revenue-report.csv",
        (revenueData.data ?? []).map((r: { period: string; total: number }) => [r.period, String(r.total)]),
        ["Period", "Revenue (MYR)"]
      );
    } else if (activeTab === "overdue" && overdueData) {
      downloadCSV(
        "overdue-report.csv",
        (overdueData.invoices ?? []).map((r: { invoice_number: string; client: string; due_date: string; days_overdue: number; aging_bucket: string; balance_due: number; currency: string }) => [
          r.invoice_number, r.client, r.due_date, String(r.days_overdue), r.aging_bucket, String(r.balance_due), r.currency,
        ]),
        ["Invoice #", "Client", "Due Date", "Days Overdue", "Aging", "Balance Due", "Currency"]
      );
    } else if (activeTab === "expenses" && expensesData) {
      downloadCSV(
        "expenses-report.csv",
        (expensesData.data ?? []).map((r: { label: string; total: number }) => [r.label, String(r.total)]),
        ["Category", "Amount (MYR)"]
      );
    } else if (activeTab === "pnl" && pnlData) {
      downloadCSV(
        `pnl-${pnlPeriod}-report.csv`,
        (pnlData.data ?? []).map((r: { period: string; revenue: number; expenses: number; profit: number }) => [
          r.period, String(r.revenue), String(r.expenses), String(r.profit),
        ]),
        ["Period", "Revenue (MYR)", "Expenses (MYR)", "Profit (MYR)"]
      );
    } else if (activeTab === "tax" && taxData) {
      downloadCSV(
        "tax-summary-report.csv",
        (taxData.summary ?? []).map((r: { tax_rate: string; total_collected: number }) => [r.tax_rate, String(r.total_collected)]),
        ["Tax Rate", "Total Collected (MYR)"]
      );
    } else if (activeTab === "invoices" && invoicesData) {
      downloadCSV(
        "invoice-list-report.csv",
        (invoicesData.invoices ?? []).map((r: { invoice_number: string; client: string; issue_date: string; due_date: string; status: string; total_amount: number; balance_due: number; currency: string }) => [
          r.invoice_number, r.client, r.issue_date, r.due_date, r.status, String(r.total_amount), String(r.balance_due), r.currency,
        ]),
        ["Invoice #", "Client", "Issue Date", "Due Date", "Status", "Total Amount", "Balance Due", "Currency"]
      );
    } else if (activeTab === "payments" && paymentsData) {
      downloadCSV(
        "payment-list-report.csv",
        (paymentsData.payments ?? []).map((r: { payment_date: string; invoice_number: string; client: string; amount: number; currency: string; payment_method: string; reference_number: string }) => [
          r.payment_date, r.invoice_number, r.client, String(r.amount), r.currency, r.payment_method, r.reference_number,
        ]),
        ["Date", "Invoice #", "Client", "Amount", "Currency", "Method", "Reference"]
      );
    } else if (activeTab === "clients" && clientsData) {
      downloadCSV(
        "client-summary-report.csv",
        (clientsData.clients ?? []).map((r: { client: string; status: string; total_invoices: number; total_invoiced: number; total_paid: number; total_outstanding: number }) => [
          r.client, r.status, String(r.total_invoices), String(r.total_invoiced), String(r.total_paid), String(r.total_outstanding),
        ]),
        ["Client", "Status", "Total Invoices", "Total Invoiced (MYR)", "Total Paid (MYR)", "Outstanding (MYR)"]
      );
    }
  };

  return (
    <div>
      <Topbar title="Reports" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
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
          <Button
            size="sm"
            variant="flat"
            color="default"
            startContent={<Download size={14} />}
            onPress={handleDownload}
          >
            Download CSV
          </Button>
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
            <CardHeader className="flex items-center gap-2">
              <h3 className="font-semibold">Overdue Invoices</h3>
              {overdueData && <Chip size="sm" color="danger" variant="flat">{overdueData.total_overdue} overdue</Chip>}
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

        {/* Invoice List */}
        {activeTab === "invoices" && (
          <Card className="shadow-sm">
            <CardHeader className="flex items-center gap-2">
              <h3 className="font-semibold">Invoice List</h3>
              {invoicesData && <Chip size="sm" variant="flat">{invoicesData.count} invoices</Chip>}
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500">
                    <th className="pb-2">Invoice #</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Issue Date</th>
                    <th className="pb-2">Due Date</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">Balance Due</th>
                  </tr></thead>
                  <tbody>
                    {(invoicesData?.invoices ?? []).map((inv: { invoice_number: string; client: string; issue_date: string; due_date: string; status: string; total_amount: number; balance_due: number; currency: string }) => (
                      <tr key={inv.invoice_number} className="border-b">
                        <td className="py-2 font-medium">{inv.invoice_number}</td>
                        <td className="py-2">{inv.client}</td>
                        <td className="py-2">{formatDate(inv.issue_date)}</td>
                        <td className="py-2">{formatDate(inv.due_date)}</td>
                        <td className="py-2">
                          <Chip size="sm" variant="flat"
                            color={inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : inv.status === "partial" ? "warning" : "default"}>
                            {inv.status}
                          </Chip>
                        </td>
                        <td className="py-2 text-right">{formatCurrency(inv.total_amount, inv.currency)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(inv.balance_due, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Payment List */}
        {activeTab === "payments" && (
          <Card className="shadow-sm">
            <CardHeader className="flex items-center gap-2">
              <h3 className="font-semibold">Payment List</h3>
              {paymentsData && (
                <>
                  <Chip size="sm" variant="flat">{paymentsData.count} payments</Chip>
                  <span className="text-sm text-gray-500 ml-auto font-semibold">Total: {formatCurrency(paymentsData.total)}</span>
                </>
              )}
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Invoice #</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2">Reference</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {(paymentsData?.payments ?? []).map((p: { payment_date: string; invoice_number: string; client: string; amount: number; currency: string; payment_method: string; reference_number: string }, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2">{formatDate(p.payment_date)}</td>
                        <td className="py-2 font-medium">{p.invoice_number}</td>
                        <td className="py-2">{p.client}</td>
                        <td className="py-2 capitalize">{p.payment_method.replace(/_/g, " ")}</td>
                        <td className="py-2 text-gray-400">{p.reference_number || "—"}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(p.amount, p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Client Summary */}
        {activeTab === "clients" && (
          <Card className="shadow-sm">
            <CardHeader className="flex items-center gap-2">
              <h3 className="font-semibold">Client Summary</h3>
              {clientsData && <Chip size="sm" variant="flat">{clientsData.count} clients</Chip>}
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500">
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Invoices</th>
                    <th className="pb-2 text-right">Total Invoiced</th>
                    <th className="pb-2 text-right">Total Paid</th>
                    <th className="pb-2 text-right">Outstanding</th>
                  </tr></thead>
                  <tbody>
                    {(clientsData?.clients ?? []).map((c: { client: string; status: string; total_invoices: number; total_invoiced: number; total_paid: number; total_outstanding: number }) => (
                      <tr key={c.client} className="border-b">
                        <td className="py-2 font-medium">{c.client}</td>
                        <td className="py-2">
                          <Chip size="sm" variant="flat" color={c.status === "active" ? "success" : "default"}>
                            {c.status}
                          </Chip>
                        </td>
                        <td className="py-2 text-right">{c.total_invoices}</td>
                        <td className="py-2 text-right">{formatCurrency(c.total_invoiced)}</td>
                        <td className="py-2 text-right text-success">{formatCurrency(c.total_paid)}</td>
                        <td className="py-2 text-right font-medium text-danger">{formatCurrency(c.total_outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
