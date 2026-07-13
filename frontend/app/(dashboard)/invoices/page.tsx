"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input, Checkbox, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import Link from "next/link";
import { Eye, FileDown, Copy, Trash2, Mail, Send, ReceiptText } from "lucide-react";
import { invoicesApi, downloadPdf } from "@/lib/api";
import { Invoice, InvoiceStatus } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { TableSkeleton } from "@/components/ui/PageSkeleton";

const STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
const PAGE_SIZE = 10;

interface BulkResult {
  invoice_number: string;
  client: string;
  email: string;
  ok: boolean;
  msg: string;
}

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const dateParams = {
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const { data: summary } = useQuery({
    queryKey: ["invoices-summary", dateFrom, dateTo, statusFilter, search],
    queryFn: () => invoicesApi.summary({
      ...dateParams,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
    }),
  });

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices", statusFilter, search, page, dateFrom, dateTo],
    queryFn: () => invoicesApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      ...dateParams,
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const totalPages = Math.max(1, Math.ceil((summary?.count ?? 0) / PAGE_SIZE));

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stylePickerId, setStylePickerId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    if (confirmDeleteId === id) {
      deleteMutation.mutate(id);
      setConfirmDeleteId(null);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    } else {
      setConfirmDeleteId(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoicesApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const handleSendOne = async (inv: Invoice) => {
    const email = inv.client_email;
    if (!email) { alert("No email registered for this client."); return; }
    setSendingId(inv.id);
    try {
      await invoicesApi.email(inv.id, email);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      alert(`Invoice ${inv.invoice_number} sent to ${email}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingId(null);
    }
  };

  const handleBulkSend = async () => {
    const selected = invoices.filter((inv) => selectedIds.has(inv.id));
    setBulkResults([]);
    setBulkSending(true);
    setBulkModal(true);

    const results: BulkResult[] = [];
    for (const inv of selected) {
      const email = inv.client_email;
      if (!email) {
        results.push({ invoice_number: inv.invoice_number, client: inv.client_name || String(inv.client_id), email: "—", ok: false, msg: "No email registered for client" });
        continue;
      }
      try {
        await invoicesApi.email(inv.id, email);
        results.push({ invoice_number: inv.invoice_number, client: inv.client_name || String(inv.client_id), email, ok: true, msg: "Sent" });
      } catch (e: any) {
        results.push({ invoice_number: inv.invoice_number, client: inv.client_name || String(inv.client_id), email, ok: false, msg: e?.response?.data?.detail || "Failed" });
      }
    }
    setBulkResults(results);
    setBulkSending(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  if (isLoading) return (
    <div>
      <Topbar title="Invoices" />
      <div className="p-6"><TableSkeleton rows={6} cols={5} /></div>
    </div>
  );

  return (
    <div>
      <Topbar title="Invoices" />
      <div className="p-6">
        {/* Filter bar */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="Search by number or client..."
              size="sm"
              className="w-52"
              variant="bordered"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Select
              placeholder="All statuses"
              className="w-40"
              size="sm"
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(keys) => { setStatusFilter(Array.from(keys)[0] as InvoiceStatus | ""); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <SelectItem key={s} className="capitalize">{s}</SelectItem>
              ))}
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                size="sm"
                className="w-36"
                variant="bordered"
                label="From"
                labelPlacement="outside-left"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
              <span className="text-default-400 text-sm">–</span>
              <Input
                type="date"
                size="sm"
                className="w-36"
                variant="bordered"
                label="To"
                labelPlacement="outside-left"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                  className="text-xs text-default-400 hover:text-danger px-1"
                  title="Clear date filter"
                >
                  ✕
                </button>
              )}
            </div>
            {selectedIds.size > 0 && (
              <Button size="sm" color="primary" variant="flat" startContent={<Mail size={14} />} onPress={handleBulkSend}>
                Send Email ({selectedIds.size} selected)
              </Button>
            )}
          </div>
          <Button as={Link} href="/invoices/new" color="primary">
            + New Invoice
          </Button>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
              <span className="text-default-500">Billed</span>
              <span className="font-semibold ml-1">{formatCurrency(summary.total_billed, "MYR")}</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success-50 text-sm">
              <span className="text-success-600">Paid</span>
              <span className="font-semibold ml-1 text-success-700">{formatCurrency(summary.total_paid, "MYR")}</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-warning-50 text-sm">
              <span className="text-warning-600">Outstanding</span>
              <span className="font-semibold ml-1 text-warning-700">{formatCurrency(summary.total_outstanding, "MYR")}</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
              <span className="text-default-500">{summary.count} invoice{summary.count !== 1 ? "s" : ""}</span>
            </div>
            {summary.by_status && Object.entries(summary.by_status).filter(([, v]) => (v as number) > 0).map(([s, v]) => (
              <Chip key={s} size="sm" color={statusColor(s)} variant="flat" className="capitalize">{s}: {v as number}</Chip>
            ))}
          </div>
        )}

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Invoices" isLoading={isLoading}>
          <TableHeader>
            <TableColumn className="w-px">
              <Checkbox
                isSelected={invoices.length > 0 && selectedIds.size === invoices.length}
                isIndeterminate={selectedIds.size > 0 && selectedIds.size < invoices.length}
                onValueChange={toggleSelectAll}
                aria-label="Select all"
              />
            </TableColumn>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Due Date</TableColumn>
            <TableColumn>Total</TableColumn>
            <TableColumn>Paid</TableColumn>
            <TableColumn>Balance</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Checkbox
                    isSelected={selectedIds.has(inv.id)}
                    onValueChange={() => toggleSelect(inv.id)}
                    aria-label={`Select ${inv.invoice_number}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/invoices/${inv.id}`} className="text-primary font-medium hover:underline">
                    {inv.invoice_number}
                  </Link>
                </TableCell>
                <TableCell>{inv.client_name || inv.client_id}</TableCell>
                <TableCell className="whitespace-nowrap">{inv.due_date ? formatDate(inv.due_date) : "—"}</TableCell>
                <TableCell>{formatCurrency(inv.total, inv.currency)}</TableCell>
                <TableCell>{formatCurrency(inv.amount_paid, inv.currency)}</TableCell>
                <TableCell>
                  <span className={parseFloat(inv.balance_due) > 0 ? "text-danger font-medium" : "text-success"}>
                    {formatCurrency(inv.balance_due, inv.currency)}
                  </span>
                </TableCell>
                <TableCell>
                  <Chip size="sm" color={statusColor(inv.status)} variant="flat">{inv.status}</Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-nowrap">
                    <Button as={Link} href={`/invoices/${inv.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                    <Button size="sm" variant="flat" color="primary" isIconOnly isLoading={sendingId === inv.id} title="Send Invoice" onPress={() => handleSendOne(inv)}><Send size={15} /></Button>
                    <Button as={Link} href={`/invoices/${inv.id}?receipt=1`} size="sm" variant="flat" color="success" isIconOnly title="Create Receipt"><ReceiptText size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly title="Download PDF" onPress={() => setStylePickerId(inv.id)}><FileDown size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly title="Duplicate" onPress={() => router.push(`/invoices/new?from=${inv.id}`)}><Copy size={15} /></Button>
                    {inv.status !== "paid" && (
                      <Button size="sm" variant="flat" color="danger" isIconOnly={confirmDeleteId !== inv.id}
                        isLoading={deleteMutation.isPending && confirmDeleteId === null}
                        title={confirmDeleteId === inv.id ? "Click again to confirm" : "Delete"}
                        onPress={() => handleDelete(inv.id)}
                        className={confirmDeleteId === inv.id ? "px-2 min-w-fit" : ""}>
                        {confirmDeleteId === inv.id ? <span className="text-xs font-medium">Confirm?</span> : <Trash2 size={15} />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <p className="text-xs text-default-400">
            {summary?.count
              ? `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, summary.count)}–${Math.min(page * PAGE_SIZE, summary.count)} of ${summary.count}`
              : "No invoices found"}
          </p>
          {totalPages > 1 && (
            <Pagination
              total={totalPages}
              page={page}
              onChange={setPage}
              size="sm"
              showControls
            />
          )}
        </div>
      </div>

      {/* Bulk Send Results Modal */}
      <Modal isOpen={bulkModal} onClose={() => setBulkModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>Bulk Email Results</ModalHeader>
          <ModalBody>
            {bulkSending ? (
              <p className="text-sm text-gray-500 text-center py-4">Sending emails, please wait...</p>
            ) : (
              <div className="space-y-2">
                {bulkResults.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2 rounded-lg text-sm ${r.ok ? "bg-success-50" : "bg-danger-50"}`}>
                    <span className={`mt-0.5 font-bold ${r.ok ? "text-success" : "text-danger"}`}>{r.ok ? "✓" : "✗"}</span>
                    <div className="flex-1">
                      <span className="font-medium">{r.invoice_number}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span>{r.client}</span>
                      {r.email !== "—" && <span className="text-gray-400 ml-1 text-xs">({r.email})</span>}
                    </div>
                    <span className={r.ok ? "text-success" : "text-danger"}>{r.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setBulkModal(false)} isDisabled={bulkSending}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Template style picker */}
      {stylePickerId !== null && (() => {
        const inv = invoices.find((i: any) => i.id === stylePickerId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-foreground">Choose Invoice Design</h2>
              <p className="text-sm text-default-400">Select a layout. Invoice data stays the same.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "professional", label: "Professional", desc: "Clean corporate layout" },
                  { key: "modern", label: "Modern", desc: "Bold and contemporary" },
                  { key: "minimal", label: "Minimal", desc: "Simple and elegant" },
                  { key: "compact", label: "Compact", desc: "Condensed single-page" },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      downloadPdf(invoicesApi.getPdfUrl(stylePickerId, t.key), `${inv?.invoice_number || "invoice-" + stylePickerId}_${t.key}.pdf`);
                      setStylePickerId(null);
                    }}
                    className="flex flex-col items-start p-3 border border-default-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
                  >
                    <span className="font-medium text-sm text-foreground">{t.label}</span>
                    <span className="text-xs text-default-400 mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStylePickerId(null)} className="w-full py-2 text-sm text-default-500 hover:text-foreground">Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
