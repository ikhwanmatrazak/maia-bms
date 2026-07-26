"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (v: number) =>
  `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

const fmtSigned = (v: number) => {
  const s = Math.abs(v).toLocaleString("en-MY", { minimumFractionDigits: 2 });
  return v < 0 ? `(RM ${s})` : `RM ${s}`;
};

const ALL_INCOME_CATS = [
  "Grant / Disbursement",
  "Professional Services",
  "Cash Deposits",
  "Director Loan",
  "Return / Refund",
  "Other Income",
];

const ALL_EXPENSE_CATS = [
  "Salaries & Allowances",
  "Consultant Fees",
  "Development / Technical",
  "Compliance & Statutory",
  "Travel & Accommodation",
  "Sponsorship / CSR",
  "Professional Fees",
  "Claims / Reimbursements",
  "Other Expenses",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="text-xs text-gray-400 font-medium mb-1">{label}</div>
      <div className={`text-xl font-bold ${positive === true ? "text-green-600" : positive === false ? "text-red-500" : "text-gray-900"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ManagementAccountsPage() {
  const [year, setYear] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"cashflow" | "pnl">("cashflow");

  const { data: yearsData } = useQuery({
    queryKey: ["available-years"],
    queryFn: () => reportsApi.availableYears(),
  });

  const availableYears: number[] = yearsData?.years ?? [];

  // Auto-select latest available year once loaded
  const effectiveYear = year ?? availableYears[availableYears.length - 1] ?? new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ["management-accounts", effectiveYear],
    queryFn: () => reportsApi.managementAccounts(effectiveYear),
    enabled: availableYears.length > 0,
  });

  const months = data?.months ?? [];
  const activeMths = months.filter((m: any) => m.inflow > 0 || m.outflow > 0);

  const incomeActive = ALL_INCOME_CATS.filter(cat =>
    months.some((m: any) => (m.income_breakdown[cat] ?? 0) > 0)
  );
  const expenseActive = ALL_EXPENSE_CATS.filter(cat =>
    months.some((m: any) => (m.expense_breakdown[cat] ?? 0) > 0)
  );

  const handlePrint = () => window.print();

  return (
    <div>
      <Topbar title="Management Accounts" />
      <div className="p-6 space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Management Accounts {effectiveYear}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Cash-basis · Bank transactions · Jan – Dec {effectiveYear}</p>
          </div>
          <div className="flex items-center gap-3 no-print">
            <select
              value={effectiveYear}
              onChange={e => setYear(Number(e.target.value))}
              disabled={availableYears.length === 0}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-50"
            >
              {availableYears.length === 0 ? (
                <option>Loading…</option>
              ) : (
                availableYears.map(y => <option key={y} value={y}>{y}</option>)
              )}
            </select>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700"
            >
              <Download size={14} /> Print / Save PDF
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Income" value={fmt(data?.total_inflow ?? 0)} positive={true} />
              <StatCard label="Total Expenditure" value={fmt(data?.total_outflow ?? 0)} positive={false} />
              <StatCard
                label="Net Cash Flow"
                value={fmtSigned(data?.net ?? 0)}
                positive={(data?.net ?? 0) >= 0}
                sub={(data?.net ?? 0) >= 0 ? "Surplus" : "Deficit"}
              />
              <StatCard
                label="Active Months"
                value={String(activeMths.length)}
                sub={`of 12 months in ${year}`}
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit no-print">
              {(["cashflow", "pnl"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {t === "cashflow" ? "Cash Flow" : "P&L Breakdown"}
                </button>
              ))}
            </div>

            {activeTab === "cashflow" ? (
              /* ── Cash Flow Statement ── */
              <Section title={`Cash Flow Statement — ${year}`}>
                <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-28">Month</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Opening</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-green-600">Cash In</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-red-500">Cash Out</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Net</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700">Closing Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m: any) => {
                        const hasData = m.inflow > 0 || m.outflow > 0;
                        return (
                          <tr key={m.month} className={`border-b border-gray-50 ${!hasData ? "opacity-40" : "hover:bg-gray-50"}`}>
                            <td className="px-4 py-3 font-semibold text-gray-700">{m.month_name}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{fmt(m.opening_balance)}</td>
                            <td className="px-4 py-3 text-right text-green-600 font-medium">{m.inflow > 0 ? fmt(m.inflow) : "—"}</td>
                            <td className="px-4 py-3 text-right text-red-500 font-medium">{m.outflow > 0 ? fmt(m.outflow) : "—"}</td>
                            <td className={`px-4 py-3 text-right font-semibold ${m.net >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {hasData ? fmtSigned(m.net) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(m.closing_balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white">
                        <td className="px-4 py-3 font-bold">TOTAL</td>
                        <td className="px-4 py-3 text-right">—</td>
                        <td className="px-4 py-3 text-right font-bold text-green-300">{fmt(data?.total_inflow ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-300">{fmt(data?.total_outflow ?? 0)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${(data?.net ?? 0) >= 0 ? "text-green-300" : "text-red-300"}`}>
                          {fmtSigned(data?.net ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">{fmtSigned(data?.net ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>
            ) : (
              /* ── P&L Breakdown ── */
              <>
                {/* Income table */}
                <Section title={`Income — ${year}`}>
                  <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-52">Category</th>
                          {months.map((m: any) => (
                            <th key={m.month} className="text-right px-3 py-3 text-xs font-semibold text-gray-500">{m.month_name}</th>
                          ))}
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomeActive.map(cat => {
                          const total = months.reduce((s: number, m: any) => s + (m.income_breakdown[cat] ?? 0), 0);
                          return (
                            <tr key={cat} className="border-b border-gray-50 hover:bg-green-50/30">
                              <td className="px-4 py-2.5 text-gray-700">{cat}</td>
                              {months.map((m: any) => {
                                const v = m.income_breakdown[cat] ?? 0;
                                return <td key={m.month} className="px-3 py-2.5 text-right text-gray-600">{v > 0 ? fmt(v) : "—"}</td>;
                              })}
                              <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmt(total)}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-green-50 font-bold">
                          <td className="px-4 py-3 text-green-800">Total Income</td>
                          {months.map((m: any) => (
                            <td key={m.month} className="px-3 py-3 text-right text-green-700">{m.inflow > 0 ? fmt(m.inflow) : "—"}</td>
                          ))}
                          <td className="px-4 py-3 text-right text-green-800">{fmt(data?.total_inflow ?? 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Expense table */}
                <Section title={`Expenditure — ${year}`}>
                  <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-52">Category</th>
                          {months.map((m: any) => (
                            <th key={m.month} className="text-right px-3 py-3 text-xs font-semibold text-gray-500">{m.month_name}</th>
                          ))}
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseActive.map(cat => {
                          const total = months.reduce((s: number, m: any) => s + (m.expense_breakdown[cat] ?? 0), 0);
                          return (
                            <tr key={cat} className="border-b border-gray-50 hover:bg-red-50/30">
                              <td className="px-4 py-2.5 text-gray-700">{cat}</td>
                              {months.map((m: any) => {
                                const v = m.expense_breakdown[cat] ?? 0;
                                return <td key={m.month} className="px-3 py-2.5 text-right text-gray-600">{v > 0 ? fmt(v) : "—"}</td>;
                              })}
                              <td className="px-4 py-2.5 text-right font-semibold text-red-600">{fmt(total)}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-red-50 font-bold">
                          <td className="px-4 py-3 text-red-800">Total Expenditure</td>
                          {months.map((m: any) => (
                            <td key={m.month} className="px-3 py-3 text-right text-red-700">{m.outflow > 0 ? fmt(m.outflow) : "—"}</td>
                          ))}
                          <td className="px-4 py-3 text-right text-red-800">{fmt(data?.total_outflow ?? 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Net surplus/deficit row */}
                <div className="bg-gray-900 text-white rounded-xl px-6 py-4 flex justify-between items-center">
                  <span className="font-bold text-sm uppercase tracking-wider">Net Surplus / (Deficit) {year}</span>
                  <span className={`text-xl font-bold ${(data?.net ?? 0) >= 0 ? "text-green-300" : "text-red-300"}`}>
                    {fmtSigned(data?.net ?? 0)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 15mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; font-size: 9pt !important; }
          /* Hide everything except the report content */
          aside, nav, header, [data-sidebar], .topbar-container { display: none !important; }
          button, select, .no-print { display: none !important; }
          /* Make the main content area full width */
          main, .main-content, [class*="ml-"], [class*="pl-"] { margin-left: 0 !important; padding-left: 0 !important; }
          div[class*="p-6"] { padding: 0 !important; }
          /* Tables */
          table { font-size: 8pt !important; page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          th, td { padding: 4px 6px !important; }
          /* KPI cards */
          .grid { display: flex !important; flex-wrap: wrap; gap: 8px; }
          .grid > div { flex: 1 1 120px; padding: 8px !important; border: 1px solid #ccc !important; box-shadow: none !important; }
          /* Overflow tables */
          .overflow-x-auto { overflow: visible !important; }
          /* Colors */
          .bg-gray-900, tfoot tr { background: #1a1a2e !important; color: white !important; }
          .text-green-600 { color: #16a34a !important; }
          .text-red-500, .text-red-600 { color: #dc2626 !important; }
          .text-green-300 { color: #86efac !important; }
          .text-red-300 { color: #fca5a5 !important; }
        }
      `}</style>
    </div>
  );
}
