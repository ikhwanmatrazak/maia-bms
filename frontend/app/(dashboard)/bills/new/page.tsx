"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Button, Input, Textarea, Select, SelectItem, Spinner,
} from "@heroui/react";
import { Upload, Sparkles, ArrowLeft, Save } from "lucide-react";
import { billsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

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

const EMPTY: BillForm = {
  vendor_name: "", vendor_address: "", vendor_email: "", vendor_phone: "",
  vendor_reg_no: "", bank_name: "", bank_account_no: "", bank_account_name: "",
  bill_number: "", description: "", issue_date: "", due_date: "",
  amount: "", currency: "MYR", notes: "", file_url: "",
};

export default function NewBillPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BillForm>(EMPTY);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [extractError, setExtractError] = useState("");

  const set = (key: keyof BillForm, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const analyzeMutation = useMutation({
    mutationFn: (file: File) => billsApi.analyze(file),
    onSuccess: (data) => {
      setExtractError("");
      setForm((prev) => ({
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
      }));
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setExtractError(err?.response?.data?.detail ?? "AI extraction failed. Please fill in manually.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) => billsApi.create(payload),
    onSuccess: () => router.push("/bills"),
  });

  const handleFile = (file: File) => {
    setFileName(file.name);
    analyzeMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...form,
      amount: form.amount ? Number(form.amount) : null,
      issue_date: form.issue_date ? new Date(form.issue_date).toISOString() : null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    });
  };

  return (
    <div>
      <Topbar title="Add Bill" />
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => router.push("/bills")}
          className="flex items-center gap-1.5 text-sm text-default-500 hover:text-foreground mb-5 transition-colors"
        >
          <ArrowLeft size={15} /> Back to Bills
        </button>

        {/* Upload Area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors mb-6 ${
            dragOver
              ? "border-primary bg-primary-50"
              : "border-default-200 hover:border-primary-300 hover:bg-default-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {analyzeMutation.isPending ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" color="primary" />
              <p className="text-sm text-default-500">
                AI is reading your invoice...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
                <Upload size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  {fileName ? fileName : "Drop invoice here or click to upload"}
                </p>
                <p className="text-sm text-default-400 mt-1">
                  JPEG, PNG, WebP or PDF · Max 10MB
                </p>
              </div>
              {fileName && !analyzeMutation.isPending && (
                <div className="flex items-center gap-1.5 text-success-600 text-sm">
                  <Sparkles size={14} />
                  AI extraction complete — review & edit below
                </div>
              )}
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
            onChange={(e) => set("description", e.target.value)} minRows={2} />
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
            Save Bill
          </Button>
        </div>
      </div>
    </div>
  );
}
