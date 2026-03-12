"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { purchaseOrdersApi, settingsApi, vendorsApi } from "@/lib/api";
import { TaxRate } from "@/types";
import { LineItemsEditor } from "@/components/documents/LineItemsEditor";
import { Topbar } from "@/components/ui/Topbar";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

interface Vendor {
  id: number;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  payment_terms: string | null;
}

function NewPurchaseOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  const { data: taxRates = [] } = useQuery<TaxRate[]>({ queryKey: ["tax-rates"], queryFn: settingsApi.getTaxRates });
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["vendors-active"], queryFn: () => vendorsApi.list({ active_only: true }) });

  const { data: sourceDoc } = useQuery({
    queryKey: ["purchase-order", fromId],
    queryFn: () => purchaseOrdersApi.get(Number(fromId)),
    enabled: !!fromId,
  });

  const { register, handleSubmit, control, watch, setValue } = useForm({
    defaultValues: {
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

  useEffect(() => {
    if (!sourceDoc || !fromId || vendors.length === 0) return;
    setValue("currency", sourceDoc.currency);
    setValue("exchange_rate", String(sourceDoc.exchange_rate || "1"));
    setValue("discount_amount", String(sourceDoc.discount_amount || "0"));
    setValue("notes", sourceDoc.notes || "");
    setValue("terms_conditions", sourceDoc.terms_conditions || "");
    setValue("items", sourceDoc.items.map((i: any) => ({
      description: i.description,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
      tax_rate_id: i.tax_rate_id ? String(i.tax_rate_id) : "",
      sub_items: [],
    })));
    const match = vendors.find((v) => v.name === sourceDoc.vendor_name);
    if (match) {
      setSelectedVendor(match);
    } else {
      setSelectedVendor({
        id: -1,
        name: sourceDoc.vendor_name,
        contact_person: null,
        email: sourceDoc.vendor_email,
        phone: sourceDoc.vendor_phone,
        address: sourceDoc.vendor_address,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        payment_terms: null,
      });
    }
  }, [sourceDoc, vendors]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => purchaseOrdersApi.create(data),
    onSuccess: (result) => router.push(`/purchase-orders/${result.id}`),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    const addressParts = [
      selectedVendor?.address,
      selectedVendor?.city,
      selectedVendor?.state,
      selectedVendor?.postal_code,
      selectedVendor?.country,
    ].filter(Boolean);

    mutation.mutate({
      ...data,
      vendor_name: selectedVendor?.name || "",
      vendor_email: selectedVendor?.email || "",
      vendor_phone: selectedVendor?.phone || "",
      vendor_address: addressParts.join(", "),
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
      <Topbar title={fromId ? "Duplicate Purchase Order" : "New Purchase Order"} />
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card>
              <CardHeader><h3 className="font-semibold">Vendor</h3></CardHeader>
              <CardBody className="space-y-4">
                {vendors.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No vendors yet. <a href="/vendors" className="text-primary underline">Add vendors</a> first.
                  </p>
                ) : (
                  <Select
                    variant="bordered"
                    label="Select Vendor *"
                    placeholder="Choose a vendor..."
                    selectedKeys={selectedVendor && selectedVendor.id !== -1 ? [String(selectedVendor.id)] : []}
                    onSelectionChange={(keys) => {
                      const id = Array.from(keys)[0] as string;
                      setSelectedVendor(vendors.find((v) => String(v.id) === id) ?? null);
                    }}
                  >
                    {vendors.map((v) => (
                      <SelectItem key={String(v.id)} textValue={v.name}>
                        <div>
                          <p className="font-medium">{v.name}</p>
                          {v.contact_person && <p className="text-xs text-gray-400">{v.contact_person}</p>}
                        </div>
                      </SelectItem>
                    ))}
                  </Select>
                )}
                {selectedVendor && selectedVendor.id === -1 && (
                  <p className="text-sm text-warning">
                    Pre-filled vendor &quot;{selectedVendor.name}&quot; not found in your vendor list. Please select a vendor from the list or the original vendor details will be used.
                  </p>
                )}
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
            {!selectedVendor && vendors.length > 0 && <p className="text-warning text-sm">Please select a vendor before submitting.</p>}
            <div className="flex gap-3">
              <Button type="submit" color="primary" isLoading={mutation.isPending} isDisabled={!selectedVendor && vendors.length > 0}>
                Create Purchase Order
              </Button>
              <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewPurchaseOrderPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading...</div>}>
      <NewPurchaseOrderForm />
    </Suspense>
  );
}
