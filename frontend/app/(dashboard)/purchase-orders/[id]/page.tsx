"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Chip } from "@heroui/react";
import { FileDown, Copy, Send, PackageCheck, Trash2 } from "lucide-react";
import { purchaseOrdersApi, downloadPdf } from "@/lib/api";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const queryClient = useQueryClient();

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => purchaseOrdersApi.get(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] }),
  });

  const receiveMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.receive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.duplicate(id),
    onSuccess: (data) => router.push(`/purchase-orders/${data.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.softDelete(id),
    onSuccess: () => router.push("/purchase-orders"),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!po) return <div className="p-6">Purchase order not found</div>;

  return (
    <div>
      <Topbar title={po.po_number} />
      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Chip color={statusColor(po.status)} variant="flat" className="capitalize">{po.status}</Chip>
          {!["received", "cancelled"].includes(po.status) && (
            <Button size="sm" color="primary" variant="flat" isLoading={sendMutation.isPending}
              onPress={() => sendMutation.mutate()} startContent={<Send size={14} />}>Send</Button>
          )}
          {!["received", "cancelled"].includes(po.status) && (
            <Button size="sm" color="success" variant="flat" isLoading={receiveMutation.isPending}
              onPress={() => receiveMutation.mutate()} startContent={<PackageCheck size={14} />}>Mark Received</Button>
          )}
          <Button size="sm" variant="flat" isLoading={duplicateMutation.isPending}
            onPress={() => duplicateMutation.mutate()} startContent={<Copy size={14} />}>Duplicate</Button>
          <Button size="sm" variant="flat"
            onPress={() => downloadPdf(purchaseOrdersApi.getPdfUrl(id), po.po_number + ".pdf")}
            startContent={<FileDown size={14} />}>Download PDF</Button>
          <Button size="sm" color="danger" variant="flat" isLoading={deleteMutation.isPending}
            onPress={() => { if (confirm("Delete this purchase order?")) deleteMutation.mutate(); }}
            startContent={<Trash2 size={14} />}>Delete</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PO Details */}
          <Card>
            <CardHeader><h3 className="font-semibold">Purchase Order Details</h3></CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">PO Number</span><span className="font-medium">{po.po_number}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Issue Date</span><span>{formatDate(po.issue_date)}</span></div>
              {po.expected_delivery_date && (
                <div className="flex justify-between"><span className="text-gray-500">Expected Delivery</span><span>{formatDate(po.expected_delivery_date)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Currency</span><span>{po.currency}</span></div>
            </CardBody>
          </Card>

          {/* Vendor */}
          <Card>
            <CardHeader><h3 className="font-semibold">Vendor</h3></CardHeader>
            <CardBody className="space-y-1 text-sm">
              <p className="font-semibold text-base">{po.vendor_name}</p>
              {po.vendor_email && <p className="text-gray-500">{po.vendor_email}</p>}
              {po.vendor_phone && <p className="text-gray-500">{po.vendor_phone}</p>}
              {po.vendor_address && <p className="text-gray-500 whitespace-pre-line">{po.vendor_address}</p>}
            </CardBody>
          </Card>
        </div>

        {/* Line Items */}
        <Card>
          <CardHeader><h3 className="font-semibold">Items</h3></CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs uppercase">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Tax</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((item: any, i: number) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unit_price, po.currency)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.tax_amount, po.currency)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.line_total, po.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(po.subtotal, po.currency)}</span></div>
                {parseFloat(po.discount_amount) > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{formatCurrency(po.discount_amount, po.currency)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(po.tax_total, po.currency)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{formatCurrency(po.total, po.currency)}</span></div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Notes */}
        {(po.notes || po.terms_conditions) && (
          <Card>
            <CardHeader><h3 className="font-semibold">Notes & Terms</h3></CardHeader>
            <CardBody className="space-y-3 text-sm">
              {po.notes && (
                <div>
                  <p className="text-xs text-gray-400 uppercase mb-1">Notes</p>
                  <p className="whitespace-pre-line">{po.notes}</p>
                </div>
              )}
              {po.terms_conditions && (
                <div>
                  <p className="text-xs text-gray-400 uppercase mb-1">Terms & Conditions</p>
                  <p className="whitespace-pre-line">{po.terms_conditions}</p>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
