"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Chip } from "@heroui/react";
import { FileDown, Copy, Send, Truck, Trash2 } from "lucide-react";
import { deliveryOrdersApi, downloadPdf } from "@/lib/api";
import { formatDate, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function DeliveryOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["delivery-orders", id],
    queryFn: () => deliveryOrdersApi.get(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => deliveryOrdersApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders", id] }),
  });

  const deliverMutation = useMutation({
    mutationFn: () => deliveryOrdersApi.deliver(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders", id] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => deliveryOrdersApi.duplicate(id),
    onSuccess: (data) => router.push(`/delivery-orders/${data.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deliveryOrdersApi.softDelete(id),
    onSuccess: () => router.push("/delivery-orders"),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!order) return <div className="p-6">Delivery order not found</div>;

  return (
    <div>
      <Topbar title={order.do_number} />
      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Chip color={statusColor(order.status)} variant="flat" className="capitalize">{order.status}</Chip>
          {order.status === "draft" && (
            <Button size="sm" color="primary" variant="flat" isLoading={sendMutation.isPending}
              onPress={() => sendMutation.mutate()} startContent={<Send size={14} />}>Send</Button>
          )}
          {order.status === "sent" && (
            <Button size="sm" color="success" variant="flat" isLoading={deliverMutation.isPending}
              onPress={() => deliverMutation.mutate()} startContent={<Truck size={14} />}>Mark Delivered</Button>
          )}
          <Button size="sm" variant="flat" isLoading={duplicateMutation.isPending}
            onPress={() => duplicateMutation.mutate()} startContent={<Copy size={14} />}>Duplicate</Button>
          <Button size="sm" variant="flat"
            onPress={() => downloadPdf(deliveryOrdersApi.getPdfUrl(id), order.do_number + ".pdf")}
            startContent={<FileDown size={14} />}>Download PDF</Button>
          <Button size="sm" color="danger" variant="flat" isLoading={deleteMutation.isPending}
            onPress={() => { if (confirm("Delete this delivery order?")) deleteMutation.mutate(); }}
            startContent={<Trash2 size={14} />}>Delete</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DO Details */}
          <Card>
            <CardHeader><h3 className="font-semibold">Delivery Order Details</h3></CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">DO Number</span><span className="font-medium">{order.do_number}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Issue Date</span><span>{formatDate(order.issue_date)}</span></div>
              {order.delivery_date && (
                <div className="flex justify-between"><span className="text-gray-500">Delivery Date</span><span>{formatDate(order.delivery_date)}</span></div>
              )}
            </CardBody>
          </Card>

          {/* Client */}
          <Card>
            <CardHeader><h3 className="font-semibold">Client</h3></CardHeader>
            <CardBody className="space-y-1 text-sm">
              <p className="font-semibold text-base">{order.client_name || `Client #${order.client_id}`}</p>
              {order.delivery_address && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 uppercase mb-1">Delivery Address</p>
                  <p className="whitespace-pre-line text-gray-600">{order.delivery_address}</p>
                </div>
              )}
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
                  <th className="pb-2 text-right">Quantity</th>
                  <th className="pb-2 text-right">Unit</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item: any, i: number) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{item.unit || "pcs"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        {/* Notes */}
        {order.notes && (
          <Card>
            <CardHeader><h3 className="font-semibold">Notes</h3></CardHeader>
            <CardBody className="text-sm">
              <p className="whitespace-pre-line">{order.notes}</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
