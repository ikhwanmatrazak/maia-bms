"use client";

import { useQuery } from "@tanstack/react-query";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { paymentsApi } from "@/lib/api";
import { Payment } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function PaymentsPage() {
  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["payments"],
    queryFn: () => paymentsApi.list(),
  });

  return (
    <div>
      <Topbar title="Payments" />
      <div className="p-6">
        <Table aria-label="Payments" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn>Reference</TableColumn>
            <TableColumn>Invoice</TableColumn>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.payment_date)}</TableCell>
                <TableCell className="font-medium text-success">{formatCurrency(p.amount, p.currency)}</TableCell>
                <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                <TableCell>{p.reference_number ?? "—"}</TableCell>
                <TableCell>INV #{p.invoice_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
