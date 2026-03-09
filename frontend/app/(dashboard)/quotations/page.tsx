"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input, Checkbox, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import Link from "next/link";
import { Eye, Send, ArrowRightLeft, FileDown, Copy, Trash2, Mail } from "lucide-react";
import { quotationsApi, downloadPdf } from "@/lib/api";
import { Quotation, QuotationStatus } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: QuotationStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];
const PAGE_SIZE = 10;
const thisMonth = new Date().toISOString().slice(0, 7);

interface BulkResult {
  quotation_number: string;
  client: string;
  email: string;
  ok: boolean;
  msg: string;
}

export default function QuotationsPage() {
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(thisMonth);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["quotations-summary", month],
    queryFn: () => quotationsApi.summary(month),
  });

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["quotations", statusFilter, search, page, month],
    queryFn: () => quotationsApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      month,
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.convert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.duplicate(id),
    onSuccess: (data) => router.push(`/quotations/${data.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === quotations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(quotations.map((q) => q.id)));
    }
  };

  const handleBulkSend = async () => {
    const selected = quotations.filter((q) => selectedIds.has(q.id));
    setBulkResults([]);
    setBulkSending(true);
    setBulkModal(true);

    const results: BulkResult[] = [];
    for (const q of selected) {
      const email = (q as any).client_email;
      if (!email) {
        results.push({ quotation_number: q.quotation_number, client: q.client_name || String(q.client_id), email: "—", ok: false, msg: "No email registered for client" });
        continue;
      }
      try {
        await quotationsApi.email(q.id, email);
        results.push({ quotation_number: q.quotation_number, client: q.client_name || String(q.client_id), email, ok: true, msg: "Sent" });
      } catch (e: any) {
        results.push({ quotation_number: q.quotation_number, client: q.client_name || String(q.client_id), email, ok: false, msg: e?.response?.data?.detail || "Failed" });
      }
    }
    setBulkResults(results);
    setBulkSending(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
  };

  return (
    <div>
      <Topbar title="Quotations" />
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
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
                <span className="text-default-500">Total</span>
                <span className="font-semibold ml-1">{summary.count} docs</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
                <span className="text-default-500">Value</span>
                <span className="font-semibold ml-1">{formatCurrency(summary.total_value, "MYR")}</span>
              </div>
              {summary.by_status && Object.entries(summary.by_status).filter(([, v]) => (v as number) > 0).map(([s, v]) => (
                <Chip key={s} size="sm" color={statusColor(s)} variant="flat" className="capitalize">{s}: {v as number}</Chip>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="Search by number or client..."
              size="sm"
              className="w-56"
              variant="bordered"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Select
              placeholder="Filter by status"
              className="w-44"
              size="sm"
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(keys) => { setStatusFilter(Array.from(keys)[0] as QuotationStatus | ""); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <SelectItem key={s} className="capitalize">{s}</SelectItem>
              ))}
            </Select>
            {selectedIds.size > 0 && (
              <Button size="sm" color="primary" variant="flat" startContent={<Mail size={14} />} onPress={handleBulkSend}>
                Send Email ({selectedIds.size} selected)
              </Button>
            )}
          </div>
          <Button as={Link} href="/quotations/new" color="primary">
            + New Quotation
          </Button>
        </div>

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Quotations" isLoading={isLoading}>
          <TableHeader>
            <TableColumn className="w-px">
              <Checkbox
                isSelected={quotations.length > 0 && selectedIds.size === quotations.length}
                isIndeterminate={selectedIds.size > 0 && selectedIds.size < quotations.length}
                onValueChange={toggleSelectAll}
                aria-label="Select all"
              />
            </TableColumn>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Issue Date</TableColumn>
            <TableColumn>Expiry</TableColumn>
            <TableColumn>Total</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {quotations.map((q) => (
              <TableRow key={q.id}>
                <TableCell>
                  <Checkbox
                    isSelected={selectedIds.has(q.id)}
                    onValueChange={() => toggleSelect(q.id)}
                    aria-label={`Select ${q.quotation_number}`}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/quotations/${q.id}`} className="text-primary font-medium hover:underline">
                    {q.quotation_number}
                  </Link>
                </TableCell>
                <TableCell>{q.client_name || q.client_id}</TableCell>
                <TableCell>{formatDate(q.issue_date)}</TableCell>
                <TableCell>{q.expiry_date ? formatDate(q.expiry_date) : "—"}</TableCell>
                <TableCell>{formatCurrency(q.total, q.currency)}</TableCell>
                <TableCell>
                  <Chip size="sm" color={statusColor(q.status)} variant="flat">{q.status}</Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-nowrap">
                    <Button as={Link} href={`/quotations/${q.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                    {!["rejected", "expired"].includes(q.status) && (
                      <Button size="sm" variant="flat" color="primary" isIconOnly isLoading={sendMutation.isPending} title="Send to Client + Email"
                        onPress={() => sendMutation.mutate(q.id)}><Send size={15} /></Button>
                    )}
                    {!["rejected", "expired"].includes(q.status) && (
                      <Button size="sm" variant="flat" color="success" isIconOnly isLoading={convertMutation.isPending} title="Convert to Invoice"
                        onPress={() => convertMutation.mutate(q.id)}><ArrowRightLeft size={15} /></Button>
                    )}
                    <Button size="sm" variant="flat" isIconOnly title="Download PDF" onPress={() => downloadPdf(quotationsApi.getPdfUrl(q.id), (q.quotation_number || "quotation-" + q.id) + ".pdf")}><FileDown size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly isLoading={duplicateMutation.isPending} title="Duplicate" onPress={() => duplicateMutation.mutate(q.id)}><Copy size={15} /></Button>
                    <Button size="sm" variant="flat" color="danger" isIconOnly isLoading={deleteMutation.isPending} title="Delete"
                      onPress={() => { if (confirm("Delete this quotation?")) deleteMutation.mutate(q.id); }}><Trash2 size={15} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (quotations.length >= PAGE_SIZE ? 1 : 0)}
            page={page}
            onChange={setPage}
            size="sm"
            showControls
          />
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
                      <span className="font-medium">{r.quotation_number}</span>
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
    </div>
  );
}
