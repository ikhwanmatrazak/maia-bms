"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller } from "react-hook-form";
import { purchaseOrdersApi, settingsApi } from "@/lib/api";
import { TaxRate } from "@/types";
import { LineItemsEditor } from "@/components/documents/LineItemsEditor";
import { Topbar } from "@/components/ui/Topbar";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const { data: taxRates = [] } = useQuery<TaxRate[]>({ queryKey: ["tax-rates"], queryFn: settingsApi.getTaxRates });

  const { register, handleSubmit, control, watch } = useForm({
    defaultValues: {
      vendor_name: "",
      vendor_email: "",
      vendor_phone: "",
      vendor_address: "",
      currency: "MYR",
      exchange_rate: "1",
      issue_date: new Date().toISOString().split("T")[0],
      expected_delivery_date: "",
      discount_amount: "0",
      notes: "",
      terms_conditions: "",
      items: [{ description: "", quantity: "1", unit_price: "0", tax_rate_id: "", sub_items: [] }],
    },
  });

  const currency = watch("currency");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => purchaseOrdersApi.create(data),
    onSuccess: (result) => router.push(`/purchase-orders/${result.id}`),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    mutation.mutate({
      ...data,
      exchange_rate: Number(data.exchange_rate),
      discount_amount: Number(data.discount_amount),
      issue_date: new Date(data.issue_date as string).toISOString(),
      expected_delivery_date: data.expected_delivery_date ? new Date(data.expected_delivery_date as string).toISOString() : null,
      items: (data.items as Array<Record<string, any>>).map((item, i) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        tax_rate_id: item.tax_rate_id ? Number(item.tax_rate_id) : null,
        sort_order: i,
      })),
    });
  };

  return (
    <div>
      <Topbar title="New Purchase Order" />
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card>
              <CardHeader><h3 className="font-semibold">Vendor Details</h3></CardHeader>
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input variant="bordered" label="Vendor Name *" {...register("vendor_name")} />
                <Input variant="bordered" label="Vendor Email" type="email" {...register("vendor_email")} />
                <Input variant="bordered" label="Vendor Phone" {...register("vendor_phone")} />
                <Textarea variant="bordered" label="Vendor Address" {...register("vendor_address")} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold">Order Details</h3></CardHeader>
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller name="currency" control={control} render={({ field }) => (
                  <Select variant="bordered" label="Currency" selectedKeys={[field.value]}
                    onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}>
                    {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
                  </Select>
                )} />
                <Input variant="bordered" label="Exchange Rate" type="number" step="0.000001" {...register("exchange_rate")} />
                <Input variant="bordered" label="Issue Date" type="date" {...register("issue_date")} />
                <Input variant="bordered" label="Expected Delivery Date" type="date" {...register("expected_delivery_date")} />
                <Input variant="bordered" label="Discount Amount" type="number" step="0.01"
                  startContent={<span className="text-xs text-gray-400">{currency}</span>} {...register("discount_amount")} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold">Line Items</h3></CardHeader>
              <CardBody>
                <LineItemsEditor control={control} register={register} taxRates={taxRates} currency={currency} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold">Notes</h3></CardHeader>
              <CardBody className="gap-4 flex flex-col">
                <Textarea variant="bordered" label="Notes" {...register("notes")} />
                <Textarea variant="bordered" label="Terms & Conditions" {...register("terms_conditions")} />
              </CardBody>
            </Card>

            {mutation.isError && <p className="text-danger text-sm">Failed to create purchase order.</p>}
            <div className="flex gap-3">
              <Button type="submit" color="primary" isLoading={mutation.isPending}>Create Purchase Order</Button>
              <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
