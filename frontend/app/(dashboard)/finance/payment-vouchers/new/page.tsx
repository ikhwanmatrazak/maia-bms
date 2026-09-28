"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Button, Input, Textarea, Select, SelectItem, Card, CardBody, CardHeader,
} from "@heroui/react";
import { paymentVouchersApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

const PAYMENT_METHODS = [
  { key: "bank_transfer", label: "Bank Transfer" },
  { key: "cheque", label: "Cheque" },
  { key: "cash", label: "Cash" },
];

export default function NewPaymentVoucherPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    payee_name: "",
    payee_address: "",
    amount: "",
    description: "",
    payment_method: "bank_transfer",
    cheque_number: "",
    bank_ref: "",
    prepared_by: "",
    approved_by: "",
    notes: "",
    status: "draft",
  });

  const { data: nextNum } = useQuery({
    queryKey: ["pv-next-number"],
    queryFn: () => paymentVouchersApi.nextNumber(),
    enabled: !isEdit,
  });

  const { data: existing } = useQuery({
    queryKey: ["payment-vouchers", editId],
    queryFn: () => paymentVouchersApi.get(Number(editId)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        date: existing.date?.split("T")[0] ?? "",
        payee_name: existing.payee_name ?? "",
        payee_address: existing.payee_address ?? "",
        amount: String(existing.amount ?? ""),
        description: existing.description ?? "",
        payment_method: existing.payment_method ?? "bank_transfer",
        cheque_number: existing.cheque_number ?? "",
        bank_ref: existing.bank_ref ?? "",
        prepared_by: existing.prepared_by ?? "",
        approved_by: existing.approved_by ?? "",
        notes: existing.notes ?? "",
        status: existing.status ?? "draft",
      });
    }
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: (data: object) => paymentVouchersApi.create(data),
    onSuccess: (pv) => router.push(`/finance/payment-vouchers/${pv.id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => paymentVouchersApi.update(Number(editId), data),
    onSuccess: (pv) => router.push(`/finance/payment-vouchers/${pv.id}`),
  });

  const set = (field: string, val: string) => setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = () => {
    const payload = {
      ...form,
      amount: parseFloat(form.amount) || 0,
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = (createMutation.error || updateMutation.error) as any;

  return (
    <div className="flex flex-col min-h-screen bg-default-50">
      <Topbar title={isEdit ? "Edit Payment Voucher" : "New Payment Voucher"} />
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
        <Card>
          <CardHeader className="flex flex-col items-start gap-1 pb-2">
            <div className="text-lg font-semibold">{isEdit ? "Edit Voucher" : "Create Payment Voucher"}</div>
            {!isEdit && nextNum && (
              <div className="text-xs text-default-400">
                Voucher number: <span className="font-mono font-medium text-primary">{nextNum.voucher_number}</span>
              </div>
            )}
          </CardHeader>
          <CardBody className="flex flex-col gap-4">

            {/* Date + Status */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date"
                type="date"
                value={form.date}
                onValueChange={(v) => set("date", v)}
                isRequired
              />
              <Select
                label="Status"
                selectedKeys={new Set([form.status])}
                onSelectionChange={(keys) => set("status", Array.from(keys)[0] as string)}
              >
                <SelectItem key="draft">Draft</SelectItem>
                <SelectItem key="approved">Approved</SelectItem>
                <SelectItem key="cancelled">Cancelled</SelectItem>
              </Select>
            </div>

            {/* Payee */}
            <Input
              label="Payee Name"
              placeholder="Name of person or company receiving payment"
              value={form.payee_name}
              onValueChange={(v) => set("payee_name", v)}
              isRequired
            />
            <Textarea
              label="Payee Address (optional)"
              placeholder="Full address"
              value={form.payee_address}
              onValueChange={(v) => set("payee_address", v)}
              minRows={2}
            />

            {/* Amount */}
            <Input
              label="Amount (MYR)"
              type="number"
              placeholder="0.00"
              value={form.amount}
              onValueChange={(v) => set("amount", v)}
              isRequired
              startContent={<span className="text-default-400 text-sm">MYR</span>}
            />

            {/* Description */}
            <Textarea
              label="Purpose / Description"
              placeholder="What is this payment for?"
              value={form.description}
              onValueChange={(v) => set("description", v)}
              isRequired
              minRows={2}
            />

            {/* Payment Method */}
            <Select
              label="Payment Method"
              selectedKeys={new Set([form.payment_method])}
              onSelectionChange={(keys) => set("payment_method", Array.from(keys)[0] as string)}
            >
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.key}>{m.label}</SelectItem>
              ))}
            </Select>

            {form.payment_method === "cheque" && (
              <Input
                label="Cheque Number"
                value={form.cheque_number}
                onValueChange={(v) => set("cheque_number", v)}
              />
            )}
            {form.payment_method === "bank_transfer" && (
              <Input
                label="Bank Reference / Transaction ID"
                value={form.bank_ref}
                onValueChange={(v) => set("bank_ref", v)}
              />
            )}

            {/* Signatories */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prepared By"
                placeholder="Name"
                value={form.prepared_by}
                onValueChange={(v) => set("prepared_by", v)}
              />
              <Input
                label="Approved By"
                placeholder="Name"
                value={form.approved_by}
                onValueChange={(v) => set("approved_by", v)}
              />
            </div>

            {/* Notes */}
            <Textarea
              label="Notes (optional)"
              value={form.notes}
              onValueChange={(v) => set("notes", v)}
              minRows={2}
            />

            {error && (
              <div className="text-danger text-sm">{error?.response?.data?.detail || "Something went wrong."}</div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="light" onPress={() => router.back()}>Cancel</Button>
              <Button
                color="primary"
                isLoading={isPending}
                onPress={handleSubmit}
                isDisabled={!form.payee_name || !form.amount || !form.description}
              >
                {isEdit ? "Save Changes" : "Create Voucher"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
