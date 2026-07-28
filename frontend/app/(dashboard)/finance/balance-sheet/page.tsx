"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { balanceSheetApi, BSManualItem, downloadPdf } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

function fmt(n: number) {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const SECTION_LABELS: Record<string, string> = {
  non_current_assets: "Non-Current Assets",
  current_assets: "Current Assets",
  equity: "Equity",
  current_liabilities: "Current Liabilities",
};

const SECTION_ORDER = ["non_current_assets", "current_assets", "equity", "current_liabilities"];

type EditableItem = BSManualItem & { _key: string };

function blankItem(section: string, idx: number): EditableItem {
  return { _key: `${section}-${Date.now()}-${idx}`, section, label: "", amount: 0, sort_order: idx };
}

export default function BalanceSheetPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);

  const qc = useQueryClient();

  const { data: bs, isLoading } = useQuery({
    queryKey: ["balance-sheet", asOf],
    queryFn: () => balanceSheetApi.get(asOf),
    enabled: !!asOf,
  });

  const { data: manualItems } = useQuery({
    queryKey: ["bs-items"],
    queryFn: balanceSheetApi.getItems,
  });

  const saveMut = useMutation({
    mutationFn: (items: BSManualItem[]) => balanceSheetApi.saveItems(items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["balance-sheet"] });
      qc.invalidateQueries({ queryKey: ["bs-items"] });
      setEditMode(false);
    },
  });

  const enterEdit = useCallback(() => {
    const items: EditableItem[] = (manualItems ?? []).map((item, i) => ({
      ...item,
      _key: `${item.section}-${item.id ?? i}`,
    }));
    if (items.length === 0) {
      // Seed with typical MAIA structure from audited accounts
      items.push(
        { _key: "nca-0", section: "non_current_assets", label: "Property, Plant & Equipment", amount: 0, sort_order: 0 },
        { _key: "nca-1", section: "non_current_assets", label: "Development Costs", amount: 0, sort_order: 1 },
        { _key: "ca-0", section: "current_assets", label: "Amount Due from Director", amount: 0, sort_order: 0 },
        { _key: "eq-0", section: "equity", label: "Share Capital", amount: 85000, sort_order: 0 },
        { _key: "cl-0", section: "current_liabilities", label: "Other Payables & Accruals", amount: 0, sort_order: 0 },
        { _key: "cl-1", section: "current_liabilities", label: "Tax Payable", amount: 0, sort_order: 1 },
      );
    }
    setEditItems(items);
    setEditMode(true);
  }, [manualItems]);

  const updateItem = (key: string, field: "label" | "amount", value: string | number) => {
    setEditItems((prev) =>
      prev.map((it) => (it._key === key ? { ...it, [field]: field === "amount" ? Number(value) : value } : it))
    );
  };

  const removeItem = (key: string) => {
    setEditItems((prev) => prev.filter((it) => it._key !== key));
  };

  const addItem = (section: string) => {
    const count = editItems.filter((it) => it.section === section).length;
    setEditItems((prev) => [...prev, blankItem(section, count)]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMut.mutateAsync(
        editItems.map((it, i) => ({
          id: it.id,
          section: it.section,
          label: it.label,
          amount: it.amount,
          sort_order: i,
        }))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDlLoading(true);
    try {
      const url = balanceSheetApi.pdfUrl(asOf);
      await downloadPdf(url, `balance_sheet_${asOf}.pdf`);
    } catch {
      alert("PDF download failed.");
    } finally {
      setDlLoading(false);
    }
  };

  const renderSection = (sectionKey: string) => {
    if (!bs) return null;
    const label = SECTION_LABELS[sectionKey];

    type AutoItem = { label: string; amount: number; auto: boolean };
    type ManualItem = { id?: number; label: string; amount: number };

    let autoItems: AutoItem[] = [];
    let manualItems2: ManualItem[] = [];
    let total = 0;

    if (sectionKey === "non_current_assets") {
      manualItems2 = bs.non_current_assets.rows;
      total = bs.non_current_assets.total;
    } else if (sectionKey === "current_assets") {
      autoItems = bs.current_assets.auto_rows;
      manualItems2 = bs.current_assets.manual_rows;
      total = bs.current_assets.total;
    } else if (sectionKey === "equity") {
      manualItems2 = bs.equity.manual_rows;
      autoItems = bs.equity.auto_rows;
      total = bs.equity.total;
    } else if (sectionKey === "current_liabilities") {
      autoItems = bs.current_liabilities.auto_rows;
      manualItems2 = bs.current_liabilities.manual_rows;
      total = bs.current_liabilities.total;
    }

    const allEmpty = autoItems.length === 0 && manualItems2.length === 0;

    return (
      <div key={sectionKey} className="mb-4">
        <div className="bg-gray-800 text-white text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-t">
          {label}
        </div>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {manualItems2.map((item, i) => (
              <tr key={`m-${i}`} className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-700">{item.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(item.amount)}</td>
              </tr>
            ))}
            {autoItems.map((item, i) => (
              <tr key={`a-${i}`} className="border-b border-gray-100 bg-blue-50/40">
                <td className="px-3 py-2 text-blue-700 italic">{item.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-blue-700 italic">{fmt(item.amount)}</td>
              </tr>
            ))}
            {allEmpty && (
              <tr>
                <td colSpan={2} className="px-3 py-2 text-gray-400 italic text-xs">
                  No items — click Edit to add entries
                </td>
              </tr>
            )}
            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-800">
              <td className="px-3 py-2">Total {label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar title="Balance Sheet" />
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">As at Date</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={enterEdit}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
            >
              Edit Manual Entries
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={dlLoading || isLoading}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900 font-medium disabled:opacity-50"
            >
              {dlLoading ? "Generating..." : "Download PDF"}
            </button>
          </div>

          {isLoading && (
            <div className="text-center py-12 text-gray-500">Loading balance sheet...</div>
          )}

          {bs && !editMode && (
            <>
              {/* Balance check banner */}
              {bs.is_balanced ? (
                <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm font-medium">
                  ✓ Balance sheet balances — Total Assets = Total Equity &amp; Liabilities (RM {fmt(bs.total_assets)})
                </div>
              ) : (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm font-medium">
                  ⚠ Out of balance by RM {fmt(Math.abs(bs.difference))} — please review manual entries
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column: Assets */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-900 text-white px-4 py-3 font-bold text-sm uppercase tracking-wide">
                    Assets
                  </div>
                  <div className="p-4">
                    {renderSection("non_current_assets")}
                    {renderSection("current_assets")}
                    {/* Grand total */}
                    <table className="w-full text-sm mt-2">
                      <tbody>
                        <tr className="bg-indigo-900 text-white font-bold">
                          <td className="px-3 py-2 text-sm uppercase tracking-wide">Total Assets</td>
                          <td className="px-3 py-2 text-right tabular-nums">RM {fmt(bs.total_assets)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right column: Equity & Liabilities */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-900 text-white px-4 py-3 font-bold text-sm uppercase tracking-wide">
                    Equity &amp; Liabilities
                  </div>
                  <div className="p-4">
                    {renderSection("equity")}
                    {renderSection("current_liabilities")}
                    {/* Grand total */}
                    <table className="w-full text-sm mt-2">
                      <tbody>
                        <tr className="bg-indigo-900 text-white font-bold">
                          <td className="px-3 py-2 text-sm uppercase tracking-wide">Total Equity &amp; Liabilities</td>
                          <td className="px-3 py-2 text-right tabular-nums">RM {fmt(bs.total_equity_liabilities)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-xs text-gray-500 italic">
                Italic blue items (Cash at Bank, Accounts Receivable, Retained Earnings, Accounts Payable from POs) are auto-computed from system data.
                All other items are manual entries.
              </p>
            </>
          )}

          {/* Edit mode */}
          {editMode && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-800">Edit Manual Entries</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50 text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-6">
                Enter all manual line items. Auto-computed items (Cash at Bank, AR, Retained Earnings, AP from POs) are added automatically.
              </p>

              {SECTION_ORDER.map((sectionKey) => {
                const sectionItems = editItems.filter((it) => it.section === sectionKey);
                return (
                  <div key={sectionKey} className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                        {SECTION_LABELS[sectionKey]}
                      </h3>
                      <button
                        onClick={() => addItem(sectionKey)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Add Row
                      </button>
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border border-gray-200">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Label</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600 w-40">Amount (RM)</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionItems.map((item) => (
                          <tr key={item._key} className="border-b border-gray-100">
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) => updateItem(item._key, "label", e.target.value)}
                                placeholder="Item name"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                value={item.amount}
                                onChange={(e) => updateItem(item._key, "amount", e.target.value)}
                                step="0.01"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => removeItem(item._key)}
                                className="text-red-400 hover:text-red-600 text-lg leading-none"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                        {sectionItems.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-gray-400 italic text-xs">
                              No items in this section — click + Add Row
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
