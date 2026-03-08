"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button, Input, Pagination } from "@heroui/react";
import { paymentsApi } from "@/lib/api";
import { Payment } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const PAGE_SIZE = 10;

export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["payments", search, page],
    queryFn: () => paymentsApi.list({ ...(search ? { search } : {}), skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
  });

  return (
    <div>
      <Topbar title="Payments" />
      <div className="p-6">
        <div className="mb-4">
          <Input
            placeholder="Search by invoice number or client..."
            size="sm"
            className="w-64"
            variant="bordered"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Table aria-label="Payments" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Invoice</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn>Reference</TableColumn>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>

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
    </div>
  );
}
