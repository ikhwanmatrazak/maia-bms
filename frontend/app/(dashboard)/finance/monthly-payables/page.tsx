"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { monthlyPayablesApi, downloadPdf, downloadFile } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { FileDown, FileText, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";

function fmt(n: number | undefined | null) {
  return new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const STATUS_STYLES: Record<string, string> = {
  sent:      "bg-blue-50 text-blue-700",
  received:  "bg-green-50 text-green-700",
  pending:   "bg-amber-50 text-amber-700",
  overdue:   "bg-red-50 text-red-700",
  draft:     "bg-gray-100 text-gray-500",
  finalized: "bg-green-50 text-green-700",
};

function SectionCard({ title, total, children, defaultOpen = true }: {
  title: string; total: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{title}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900">RM {fmt(total)}</span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>
      {open && children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr><td colSpan={10} className="px-5 py-6 text-center text-gray-400 italic text-sm">{text}</td></tr>
  );
}

export default function MonthlyPayablesPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [dlPdf, setDlPdf] = useState(false);
  const [dlCsv, setDlCsv] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-payables", month, year],
    queryFn: () => monthlyPayablesApi.get(month, year),
  });

  const handlePdf = async () => {
    setDlPdf(true);
    await downloadPdf(monthlyPayablesApi.pdfUrl(month, year), `Monthly_Payables_${MONTHS[month-1]}_${year}.pdf`);
    setDlPdf(false);
  };

  const handleCsv = async () => {
    setDlCsv(true);
    await downloadFile(monthlyPayablesApi.csvUrl(month, year), `Monthly_Payables_${MONTHS[month-1]}_${year}.csv`, "text/csv");
    setDlCsv(false);
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar title="Monthly Payables" />
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">

          {/* Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex gap-2 self-end ml-auto">
              <button
                onClick={handlePdf}
                disabled={dlPdf || isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900 disabled:opacity-40 font-medium"
              >
                <FileText size={14} />
                {dlPdf ? "Generating..." : "PDF"}
              </button>
              <button
                onClick={handleCsv}
                disabled={dlCsv || isLoading}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 disabled:opacity-40 font-medium"
              >
                <FileSpreadsheet size={14} />
                {dlCsv ? "Exporting..." : "CSV / Excel"}
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-16 text-gray-400 text-sm">Loading payables...</div>
          )}

          {data && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3 mb-6 sm:grid-cols-6">
                {[
                  { label: "Salaries",         amount: data.salaries?.total,         color: "text-gray-900" },
                  { label: "Statutory",         amount: data.statutory?.total,         color: "text-gray-900" },
                  { label: "Bills",             amount: data.bills?.total,             color: "text-gray-900" },
                  { label: "Purchase Orders",   amount: data.purchase_orders?.total,   color: "text-gray-900" },
                  { label: "Claims",            amount: data.claims?.total,            color: "text-gray-900" },
                ].map((c) => (
                  <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-400 font-medium mb-1">{c.label}</div>
                    <div className={`text-sm font-bold ${c.color}`}>RM {fmt(c.amount)}</div>
                  </div>
                ))}
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-xs text-gray-400 font-medium mb-1">Grand Total</div>
                  <div className="text-sm font-bold text-white">RM {fmt(data.grand_total)}</div>
                </div>
              </div>

              {/* 1. Salaries */}
              <SectionCard title="Employee Salaries" total={data.salaries?.total ?? 0}>
                {data.payroll_run_status && (
                  <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Payroll run status:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[data.payroll_run_status] ?? "bg-gray-100 text-gray-600"}`}>
                      {data.payroll_run_status}
                    </span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Employee</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Bank</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Account No.</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Gross (RM)</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Net Pay (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salaries?.items?.length === 0
                        ? <EmptyRow text="No payroll run found for this month" />
                        : data.salaries?.items?.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-2.5">
                              <div className="font-medium text-gray-900">{r.full_name}</div>
                              <div className="text-xs text-gray-400">{r.employee_no}</div>
                            </td>
                            <td className="px-5 py-2.5 text-sm text-gray-500">{r.bank_name || "—"}</td>
                            <td className="px-5 py-2.5 text-sm text-gray-500 font-mono">{r.bank_account_no || "—"}</td>
                            <td className="px-5 py-2.5 text-right text-sm tabular-nums text-gray-700">{fmt(r.gross_pay)}</td>
                            <td className="px-5 py-2.5 text-right text-sm tabular-nums font-bold text-gray-900">{fmt(r.net_pay)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    {(data.salaries?.items?.length ?? 0) > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td colSpan={4} className="px-5 py-2 text-right text-xs font-semibold text-gray-600">Total Net Salaries</td>
                          <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">RM {fmt(data.salaries?.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </SectionCard>

              {/* 2. Statutory */}
              <SectionCard title="Statutory Contributions" total={data.statutory?.total ?? 0}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Contribution</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Employee (RM)</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Employer (RM)</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Total (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "EPF — KWSP",            emp: data.statutory?.epf_employee,   er: data.statutory?.epf_employer,   tot: data.statutory?.epf_total },
                        { label: "SOCSO — PERKESO",       emp: data.statutory?.socso_employee, er: data.statutory?.socso_employer, tot: data.statutory?.socso_total },
                        { label: "EIS",                   emp: data.statutory?.eis_employee,   er: data.statutory?.eis_employer,   tot: data.statutory?.eis_total },
                        { label: "PCB / Income Tax — LHDN", emp: data.statutory?.pcb,          er: null,                            tot: data.statutory?.pcb },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-5 py-2.5 font-medium text-gray-800">{row.label}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.emp)}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-gray-600">{row.er !== null ? fmt(row.er) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmt(row.tot)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50">
                        <td colSpan={3} className="px-5 py-2 text-right text-xs font-semibold text-gray-600">Total Statutory</td>
                        <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">RM {fmt(data.statutory?.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {data.statutory?.total === 0 && (
                  <div className="px-5 py-4 text-center text-sm text-gray-400 italic">No statutory contributions — no payroll run for this month</div>
                )}
              </SectionCard>

              {/* 3. Bills */}
              <SectionCard title="Vendor Bills" total={data.bills?.total ?? 0}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Vendor</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Bill No.</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Description</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Due Date</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Amount (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bills?.items?.length === 0
                        ? <EmptyRow text="No outstanding bills due this month" />
                        : data.bills?.items?.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 font-medium text-gray-900">{r.vendor_name || "—"}</td>
                            <td className="px-5 py-2.5 text-gray-500 font-mono text-xs">{r.bill_number || "—"}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">{r.description || "—"}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs">{r.due_date ? String(r.due_date).slice(0, 10) : "—"}</td>
                            <td className="px-5 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmt(r.amount)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    {(data.bills?.items?.length ?? 0) > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td colSpan={5} className="px-5 py-2 text-right text-xs font-semibold text-gray-600">Total Bills</td>
                          <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">RM {fmt(data.bills?.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </SectionCard>

              {/* 4. Purchase Orders */}
              <SectionCard title="Purchase Orders (Unpaid)" total={data.purchase_orders?.total ?? 0}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">PO Number</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Vendor</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Issue Date</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Total (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchase_orders?.items?.length === 0
                        ? <EmptyRow text="No outstanding purchase orders" />
                        : data.purchase_orders?.items?.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 font-mono text-xs font-medium text-gray-900">{r.po_number}</td>
                            <td className="px-5 py-2.5 text-gray-800">{r.vendor_name}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs">{r.issue_date ? String(r.issue_date).slice(0, 10) : "—"}</td>
                            <td className="px-5 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmt(r.total)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    {(data.purchase_orders?.items?.length ?? 0) > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td colSpan={4} className="px-5 py-2 text-right text-xs font-semibold text-gray-600">Total POs</td>
                          <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">RM {fmt(data.purchase_orders?.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </SectionCard>

              {/* 5. Claims */}
              <SectionCard title="Expense Claims (Pending Reimbursement)" total={data.claims?.total ?? 0}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Employee</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Claim Type</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Description</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                        <th className="px-5 py-2 text-right text-xs font-semibold text-gray-500">Amount (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.claims?.items?.length === 0
                        ? <EmptyRow text="No approved expense claims pending reimbursement" />
                        : data.claims?.items?.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                            <td className="px-5 py-2.5 text-gray-600">{r.claim_type}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">{r.description || "—"}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs">{r.claim_date ? String(r.claim_date).slice(0, 10) : "—"}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmt(r.amount)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    {(data.claims?.items?.length ?? 0) > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td colSpan={4} className="px-5 py-2 text-right text-xs font-semibold text-gray-600">Total Claims</td>
                          <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">RM {fmt(data.claims?.total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </SectionCard>

              {/* Grand Total */}
              <div className="bg-gray-900 rounded-lg p-5 flex justify-between items-center">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">Grand Total Payable</div>
                  <div className="text-sm text-gray-400 mt-0.5">{MONTHS[month - 1]} {year}</div>
                </div>
                <div className="text-2xl font-bold text-white">RM {fmt(data.grand_total)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
