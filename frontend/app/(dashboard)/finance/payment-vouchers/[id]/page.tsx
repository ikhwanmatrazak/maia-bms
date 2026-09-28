"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Chip, Card, CardBody,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { paymentVouchersApi, downloadPdf } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { formatDate, formatCurrency } from "@/lib/utils";
import { FileDown, Pencil, Trash2, CheckCircle } from "lucide-react";

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

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-default-50 last:border-0">
      <span className="text-default-400 text-sm w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function PaymentVoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);
  const [deleteModal, setDeleteModal] = useState(false);

  const { data: pv, isLoading } = useQuery({
    queryKey: ["payment-vouchers", id],
    queryFn: () => paymentVouchersApi.get(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => paymentVouchersApi.delete(id),
    onSuccess: () => router.push("/finance/payment-vouchers"),
  });

  const approveMutation = useMutation({
    mutationFn: () => paymentVouchersApi.update(id, { status: "approved" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-vouchers", id] }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-default-50">
        <Topbar title="Payment Voucher" />
        <div className="flex justify-center p-16 text-default-400">Loading…</div>
      </div>
    );
  }

  if (!pv) {
    return (
      <div className="flex flex-col min-h-screen bg-default-50">
        <Topbar title="Payment Voucher" />
        <div className="flex justify-center p-16 text-default-400">Voucher not found.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-default-50">
      <Topbar title={pv.voucher_number} />
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full flex flex-col gap-4">

        {/* Action bar */}
        <div className="flex gap-2 flex-wrap justify-end">
          {pv.status === "draft" && (
            <Button
              size="sm"
              color="success"
              variant="flat"
              startContent={<CheckCircle size={14} />}
              isLoading={approveMutation.isPending}
              onPress={() => approveMutation.mutate()}
            >
              Approve
            </Button>
          )}
          <Button
            size="sm"
            variant="flat"
            startContent={<FileDown size={14} />}
            onPress={() => downloadPdf(paymentVouchersApi.getPdfUrl(id), `${pv.voucher_number}.pdf`)}
          >
            Download PDF
          </Button>
          <Button
            size="sm"
            variant="flat"
            startContent={<Pencil size={14} />}
            onPress={() => router.push(`/finance/payment-vouchers/new?edit=${id}`)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            color="danger"
            variant="flat"
            startContent={<Trash2 size={14} />}
            onPress={() => setDeleteModal(true)}
          >
            Delete
          </Button>
        </div>

        {/* Header card */}
        <Card>
          <CardBody>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs text-default-400 mb-1">Payment Voucher</div>
                <div className="text-xl font-bold font-mono">{pv.voucher_number}</div>
                <div className="text-default-500 text-sm mt-1">{formatDate(pv.date)}</div>
              </div>
              <Chip color={STATUS_COLOR[pv.status] ?? "default"} variant="flat">
                {pv.status}
              </Chip>
            </div>

            {/* Amount */}
            <div className="bg-default-50 rounded-xl p-4 mb-4">
              <div className="text-xs text-default-400 mb-1">Amount</div>
              <div className="text-3xl font-bold">{formatCurrency(pv.amount, "MYR")}</div>
              {pv.amount_in_words && (
                <div className="text-xs text-default-400 mt-1 italic">{pv.amount_in_words}</div>
              )}
            </div>

            <Row label="Payee" value={pv.payee_name} />
            {pv.payee_address && <Row label="Payee Address" value={pv.payee_address} />}
            <Row label="Description" value={pv.description} />
            <Row label="Payment Method" value={METHOD_LABEL[pv.payment_method] ?? pv.payment_method} />
            {pv.cheque_number && <Row label="Cheque Number" value={pv.cheque_number} />}
            {pv.bank_ref && <Row label="Bank Ref / TxID" value={pv.bank_ref} />}
            {pv.prepared_by && <Row label="Prepared By" value={pv.prepared_by} />}
            {pv.approved_by && <Row label="Approved By" value={pv.approved_by} />}
            {pv.notes && <Row label="Notes" value={pv.notes} />}
          </CardBody>
        </Card>

        {/* Signature preview */}
        <Card>
          <CardBody>
            <div className="text-xs text-default-400 uppercase tracking-wide mb-4">Signature Section (on printed copy)</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {["Prepared By", "Approved By", "Received By"].map((role) => (
                <div key={role}>
                  <div className="border-t border-default-300 mb-2 mt-10"></div>
                  <div className="text-xs text-default-400">{role}</div>
                  {role === "Prepared By" && pv.prepared_by && (
                    <div className="text-xs font-medium mt-1">{pv.prepared_by}</div>
                  )}
                  {role === "Approved By" && pv.approved_by && (
                    <div className="text-xs font-medium mt-1">{pv.approved_by}</div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)}>
        <ModalContent>
          <ModalHeader>Delete Voucher</ModalHeader>
          <ModalBody>Delete <strong>{pv.voucher_number}</strong>? This cannot be undone.</ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteModal(false)}>Cancel</Button>
            <Button color="danger" isLoading={deleteMutation.isPending} onPress={() => deleteMutation.mutate()}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
