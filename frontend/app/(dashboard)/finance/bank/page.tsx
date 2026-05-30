"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { bankApi, BankAccount, downloadPdf } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

const EMPTY: Omit<BankAccount, "id" | "current_balance" | "total_credit" | "total_debit"> = {
  name: "", bank_name: "", account_number: "", opening_balance: 0, currency: "MYR",
};

function fmt(n: number, cur = "MYR") {
  return `${cur} ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankAccountsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Cashflow download
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [cfFrom, setCfFrom] = useState(firstOfYear);
  const [cfTo, setCfTo] = useState(today);
  const [cfLoading, setCfLoading] = useState<"pdf" | "excel" | null>(null);

  const handleCfDownload = async (type: "pdf" | "excel") => {
    if (!cfFrom || !cfTo) return;
    setCfLoading(type);
    try {
      if (type === "pdf") {
        await downloadPdf(bankApi.cashflowPdfUrl(cfFrom, cfTo), `cashflow_${cfFrom}_${cfTo}.pdf`);
      } else {
        const url = bankApi.cashflowExcelUrl(cfFrom, cfTo);
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cashflow_${cfFrom}_${cfTo}.xlsx`;
        a.click();
      }
    } finally {
      setCfLoading(null);
    }
  };

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: bankApi.listAccounts,
  });

  const createMut = useMutation({
    mutationFn: bankApi.createAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof EMPTY }) => bankApi.updateAccount(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); closeModal(); },
  });

  const deleteMut = useMutation({
    mutationFn: bankApi.deleteAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); setDeleteId(null); },
  });

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(EMPTY); };

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };

  const openEdit = (acc: BankAccount) => {
    setEditing(acc);
    setForm({ name: acc.name, bank_name: acc.bank_name ?? "", account_number: acc.account_number ?? "", opening_balance: acc.opening_balance, currency: acc.currency });
    setShowModal(true);
  };

  const handleSubmit = () => {
    const payload = { ...form, opening_balance: Number(form.opening_balance) };
    if (editing) {
      updateMut.mutate({ id: editing.id, d: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <Topbar title="Bank / Cash Flow" />
      <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
          <p className="text-default-400 text-sm mt-0.5">Track cash flow across your bank accounts.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Add Account
        </button>
      </div>

      {/* Accounts grid */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-default-400 text-sm">
          No bank accounts yet. Click "Add Account" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const balanceColor = acc.current_balance >= 0 ? "text-success-600" : "text-danger-500";
            return (
              <div
                key={acc.id}
                className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Account name + bank */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-foreground">{acc.name}</p>
                    {acc.bank_name && <p className="text-xs text-default-400 mt-0.5">{acc.bank_name}</p>}
                    {acc.account_number && (
                      <p className="text-xs text-default-400 font-mono mt-0.5">••• {acc.account_number.slice(-4)}</p>
                    )}
                  </div>
                  <span className="text-xs bg-default-100 text-default-500 px-2 py-0.5 rounded-full">{acc.currency}</span>
                </div>

                {/* Balance */}
                <div className="mb-4">
                  <p className="text-xs text-default-400 mb-1">Current Balance</p>
                  <p className={`text-2xl font-bold ${balanceColor}`}>{fmt(acc.current_balance, acc.currency)}</p>
                </div>

                {/* Credit / Debit */}
                <div className="grid grid-cols-2 gap-3 mb-4 pt-3 border-t border-default-100">
                  <div>
                    <p className="text-xs text-default-400">Total In (Credit)</p>
                    <p className="text-sm font-semibold text-success-600">+{fmt(acc.total_credit, acc.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-default-400">Total Out (Debit)</p>
                    <p className="text-sm font-semibold text-danger-500">-{fmt(acc.total_debit, acc.currency)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/finance/bank/${acc.id}`)}
                    className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    View Transactions
                  </button>
                  <button
                    onClick={() => openEdit(acc)}
                    className="px-3 py-2 rounded-xl border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteId(acc.id)}
                    className="px-3 py-2 rounded-xl border border-danger-200 text-xs font-medium text-danger-500 hover:bg-danger-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cashflow Download */}
      <div className="mt-8 bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <h2 className="font-semibold text-foreground">Download Cashflow Report</h2>
          <span className="text-xs text-default-400 ml-1">All accounts combined</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">From</label>
            <input
              type="date"
              value={cfFrom}
              onChange={(e) => setCfFrom(e.target.value)}
              className="text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">To</label>
            <input
              type="date"
              value={cfTo}
              onChange={(e) => setCfTo(e.target.value)}
              className="text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => handleCfDownload("pdf")}
            disabled={!cfFrom || !cfTo || cfLoading !== null}
            className="px-4 py-2 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium hover:bg-[#252540] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {cfLoading === "pdf" ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            )}
            PDF
          </button>
          <button
            onClick={() => handleCfDownload("excel")}
            disabled={!cfFrom || !cfTo || cfLoading !== null}
            className="px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-medium hover:bg-success-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {cfLoading === "excel" ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            )}
            Excel
          </button>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="font-semibold text-lg text-foreground">{editing ? "Edit Account" : "Add Bank Account"}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Account Label *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='e.g. "Maybank Current Account"'
                  className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Bank Name</label>
                  <input
                    value={form.bank_name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                    placeholder="e.g. CIMB"
                    className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
                  >
                    <option>MYR</option>
                    <option>USD</option>
                    <option>SGD</option>
                    <option>EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Account Number</label>
                <input
                  value={form.account_number ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                  placeholder="Last 4 digits shown only"
                  className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Opening Balance ({form.currency})</label>
                <input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => setForm((f) => ({ ...f, opening_balance: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium text-default-600 hover:bg-default-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name || isSaving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Delete Account?</h2>
            <p className="text-sm text-default-500">This will permanently delete the account and all its transactions. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium">Cancel</button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-danger-500 text-white text-sm font-medium hover:bg-danger-600 disabled:opacity-50"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
