"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller } from "react-hook-form";
import { clientsApi, quotationsApi, settingsApi } from "@/lib/api";
import { Client, TaxRate } from "@/types";
import { LineItemsEditor } from "@/components/documents/LineItemsEditor";
import { Topbar } from "@/components/ui/Topbar";

export default function NewQuotationPage() {
  const router = useRouter();

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => clientsApi.list(),
  });
  const { data: taxRates = [] } = useQuery<TaxRate[]>({
    queryKey: ["tax-rates"],
    queryFn: settingsApi.getTaxRates,
  });

  const { register, handleSubmit, control, watch } = useForm({
    defaultValues: {
      client_id: "",
      currency: "MYR",
      exchange_rate: "1",
      issue_date: new Date().toISOString().split("T")[0],
      expiry_date: "",
      discount_amount: "0",
      notes: "",
      terms_conditions: "",
      items: [{ description: "", quantity: "1", unit_price: "0", tax_rate_id: "" }],
    },
  });

  const currency = watch("currency");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => quotationsApi.create(data),
    onSuccess: (result) => router.push(`/quotations/${result.id}`),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    const payload = {
      ...data,
      client_id: Number(data.client_id),
      exchange_rate: Number(data.exchange_rate),
      discount_amount: Number(data.discount_amount),
      issue_date: new Date(data.issue_date as string).toISOString(),
      expiry_date: data.expiry_date ? new Date(data.expiry_date as string).toISOString() : null,
      items: (data.items as Array<Record<string, string>>).map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        tax_rate_id: item.tax_rate_id ? Number(item.tax_rate_id) : null,
        sort_order: 0,
      })),
    };
    mutation.mutate(payload);
  };

  const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

  return (
    <div>
      <Topbar title="New Quotation" />
      <div className="p-6 max-w-4xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card>
              <CardHeader><h3 className="font-semibold">Quotation Details</h3></CardHeader>
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller
                  name="client_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Client *"
                      selectedKeys={field.value ? [field.value] : []}
                      onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}
                    >
                      {clients.map((c) => (
                        <SelectItem key={String(c.id)}>{c.company_name}</SelectItem>
                      ))}
                    </Select>
                  )}
                />
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Currency"
                      selectedKeys={[field.value]}
                      onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}
                    >
                      {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
                    </Select>
                  )}
                />
                <Input label="Issue Date" type="date" {...register("issue_date")} />
                <Input label="Expiry Date" type="date" {...register("expiry_date")} />
                <Input label="Exchange Rate" type="number" step="0.000001" {...register("exchange_rate")} />
                <Input label="Discount Amount" type="number" step="0.01" startContent={<span className="text-xs text-gray-400">{currency}</span>} {...register("discount_amount")} />
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
                <Textarea label="Notes" {...register("notes")} />
                <Textarea label="Terms & Conditions" {...register("terms_conditions")} />
              </CardBody>
            </Card>

            {mutation.isError && <p className="text-danger text-sm">Failed to create quotation.</p>}
            <div className="flex gap-3">
              <Button type="submit" color="primary" className="bg-[#1a1a2e]" isLoading={mutation.isPending}>
                Create Quotation
              </Button>
              <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
