"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem,
} from "@heroui/react";
import Link from "next/link";
import { quotationsApi, downloadPdf } from "@/lib/api";
import { Quotation, QuotationStatus } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: QuotationStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

export default function QuotationsPage() {
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "">("");
  const queryClient = useQueryClient();

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["quotations", statusFilter],
    queryFn: () => quotationsApi.list(statusFilter ? { status: statusFilter } : {}),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.convert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  return (
    <div>
      <Topbar title="Quotations" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <Select
            placeholder="Filter by status"
            className="max-w-xs"
            size="sm"
            selectedKeys={statusFilter ? [statusFilter] : []}
            onSelectionChange={(keys) => setStatusFilter(Array.from(keys)[0] as QuotationStatus | "")}
          >
            {STATUSES.map((s) => (
              <SelectItem key={s} className="capitalize">{s}</SelectItem>
            ))}
          </Select>
          <Button as={Link} href="/quotations/new" color="primary">
            + New Quotation
          </Button>
        </div>

        <Table aria-label="Quotations" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Issue Date</TableColumn>
            <TableColumn>Expiry</TableColumn>
            <TableColumn>Total</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {quotations.map((q) => (
              <TableRow key={q.id}>
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
                  <div className="flex gap-1 flex-wrap">
                    <Button as={Link} href={`/quotations/${q.id}`} size="sm" variant="flat">View</Button>
                    {q.status === "draft" && (
                      <Button size="sm" variant="flat" color="primary" isLoading={sendMutation.isPending}
                        onPress={() => sendMutation.mutate(q.id)}>Send</Button>
                    )}
                    {(q.status === "sent" || q.status === "accepted") && (
                      <Button size="sm" variant="flat" color="success" isLoading={convertMutation.isPending}
                        onPress={() => convertMutation.mutate(q.id)}>→ Invoice</Button>
                    )}
                    <Button size="sm" variant="flat" onPress={() => downloadPdf(quotationsApi.getPdfUrl(q.id), (q.quotation_number || "quotation-" + q.id) + ".pdf")}>PDF</Button>
                    <Button size="sm" variant="flat" color="danger" isLoading={deleteMutation.isPending}
                      onPress={() => { if (confirm("Delete this quotation?")) deleteMutation.mutate(q.id); }}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
