"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Checkbox, Pagination, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import Link from "next/link";
import { Eye, FileDown, Trash2, Mail, Send } from "lucide-react";
import { receiptsApi, downloadPdf } from "@/lib/api";
import { Receipt } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const PAGE_SIZE = 10;

interface BulkResult {
  receipt_number: string;
  client: string;
  email: string;
  ok: boolean;
  msg: string;
}

export default function ReceiptsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery<Receipt[]>({
    queryKey: ["receipts", search, page],
    queryFn: () => receiptsApi.list({ ...(search ? { search } : {}), skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => receiptsApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["receipts"] }),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === receipts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(receipts.map((r) => r.id)));
    }
  };

  const handleSendOne = async (r: Receipt) => {
    const email = r.client_email;
    if (!email) { alert("No email registered for this client."); return; }
    setSendingId(r.id);
    try {
      await receiptsApi.email(r.id, email);
      alert(`Receipt ${r.receipt_number} sent to ${email}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingId(null);
    }
  };

  const handleBulkSend = async () => {
    const selected = receipts.filter((r) => selectedIds.has(r.id));
    setBulkResults([]);
    setBulkSending(true);
    setBulkModal(true);

    const results: BulkResult[] = [];
    for (const r of selected) {
      const email = r.client_email;
      if (!email) {
        results.push({ receipt_number: r.receipt_number, client: r.client_name || String(r.client_id), email: "—", ok: false, msg: "No email registered for client" });
        continue;
      }
      try {
        await receiptsApi.email(r.id, email);
        results.push({ receipt_number: r.receipt_number, client: r.client_name || String(r.client_id), email, ok: true, msg: "Sent" });
      } catch (e: any) {
        results.push({ receipt_number: r.receipt_number, client: r.client_name || String(r.client_id), email, ok: false, msg: e?.response?.data?.detail || "Failed" });
      }
    }
    setBulkResults(results);
    setBulkSending(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["receipts"] });
  };

  return (
    <div>
      <Topbar title="Receipts" />
      <div className="p-6">
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
            {selectedIds.size > 0 && (
              <Button size="sm" color="primary" variant="flat" startContent={<Mail size={14} />} onPress={handleBulkSend}>
                Send Email ({selectedIds.size} selected)
              </Button>
            )}
          </div>
        </div>

        <Table aria-label="Receipts" isLoading={isLoading}>
          <TableHeader>
            <TableColumn className="w-px">
              <Checkbox
                isSelected={receipts.length > 0 && selectedIds.size === receipts.length}
                isIndeterminate={selectedIds.size > 0 && selectedIds.size < receipts.length}
                onValueChange={toggleSelectAll}
                aria-label="Select all"
              />
            </TableColumn>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Payment Date</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {receipts.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox
                    isSelected={selectedIds.has(r.id)}
                    onValueChange={() => toggleSelect(r.id)}
                    aria-label={`Select ${r.receipt_number}`}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/receipts/${r.id}`} className="text-primary font-medium hover:underline">
                    {r.receipt_number}
                  </Link>
                </TableCell>
                <TableCell>{r.client_name || r.client_id}</TableCell>
                <TableCell>{formatDate(r.payment_date)}</TableCell>
                <TableCell>{formatCurrency(r.amount, r.currency)}</TableCell>
                <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-nowrap">
                    <Button as={Link} href={`/receipts/${r.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                    <Button size="sm" variant="flat" color="primary" isIconOnly isLoading={sendingId === r.id} title="Send Email" onPress={() => handleSendOne(r)}><Send size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly title="Download PDF" onPress={() => downloadPdf(receiptsApi.getPdfUrl(r.id), (r.receipt_number || "receipt-" + r.id) + ".pdf")}><FileDown size={15} /></Button>
                    <Button size="sm" variant="flat" color="danger" isIconOnly isLoading={deleteMutation.isPending} title="Delete"
                      onPress={() => { if (confirm("Delete this receipt?")) deleteMutation.mutate(r.id); }}><Trash2 size={15} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (receipts.length >= PAGE_SIZE ? 1 : 0)}
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
                      <span className="font-medium">{r.receipt_number}</span>
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
