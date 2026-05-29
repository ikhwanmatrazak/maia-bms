"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  bankApi, BankTransaction, TxnCategory, ParsedRow,
  UnpaidInvoice, UnpaidBill,
} from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Static files are served at the root (not under /api/v1), so strip that suffix
const STATIC_BASE = API_URL.replace(/\/api\/v1\/?$/, "");

function fmt(n: number, cur = "MYR") {
  return `${cur} ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Quick invoice link modal (for credit transactions) ────────────────────────

function QuickLinkInvoiceModal({
  txn,
  unpaidInvoices,
  onClose,
}: {
  txn: BankTransaction;
  unpaidInvoices: UnpaidInvoice[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [invId, setInvId] = useState<number | null>(txn.invoice_id);

  const mut = useMutation({
    mutationFn: () => bankApi.updateTransaction(txn.id, { invoice_id: invId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", txn.account_id] });
      qc.invalidateQueries({ queryKey: ["bank-summary", txn.account_id] });
      onClose();
    },
  });

  const allOptions = [
    ...(txn.invoice_id && txn.invoice_number
      ? [{ id: txn.invoice_id, invoice_number: txn.invoice_number, client_name: "(currently linked)", balance_due: 0 }]
      : []),
    ...unpaidInvoices.filter((inv) => inv.id !== txn.invoice_id),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Link to Invoice</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl">&times;</button>
        </div>
        <div className="bg-default-50 rounded-xl p-3 text-sm">
          <p className="font-medium text-foreground">{txn.description}</p>
          <p className="text-success-600 font-bold">+{fmt(txn.amount)}</p>
          <p className="text-xs text-default-400">{txn.txn_date}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">
            Select Invoice <span className="text-success-600 font-normal">(marks as Paid)</span>
          </label>
          <select
            value={invId ?? ""}
            onChange={(e) => setInvId(e.target.value ? Number(e.target.value) : null)}
            className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
          >
            <option value="">— No invoice —</option>
            {allOptions.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} — {inv.client_name}{inv.balance_due > 0 ? ` (${fmt(inv.balance_due)})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-default-200 text-sm font-medium">Cancel</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {mut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt upload button (for debit transactions) ────────────────────────────

function ReceiptUploadCell({ txn }: { txn: BankTransaction }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await bankApi.uploadReceipt(txn.id, file);
      qc.invalidateQueries({ queryKey: ["bank-txns", txn.account_id] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (txn.receipt_url) {
    return (
      <a
        href={`${STATIC_BASE}${txn.receipt_url}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
      >
        📎 Receipt
      </a>
    );
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="text-xs text-default-400 hover:text-primary hover:bg-default-50 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "↑ Receipt"}
      </button>
    </>
  );
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (f: File) => {
    setFile(f);
    setError("");
    setLoading(true);
    try {
      const res = await bankApi.previewStatement(accountId, f);
      setPreview(res.rows);
      setStep("preview");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not parse file. Try CSV export instead.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setLoading(true);
    try {
      await bankApi.confirmStatement(accountId, file);
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      setStep("done");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-foreground">Upload Bank Statement</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl leading-none">&times;</button>
        </div>

        {step === "pick" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-full border-2 border-dashed border-default-200 rounded-2xl p-10 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-sm font-medium text-foreground">Drop your bank statement here</p>
              <p className="text-xs text-default-400 mt-1">PDF or CSV — CIMB, Maybank, and most banks</p>
              {loading && <p className="text-xs text-primary mt-3 animate-pulse">Parsing file…</p>}
            </div>
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <input ref={fileRef} type="file" accept=".pdf,.csv,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <p className="text-xs text-default-400">For best results, use the CSV export from your online banking portal.</p>
          </div>
        )}

        {step === "preview" && (
          <>
            <p className="text-sm text-default-500">
              Found <span className="font-semibold text-foreground">{preview.length}</span> transactions. Review before importing.
            </p>
            <div className="overflow-auto flex-1 border border-default-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-default-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-default-500">Date</th>
                    <th className="text-left p-2 font-medium text-default-500">Description</th>
                    <th className="text-left p-2 font-medium text-default-500">Party</th>
                    <th className="text-left p-2 font-medium text-default-500">Ref / Note</th>
                    <th className="text-right p-2 font-medium text-success-600">Money In</th>
                    <th className="text-right p-2 font-medium text-danger-500">Money Out</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-default-100">
                      <td className="p-2 text-default-600 whitespace-nowrap">{row.txn_date}</td>
                      <td className="p-2 text-default-700 whitespace-normal break-words">{row.description}</td>
                      <td className="p-2 text-default-500 whitespace-normal break-words">{row.party_name ?? "—"}</td>
                      <td className="p-2 text-default-400 whitespace-normal break-words text-xs">{row.note ?? "—"}</td>
                      <td className="p-2 text-right font-medium text-success-600 whitespace-nowrap">
                        {row.type === "credit" ? `+${row.amount.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-2 text-right font-medium text-danger-500 whitespace-nowrap">
                        {row.type === "debit" ? `-${row.amount.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setStep("pick"); setPreview([]); setFile(null); setError(""); }}
                className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium">Back</button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {loading ? "Importing…" : `Import ${preview.length} Transactions`}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div className="text-5xl">✅</div>
            <p className="font-semibold text-foreground">Imported successfully!</p>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add/Edit transaction modal ────────────────────────────────────────────────

function TxnModal({
  accountId, editing, categories, onClose,
}: {
  accountId: number;
  editing: BankTransaction | null;
  categories: TxnCategory[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    txn_date: editing?.txn_date ?? new Date().toISOString().slice(0, 10),
    description: editing?.description ?? "",
    party_name: editing?.party_name ?? "",
    amount: editing?.amount ?? 0,
    type: editing?.type ?? "credit",
    category_ids: editing?.categories?.map((c) => c.id) ?? [] as number[],
    note: editing?.note ?? "",
  });

  const createMut = useMutation({
    mutationFn: (d: typeof form) => bankApi.createTransaction(accountId, { ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: (d: typeof form) => bankApi.updateTransaction(editing!.id, { ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onClose();
    },
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  const handleSubmit = () => {
    if (editing) updateMut.mutate(form);
    else createMut.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-foreground">{editing ? "Edit Transaction" : "Add Transaction"}</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl leading-none">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Date *</label>
            <input type="date" value={form.txn_date}
              onChange={(e) => setForm((f) => ({ ...f, txn_date: e.target.value }))}
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Type *</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
              <option value="credit">Credit (Money In)</option>
              <option value="debit">Debit (Money Out)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Description *</label>
          <input value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="e.g. CIMB Transfer"
            className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Amount *</label>
            <input type="number" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Party Name</label>
            <input value={form.party_name}
              onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
              placeholder="Payee / Sender"
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Categories</label>
          <div className="border border-default-200 rounded-lg overflow-hidden divide-y divide-default-100 max-h-36 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-xs text-default-400 p-2">No categories yet.</p>
            ) : categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-default-50 cursor-pointer">
                <input type="checkbox" checked={form.category_ids.includes(c.id)}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    category_ids: e.target.checked ? [...f.category_ids, c.id] : f.category_ids.filter((id) => id !== c.id),
                  }))}
                  className="accent-primary" />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-sm text-foreground">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Note</label>
          <textarea value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            rows={2} placeholder="Optional note"
            className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary resize-none" />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={!form.description || !form.amount || isSaving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Party autocomplete ────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = { client: "Client", vendor: "Vendor", staff: "Staff" };
const SOURCE_COLOR: Record<string, string> = { client: "text-primary", vendor: "text-warning-600", staff: "text-success-600" };

function PartySearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ source: string; name: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    if (v.trim().length < 1) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await bankApi.searchParties(v.trim());
        setResults(res);
        setOpen(res.length > 0);
      } catch (_e) { setResults([]); }
    }, 250);
  };

  const pick = (name: string) => { onChange(name); setOpen(false); setResults([]); };

  return (
    <div className="relative">
      <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Party</label>
      <input
        value={value}
        onChange={handleInput}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => value.trim() && results.length > 0 && setOpen(true)}
        placeholder="Search client, vendor or staff…"
        className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
      />
      {open && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-default-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <li key={i} onMouseDown={() => pick(r.name)}
              className="flex items-center justify-between px-3 py-2 hover:bg-default-50 cursor-pointer text-sm">
              <span className="text-foreground">{r.name}</span>
              <span className={`text-xs font-medium ${SOURCE_COLOR[r.source] ?? "text-default-400"}`}>
                {SOURCE_LABEL[r.source] ?? r.source}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Edit drawer (category + reconciliation + receipt) ────────────────────────

function EditDrawer({
  txn, categories, unpaidInvoices, unpaidBills, onClose,
}: {
  txn: BankTransaction;
  categories: TxnCategory[];
  unpaidInvoices: UnpaidInvoice[];
  unpaidBills: UnpaidBill[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(txn.description ?? "");
  const [partyName, setPartyName] = useState(txn.party_name ?? "");
  const [catIds, setCatIds] = useState<number[]>(txn.categories?.map((c) => c.id) ?? (txn.category_id ? [txn.category_id] : []));
  const [invId, setInvId] = useState<number | null>(txn.invoice_id);
  const [billId, setBillId] = useState<number | null>(txn.bill_id);
  const [note, setNote] = useState(txn.note ?? "");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(txn.receipt_url);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: () => bankApi.updateTransaction(txn.id, {
      description, party_name: partyName,
      category_ids: catIds, invoice_id: invId, bill_id: billId, note,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", txn.account_id] });
      qc.invalidateQueries({ queryKey: ["bank-summary", txn.account_id] });
      onClose();
    },
  });

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await bankApi.uploadReceipt(txn.id, file);
      setReceiptUrl(res.receipt_url);
      qc.invalidateQueries({ queryKey: ["bank-txns", txn.account_id] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6366f1");
  const createCatMut = useMutation({
    mutationFn: () => bankApi.createCategory({
      name: newCatName.trim(),
      type: txn.type === "credit" ? "income" : "expense",
      color: newCatColor,
    }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ["bank-cats"] });
      setCatIds((prev) => [...prev, cat.id]);
      setShowAddCat(false);
      setNewCatName("");
    },
  });
  // Show all categories — no type restriction so user always sees options
  const relevantCats = categories;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="bg-white w-full max-w-sm h-full shadow-2xl overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Edit Transaction</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl">&times;</button>
        </div>

        {/* Transaction summary */}
        <div className="bg-default-50 rounded-xl p-3 text-sm space-y-1">
          <p className={`font-bold ${txn.type === "credit" ? "text-success-600" : "text-danger-500"}`}>
            {txn.type === "credit" ? "+" : "-"}{fmt(txn.amount)}
          </p>
          <p className="text-xs text-default-400">{txn.txn_date}</p>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
          />
        </div>

        {/* Party — searchable across clients, vendors, staff */}
        <PartySearch value={partyName} onChange={setPartyName} />

        {/* Category */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider">Category</label>
            <button onClick={() => setShowAddCat((v) => !v)}
              className="text-xs text-primary hover:underline">
              {showAddCat ? "Cancel" : "+ Add Category"}
            </button>
          </div>
          {showAddCat ? (
            <div className="space-y-2 p-3 border border-default-200 rounded-lg bg-default-50">
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
              <div className="flex items-center gap-2">
                <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                <span className="text-xs text-default-400">Pick colour</span>
              </div>
              <button
                onClick={() => createCatMut.mutate()}
                disabled={!newCatName.trim() || createCatMut.isPending}
                className="w-full py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createCatMut.isPending ? "Saving…" : "Save Category"}
              </button>
            </div>
          ) : (
            <div className="border border-default-200 rounded-lg overflow-hidden divide-y divide-default-100 max-h-40 overflow-y-auto">
              {relevantCats.length === 0 ? (
                <p className="text-xs text-default-400 p-2">No categories yet. Click "+ New" to add one.</p>
              ) : relevantCats.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-default-50 cursor-pointer">
                  <input type="checkbox" checked={catIds.includes(c.id)}
                    onChange={(e) => setCatIds((prev) => e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))}
                    className="accent-primary" />
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-sm text-foreground">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Link to invoice (for credits) */}
        {txn.type === "credit" && (
          <div>
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">
              Link to Invoice <span className="text-success-600 font-normal">(marks as Paid)</span>
            </label>
            <select value={invId ?? ""} onChange={(e) => setInvId(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
              <option value="">— No invoice —</option>
              {unpaidInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.client_name} [{inv.status ?? ""}] ({fmt(inv.total)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Link to bill + receipt upload (for debits) */}
        {txn.type === "debit" && (
          <>
            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">
                Link to Bill <span className="text-danger-500 font-normal">(marks as Paid)</span>
              </label>
              <select value={billId ?? ""} onChange={(e) => setBillId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
                <option value="">— No bill —</option>
                {txn.bill_id && txn.bill_number && (
                  <option value={txn.bill_id}>{txn.bill_number} (currently linked)</option>
                )}
                {unpaidBills
                  .filter((b) => b.id !== txn.bill_id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bill_number ?? `Bill #${b.id}`} — {b.vendor_name} ({fmt(b.amount)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Receipt / Invoice</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleReceiptUpload} />
              {receiptUrl ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`${STATIC_BASE}${receiptUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-sm text-primary font-medium hover:underline truncate"
                  >
                    📎 View Receipt
                  </a>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-default-400 hover:text-default-600 px-2 py-1 border border-default-200 rounded-lg"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-2 border-2 border-dashed border-default-200 rounded-lg text-sm text-default-400 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "↑ Upload Receipt / Invoice"}
                </button>
              )}
            </div>
          </>
        )}

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="Optional note"
            className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary resize-none" />
        </div>

        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {mut.isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ── Category Manager modal ────────────────────────────────────────────────────

function CategoryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ["bank-cats"], queryFn: bankApi.listCategories });
  const [form, setForm] = useState({ name: "", type: "expense" as "income" | "expense", color: "#6366f1" });
  const [editId, setEditId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: bankApi.createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-cats"] }); setForm({ name: "", type: "expense", color: "#6366f1" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof form }) => bankApi.updateCategory(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-cats"] }); setEditId(null); setForm({ name: "", type: "expense", color: "#6366f1" }); },
  });
  const deleteMut = useMutation({
    mutationFn: bankApi.deleteCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-cats"] }),
  });

  const openEdit = (c: TxnCategory) => {
    setEditId(c.id);
    setForm({ name: c.name, type: c.type as "income" | "expense", color: c.color });
  };

  const handleSubmit = () => {
    if (editId) updateMut.mutate({ id: editId, d: form });
    else createMut.mutate(form);
  };

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-foreground">Manage Categories</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl">&times;</button>
        </div>

        {/* Add / edit form */}
        <div className="bg-default-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-default-500 uppercase tracking-wider">{editId ? "Edit Category" : "New Category"}</p>
          <div className="flex gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Category name"
              className="flex-1 text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary bg-white" />
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "income" | "expense" }))}
              className="text-sm border border-default-200 rounded-lg px-3 py-2 outline-none focus:border-primary bg-white">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-default-200 cursor-pointer p-0.5" />
          </div>
          <div className="flex gap-2">
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ name: "", type: "expense", color: "#6366f1" }); }}
                className="px-3 py-1.5 text-xs border border-default-200 rounded-lg">Cancel</button>
            )}
            <button onClick={handleSubmit} disabled={!form.name}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {editId ? "Update" : "Add"}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 space-y-4">
          {[{ label: "Income", items: income }, { label: "Expense", items: expense }].map(({ label, items }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-default-500 uppercase tracking-wider mb-2">{label}</p>
              {items.length === 0 ? (
                <p className="text-xs text-default-400 pl-1">No {label.toLowerCase()} categories yet.</p>
              ) : (
                <div className="space-y-1">
                  {items.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-default-50 group">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-sm text-foreground">{c.name}</span>
                      <button onClick={() => openEdit(c)}
                        className="text-xs text-default-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                      <button onClick={() => deleteMut.mutate(c.id)}
                        className="text-xs text-danger-400 hover:text-danger-600 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BankDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const accountId = Number(params.id);

  const [showUpload, setShowUpload] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [editingTxn, setEditingTxn] = useState<BankTransaction | null>(null);
  const [drawerTxn, setDrawerTxn] = useState<BankTransaction | null>(null);
  const [showCats, setShowCats] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [txnType, setTxnType] = useState("");
  const [catFilter, setCatFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");

  // Build a clean params object — no undefined values so React Query key serializes reliably
  const filterParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (txnType) p.type = txnType;
    if (catFilter) p.category_id = catFilter as number;
    if (search) p.search = search;
    return p;
  }, [dateFrom, dateTo, txnType, catFilter, search]);

  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: bankApi.listAccounts });
  const account = accounts.find((a) => a.id === accountId);

  const { data: txns = [], isLoading: txnsLoading } = useQuery({
    queryKey: ["bank-txns", accountId, filterParams],
    queryFn: () => bankApi.listTransactions(accountId, filterParams),
    enabled: !!accountId,
  });

  // Client-side date guard — belt-and-suspenders in case cached/unfiltered data sneaks through
  const filteredTxns = useMemo(() => txns.filter((t) => {
    if (dateFrom && t.txn_date < dateFrom) return false;
    if (dateTo && t.txn_date > dateTo) return false;
    return true;
  }), [txns, dateFrom, dateTo]);

  const { data: summary } = useQuery({
    queryKey: ["bank-summary", accountId, dateFrom, dateTo, catFilter],
    queryFn: () => bankApi.getSummary(accountId, {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      category_id: catFilter || undefined,
    }),
    enabled: !!accountId,
  });

  const { data: categories = [] } = useQuery({ queryKey: ["bank-cats"], queryFn: bankApi.listCategories });
  const { data: unpaidInvoices = [] } = useQuery({ queryKey: ["bank-unpaid-inv"], queryFn: bankApi.listUnpaidInvoices });
  const { data: unpaidBills = [] } = useQuery({ queryKey: ["bank-unpaid-bills"], queryFn: bankApi.listUnpaidBills });

  const deleteMut = useMutation({
    mutationFn: bankApi.deleteTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
  });

  const cur = account?.currency ?? "MYR";

  return (
    <div>
      <Topbar title="Bank / Cash Flow" />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/finance/bank")} className="text-default-400 hover:text-default-600 text-sm">← Back</button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{account?.name ?? "Bank Account"}</h1>
            {account?.bank_name && <p className="text-xs text-default-400">{account.bank_name}{account.account_number ? ` ••• ${account.account_number.slice(-4)}` : ""}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => setShowCats(true)}
            className="px-3 py-1.5 rounded-xl border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50">
            Categories
          </button>
          <button onClick={() => setShowAddTxn(true)}
            className="px-3 py-1.5 rounded-xl border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50">
            + Add Manual
          </button>
          <button onClick={() => setShowUpload(true)}
            className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90">
            Upload Statement
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Current Balance", value: summary.current_balance, color: summary.current_balance >= 0 ? "text-success-600" : "text-danger-500" },
            { label: "Total In", value: summary.total_credit, color: "text-success-600" },
            { label: "Total Out", value: summary.total_debit, color: "text-danger-500" },
            { label: "Net Flow", value: summary.net, color: summary.net >= 0 ? "text-success-600" : "text-danger-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-default-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-default-400 mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{fmt(value, cur)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Monthly chart (simple bars) */}
      {summary && summary.monthly.length > 0 && (
        <div className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-4">Monthly Cash Flow</p>
          <div className="flex items-end gap-2 h-32 overflow-x-auto pb-2">
            {summary.monthly.map((m) => {
              const maxVal = Math.max(...summary.monthly.map((x) => Math.max(x.credit, x.debit)), 1);
              const creditH = Math.max((m.credit / maxVal) * 100, 2);
              const debitH = Math.max((m.debit / maxVal) * 100, 2);
              const [year, mo] = m.month.split("-");
              return (
                <div key={m.month} className="flex flex-col items-center gap-1 min-w-[48px] group relative">
                  <div className="flex items-end gap-0.5 h-28">
                    <div className="w-4 bg-success-400 rounded-t transition-all" style={{ height: `${creditH}%` }} title={`In: ${fmt(m.credit, cur)}`} />
                    <div className="w-4 bg-danger-400 rounded-t transition-all" style={{ height: `${debitH}%` }} title={`Out: ${fmt(m.debit, cur)}`} />
                  </div>
                  <span className="text-xs text-default-400 whitespace-nowrap">{MONTHS[parseInt(mo) - 1]}</span>
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 bg-default-900 text-white text-xs rounded-lg px-2 py-1.5 hidden group-hover:block whitespace-nowrap z-10 shadow-lg">
                    <p className="text-success-300">In: {fmt(m.credit, cur)}</p>
                    <p className="text-danger-300">Out: {fmt(m.debit, cur)}</p>
                    <p className={m.net >= 0 ? "text-success-300" : "text-danger-300"}>Net: {fmt(m.net, cur)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-success-400" /><span className="text-xs text-default-400">Credit (In)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-danger-400" /><span className="text-xs text-default-400">Debit (Out)</span></div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-default-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-default-500 block mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-default-500 block mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-default-500 block mb-1">Type</label>
            <select value={txnType} onChange={(e) => setTxnType(e.target.value)}
              className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary">
              <option value="">All</option>
              <option value="credit">Credit (In)</option>
              <option value="debit">Debit (Out)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-default-500 block mb-1">Category</label>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value ? Number(e.target.value) : "")}
              className="text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary">
              <option value="">All</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-default-500 block mb-1">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description or party…"
              className="w-full text-sm border border-default-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary" />
          </div>
          {(dateFrom || dateTo || txnType || catFilter || search) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); setTxnType(""); setCatFilter(""); setSearch(""); }}
              className="text-xs text-default-400 hover:text-danger-500 py-1.5">Clear</button>
          )}
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white border border-default-200 rounded-2xl shadow-sm overflow-hidden">
        {txnsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTxns.length === 0 ? (
          <div className="text-center py-12 text-default-400 text-sm">
            No transactions found. Upload a statement or add one manually.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-default-50 border-b border-default-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-default-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-default-500">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-default-500">Party</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-default-500">Remarks</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-default-500">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-success-600">Money In</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-danger-500">Money Out</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((txn) => (
                  <tr key={txn.id} className="border-t border-default-100 hover:bg-default-50/50 transition-colors">
                    <td className="px-4 py-3 text-default-600 whitespace-nowrap text-xs">{txn.txn_date}</td>
                    <td className="px-4 py-3 text-foreground">
                      <p className="whitespace-normal break-words">{txn.description}</p>
                    </td>
                    <td className="px-4 py-3 text-default-500 text-xs whitespace-normal break-words">{txn.party_name ?? "—"}</td>
                    <td className="px-4 py-3 text-default-500 text-xs whitespace-normal break-words">{txn.note ?? "—"}</td>
                    <td className="px-4 py-3">
                      {txn.categories && txn.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {txn.categories.map((cat) => (
                            <span key={cat.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: `${cat.color}35`, color: "#1f2937" }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-default-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-success-600">
                      {txn.type === "credit" ? fmt(txn.amount, cur) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-danger-500">
                      {txn.type === "debit" ? fmt(txn.amount, cur) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setDrawerTxn(txn)}
                          className="px-2 py-1 rounded-lg text-xs text-default-500 hover:bg-default-100 transition-colors">Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {summary && summary.categories.length > 0 && (
        <div className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-4">Breakdown by Category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {["income", "expense"].map((t) => {
              const cats = summary.categories.filter((c) => c.type === t);
              if (cats.length === 0) return null;
              const total = cats.reduce((s, c) => s + c.total, 0);
              return (
                <div key={t}>
                  <p className="text-xs font-medium text-default-500 uppercase tracking-wider mb-2">{t === "income" ? "Income" : "Expenses"}</p>
                  <div className="space-y-2">
                    {cats.map((c) => (
                      <div key={c.name}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="text-foreground">{c.name}</span>
                          </div>
                          <span className="font-medium text-foreground">{fmt(c.total, cur)}</span>
                        </div>
                        <div className="h-1.5 bg-default-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(c.total / total) * 100}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showUpload && <UploadModal accountId={accountId} onClose={() => setShowUpload(false)} />}
      {showAddTxn && (
        <TxnModal accountId={accountId} editing={null} categories={categories} onClose={() => setShowAddTxn(false)} />
      )}
      {editingTxn && (
        <TxnModal accountId={accountId} editing={editingTxn} categories={categories} onClose={() => setEditingTxn(null)} />
      )}
      {drawerTxn && (
        <EditDrawer
          txn={drawerTxn}
          categories={categories}
          unpaidInvoices={unpaidInvoices}
          unpaidBills={unpaidBills}
          onClose={() => setDrawerTxn(null)}
        />
      )}
      {showCats && <CategoryModal onClose={() => { setShowCats(false); qc.invalidateQueries({ queryKey: ["bank-cats"] }); }} />}
      </div>
    </div>
  );
}
