"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bankApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

async function downloadFile(url: string, filename: string, mime: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([blob], { type: mime }));
  a.download = filename;
  a.click();
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 }).format(n);
}

function monthLabel(ym: string) {
  const [yr, mo] = ym.split("-");
  return `${MONTHS[parseInt(mo) - 1]} ${yr}`;
}

export default function PnLPage() {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-01`;
  const defaultTo   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [fromMonth, setFromMonth] = useState(defaultFrom);
  const [toMonth, setToMonth]     = useState(defaultTo);
  const [dlLoading, setDlLoading] = useState<"pdf"|"excel"|null>(null);

  const params = useMemo(() => {
    const p: { date_from?: string; date_to?: string } = {};
    if (fromMonth) p.date_from = `${fromMonth}-01`;
    if (toMonth) {
      // Last day of toMonth
      const [yr, mo] = toMonth.split("-").map(Number);
      const lastDay = new Date(yr, mo, 0).getDate();
      p.date_to = `${toMonth}-${String(lastDay).padStart(2, "0")}`;
    }
    return p;
  }, [fromMonth, toMonth]);

  const handleDownload = async (format: "pdf" | "excel") => {
    setDlLoading(format);
    try {
      const df = params.date_from; const dt = params.date_to;
      if (format === "pdf") {
        await downloadFile(bankApi.pnlPdfUrl(df, dt), `pnl_${fromMonth}_${toMonth}.pdf`, "application/pdf");
      } else {
        await downloadFile(bankApi.pnlExcelUrl(df, dt), `pnl_${fromMonth}_${toMonth}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
    } catch { alert("Download failed."); } finally { setDlLoading(null); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["bank-pnl", params],
    queryFn: () => bankApi.getPnl(params),
  });

  const monthly = data?.monthly ?? [];

  const rows = [
    { key: "revenue",  label: "Revenue (Credits)",  color: "text-success-600", getter: (m: typeof monthly[0]) => m.revenue  },
    { key: "expenses", label: "Expenses (Debits)",   color: "text-danger-600",  getter: (m: typeof monthly[0]) => m.expenses },
    { key: "net",      label: "Net Profit",           color: "",                 getter: (m: typeof monthly[0]) => m.net      },
  ];

  const totals = {
    revenue:  data?.total_revenue  ?? 0,
    expenses: data?.total_expenses ?? 0,
    net:      data?.total_net      ?? 0,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar title="Finance / P&L" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Header + date pickers */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Profit &amp; Loss Statement</h1>
            <p className="text-sm text-default-400 mt-0.5">Based on bank transaction credits (revenue) and debits (expenses)</p>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-default-500 block mb-1">From</label>
              <input
                type="month"
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-default-500 block mb-1">To</label>
              <input
                type="month"
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
                className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={!!dlLoading || isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-danger-600 text-white text-sm rounded-lg hover:bg-danger-700 disabled:opacity-50"
            >
              {dlLoading === "pdf" ? "…" : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              PDF
            </button>
            <button
              onClick={() => handleDownload("excel")}
              disabled={!!dlLoading || isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700 disabled:opacity-50"
            >
              {dlLoading === "excel" ? "…" : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              Excel
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Revenue",  value: totals.revenue,  color: "text-success-600" },
            { label: "Total Expenses", value: totals.expenses, color: "text-danger-600"  },
            { label: "Net Profit",     value: totals.net,      color: totals.net >= 0 ? "text-success-600" : "text-danger-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-default-400 mb-1">{c.label}</p>
              <p className={`text-xl font-semibold ${c.color}`}>{fmt(c.value)}</p>
            </div>
          ))}
        </div>

        {/* P&L table */}
        <div className="bg-white border border-default-200 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-default-400 text-sm">Loading…</div>
          ) : monthly.length === 0 ? (
            <div className="p-10 text-center text-default-400 text-sm">No transactions in the selected period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-100 bg-default-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-default-500 sticky left-0 bg-default-50 min-w-[160px]">
                      Category
                    </th>
                    {monthly.map((m) => (
                      <th key={m.month} className="text-right px-4 py-3 text-xs font-medium text-default-500 whitespace-nowrap">
                        {monthLabel(m.month)}
                      </th>
                    ))}
                    <th className="text-right px-5 py-3 text-xs font-medium text-default-500 bg-default-100 whitespace-nowrap">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => {
                    const total = row.getter({ month: "", revenue: totals.revenue, expenses: totals.expenses, net: totals.net });
                    const isNetRow = row.key === "net";
                    return (
                      <tr
                        key={row.key}
                        className={`border-b border-default-100 ${isNetRow ? "bg-default-50 font-semibold" : "hover:bg-default-50"}`}
                      >
                        <td className={`px-5 py-3.5 sticky left-0 ${isNetRow ? "bg-default-50" : "bg-white"} ${row.color || (isNetRow ? (total >= 0 ? "text-success-600" : "text-danger-600") : "")}`}>
                          {row.label}
                        </td>
                        {monthly.map((m) => {
                          const val = row.getter(m);
                          const color = row.key === "net"
                            ? (val >= 0 ? "text-success-600" : "text-danger-600")
                            : row.color;
                          return (
                            <td key={m.month} className={`text-right px-4 py-3.5 whitespace-nowrap ${color}`}>
                              {fmt(val)}
                            </td>
                          );
                        })}
                        <td className={`text-right px-5 py-3.5 whitespace-nowrap bg-default-50 font-semibold ${
                          row.key === "net"
                            ? (total >= 0 ? "text-success-600" : "text-danger-600")
                            : row.color
                        }`}>
                          {fmt(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
