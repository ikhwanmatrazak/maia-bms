"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Textarea, Select, SelectItem, Spinner, Chip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { ArrowLeft, Save, Upload, Sparkles, CheckCircle, FileText, Paperclip, X } from "lucide-react";
import { billsApi } from "@/lib/api";
import { Bill } from "@/types";
import { Topbar } from "@/components/ui/Topbar";
import { formatDate, formatCurrency } from "@/lib/utils";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");
function fileUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

const STATUS_COLOR: Record<string, "warning" | "danger" | "success"> = {
  pending: "warning",
  overdue: "danger",
  paid: "success",
};

interface BillForm {
  vendor_name: string;
  vendor_address: string;
  vendor_email: string;
  vendor_phone: string;
  vendor_reg_no: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  bill_number: string;
  description: string;
  issue_date: string;
  due_date: string;
  amount: string;
  currency: string;
  notes: string;
  file_url: string;
}

function billToForm(bill: Bill): BillForm {
  return {
    vendor_name: bill.vendor_name ?? "",
    vendor_address: bill.vendor_address ?? "",
    vendor_email: bill.vendor_email ?? "",
    vendor_phone: bill.vendor_phone ?? "",
    vendor_reg_no: bill.vendor_reg_no ?? "",
    bank_name: bill.bank_name ?? "",
    bank_account_no: bill.bank_account_no ?? "",
    bank_account_name: bill.bank_account_name ?? "",
    bill_number: bill.bill_number ?? "",
    description: bill.description ?? "",
    issue_date: bill.issue_date ? bill.issue_date.split("T")[0] : "",
    due_date: bill.due_date ? bill.due_date.split("T")[0] : "",
    amount: bill.amount != null ? String(bill.amount) : "",
    currency: bill.currency ?? "MYR",
    notes: bill.notes ?? "",
    file_url: bill.file_url ?? "",
  };
}

