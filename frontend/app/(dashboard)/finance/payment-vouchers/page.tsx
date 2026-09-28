"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { paymentVouchersApi, downloadPdf } from "@/lib/api";
import { PaymentVoucher } from "@/types";
import { Topbar } from "@/components/ui/Topbar";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Plus, Search, FileDown, Trash2 } from "lucide-react";

const STATUS_COLOR: Record<string, "warning" | "success" | "danger" | "default"> = {
  draft: "warning",
  approved: "success",
  cancelled: "danger",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
};

export default function PaymentVouchersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-vouchers", search, statusFilter],
    queryFn: () =>
      paymentVouchersApi.list({ search: search || undefined, status: statusFilter || undefined, limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => paymentVouchersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-vouchers"] });
      setDeleteId(null);
    },
  });

  const vouchers: PaymentVoucher[] = data?.items ?? [];

  const total = vouchers.reduce((sum, v) => sum + (v.amount ?? 0), 0);

  return (
    <div className="flex flex-col min-h-screen bg-default-50">
      <Topbar title="Payment Vouchers" />
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-4">

        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="Search voucher number, payee…"
              value={search}
              onValueChange={setSearch}
              startContent={<Search size={15} className="text-default-400" />}
              size="sm"
              className="max-w-xs"
            />
            <select
              className="text-sm border border-default-200 rounded-lg px-3 py-1.5 bg-content1 text-foreground"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <Button
            color="primary"
            size="sm"
            startContent={<Plus size={15} />}
            onPress={() => router.push("/finance/payment-vouchers/new")}
          >
            New Voucher
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Vouchers", value: vouchers.length },
            { label: "Approved", value: vouchers.filter((v) => v.status === "approved").length },
            { label: "Total Amount", value: formatCurrency(total, "MYR") },
          ].map((s) => (
            <div key={s.label} className="bg-content1 rounded-xl p-4 shadow-sm border border-default-100">
              <div className="text-xs text-default-400 mb-1">{s.label}</div>
              <div className="text-lg font-semibold">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-content1 rounded-xl shadow-sm border border-default-100 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center p-12"><Spinner /></div>
          ) : vouchers.length === 0 ? (
            <div className="text-center text-default-400 py-16">
              No payment vouchers found.{" "}
              <button
                className="text-primary underline"
                onClick={() => router.push("/finance/payment-vouchers/new")}
              >
                Create one
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default-100 bg-default-50">
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Voucher No.</th>
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Payee</th>
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Method</th>
                    <th className="text-right px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Amount (MYR)</th>
                    <th className="text-left px-4 py-3 font-medium text-default-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-default-50 hover:bg-default-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/finance/payment-vouchers/${v.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{v.voucher_number}</td>
                      <td className="px-4 py-3 text-default-600">{formatDate(v.date)}</td>
                      <td className="px-4 py-3 font-medium">{v.payee_name}</td>
                      <td className="px-4 py-3 text-default-500 max-w-xs truncate">{v.description}</td>
                      <td className="px-4 py-3 text-default-500">{METHOD_LABEL[v.payment_method] ?? v.payment_method}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(v.amount, "MYR")}</td>
                      <td className="px-4 py-3">
                        <Chip size="sm" color={STATUS_COLOR[v.status] ?? "default"} variant="flat">
                          {v.status}
                        </Chip>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <Button
                            isIconOnly size="sm" variant="light"
                            onPress={() => downloadPdf(paymentVouchersApi.getPdfUrl(v.id), `${v.voucher_number}.pdf`)}
                            title="Download PDF"
                          >
                            <FileDown size={14} />
                          </Button>
                          <Button
                            isIconOnly size="sm" variant="light" color="danger"
                            onPress={() => setDeleteId(v.id)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)}>
        <ModalContent>
          <ModalHeader>Delete Payment Voucher</ModalHeader>
          <ModalBody>Are you sure you want to delete this voucher? This action cannot be undone.</ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
            <Button
              color="danger"
              isLoading={deleteMutation.isPending}
              onPress={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
