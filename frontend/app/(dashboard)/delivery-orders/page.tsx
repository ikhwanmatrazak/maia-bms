"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input, Pagination,
} from "@heroui/react";
import Link from "next/link";
import { Eye, Send, Truck, FileDown, Copy, Trash2 } from "lucide-react";
import { deliveryOrdersApi, downloadPdf } from "@/lib/api";
import { DeliveryOrder, DeliveryOrderStatus } from "@/types";
import { formatDate, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: DeliveryOrderStatus[] = ["draft", "sent", "delivered", "cancelled"];
const PAGE_SIZE = 20;
const thisMonth = new Date().toISOString().slice(0, 7);

export default function DeliveryOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryOrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(thisMonth);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["delivery-orders-summary", month],
    queryFn: () => deliveryOrdersApi.summary(month),
  });

  const { data: orders = [], isLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["delivery-orders", statusFilter, search, page, month],
    queryFn: () => deliveryOrdersApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      month,
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deliveryOrdersApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-orders"] }),
  });

  return (
    <div>
      <Topbar title="Delivery Orders" />
      <div className="p-6">
        {/* Summary Bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Input
            type="month"
            size="sm"
            className="w-40"
            variant="bordered"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          {summary && (
            <>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
                <span className="text-default-500">{summary.count} orders</span>
              </div>
              {summary.by_status && Object.entries(summary.by_status).filter(([, v]) => (v as number) > 0).map(([s, v]) => (
                <Chip key={s} size="sm" color={statusColor(s)} variant="flat" className="capitalize">{s}: {v as number}</Chip>
              ))}
            </>
          )}
        </div>

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

        <div className="overflow-x-auto -mx-1">
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
                    <Button size="sm" variant="flat" isIconOnly title="Duplicate" onPress={() => router.push(`/delivery-orders/new?from=${order.id}`)}><Copy size={15} /></Button>
                    <Button size="sm" variant="flat" color="danger" isIconOnly isLoading={deleteMutation.isPending} title="Delete"
                      onPress={() => { if (confirm("Delete this delivery order?")) deleteMutation.mutate(order.id); }}><Trash2 size={15} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (orders.length >= PAGE_SIZE ? 1 : 0)}
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