export default function BillDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BillForm | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [extractError, setExtractError] = useState("");
  const [markPaidModal, setMarkPaidModal] = useState(false);
  const [payRef, setPayRef] = useState("");
  const [payReceipt, setPayReceipt] = useState<File | null>(null);
  const payReceiptRef = useRef<HTMLInputElement>(null);

  const { data: bill, isLoading } = useQuery<Bill>({
    queryKey: ["bills", id],
    queryFn: () => billsApi.get(Number(id)),
  });

  useEffect(() => {
    if (bill && !form) {
      setForm(billToForm(bill));
    }
  }, [bill]);

  const set = (key: keyof BillForm, val: string) =>
    setForm((prev) => prev ? { ...prev, [key]: val } : prev);

  const analyzeMutation = useMutation({
    mutationFn: (file: File) => billsApi.analyze(file),
    onSuccess: (data) => {
      setExtractError("");
      setForm((prev) => prev ? {
        ...prev,
        vendor_name: data.vendor_name ?? prev.vendor_name,
        vendor_address: data.vendor_address ?? prev.vendor_address,
        vendor_email: data.vendor_email ?? prev.vendor_email,
        vendor_phone: data.vendor_phone ?? prev.vendor_phone,
        vendor_reg_no: data.vendor_reg_no ?? prev.vendor_reg_no,
        bank_name: data.bank_name ?? prev.bank_name,
        bank_account_no: data.bank_account_no ?? prev.bank_account_no,
        bank_account_name: data.bank_account_name ?? prev.bank_account_name,
        bill_number: data.bill_number ?? prev.bill_number,
        description: data.description ?? prev.description,
        issue_date: data.issue_date ?? prev.issue_date,
        due_date: data.due_date ?? prev.due_date,
        amount: data.amount != null ? String(data.amount) : prev.amount,
        currency: data.currency ?? prev.currency,
        file_url: data.file_url ?? prev.file_url,
      } : prev);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setExtractError(err?.response?.data?.detail ?? "Extraction failed.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) => billsApi.update(Number(id), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      router.push("/bills");
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => billsApi.markPaid(Number(id), payRef || undefined, payReceipt ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills", id] });
      setMarkPaidModal(false);
      setPayRef("");
      setPayReceipt(null);
    },
  });

  const handleFile = (file: File) => {
    setFileName(file.name);
    analyzeMutation.mutate(file);
  };

  const handleSave = () => {
    if (!form) return;
    saveMutation.mutate({
      ...form,
      amount: form.amount ? Number(form.amount) : null,
      issue_date: form.issue_date ? new Date(form.issue_date).toISOString() : null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    });
  };

  if (isLoading || !form) {
    return (
      <div>
        <Topbar title="Bill Details" />
        <div className="flex justify-center items-center h-64">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title="Bill Details" />
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.push("/bills")}
            className="flex items-center gap-1.5 text-sm text-default-500 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} /> Back to Bills
          </button>
          <div className="flex items-center gap-2">
            {bill && (
              <Chip size="sm" color={STATUS_COLOR[bill.status]} variant="flat" className="capitalize">
                {bill.status}
              </Chip>
            )}
            {bill?.status !== "paid" && (
              <Button
                size="sm"
                color="success"
                variant="flat"
                startContent={<CheckCircle size={14} />}
                onPress={() => setMarkPaidModal(true)}
              >
                Mark Paid
              </Button>
            )}
            {bill?.paid_at && (
              <span className="text-xs text-default-400">
                Paid {formatDate(bill.paid_at)}
              </span>
            )}
          </div>
        </div>

        {/* Summary card if paid */}
        {bill?.status === "paid" && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-success-50 border border-success-100 text-sm flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-success-700 font-medium">
                Paid {bill.paid_at ? formatDate(bill.paid_at) : ""}
              </span>
              {bill.payment_reference && (
                <span className="text-success-600 ml-2">· Ref: {bill.payment_reference}</span>
              )}
              <span className="text-success-700 font-semibold ml-2">
                {bill.amount != null ? formatCurrency(bill.amount, bill.currency) : ""}
              </span>
            </div>
            {bill.payment_receipt_url && (
              <a
                href={fileUrl(bill.payment_receipt_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-success-700 hover:text-success-800 text-xs font-medium"
              >
                <Paperclip size={13} /> View Receipt
              </a>
            )}
          </div>
        )}

        {/* File Upload / Replace */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors mb-6 ${
            dragOver ? "border-primary bg-primary-50" : "border-default-200 hover:border-primary-300 hover:bg-default-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {analyzeMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Spinner size="md" color="primary" />
              <p className="text-sm text-default-500">Reading invoice...</p>
            </div>
          ) : form.file_url ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-default-600">
                <FileText size={16} className="text-primary" />
                <a
                  href={fileUrl(form.file_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary hover:underline"
                >
                  View attached file
                </a>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-default-400">
                <Upload size={12} />
                {fileName ? fileName : "Drop to replace file"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={18} className="text-default-400" />
              <p className="text-sm text-default-500">
                {fileName ? fileName : "Drop invoice here to re-extract or attach file"}
              </p>
            </div>
          )}
          {fileName && !analyzeMutation.isPending && (
            <div className="flex items-center justify-center gap-1.5 text-success-600 text-xs mt-2">
              <Sparkles size={12} /> Extraction complete — review & edit below
            </div>
          )}
        </div>

        {extractError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-danger-50 text-danger-700 text-sm">
            {extractError}
          </div>
        )}

        {/* Form */}
        <div className="space-y-5">
          <p className="text-sm font-semibold text-default-600 uppercase tracking-wide">
            Vendor Information
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input variant="bordered" label="Vendor Name" value={form.vendor_name}
              onChange={(e) => set("vendor_name", e.target.value)} />
            <Input variant="bordered" label="Vendor Reg. No." value={form.vendor_reg_no}
              onChange={(e) => set("vendor_reg_no", e.target.value)} />
            <Input variant="bordered" label="Vendor Email" value={form.vendor_email}
              onChange={(e) => set("vendor_email", e.target.value)} />
            <Input variant="bordered" label="Vendor Phone" value={form.vendor_phone}
              onChange={(e) => set("vendor_phone", e.target.value)} />
          </div>
          <Textarea variant="bordered" label="Vendor Address" value={form.vendor_address}
            onChange={(e) => set("vendor_address", e.target.value)} minRows={2} />

          <p className="text-sm font-semibold text-default-600 uppercase tracking-wide pt-2">
            Bank Details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input variant="bordered" label="Bank Name" value={form.bank_name}
              onChange={(e) => set("bank_name", e.target.value)} />
            <Input variant="bordered" label="Account No." value={form.bank_account_no}
              onChange={(e) => set("bank_account_no", e.target.value)} />
            <Input variant="bordered" label="Account Holder Name" value={form.bank_account_name}
              onChange={(e) => set("bank_account_name", e.target.value)} className="sm:col-span-2" />
          </div>

          <p className="text-sm font-semibold text-default-600 uppercase tracking-wide pt-2">
            Bill Details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input variant="bordered" label="Bill / Invoice No." value={form.bill_number}
              onChange={(e) => set("bill_number", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input variant="bordered" label="Amount" type="number" step="0.01"
                value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              <Select variant="bordered" label="Currency"
                selectedKeys={[form.currency]}
                onSelectionChange={(k) => set("currency", Array.from(k)[0] as string)}>
                {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
              </Select>
            </div>
            <Input variant="bordered" label="Issue Date" type="date" value={form.issue_date}
              onChange={(e) => set("issue_date", e.target.value)} />
            <Input variant="bordered" label="Due Date" type="date" value={form.due_date}
              onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <Textarea variant="bordered" label="Description" value={form.description}
            onChange={(e) => set("description", e.target.value)} minRows={3} />
          <Textarea variant="bordered" label="Notes" value={form.notes}
            onChange={(e) => set("notes", e.target.value)} minRows={2} />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="flat" onPress={() => router.push("/bills")}>Cancel</Button>
          <Button
            color="primary"
            startContent={<Save size={15} />}
            isLoading={saveMutation.isPending}
            onPress={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Mark Paid Modal */}
      <Modal isOpen={markPaidModal} onClose={() => setMarkPaidModal(false)}>
        <ModalContent>
          <ModalHeader>Mark as Paid</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-3">
              Mark <strong>{form.vendor_name}</strong> —{" "}
              <strong>{form.amount ? formatCurrency(Number(form.amount), form.currency) : ""}</strong>{" "}
              as paid?
            </p>
            <Textarea
              variant="bordered"
              label="Payment Reference (optional)"
              placeholder="e.g. bank transfer ref, cheque no."
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              minRows={2}
            />
            {/* Payment receipt file */}
            <input
              ref={payReceiptRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => setPayReceipt(e.target.files?.[0] ?? null)}
            />
            {payReceipt ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-success-50 border border-success-100 text-sm mt-1">
                <div className="flex items-center gap-2 text-success-700">
                  <Paperclip size={14} />
                  <span className="truncate max-w-[260px]">{payReceipt.name}</span>
                </div>
                <button onClick={() => setPayReceipt(null)} className="text-default-400 hover:text-danger ml-2">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => payReceiptRef.current?.click()}
                className="flex items-center gap-2 text-sm text-default-500 hover:text-primary transition-colors mt-1 px-1"
              >
                <Paperclip size={14} />
                Attach payment receipt (optional)
              </button>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setMarkPaidModal(false); setPayReceipt(null); }}>Cancel</Button>
            <Button
              color="success"
              isLoading={markPaidMutation.isPending}
              onPress={() => markPaidMutation.mutate()}
            >
              Confirm Paid
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
