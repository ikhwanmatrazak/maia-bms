"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  bankApi, invoicesApi, BankTransaction, BankStatement, TxnCategory, ParsedRow,
  UnpaidInvoice, UnpaidBill, downloadPdf, downloadFile,
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
  onClose,
}: {
  txn: BankTransaction;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [invIds, setInvIds] = useState<number[]>(
    txn.invoices?.map((i) => i.id) ?? (txn.invoice_id ? [txn.invoice_id] : [])
  );

  const { data: filteredInvoices = [] } = useQuery({
    queryKey: ["bank-unpaid-inv", txn.id],
    queryFn: () => bankApi.listUnpaidInvoices(txn.id),
  });

  const mut = useMutation({
    mutationFn: () => bankApi.updateTransaction(txn.id, { invoice_ids: invIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-txns", txn.account_id] });
      qc.invalidateQueries({ queryKey: ["bank-summary", txn.account_id] });
      onClose();
    },
  });

  const allOptions = filteredInvoices;

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
          <div className="border border-default-200 rounded-lg overflow-hidden divide-y divide-default-100 max-h-52 overflow-y-auto">
            {allOptions.length === 0 ? (
              <p className="text-xs text-default-400 p-3">No invoices available.</p>
            ) : allOptions.map((inv) => (
              <label key={inv.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-default-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={invIds.includes(inv.id)}
                  onChange={(e) => setInvIds(prev => e.target.checked ? [...prev, inv.id] : prev.filter(id => id !== inv.id))}
                  className="accent-primary"
                />
                <span className="text-sm flex-1 min-w-0">
                  <span className="font-medium text-foreground">{inv.invoice_number}</span>
                  {"client_name" in inv && <span className="text-default-400"> — {inv.client_name}</span>}
                  {"balance_due" in inv && (inv as any).balance_due > 0 && (
                    <span className="text-default-400"> ({fmt((inv as any).balance_due)})</span>
                  )}
                </span>
                {invIds.includes(inv.id) && (
                  <button
                    type="button"
                    onClick={async (e) => { e.stopPropagation(); const { getAccessToken } = await import("@/lib/auth"); const r = await fetch(`/api/v1/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${getAccessToken()}` } }); const blob = await r.blob(); window.open(URL.createObjectURL(blob), "_blank"); }}
                    className="text-xs text-primary hover:underline shrink-0">
                    View
                  </button>
                )}
              </label>
            ))}
          </div>
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

// ── Import Invoice PDF modal ──────────────────────────────────────────────────

function ImportInvoiceModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ invoice_id: number; invoice_number: string; client_name: string; total: number; items_count: number } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const res = await invoicesApi.uploadPdf(file);
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to parse PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Import Invoice PDF</h2>
          <button onClick={onClose} className="text-default-400 hover:text-default-600 text-xl leading-none">&times;</button>
        </div>

        {!result ? (
          <>
            <p className="text-xs text-default-400">Upload an invoice PDF to automatically create a draft invoice in the system. Client will be created if not found.</p>

            <div
              className="border-2 border-dashed border-default-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-default-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <svg className="w-8 h-8 text-default-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-default-500">Click to select invoice PDF</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />

            {error && <p className="text-xs text-danger-500 bg-danger-50 rounded-lg p-2">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium text-default-600">Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Import & Create Draft"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-success-50 border border-success-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-success-600 text-lg">✓</span>
                <p className="text-sm font-semibold text-success-700">Invoice Created as Draft</p>
              </div>
              <div className="text-xs space-y-1 text-default-600">
                <p><span className="text-default-400">Invoice No:</span> <span className="font-medium">{result.invoice_number}</span></p>
                <p><span className="text-default-400">Client:</span> <span className="font-medium">{result.client_name}</span></p>
                <p><span className="text-default-400">Total:</span> <span className="font-medium">MYR {result.total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span></p>
                <p><span className="text-default-400">Line Items:</span> <span className="font-medium">{result.items_count}</span></p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium">Close</button>
              <a
                href={`/invoices/${result.invoice_id}`}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium text-center hover:bg-primary/90"
              >
                View Invoice
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null);

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
      const res = await bankApi.confirmStatement(accountId, file);
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-statements", accountId] });
      setImportResult({ inserted: res.inserted ?? 0, skipped: res.skipped ?? 0 });
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
            <p className="font-semibold text-foreground">Import complete!</p>
            {importResult && (
              <div className="text-sm text-center space-y-1">
                <p className="text-success-600 font-medium">{importResult.inserted} new transaction{importResult.inserted !== 1 ? "s" : ""} added</p>
                {importResult.skipped > 0 && (
                  <p className="text-default-400">{importResult.skipped} already existed — skipped</p>
                )}
              </div>
            )}
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
  txn, categories, unpaidBills, onClose,
}: {
  txn: BankTransaction;
  categories: TxnCategory[];
  unpaidBills: UnpaidBill[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(txn.description ?? "");
  const [partyName, setPartyName] = useState(txn.party_name ?? "");
  const [catIds, setCatIds] = useState<number[]>(txn.categories?.map((c) => c.id) ?? (txn.category_id ? [txn.category_id] : []));
  const [invIds, setInvIds] = useState<number[]>(txn.invoices?.map((i) => i.id) ?? (txn.invoice_id ? [txn.invoice_id] : []));
  const [billId, setBillId] = useState<number | null>(txn.bill_id);

  const { data: filteredInvoices = [] } = useQuery({
    queryKey: ["bank-unpaid-inv", txn.id],
    queryFn: () => bankApi.listUnpaidInvoices(txn.id),
    enabled: txn.type === "credit",
  });
  const [note, setNote] = useState(txn.note ?? "");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(txn.receipt_url);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: () => bankApi.updateTransaction(txn.id, {
      description, party_name: partyName,
      category_ids: catIds, invoice_ids: invIds, bill_id: billId, note,
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
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-2">
              Link to Invoice <span className="text-success-600 font-normal">(marks as Paid)</span>
            </label>
            <div className="border border-default-200 rounded-lg overflow-hidden divide-y divide-default-100 max-h-44 overflow-y-auto">
              {filteredInvoices.length === 0 ? (
                <p className="text-xs text-default-400 p-2">No invoices available.</p>
              ) : filteredInvoices.map((inv) => (
                <label key={inv.id} className="flex items-center gap-2 px-3 py-2 hover:bg-default-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invIds.includes(inv.id)}
                    onChange={(e) => setInvIds(prev => e.target.checked ? [...prev, inv.id] : prev.filter(id => id !== inv.id))}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground flex-1 min-w-0">
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-default-400"> — {inv.client_name} [{inv.status ?? ""}] ({fmt(inv.total)})</span>
                  </span>
                  {invIds.includes(inv.id) && (
                    <button
                      type="button"
                      onClick={async (e) => { e.stopPropagation(); const { getAccessToken } = await import("@/lib/auth"); const r = await fetch(`/api/v1/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${getAccessToken()}` } }); const blob = await r.blob(); window.open(URL.createObjectURL(blob), "_blank"); }}
                      className="text-xs text-primary hover:underline shrink-0">
                      View
                    </button>
                  )}
                </label>
              ))}
            </div>
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
  const [form, setForm] = useState({ name: "", type: "expense" as "income" | "expense", color: "#6366f1", cost_type: "opex" as "opex" | "cogs" });
  const [editId, setEditId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: bankApi.createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-cats"] }); setForm({ name: "", type: "expense", color: "#6366f1", cost_type: "opex" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof form }) => bankApi.updateCategory(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-cats"] }); setEditId(null); setForm({ name: "", type: "expense", color: "#6366f1", cost_type: "opex" }); },
  });
  const deleteMut = useMutation({
    mutationFn: bankApi.deleteCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-cats"] }),
  });

  const openEdit = (c: TxnCategory) => {
    setEditId(c.id);
    setForm({ name: c.name, type: c.type as "income" | "expense", color: c.color, cost_type: (c.cost_type ?? "opex") as "opex" | "cogs" });
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
          {form.type === "expense" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-default-500">P&amp;L Classification:</span>
              {(["opex", "cogs"] as const).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, cost_type: ct }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    form.cost_type === ct
                      ? ct === "cogs"
                        ? "bg-orange-100 border-orange-400 text-orange-700 font-semibold"
                        : "bg-blue-100 border-blue-400 text-blue-700 font-semibold"
                      : "border-default-200 text-default-400"
                  }`}
                >
                  {ct === "cogs" ? "COGS" : "Operating Expense"}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ name: "", type: "expense", color: "#6366f1", cost_type: "opex" }); }}
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
                      {c.type === "expense" && c.cost_type === "cogs" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">COGS</span>
                      )}
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
  const [showImportInv, setShowImportInv] = useState(false);
  const [editingTxn, setEditingTxn] = useState<BankTransaction | null>(null);
  const [drawerTxn, setDrawerTxn] = useState<BankTransaction | null>(null);
  const [showCats, setShowCats] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [txnType, setTxnType] = useState("");
  const [catFilter, setCatFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [reportLoading, setReportLoading] = useState<"pdf" | "excel" | null>(null);

  // Chart controls
  const [chartView, setChartView] = useState<"monthly" | "yearly">("monthly");
  const [chartYear, setChartYear] = useState<string>("all");

  const handleReportDownload = async (format: "pdf" | "excel") => {
    setReportLoading(format);
    const params = { date_from: dateFrom || undefined, date_to: dateTo || undefined, type: txnType || undefined, category_id: catFilter || undefined, search: search || undefined };
    const url = bankApi.accountReportUrl(accountId, params, format);
    const filename = `report_${account?.name || accountId}_${dateFrom || "all"}_${dateTo || "all"}.${format === "pdf" ? "pdf" : "xlsx"}`.replace(/\s+/g, "_");
    try {
      if (format === "pdf") await downloadPdf(url, filename);
      else await downloadFile(url, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } finally {
      setReportLoading(null);
    }
  };

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

  // Unfiltered summary just for year list
  const { data: summaryAll } = useQuery({
    queryKey: ["bank-summary-all", accountId],
    queryFn: () => bankApi.getSummary(accountId, {}),
    enabled: !!accountId,
  });
  const availableYears = useMemo(() => {
    if (!summaryAll?.monthly) return [] as string[];
    return [...new Set(summaryAll.monthly.map((m) => m.month.split("-")[0]))].sort().reverse() as string[];
  }, [summaryAll]);

  const { data: categories = [] } = useQuery({ queryKey: ["bank-cats"], queryFn: bankApi.listCategories });
  const { data: unpaidInvoices = [] } = useQuery({ queryKey: ["bank-unpaid-inv"], queryFn: bankApi.listUnpaidInvoices });
  const { data: unpaidBills = [] } = useQuery({ queryKey: ["bank-unpaid-bills"], queryFn: bankApi.listUnpaidBills });

  const { data: statements = [] } = useQuery({
    queryKey: ["bank-statements", accountId],
    queryFn: () => bankApi.listStatements(accountId),
    enabled: !!accountId,
  });

  const deleteStmtMut = useMutation({
    mutationFn: (stmtId: number) => bankApi.deleteStatement(accountId, stmtId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-statements", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-txns", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-summary", accountId] });
      qc.invalidateQueries({ queryKey: ["bank-summary-all", accountId] });
    },
  });

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
          <button onClick={() => setShowImportInv(true)}
            className="px-3 py-1.5 rounded-xl border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50">
            Import Invoice PDF
          </button>
          <button onClick={() => setShowUpload(true)}
            className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90">
            Upload Statement
          </button>
        </div>
      </div>

      {/* Year selector */}
      {availableYears.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-default-400 font-medium">Year:</span>
          {(["all", ...availableYears] as string[]).map((yr) => {
            const isActive = yr === "all"
              ? !dateFrom && !dateTo
              : dateFrom === `${yr}-01-01` && dateTo === `${yr}-12-31`;
            return (
              <button
                key={yr}
                onClick={() => {
                  if (yr === "all") { setDateFrom(""); setDateTo(""); }
                  else { setDateFrom(`${yr}-01-01`); setDateTo(`${yr}-12-31`); }
                }}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  isActive
                    ? "bg-primary text-white border-primary font-semibold"
                    : "border-default-200 text-default-500 hover:border-primary hover:text-primary"
                }`}
              >
                {yr === "all" ? "All Time" : yr}
              </button>
            );
          })}
        </div>
      )}

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

      {/* Cash Flow Chart */}
      {summary && summary.monthly.length > 0 && (() => {
        // Derive unique years from monthly data
        const availableYears = [...new Set(summary.monthly.map((m) => m.month.split("-")[0]))].sort();

        // Monthly view: filter by selected year
        const monthlyData = chartView === "monthly"
          ? (chartYear === "all" ? summary.monthly : summary.monthly.filter((m) => m.month.startsWith(chartYear)))
          : [];

        // Yearly view: aggregate credit/debit per year
        const yearlyData = chartView === "yearly"
          ? availableYears.map((yr) => {
              const rows = summary.monthly.filter((m) => m.month.startsWith(yr));
              const credit = rows.reduce((s, r) => s + r.credit, 0);
              const debit  = rows.reduce((s, r) => s + r.debit, 0);
              return { year: yr, credit, debit, net: credit - debit };
            })
          : [];

        const chartData = chartView === "monthly" ? monthlyData : yearlyData;
        const maxVal = Math.max(...chartData.map((x) => Math.max(x.credit, x.debit)), 1);

        return (
          <div className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-sm font-semibold text-foreground">
                {chartView === "monthly" ? "Monthly Cash Flow" : "Yearly Cash Flow"}
              </p>
              <div className="flex items-center gap-2">
                {/* Monthly / Yearly toggle */}
                <div className="flex rounded-lg border border-default-200 overflow-hidden text-xs">
                  <button
                    onClick={() => { setChartView("monthly"); }}
                    className={`px-3 py-1.5 transition-colors ${chartView === "monthly" ? "bg-primary text-white" : "text-default-500 hover:bg-default-100"}`}
                  >Monthly</button>
                  <button
                    onClick={() => { setChartView("yearly"); setChartYear("all"); setDateFrom(""); setDateTo(""); }}
                    className={`px-3 py-1.5 transition-colors ${chartView === "yearly" ? "bg-primary text-white" : "text-default-500 hover:bg-default-100"}`}
                  >Yearly</button>
                </div>
                {/* Year selector — only shown in monthly view */}
                {chartView === "monthly" && (
                  <select
                    value={chartYear}
                    onChange={(e) => {
                      const yr = e.target.value;
                      setChartYear(yr);
                      if (yr === "all") {
                        setDateFrom("");
                        setDateTo("");
                      } else {
                        setDateFrom(`${yr}-01-01`);
                        setDateTo(`${yr}-12-31`);
                      }
                    }}
                    className="text-xs border border-default-200 rounded-lg px-2 py-1.5 outline-none focus:border-primary"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Bars */}
            <div className="flex items-end gap-2 h-32 overflow-x-auto pb-2">
              {chartView === "monthly" && monthlyData.map((m) => {
                const creditH = Math.max((m.credit / maxVal) * 100, 2);
                const debitH  = Math.max((m.debit  / maxVal) * 100, 2);
                const [yr, mo] = m.month.split("-");
                return (
                  <div key={m.month} className="flex flex-col items-center gap-1 min-w-[48px] group relative">
                    <div className="flex items-end gap-0.5 h-28">
                      <div className="w-4 bg-success-400 rounded-t transition-all" style={{ height: `${creditH}%` }} title={`In: ${fmt(m.credit, cur)}`} />
                      <div className="w-4 bg-danger-400 rounded-t transition-all" style={{ height: `${debitH}%` }} title={`Out: ${fmt(m.debit, cur)}`} />
                    </div>
                    <span className="text-xs text-default-400 whitespace-nowrap">
                      {MONTHS[parseInt(mo) - 1]}{chartYear === "all" ? ` '${yr.slice(2)}` : ""}
                    </span>
                    <div className="absolute bottom-full mb-2 bg-default-900 text-white text-xs rounded-lg px-2 py-1.5 hidden group-hover:block whitespace-nowrap z-10 shadow-lg">
                      <p className="font-medium mb-0.5">{MONTHS[parseInt(mo) - 1]} {yr}</p>
                      <p className="text-success-300">In: {fmt(m.credit, cur)}</p>
                      <p className="text-danger-300">Out: {fmt(m.debit, cur)}</p>
                      <p className={m.net >= 0 ? "text-success-300" : "text-danger-300"}>Net: {fmt(m.net, cur)}</p>
                    </div>
                  </div>
                );
              })}
              {chartView === "yearly" && yearlyData.map((y) => {
                const creditH = Math.max((y.credit / maxVal) * 100, 2);
                const debitH  = Math.max((y.debit  / maxVal) * 100, 2);
                return (
                  <div key={y.year} className="flex flex-col items-center gap-1 min-w-[64px] group relative">
                    <div className="flex items-end gap-1 h-28">
                      <div className="w-6 bg-success-400 rounded-t transition-all" style={{ height: `${creditH}%` }} title={`In: ${fmt(y.credit, cur)}`} />
                      <div className="w-6 bg-danger-400 rounded-t transition-all" style={{ height: `${debitH}%` }} title={`Out: ${fmt(y.debit, cur)}`} />
                    </div>
                    <span className="text-xs text-default-400 whitespace-nowrap">{y.year}</span>
                    <div className="absolute bottom-full mb-2 bg-default-900 text-white text-xs rounded-lg px-2 py-1.5 hidden group-hover:block whitespace-nowrap z-10 shadow-lg">
                      <p className="font-medium mb-0.5">{y.year}</p>
                      <p className="text-success-300">In: {fmt(y.credit, cur)}</p>
                      <p className="text-danger-300">Out: {fmt(y.debit, cur)}</p>
                      <p className={y.net >= 0 ? "text-success-300" : "text-danger-300"}>Net: {fmt(y.net, cur)}</p>
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
        );
      })()}

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
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleReportDownload("pdf")}
              disabled={reportLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a2e] text-white text-xs font-medium hover:bg-[#252540] disabled:opacity-50 transition-colors"
            >
              {reportLoading === "pdf" ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>}
              PDF
            </button>
            <button
              onClick={() => handleReportDownload("excel")}
              disabled={reportLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-600 text-white text-xs font-medium hover:bg-success-700 disabled:opacity-50 transition-colors"
            >
              {reportLoading === "excel" ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>}
              Excel
            </button>
          </div>
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
                              {cat.cost_type === "cogs" && (
                                <span className="ml-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-orange-100 text-orange-700">COGS</span>
                              )}
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

      {/* Uploaded Statements */}
      {statements.length > 0 && (
        <div className="bg-white border border-default-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-4">Uploaded Statements</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-default-200">
                <tr>
                  <th className="text-left pb-2 text-xs font-medium text-default-500">Period</th>
                  <th className="text-left pb-2 text-xs font-medium text-default-500">File</th>
                  <th className="text-right pb-2 text-xs font-medium text-default-500">Transactions</th>
                  <th className="text-right pb-2 text-xs font-medium text-default-500">Uploaded</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {statements.map((stmt) => {
                  const displayName = stmt.filename
                    .replace(/\s*-\s*\d{14}(\.\w+)?$/, "")
                    .replace(/\.\w+$/, "");
                  const period = stmt.period_start && stmt.period_end
                    ? stmt.period_start.slice(0, 7) === stmt.period_end.slice(0, 7)
                      ? new Date(stmt.period_start + "T00:00:00").toLocaleDateString("en-MY", { month: "short", year: "numeric" })
                      : `${new Date(stmt.period_start + "T00:00:00").toLocaleDateString("en-MY", { month: "short", year: "numeric" })} – ${new Date(stmt.period_end + "T00:00:00").toLocaleDateString("en-MY", { month: "short", year: "numeric" })}`
                    : "—";
                  const uploadedAt = new Date(stmt.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <tr key={stmt.id} className="group">
                      <td className="py-2.5 pr-4 text-default-600 whitespace-nowrap text-xs">{period}</td>
                      <td className="py-2.5 pr-4 text-foreground text-xs max-w-xs truncate">
                        {stmt.file_url ? (
                          <a href={`${STATIC_BASE}${stmt.file_url}`} target="_blank" rel="noreferrer"
                            className="hover:text-primary hover:underline" title={stmt.filename}>
                            {displayName}
                          </a>
                        ) : displayName}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-xs text-default-500">{stmt.tx_count}</td>
                      <td className="py-2.5 pr-4 text-right text-xs text-default-400 whitespace-nowrap">{uploadedAt}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${displayName}"?\n\nThis will permanently remove ${stmt.tx_count} transactions.`))
                              deleteStmtMut.mutate(stmt.id);
                          }}
                          disabled={deleteStmtMut.isPending}
                          className="text-xs text-danger-500 hover:text-danger-700 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showImportInv && <ImportInvoiceModal onClose={() => setShowImportInv(false)} />}
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
          unpaidBills={unpaidBills}
          onClose={() => setDrawerTxn(null)}
        />
      )}
      {showCats && <CategoryModal onClose={() => { setShowCats(false); qc.invalidateQueries({ queryKey: ["bank-cats"] }); }} />}
      </div>
    </div>
  );
}
