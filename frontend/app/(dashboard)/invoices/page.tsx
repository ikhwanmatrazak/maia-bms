"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem,
} from "@heroui/react";
import Link from "next/link";
import { invoicesApi, downloadPdf } from "@/lib/api";
import { Invoice, InvoiceStatus } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices", statusFilter],
    queryFn: () => invoicesApi.list(statusFilter ? { status: statusFilter } : {}),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => invoicesApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoicesApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div>
      <Topbar title="Invoices" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <Select
            placeholder="Filter by status"
            className="max-w-xs"
            size="sm"
            selectedKeys={statusFilter ? [statusFilter] : []}
            onSelectionChange={(keys) => setStatusFilter(Array.from(keys)[0] as InvoiceStatus | "")}
          >
            {STATUSES.map((s) => (
              <SelectItem key={s} className="capitalize">{s}</SelectItem>
            ))}
          </Select>
          <Button as={Link} href="/invoices/new" color="primary">
            + New Invoice
          </Button>
        </div>

        <Table aria-label="Invoices" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Due Date</TableColumn>
            <TableColumn>Total</TableColumn>
            <TableColumn>Paid</TableColumn>
            <TableColumn>Balance</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Link href={`/invoices/${inv.id}`} className="text-primary font-medium hover:underline">
                    {inv.invoice_number}
                  </Link>
                </TableCell>
                <TableCell>{inv.client_name || inv.client_id}</TableCell>
                <TableCell>{inv.due_date ? formatDate(inv.due_date) : "—"}</TableCell>
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
                  <div className="flex gap-1 flex-wrap">
                    <Button as={Link} href={`/invoices/${inv.id}`} size="sm" variant="flat">View</Button>
                    {inv.status === "draft" && (
                      <Button size="sm" color="primary" variant="flat" isLoading={sendMutation.isPending}
                        onPress={() => sendMutation.mutate(inv.id)}>Send</Button>
                    )}
                    <Button size="sm" variant="flat" onPress={() => downloadPdf(invoicesApi.getPdfUrl(inv.id), (inv.invoice_number || "invoice-" + inv.id) + ".pdf")}>PDF</Button>
                    <Button size="sm" variant="flat" color="danger" isLoading={deleteMutation.isPending}
                      onPress={() => { if (confirm("Delete this invoice?")) deleteMutation.mutate(inv.id); }}>Delete</Button>
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
