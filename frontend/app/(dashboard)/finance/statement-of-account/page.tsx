"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { soaApi, SOAData, downloadPdf } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

function fmt(n: number) {
  return new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function today() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const TYPE_COLORS: Record<string, string> = {
  Invoice: "text-blue-700",
  Payment: "text-green-700",
  "Credit Note": "text-purple-700",
  Bill: "text-blue-700",
  "Purchase Order": "text-gray-500 italic",
};

export default function StatementOfAccountPage() {
  const [mode, setMode] = useState<"client" | "vendor">("client");
  const [clientId, setClientId] = useState<number | null>(null);
  const [vendorName, setVendorName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [dlLoading, setDlLoading] = useState(false);

  // Lists
  const { data: clients = [] } = useQuery({ queryKey: ["soa-clients"], queryFn: soaApi.listClients });
  const { data: vendors = [] } = useQuery({ queryKey: ["soa-vendors"], queryFn: soaApi.listVendors });

  const canLoad = mode === "client" ? clientId !== null : vendorName !== "";

  // Statement data
  const { data: soa, isLoading, error } = useQuery<SOAData>({
    queryKey: ["soa", mode, mode === "client" ? clientId : vendorName, dateFrom, dateTo],
    queryFn: () =>
      mode === "client"
        ? soaApi.getClient(clientId!, dateFrom, dateTo)
        : soaApi.getVendor(vendorName, dateFrom, dateTo),
    enabled: canLoad,
  });

  const handleDownload = async () => {
    if (!canLoad) return;
    setDlLoading(true);
    try {
      const url =
        mode === "client"
          ? soaApi.clientPdfUrl(clientId!, dateFrom, dateTo)
          : soaApi.vendorPdfUrl(vendorName, dateFrom, dateTo);
      const name =
        mode === "client"
          ? clients.find((c) => c.id === clientId)?.company_name ?? "client"
          : vendorName;
      await downloadPdf(url, `SOA_${name.replace(/\s+/g, "_")}_${dateFrom}_${dateTo}.pdf`);
    } catch { alert("Download failed."); }
    finally { setDlLoading(false); }
  };

  const aged = soa?.aged;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar title="Statement of Account" />
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap items-end gap-3">

              {/* Mode toggle */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Statement For</label>
                <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
                  <button
                    onClick={() => { setMode("client"); setVendorName(""); }}
                    className={`px-4 py-2 font-medium ${mode === "client" ? "bg-gray-800 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    Client
                  </button>
                  <button
                    onClick={() => { setMode("vendor"); setClientId(null); }}
                    className={`px-4 py-2 font-medium ${mode === "vendor" ? "bg-gray-800 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    Vendor
                  </button>
                </div>
              </div>

              {/* Client / Vendor picker */}
              {mode === "client" ? (
                <div className="min-w-56">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
                  <select
                    value={clientId ?? ""}
                    onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="min-w-56">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                  <select
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select vendor —</option>
                    {vendors.map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Download */}
              <button
                onClick={handleDownload}
                disabled={!canLoad || dlLoading}
                className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900 font-medium disabled:opacity-40 self-end"
              >
                {dlLoading ? "Generating..." : "Download PDF"}
              </button>
            </div>
          </div>

          {/* Prompt to select */}
          {!canLoad && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Select a {mode === "client" ? "client" : "vendor"} to view their statement
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 text-gray-500 text-sm">Loading statement...</div>
          )}

          {soa && (
            <>
              {/* Party + summary */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-1">
                      {mode === "client" ? "Client" : "Vendor"}
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {mode === "client" ? soa.client?.company_name : soa.vendor_name}
                    </div>
                    {mode === "client" && soa.client?.email && (
                      <div className="text-sm text-gray-500">{soa.client.email}</div>
                    )}
                    {mode === "client" && soa.client?.phone && (
                      <div className="text-sm text-gray-500">{soa.client.phone}</div>
                    )}
                  </div>
                  <div className="flex gap-6 text-right">
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-medium tracking-wide">Opening Balance</div>
                      <div className="text-lg font-semibold text-gray-800">RM {fmt(soa.opening_balance)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-medium tracking-wide">Closing Balance</div>
                      <div className={`text-lg font-bold ${soa.closing_balance > 0 ? "text-amber-600" : "text-green-700"}`}>
                        RM {fmt(soa.closing_balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-medium tracking-wide">Outstanding</div>
                      <div className="text-lg font-bold text-amber-600">RM {fmt(soa.aged.total)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transaction table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
                <div className="bg-gray-900 text-white px-4 py-3 text-sm font-bold uppercase tracking-wide">
                  Transactions — {soa.date_from} to {soa.date_to}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs w-24">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs w-28">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs w-32">Reference</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 text-xs w-28">Debit (RM)</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 text-xs w-28">Credit (RM)</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 text-xs w-28">Balance (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-500 text-xs">{soa.date_from}</td>
                        <td colSpan={5} className="px-3 py-2 text-gray-500 italic text-xs">Opening Balance</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600 font-medium">{fmt(soa.opening_balance)}</td>
                      </tr>

                      {soa.transactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-gray-400 italic text-sm">
                            No transactions in this period
                          </td>
                        </tr>
                      )}

                      {soa.transactions.map((t, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${t.info_only ? "bg-gray-50/50" : ""} ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                          <td className="px-3 py-2 text-xs text-gray-600">{t.date}</td>
                          <td className={`px-3 py-2 text-xs font-medium ${TYPE_COLORS[t.type] ?? "text-gray-700"}`}>{t.type}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 font-mono">{t.reference}</td>
                          <td className={`px-3 py-2 text-xs ${t.info_only ? "text-gray-400 italic" : "text-gray-700"}`}>{t.description}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-blue-700">
                            {t.debit > 0 ? fmt(t.debit) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-green-700">
                            {t.credit > 0 ? fmt(t.credit) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-medium text-gray-800">
                            {t.balance !== null ? fmt(t.balance) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}

                      {/* Closing balance row */}
                      <tr className="bg-gray-100 border-t-2 border-gray-800 font-bold">
                        <td colSpan={6} className="px-3 py-2 text-right text-sm text-gray-700">Closing Balance</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sm text-gray-900">{fmt(soa.closing_balance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Aged analysis */}
              {aged && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-900 text-white px-4 py-3 text-sm font-bold uppercase tracking-wide">
                    Aged Analysis — Outstanding
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["Current", "1–30 Days", "31–60 Days", "61–90 Days", "91+ Days", "Total"].map((h) => (
                            <th key={h} className="px-4 py-2 text-center font-semibold text-gray-600 text-xs">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {[aged.current, aged.d1_30, aged.d31_60, aged.d61_90, aged.d91_plus].map((v, i) => (
                            <td key={i} className="px-4 py-3 text-center tabular-nums text-sm">
                              {v > 0 ? (
                                <span className="text-amber-700 font-medium">RM {fmt(v)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center tabular-nums text-sm font-bold text-gray-900">
                            RM {fmt(aged.total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
