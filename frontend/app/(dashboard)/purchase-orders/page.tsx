"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input, Pagination,
} from "@heroui/react";
import Link from "next/link";
import { Eye, Send, PackageCheck, FileDown, Copy, Trash2 } from "lucide-react";
import { purchaseOrdersApi, downloadPdf } from "@/lib/api";
import { PurchaseOrder, PurchaseOrderStatus } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUSES: PurchaseOrderStatus[] = ["draft", "sent", "received", "cancelled"];
const PAGE_SIZE = 20;
const thisMonth = new Date().toISOString().slice(0, 7);

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(thisMonth);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["purchase-orders-summary", month],
    queryFn: () => purchaseOrdersApi.summary(month),
  });

  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders", statusFilter, search, page, month],
    queryFn: () => purchaseOrdersApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      month,
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.receive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  return (
    <div>
      <Topbar title="Purchase Orders" />
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
                <span className="text-default-500">Total Value</span>
                <span className="font-semibold ml-1">{formatCurrency(summary.total_value, "MYR")}</span>
              </div>
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
              placeholder="Search by number or vendor..."
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
              onSelectionChange={(keys) => { setStatusFilter(Array.from(keys)[0] as PurchaseOrderStatus | ""); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <SelectItem key={s} className="capitalize">{s}</SelectItem>
              ))}
            </Select>
          </div>
          <Button as={Link} href="/purchase-orders/new" color="primary">
            + New PO
          </Button>
        </div>

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Purchase Orders" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Number</TableColumn>
            <TableColumn>Vendor</TableColumn>
            <TableColumn>Issue Date</TableColumn>
            <TableColumn>Expected Delivery</TableColumn>
            <TableColumn>Total</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {orders.map((po) => (
              <TableRow key={po.id}>
                <TableCell>
                  <Link href={`/purchase-orders/${po.id}`} className="text-primary font-medium hover:underline">
                    {po.po_number}
                  </Link>
                </TableCell>
                <TableCell>{po.vendor_name}</TableCell>
                <TableCell>{formatDate(po.issue_date)}</TableCell>
                <TableCell>{po.expected_delivery_date ? formatDate(po.expected_delivery_date) : "—"}</TableCell>
                <TableCell>{formatCurrency(po.total, po.currency)}</TableCell>
                <TableCell>
                  <Chip size="sm" color={statusColor(po.status)} variant="flat">{po.status}</Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-nowrap">
                    <Button as={Link} href={`/purchase-orders/${po.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                    {po.status === "draft" && (
                      <Button size="sm" variant="flat" color="primary" isIconOnly isLoading={sendMutation.isPending} title="Send"
                        onPress={() => sendMutation.mutate(po.id)}><Send size={15} /></Button>
                    )}
                    {po.status === "sent" && (
                      <Button size="sm" variant="flat" color="success" isIconOnly isLoading={receiveMutation.isPending} title="Mark Received"
                        onPress={() => receiveMutation.mutate(po.id)}><PackageCheck size={15} /></Button>
                    )}
                    <Button size="sm" variant="flat" isIconOnly title="Download PDF" onPress={() => downloadPdf(purchaseOrdersApi.getPdfUrl(po.id), (po.po_number || "po-" + po.id) + ".pdf")}><FileDown size={15} /></Button>
                    <Button size="sm" variant="flat" isIconOnly title="Duplicate" onPress={() => router.push(`/purchase-orders/new?from=${po.id}`)}><Copy size={15} /></Button>
                    <Button size="sm" variant="flat" color="danger" isIconOnly isLoading={deleteMutation.isPending} title="Delete"
                      onPress={() => { if (confirm("Delete this purchase order?")) deleteMutation.mutate(po.id); }}><Trash2 size={15} /></Button>
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
