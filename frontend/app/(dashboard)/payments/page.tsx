"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Pagination, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Select, SelectItem, Chip,
} from "@heroui/react";
import { Plus, Eye, Upload, FileText, Download, ExternalLink } from "lucide-react";
import { paymentsApi, invoicesApi } from "@/lib/api";
import { Payment, Invoice } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const PAGE_SIZE = 10;
const thisMonth = new Date().toISOString().slice(0, 7);
const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"];
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");

function proofUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

function isPdf(url: string) {
  return url.toLowerCase().endsWith(".pdf");
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(thisMonth);

  // Add Payment modal
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({
    invoice_id: "",
    amount: "",
    currency: "MYR",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "bank_transfer",
    reference_number: "",
    notes: "",
    generate_receipt: true,
  });
  const [formError, setFormError] = useState("");

  // View modal
  const [viewPayment, setViewPayment] = useState<Payment | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const { data: summary } = useQuery({
    queryKey: ["payments-summary", month],
    queryFn: () => paymentsApi.summary(month),
  });

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["payments", search, page, month],
    queryFn: () => paymentsApi.list({ ...(search ? { search } : {}), month, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
  });

  const { data: openInvoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices-open"],
    queryFn: () => invoicesApi.list({ status: "sent,partial,overdue", limit: 200 }),
    enabled: addModal,
  });

  const recordMutation = useMutation({
    mutationFn: (data: object) => invoicesApi.recordPayment(Number(form.invoice_id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setAddModal(false);
      resetForm();
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail || "Failed to record payment"),
  });

  const uploadProofMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => paymentsApi.uploadProof(id, file),
    onSuccess: (updated: Payment) => {
      // Update viewPayment with new proof URL
      setViewPayment((prev) => prev ? { ...prev, proof_file_url: updated.proof_file_url } : prev);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const resetForm = () => {
    setForm({ invoice_id: "", amount: "", currency: "MYR", payment_date: new Date().toISOString().split("T")[0], payment_method: "bank_transfer", reference_number: "", notes: "", generate_receipt: true });
    setFormError("");
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    const inv = openInvoices.find((i) => String(i.id) === invoiceId);
    setForm((f) => ({
      ...f,
      invoice_id: invoiceId,
      amount: inv ? inv.balance_due : f.amount,
      currency: inv ? inv.currency : f.currency,
    }));
  };

  const handleSubmit = () => {
    if (!form.invoice_id) { setFormError("Please select an invoice"); return; }
    if (!form.amount || Number(form.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    setFormError("");
    recordMutation.mutate({
      amount: Number(form.amount),
      currency: form.currency,
      payment_date: new Date(form.payment_date).toISOString(),
      payment_method: form.payment_method,
      reference_number: form.reference_number || null,
      notes: form.notes || null,
      generate_receipt: form.generate_receipt,
    });
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewPayment) return;
    uploadProofMutation.mutate({ id: viewPayment.id, file });
    e.target.value = "";
  };

  return (
    <div>
      <Topbar title="Payments" />
      <div className="p-6">
        {/* Summary Bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Input
            type="month"
            size="sm"
            className="w-40"
            variant="bordered"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          {summary && (
            <>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success-50 text-sm">
                <span className="text-success-600">Total Received</span>
                <span className="font-semibold ml-1 text-success-700">{formatCurrency(summary.total_amount, "MYR")}</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
                <span className="text-default-500">{summary.count} payments</span>
              </div>
              {summary.by_method && Object.entries(summary.by_method).filter(([, v]) => (v as number) > 0).map(([m, v]) => (
                <div key={m} className="px-3 py-1.5 rounded-lg bg-default-50 text-sm capitalize">
                  <span className="text-default-500">{m.replace("_", " ")}</span>
                  <span className="font-medium ml-1">{v as number}</span>
                </div>
              ))}
            </>
          )}
          <div className="ml-auto">
            <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={() => { resetForm(); setAddModal(true); }}>
              Add Payment
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search by invoice number or client..."
            size="sm"
            className="w-full sm:w-64"
            variant="bordered"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Payments" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Invoice</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn>Reference</TableColumn>
            <TableColumn>Proof</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.payment_date)}</TableCell>
                <TableCell className="font-medium">{p.client_name || "—"}</TableCell>
                <TableCell>{p.invoice_number || `INV #${p.invoice_id}`}</TableCell>
                <TableCell className="font-medium text-success">{formatCurrency(p.amount, p.currency)}</TableCell>
                <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                <TableCell>{p.reference_number ?? "—"}</TableCell>
                <TableCell>
                  {p.proof_file_url ? (
                    <Chip size="sm" color="success" variant="flat">Attached</Chip>
                  ) : (
                    <Chip size="sm" color="default" variant="flat">None</Chip>
                  )}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="light" isIconOnly onPress={() => setViewPayment(p)} title="View">
                    <Eye size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (payments.length >= PAGE_SIZE ? 1 : 0)}
            page={page}
            onChange={setPage}
            size="sm"
            showControls
          />
        </div>
      </div>

      {/* Add Payment Modal */}
      <Modal isOpen={addModal} onClose={() => { setAddModal(false); resetForm(); }} size="md">
        <ModalContent>
          <ModalHeader>Record Payment</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              variant="bordered"
              label="Invoice *"
              placeholder="Select an invoice"
              selectedKeys={form.invoice_id ? [form.invoice_id] : []}
              onSelectionChange={(k) => handleInvoiceSelect(Array.from(k)[0] as string)}
            >
              {openInvoices.map((inv) => (
                <SelectItem key={String(inv.id)} textValue={`${inv.invoice_number} — ${inv.client_name}`}>
                  <div className="flex flex-col">
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-xs text-gray-400">{inv.client_name} · Balance: {formatCurrency(inv.balance_due, inv.currency)}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>

            <div className="flex gap-2">
              <Input
                variant="bordered"
                label="Amount *"
                type="number"
                step="0.01"
                className="flex-1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <Input
                variant="bordered"
                label="Currency"
                className="w-24"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </div>

            <Input
              variant="bordered"
              label="Payment Date *"
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            />

            <Select
              variant="bordered"
              label="Payment Method *"
              selectedKeys={[form.payment_method]}
              onSelectionChange={(k) => setForm({ ...form, payment_method: Array.from(k)[0] as string })}
            >
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
              ))}
            </Select>

            <Input
              variant="bordered"
              label="Reference Number"
              placeholder="Cheque no., transaction ID..."
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            />

            <Input
              variant="bordered"
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            {formError && <p className="text-danger text-sm">{formError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setAddModal(false); resetForm(); }}>Cancel</Button>
            <Button color="primary" isLoading={recordMutation.isPending} onPress={handleSubmit}>
              Record Payment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* View Payment Modal */}
      <Modal isOpen={!!viewPayment} onClose={() => setViewPayment(null)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            Payment Details
            {viewPayment?.receipt_id && (
              <Chip size="sm" variant="flat" color="primary">Receipt #{String(viewPayment.receipt_id).padStart(5, "0")}</Chip>
            )}
          </ModalHeader>
          <ModalBody className="gap-0">
            {viewPayment && (
              <div className="flex flex-col gap-6">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Invoice</p>
                    <p className="font-semibold">{viewPayment.invoice_number || `#${viewPayment.invoice_id}`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Client</p>
                    <p className="font-semibold">{viewPayment.client_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Amount Paid</p>
                    <p className="font-bold text-success text-base">{formatCurrency(viewPayment.amount, viewPayment.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Payment Date</p>
                    <p className="font-medium">{formatDate(viewPayment.payment_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Payment Method</p>
                    <Chip size="sm" variant="flat" color="secondary" className="capitalize">{viewPayment.payment_method.replace("_", " ")}</Chip>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Reference Number</p>
                    <p className="font-mono text-sm">{viewPayment.reference_number || "—"}</p>
                  </div>
                  {viewPayment.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Notes</p>
                      <p className="text-gray-700">{viewPayment.notes}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Recorded On</p>
                    <p className="text-gray-500">{formatDate(viewPayment.created_at)}</p>
                  </div>
                </div>

                {/* Proof section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Payment Proof</h3>
                    <div>
                      <input
                        ref={proofInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={handleProofUpload}
                      />
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        startContent={<Upload size={13} />}
                        isLoading={uploadProofMutation.isPending}
                        onPress={() => proofInputRef.current?.click()}
                      >
                        {viewPayment.proof_file_url ? "Replace" : "Upload Proof"}
                      </Button>
                    </div>
                  </div>

                  {viewPayment.proof_file_url ? (
                    <div className="border rounded-xl overflow-hidden bg-gray-50">
                      {isPdf(viewPayment.proof_file_url) ? (
                        /* PDF: show iframe preview + download link */
                        <div className="flex flex-col">
                          <iframe
                            src={proofUrl(viewPayment.proof_file_url)}
                            className="w-full h-96 border-0"
                            title="Payment proof"
                          />
                          <div className="flex items-center gap-2 px-4 py-2.5 border-t bg-white">
                            <FileText size={14} className="text-danger" />
                            <span className="text-sm text-gray-600 flex-1 truncate">Payment proof document</span>
                            <a
                              href={proofUrl(viewPayment.proof_file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                            >
                              <ExternalLink size={12} />
                              Open
                            </a>
                            <a
                              href={proofUrl(viewPayment.proof_file_url)}
                              download
                              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                            >
                              <Download size={12} />
                              Download
                            </a>
                          </div>
                        </div>
                      ) : (
                        /* Image: show inline with open/download links */
                        <div className="flex flex-col">
                          <div className="flex items-center justify-center bg-gray-50 p-2">
                            <img
                              src={proofUrl(viewPayment.proof_file_url)}
                              alt="Payment proof"
                              className="max-h-96 max-w-full object-contain rounded-lg"
                            />
                          </div>
                          <div className="flex items-center gap-2 px-4 py-2.5 border-t bg-white">
                            <span className="text-sm text-gray-600 flex-1">Payment proof image</span>
                            <a
                              href={proofUrl(viewPayment.proof_file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                            >
                              <ExternalLink size={12} />
                              Open
                            </a>
                            <a
                              href={proofUrl(viewPayment.proof_file_url)}
                              download
                              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                            >
                              <Download size={12} />
                              Download
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => proofInputRef.current?.click()}
                    >
                      <Upload size={24} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Click to upload payment proof</p>
                      <p className="text-xs text-gray-300 mt-1">JPG, PNG, WebP or PDF · Max {process.env.NEXT_PUBLIC_MAX_FILE_MB ?? "10"}MB</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setViewPayment(null)}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
