"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button } from "@heroui/react";
import Link from "next/link";
import { receiptsApi, downloadPdf } from "@/lib/api";
import { Receipt } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function ReceiptsPage() {
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery<Receipt[]>({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => receiptsApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["receipts"] }),
  });

  return (
    <div>
      <Topbar title="Receipts" />
      <div className="p-6">
        <Table aria-label="Receipts" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Payment Date</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {receipts.map((r) => (
              <TableRow key={r.id}>
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
                  <div className="flex gap-2">
                    <Button as={Link} href={`/receipts/${r.id}`} size="sm" variant="flat">View</Button>
                    <Button size="sm" variant="flat" onPress={() => downloadPdf(receiptsApi.getPdfUrl(r.id), (r.receipt_number || "receipt-" + r.id) + ".pdf")}>PDF</Button>
                    <Button size="sm" variant="flat" color="danger" isLoading={deleteMutation.isPending}
                      onPress={() => { if (confirm("Delete this receipt?")) deleteMutation.mutate(r.id); }}>Delete</Button>
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
