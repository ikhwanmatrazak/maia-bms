"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Textarea,
} from "@heroui/react";
import { Plus, Trash2, CheckCircle, Pencil } from "lucide-react";
import { billsApi } from "@/lib/api";
import { Bill, BillStatus } from "@/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");
function fileUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const STATUS_TABS: { key: BillStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

const STATUS_COLOR: Record<BillStatus, "warning" | "danger" | "success"> = {
  pending: "warning",
  overdue: "danger",
  paid: "success",
};

export default function BillsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BillStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [markPaidModal, setMarkPaidModal] = useState<Bill | null>(null);
  const [payRef, setPayRef] = useState("");

  const { data: bills = [], isLoading } = useQuery<Bill[]>({
    queryKey: ["bills", tab, search],
    queryFn: () =>
      billsApi.list({
        ...(tab !== "all" ? { status: tab } : {}),
        ...(search ? { search } : {}),
      }),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, ref }: { id: number; ref: string }) =>
      billsApi.markPaid(id, ref || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      setMarkPaidModal(null);
      setPayRef("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => billsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bills"] }),
  });

  const totalPending = bills
    .filter((b) => b.status !== "paid")
    .reduce((s, b) => s + (b.amount ?? 0), 0);

  return (
    <div>
      <Topbar title="Bills (Payable)" />
      <div className="p-6">
        {/* Summary */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="px-4 py-2 rounded-xl bg-warning-50 border border-warning-100 text-sm">
            <span className="text-warning-600">Outstanding</span>
            <span className="font-semibold ml-2 text-warning-700">
              {formatCurrency(totalPending, "MYR")}
            </span>
          </div>
          <div className="px-4 py-2 rounded-xl bg-default-100 text-sm">
            <span className="text-default-500">{bills.length} bills</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex gap-1 bg-default-100 p-1 rounded-xl">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-foreground shadow-sm"
                    : "text-default-500 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search vendor or bill number..."
            size="sm"
            className="w-full sm:max-w-xs"
            variant="bordered"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto">
            <Button
              color="primary"
              startContent={<Plus size={16} />}
              onPress={() => router.push("/bills/new")}
            >
              Add Bill
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1">
          <Table aria-label="Bills" isLoading={isLoading}>
            <TableHeader>
              <TableColumn>Vendor</TableColumn>
              <TableColumn>Bill No.</TableColumn>
              <TableColumn>Issue Date</TableColumn>
              <TableColumn>Due Date</TableColumn>
              <TableColumn>Amount</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn className="w-px">Actions</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No bills found.">
              {bills.map((bill) => (
                <TableRow
                  key={bill.id}
                  className="cursor-pointer hover:bg-default-50"
                  onClick={() => router.push(`/bills/${bill.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{bill.vendor_name ?? "—"}</div>
                    {bill.description && (
                      <div className="text-xs text-default-400 truncate max-w-[200px]">
                        {bill.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{bill.bill_number ?? "—"}</TableCell>
                  <TableCell>{bill.issue_date ? formatDate(bill.issue_date) : "—"}</TableCell>
                  <TableCell>
                    {bill.due_date ? (
                      <span
                        className={
                          bill.status !== "paid" &&
                          new Date(bill.due_date) < new Date()
                            ? "text-danger-600 font-medium"
                            : ""
                        }
                      >
                        {formatDate(bill.due_date)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {bill.amount != null
                      ? formatCurrency(bill.amount, bill.currency)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" color={STATUS_COLOR[bill.status]} variant="flat">
                      {bill.status}
                    </Chip>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="flat"
                        isIconOnly
                        title="Edit"
                        onPress={() => router.push(`/bills/${bill.id}`)}
                      >
                        <Pencil size={14} />
                      </Button>
                      {bill.status !== "paid" && (
                        <Button
                          size="sm"
                          color="success"
                          variant="flat"
                          isIconOnly
                          title="Mark as paid"
                          onPress={() => {
                            setMarkPaidModal(bill);
                            setPayRef("");
                          }}
                        >
                          <CheckCircle size={14} />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        isIconOnly
                        title="Delete"
                        onPress={() => deleteMutation.mutate(bill.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mark Paid Modal */}
      <Modal isOpen={!!markPaidModal} onClose={() => setMarkPaidModal(null)}>
        <ModalContent>
          <ModalHeader>Mark as Paid</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-3">
              Mark <strong>{markPaidModal?.vendor_name}</strong> bill as paid?
            </p>
            <Textarea
              variant="bordered"
              label="Payment Reference (optional)"
              placeholder="e.g. bank transfer ref, cheque no."
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              minRows={2}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setMarkPaidModal(null)}>
              Cancel
            </Button>
            <Button
              color="success"
              isLoading={markPaidMutation.isPending}
              onPress={() =>
                markPaidModal &&
                markPaidMutation.mutate({ id: markPaidModal.id, ref: payRef })
              }
            >
              Confirm Paid
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
