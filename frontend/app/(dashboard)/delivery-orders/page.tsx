"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input,
} from "@heroui/react";
import Link from "next/link";
import { Eye, Send, Truck, FileDown, Copy, Trash2 } from "lucide-react";
import { deliveryOrdersApi, downloadPdf } from "@/lib/api";
import { DeliveryOrder, DeliveryOrderStatus } from "@/types";
import { formatDate, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: DeliveryOrderStatus[] = ["draft", "sent", "delivered", "cancelled"];
const PAGE_SIZE = 20;

export default function DeliveryOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryOrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["delivery-orders", statusFilter, search, page],
    queryFn: () => deliveryOrdersApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => deliveryOrdersApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders"] }),
  });

  const deliverMutation = useMutation({
    mutationFn: (id: number) => deliveryOrdersApi.deliver(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => deliveryOrdersApi.duplicate(id),
    onSuccess: (data) => router.push(`/delivery-orders/${data.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deliveryOrdersApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders"] }),
  });

  return (
    <div>
      <Topbar title="Delivery Orders" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
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
              onSelectionChange={(keys) => { setStatusFilter(Array.from(keys)[0] as DeliveryOrderStatus | ""); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <SelectItem key={s} className="capitalize">{s}</SelectItem>
              ))}
            </Select>
          </div>
          <Button as={Link} href="/delivery-orders/new" color="primary">
            + New DO
          </Button>
        </div>

        <Table aria-label="Delivery Orders" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Number</TableColumn>
            <TableColumn>Client</TableColumn>
            <TableColumn>Issue Date</TableColumn>
            <TableColumn>Delivery Date</TableColumn>
            <TableColumn>Items</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link href={`/delivery-orders/${order.id}`} className="text-primary font-medium hover:underline">
                    {order.do_number}
                  </Link>
                </TableCell>
                <TableCell>{order.client_name || order.client_id}</TableCell>
                <TableCell>{formatDate(order.issue_date)}</TableCell>
                <TableCell>{order.delivery_date ? formatDate(order.delivery_date) : "—"}</TableCell>
                <TableCell>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</TableCell>
                <TableCell>
                  <Chip size="sm" color={statusColor(order.status)} variant="flat">{order.status}</Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-nowrap">
                    <Button as={Link} href={`/delivery-orders/${order.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                    {order.status === "draft" && (
                      <Button size="sm" variant="flat" color="primary" isIconOnly isLoading={sendMutation.isPending} title="Send"
                        onPress={() => sendMutation.mutate(order.id)}><Send size={15} /></Button>
                    )}
                    {order.status === "sent" && (
                      <Button size="sm" variant="flat" color="success" isIconOnly isLoading={deliverMutation.isPending} title="Mark Delivered"
                        onPress={() => deliverMutation.mutate(order.id)}><Truck size={15} /></Button>
                    )}
                    <Button size="sm" variant="flat" isIconOnly title="Download PDF" onPress={() => downloadPdf(deliveryOrdersApi.getPdfUrl(order.id), (order.do_number || "do-" + order.id) + ".pdf")}><FileDown size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly isLoading={duplicateMutation.isPending} title="Duplicate" onPress={() => duplicateMutation.mutate(order.id)}><Copy size={15} /></Button>
                    <Button size="sm" variant="flat" color="danger" isIconOnly isLoading={deleteMutation.isPending} title="Delete"
                      onPress={() => { if (confirm("Delete this delivery order?")) deleteMutation.mutate(order.id); }}><Trash2 size={15} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" isDisabled={page === 1} onPress={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="flat" isDisabled={orders.length < PAGE_SIZE} onPress={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
