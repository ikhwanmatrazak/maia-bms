"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, CardHeader, Button, Chip, Modal, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Input, Select, SelectItem,
} from "@heroui/react";
import { invoicesApi, paymentsApi, settingsApi, downloadPdf } from "@/lib/api";
import { Mail as MailIcon, Eye as EyeIcon, Link as LinkIcon, Copy as CopyIcon, CheckCheck } from "lucide-react";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { Payment } from "@/types";

const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"];

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [paymentModal, setPaymentModal] = useState(searchParams.get("receipt") === "1");
  const [emailModal, setEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    currency: "MYR",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "bank_transfer",
    reference_number: "",
    generate_receipt: true,
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [payLinkModal, setPayLinkModal] = useState(false);
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoices", id],
    queryFn: () => invoicesApi.get(id),
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["invoices", id, "payments"],
    queryFn: () => invoicesApi.getPayments(id),
  });

  const { data: emailTracking } = useQuery({
    queryKey: ["invoices", id, "email-tracking"],
    queryFn: () => invoicesApi.getEmailTracking(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => invoicesApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", id] }),
  });

  const emailMutation = useMutation({
    mutationFn: (to: string) => invoicesApi.email(id, to),
    onSuccess: () => setEmailResult({ ok: true, msg: `Email sent to ${emailTo}` }),
    onError: (e: any) => setEmailResult({ ok: false, msg: e?.response?.data?.detail || "Failed to send email" }),
  });

  const openEmailModal = () => {
    setEmailTo((inv as any)?.client_email || "");
    setEmailResult(null);
    setEmailModal(true);
  };

  const paymentMutation = useMutation({
    mutationFn: (data: object) => invoicesApi.recordPayment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id, "payments"] });
      setPaymentModal(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => invoicesApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", id] }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (data: object) => settingsApi.createTemplate(data),
    onSuccess: () => { setTemplateSaved(true); setTimeout(() => { setTemplateModal(false); setTemplateSaved(false); }, 1500); },
  });

  const generateReceiptMutation = useMutation({
    mutationFn: () => invoicesApi.generateReceipt(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id, "payments"] });
      router.push(`/receipts/${data.receipt_id}`);
    },
  });

  const payLinkMutation = useMutation({
    mutationFn: () => invoicesApi.createPaymentLink(id),
    onSuccess: (data) => {
      setPayLinkUrl(data.url);
      setPayLinkModal(true);
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  const openPayLink = () => {
    if ((inv as any)?.payment_link_url) {
      setPayLinkUrl((inv as any).payment_link_url);
      setPayLinkModal(true);
    } else {
      payLinkMutation.mutate();
    }
  };

  const copyPayLink = () => {
    if (payLinkUrl) {
      navigator.clipboard.writeText(payLinkUrl);
      setPayLinkCopied(true);
      setTimeout(() => setPayLinkCopied(false), 2000);
    }
  };

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!inv) return <div className="p-6">Invoice not found</div>;

  const analyzeProof = async (file: File) => {
    setIsAnalyzing(true);
    try {
      const result = await paymentsApi.analyzeProof(file);
      setPaymentForm((prev) => ({
        ...prev,
        ...(result.amount ? { amount: String(result.amount) } : {}),
        ...(result.currency ? { currency: result.currency } : {}),
        ...(result.payment_date ? { payment_date: result.payment_date } : {}),
        ...(result.payment_method && PAYMENT_METHODS.includes(result.payment_method) ? { payment_method: result.payment_method } : {}),
        ...(result.reference_number ? { reference_number: result.reference_number } : {}),
      }));
    } catch {
      // silently fail — user can fill in manually
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitPayment = async () => {
    paymentMutation.mutate(
      {
        ...paymentForm,
        amount: Number(paymentForm.amount),
        payment_date: new Date(paymentForm.payment_date).toISOString(),
      },
      {
        onSuccess: async (data) => {
          if (proofFile) {
            try { await paymentsApi.uploadProof(data.id, proofFile); } catch { /* non-critical */ }
          }
          setProofFile(null);
        },
      }
    );
  };

  return (
    <div>
      <Topbar title={inv.invoice_number} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Chip color={statusColor(inv.status)} variant="flat">{inv.status}</Chip>
            <span className="text-gray-500 text-sm">{inv.invoice_number}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!["paid", "cancelled"].includes(inv.status) && (
              <Button size="sm" color="success" onPress={() => {
                setPaymentForm(prev => ({ ...prev, amount: String(inv.balance_due) }));
                setPaymentModal(true);
              }}>Record Payment</Button>
            )}
            {!["paid", "cancelled"].includes(inv.status) && (
              <Button size="sm" color="secondary" variant="flat" startContent={<LinkIcon size={14} />}
                isLoading={payLinkMutation.isPending} onPress={openPayLink}>
                {(inv as any)?.payment_link_url ? "Payment Link" : "Generate Payment Link"}
              </Button>
            )}
            {!["paid", "cancelled"].includes(inv.status) && (
              <Button size="sm" color="primary" onPress={() => setPaymentModal(true)}>Create Receipt</Button>
            )}
            {inv.status === "paid" && (() => {
              const receiptId = payments.find((p) => p.receipt_id)?.receipt_id;
              return receiptId ? (
                <Button size="sm" color="primary" onPress={() => router.push(`/receipts/${receiptId}`)}>View Receipt</Button>
              ) : (
                <Button size="sm" color="primary" isLoading={generateReceiptMutation.isPending}
                  onPress={() => generateReceiptMutation.mutate()}>Create Receipt</Button>
              );
            })()}
            <Button size="sm" color="primary" variant="flat" onPress={openEmailModal}>Email PDF</Button>
            <Button size="sm" variant="flat" onPress={() => downloadPdf(invoicesApi.getPdfUrl(id), (inv?.invoice_number || "invoice-" + id) + ".pdf")}>PDF</Button>
            <Button size="sm" variant="flat" onPress={() => router.push(`/invoices/new?from=${id}`)}>Duplicate</Button>
            <Button size="sm" variant="flat" onPress={() => { setTemplateName(inv.invoice_number); setTemplateSaved(false); setTemplateModal(true); }}>
              Save as Template
            </Button>
            {!["paid", "cancelled"].includes(inv.status) && (
              <Button size="sm" color="danger" variant="flat" isLoading={cancelMutation.isPending}
                onPress={() => cancelMutation.mutate()}>Cancel</Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total", value: formatCurrency(inv.total, inv.currency) },
            { label: "Paid", value: formatCurrency(inv.amount_paid, inv.currency), color: "text-success" },
            { label: "Balance", value: formatCurrency(inv.balance_due, inv.currency), color: parseFloat(inv.balance_due) > 0 ? "text-danger" : "text-success" },
            { label: "Due Date", value: inv.due_date ? formatDate(inv.due_date) : "N/A" },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardBody className="p-4">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color ?? "text-gray-900"}`}>{item.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Payment progress bar — shown for partial payments */}
        {parseFloat(inv.amount_paid) > 0 && parseFloat(inv.balance_due) >= 0 && (
          <div className="px-1">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Payment Progress</span>
              <span>{Math.round((parseFloat(inv.amount_paid) / parseFloat(inv.total)) * 100)}% paid ({payments.length} payment{payments.length !== 1 ? "s" : ""})</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${parseFloat(inv.balance_due) <= 0 ? "bg-success-500" : "bg-primary-500"}`}
                style={{ width: `${Math.min(100, Math.round((parseFloat(inv.amount_paid) / parseFloat(inv.total)) * 100))}%` }}
              />
            </div>
          </div>
        )}

        <Card>
          <CardHeader><h3 className="font-semibold">Client Information</h3></CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Client</p>
                <p className="font-medium">{(inv as any).client_name || "—"}</p>
              </div>
              {(inv as any).client_email && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Email</p>
                  <p>{(inv as any).client_email}</p>
                </div>
              )}
              {(inv as any).client_phone && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                  <p>{(inv as any).client_phone}</p>
                </div>
              )}
              {(inv as any).client_address && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Address</p>
                  <p className="whitespace-pre-line">{(inv as any).client_address}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Issue Date</p>
                <p>{formatDate(inv.issue_date)}</p>
              </div>
              {inv.due_date && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Due Date</p>
                  <p>{formatDate(inv.due_date)}</p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-semibold">Line Items</h3></CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Tax</th>
                <th className="pb-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                {inv.items.map((item: { id: number; description: string; quantity: string; unit_price: string; tax_amount: string; line_total: string }) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">
                      {item.description.includes("\n") ? (
                        <div>
                          <span>{item.description.split("\n")[0]}</span>
                          {item.description.split("\n").slice(1).map((sub: string, i: number) => (
                            <div key={i} className="text-gray-500 text-xs pl-2 mt-0.5">{sub}</div>
                          ))}
                        </div>
                      ) : item.description}
                    </td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unit_price, inv.currency)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.tax_amount, inv.currency)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.line_total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal, inv.currency)}</span></div>
              {parseFloat(inv.discount_amount) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{formatCurrency(inv.discount_amount, inv.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(inv.tax_total, inv.currency)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(inv.total, inv.currency)}</span></div>
            </div>
          </CardBody>
        </Card>

        {inv.payment_terms && (
          <Card><CardHeader><h3 className="font-semibold">Payment Terms</h3></CardHeader>
            <CardBody><p className="text-sm text-gray-600 whitespace-pre-line">{inv.payment_terms}</p></CardBody>
          </Card>
        )}

        {emailTracking?.sent && (
          <Card>
            <CardHeader><h3 className="font-semibold flex items-center gap-2"><MailIcon size={16} /> Email Tracking</h3></CardHeader>
            <CardBody>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <MailIcon size={14} className="text-gray-400" />
                  <span className="text-gray-500">Sent to</span>
                  <span className="font-medium">{emailTracking.recipient_email || "—"}</span>
                  {emailTracking.sent_at && <span className="text-gray-400 text-xs">{new Date(emailTracking.sent_at).toLocaleString()}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <EyeIcon size={14} className={emailTracking.opened ? "text-success" : "text-gray-300"} />
                  {emailTracking.opened ? (
                    <span className="text-success font-medium">
                      Opened {emailTracking.open_count > 1 ? `(${emailTracking.open_count}x)` : ""}
                      {emailTracking.opened_at && <span className="text-gray-400 font-normal ml-1 text-xs">· {new Date(emailTracking.opened_at).toLocaleString()}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not yet opened</span>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {payments.length > 0 && (
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h3 className="font-semibold">Payment History</h3>
              <span className="text-xs text-gray-400">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
            </CardHeader>
            <CardBody>
              <div className="space-y-0">
                {payments.map((p, i) => (
                  <div key={p.id} className={`flex items-center justify-between text-sm py-2.5 ${i < payments.length - 1 ? "border-b" : ""}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs bg-default-100 rounded-full px-2 py-0.5">Tranche {i + 1}</span>
                        <span className="text-gray-600">{formatDate(p.payment_date)}</span>
                        <span className="text-gray-400 capitalize">{p.payment_method.replace("_", " ")}</span>
                        {p.reference_number && <span className="text-gray-400 text-xs">Ref: {p.reference_number}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-success-600">{formatCurrency(p.amount, p.currency)}</span>
                      {p.receipt_id && (
                        <Button size="sm" variant="flat" onPress={() => router.push(`/receipts/${p.receipt_id}`)}>
                          Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-3 border-t font-semibold">
                  <span>Total Paid</span>
                  <span className="text-success-600">{formatCurrency(inv.amount_paid, inv.currency)}</span>
                </div>
                {parseFloat(inv.balance_due) > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-500">Remaining Balance</span>
                    <span className="text-danger-600 font-semibold">{formatCurrency(inv.balance_due, inv.currency)}</span>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Save as Template Modal */}
        <Modal isOpen={templateModal} onClose={() => setTemplateModal(false)}>
          <ModalContent>
            <ModalHeader>Save as Template</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input variant="bordered" label="Template Name" value={templateName}
                onChange={(e) => setTemplateName(e.target.value)} />
              {templateSaved && <p className="text-sm text-success">Template saved successfully!</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setTemplateModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={saveTemplateMutation.isPending}
                onPress={() => saveTemplateMutation.mutate({
                  name: templateName,
                  type: "invoice",
                  style: "professional",
                  items: inv.items.map((i: any) => {
                    const lines = i.description.split("\n");
                    return {
                      description: lines[0],
                      quantity: Number(i.quantity),
                      unit_price: Number(i.unit_price),
                      sub_items: lines.slice(1).map((s: string) => s.replace(/^•\s*/, "")),
                    };
                  }),
                  notes: inv.notes ?? "",
                  terms_conditions: inv.terms_conditions ?? "",
                  currency: inv.currency,
                  exchange_rate: Number(inv.exchange_rate),
                  discount_amount: Number(inv.discount_amount),
                })}>
                Save Template
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Payment Modal */}
        <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)}>
          <ModalContent>
            <ModalHeader>
              <div>
                <div>Record Payment</div>
                <div className="text-xs font-normal text-gray-400 mt-0.5">
                  Total: {formatCurrency(inv.total, inv.currency)} · Paid: {formatCurrency(inv.amount_paid, inv.currency)} · <span className={parseFloat(inv.balance_due) > 0 ? "text-danger-500 font-medium" : "text-success-500 font-medium"}>Balance: {formatCurrency(inv.balance_due, inv.currency)}</span>
                </div>
              </div>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {/* Proof upload + auto-fill */}
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">Upload payment proof (image or PDF) — AI will auto-fill the form</p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="text-xs text-gray-600 flex-1"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setProofFile(f);
                      if (f) analyzeProof(f);
                    }}
                  />
                  {isAnalyzing && <span className="text-xs text-primary animate-pulse">Analyzing...</span>}
                  {proofFile && !isAnalyzing && <span className="text-xs text-success">✓ Ready</span>}
                </div>
              </div>

              <Input
                variant="bordered"
                label="Amount"
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                startContent={<span className="text-xs text-gray-400">{inv.currency}</span>}
              />
              <Input
                variant="bordered"
                label="Payment Date"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
              <Select
                variant="bordered"
                label="Payment Method"
                selectedKeys={[paymentForm.payment_method]}
                onSelectionChange={(k) => setPaymentForm({ ...paymentForm, payment_method: Array.from(k)[0] as string })}
              >
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
              </Select>
              <Input
                variant="bordered"
                label="Reference Number"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setPaymentModal(false)}>Cancel</Button>
              <Button color="success" isLoading={paymentMutation.isPending || isAnalyzing} onPress={submitPayment}>Record Payment</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Email Modal */}
        <Modal isOpen={emailModal} onClose={() => setEmailModal(false)}>
          <ModalContent>
            <ModalHeader>Email Invoice PDF</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input
                variant="bordered"
                label="Recipient Email"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="client@example.com"
              />
              {emailResult && (
                <p className={`text-sm ${emailResult.ok ? "text-success" : "text-danger"}`}>{emailResult.msg}</p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setEmailModal(false)}>Close</Button>
              <Button color="primary" isLoading={emailMutation.isPending} onPress={() => emailMutation.mutate(emailTo)}>
                Send Email
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Payment Link Modal */}
        <Modal isOpen={payLinkModal} onOpenChange={setPayLinkModal} size="md">
          <ModalContent>
            <ModalHeader>Billplz Payment Link</ModalHeader>
            <ModalBody className="space-y-4">
              <p className="text-sm text-gray-500">
                Share this link with your client so they can pay online via FPX or credit card through Billplz.
              </p>
              {payLinkUrl ? (
                <div className="flex gap-2 items-center">
                  <Input
                    variant="bordered"
                    value={payLinkUrl}
                    readOnly
                    size="sm"
                    classNames={{ input: "text-xs" }}
                  />
                  <Button size="sm" variant="flat" isIconOnly onPress={copyPayLink}>
                    {payLinkCopied ? <CheckCheck size={16} className="text-success" /> : <CopyIcon size={16} />}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-danger">Failed to generate payment link.</p>
              )}
              {payLinkCopied && <p className="text-xs text-success">Link copied to clipboard!</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setPayLinkModal(false)}>Close</Button>
              {payLinkUrl && (
                <Button color="primary" onPress={() => window.open(payLinkUrl!, "_blank")}>
                  Open Payment Page
                </Button>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
