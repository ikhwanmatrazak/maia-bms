"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button } from "@heroui/react";
import { receiptsApi, downloadPdf } from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function ReceiptDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { data: receipt, isLoading } = useQuery({
    queryKey: ["receipts", id],
    queryFn: () => receiptsApi.get(id),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!receipt) return <div className="p-6">Receipt not found</div>;

  return (
    <div>
      <Topbar title={receipt.receipt_number} />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <Button variant="flat" onPress={() => downloadPdf(receiptsApi.getPdfUrl(id), (receipt?.receipt_number || "receipt-" + id) + ".pdf")}>Download PDF</Button>
        </div>
        <Card>
          <CardHeader><h3 className="font-semibold">Receipt Details</h3></CardHeader>
          <CardBody className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-400">Receipt Number</p><p className="font-medium">{receipt.receipt_number}</p></div>
            <div><p className="text-gray-400">Payment Date</p><p className="font-medium">{formatDate(receipt.payment_date)}</p></div>
            <div><p className="text-gray-400">Amount</p><p className="font-bold text-success text-lg">{formatCurrency(receipt.amount, receipt.currency)}</p></div>
            <div><p className="text-gray-400">Payment Method</p><p className="font-medium capitalize">{receipt.payment_method.replace("_", " ")}</p></div>
            {receipt.notes && <div className="col-span-2"><p className="text-gray-400">Notes</p><p>{receipt.notes}</p></div>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
