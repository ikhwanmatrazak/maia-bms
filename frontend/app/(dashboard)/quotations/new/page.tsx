"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { clientsApi, quotationsApi, settingsApi } from "@/lib/api";
import { Client, TaxRate, CompanySettings } from "@/types";
import { LineItemsEditor } from "@/components/documents/LineItemsEditor";
import { Topbar } from "@/components/ui/Topbar";

type TemplateItem = { description: string; quantity: number; unit_price: number };
type DocTemplate = {
  id: number; name: string; type: string; style: string; is_default: boolean;
  items: TemplateItem[]; notes: string; terms_conditions: string;
  currency: string; exchange_rate: number; discount_amount: number; expiry_days: number;
};

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

function NewQuotationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: () => clientsApi.list() });
  const { data: taxRates = [] } = useQuery<TaxRate[]>({ queryKey: ["tax-rates"], queryFn: settingsApi.getTaxRates });
  const { data: templates = [] } = useQuery<DocTemplate[]>({ queryKey: ["templates"], queryFn: settingsApi.getTemplates });
  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ["settings", "company"], queryFn: settingsApi.getCompany });

  const { data: sourceDoc } = useQuery({
    queryKey: ["quotation", fromId],
    queryFn: () => quotationsApi.get(Number(fromId)),
    enabled: !!fromId,
  });

  const quotationTemplates = templates.filter((t) => t.type === "quotation");
  const defaultTemplate = quotationTemplates.find((t) => t.is_default);

  const { register, handleSubmit, control, watch, setValue } = useForm({
    defaultValues: {
      client_id: "",
      template_id: "",
      subject: "",
      currency: "MYR",
      exchange_rate: "1",
      issue_date: new Date().toISOString().split("T")[0],
      expiry_date: "",
      discount_amount: "0",
      notes: "",
      terms_conditions: "",
      payment_terms: "",
      items: [{ description: "", quantity: "1", unit_price: "0", tax_rate_id: "", sub_items: [] }],
    },
  });

  const currency = watch("currency");
  const notesValue = watch("notes");
  const termsValue = watch("terms_conditions");
  const paymentTermsValue = watch("payment_terms");
  const defaultApplied = useRef(false);

  const applyTemplate = (templateId: string) => {
    const tmpl = quotationTemplates.find((t) => String(t.id) === templateId);
    if (!tmpl) return;
    if (tmpl.items.length > 0) {
      setValue("items", tmpl.items.map((i) => ({
        description: i.description,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
        tax_rate_id: "",
        sub_items: (i.sub_items || []).map((s: string) => ({ text: s })),
      })));
    }
    setValue("notes", tmpl.notes ?? "");
    setValue("terms_conditions", tmpl.terms_conditions ?? "");
    if (tmpl.currency) setValue("currency", tmpl.currency);
    if (tmpl.exchange_rate) setValue("exchange_rate", String(tmpl.exchange_rate));
    if (tmpl.discount_amount) setValue("discount_amount", String(tmpl.discount_amount));
    if (tmpl.expiry_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + tmpl.expiry_days);
      setValue("expiry_date", d.toISOString().split("T")[0]);
    }
  };

  useEffect(() => {
    if (companySettings?.payment_terms_text) {
      setValue("payment_terms", companySettings.payment_terms_text);
    }
  }, [companySettings]);

  useEffect(() => {
    if (!defaultApplied.current && defaultTemplate && !fromId) {
      defaultApplied.current = true;
      setValue("template_id", String(defaultTemplate.id));
      if (defaultTemplate.items.length > 0) {
        setValue("items", defaultTemplate.items.map((i) => ({
          description: i.description, quantity: String(i.quantity),
          unit_price: String(i.unit_price), tax_rate_id: "",
          sub_items: (i.sub_items || []).map((s: string) => ({ text: s })),
        })));
      }
      setValue("notes", defaultTemplate.notes ?? "");
      setValue("terms_conditions", defaultTemplate.terms_conditions ?? "");
      if (defaultTemplate.currency) setValue("currency", defaultTemplate.currency);
      if (defaultTemplate.exchange_rate) setValue("exchange_rate", String(defaultTemplate.exchange_rate));
      if (defaultTemplate.discount_amount) setValue("discount_amount", String(defaultTemplate.discount_amount));
      if (defaultTemplate.expiry_days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + defaultTemplate.expiry_days);
        setValue("expiry_date", d.toISOString().split("T")[0]);
      }
    }
  }, [defaultTemplate]);

  useEffect(() => {
    if (!sourceDoc || !fromId) return;
    setValue("client_id", String(sourceDoc.client_id));
    setValue("currency", sourceDoc.currency);
    setValue("exchange_rate", String(sourceDoc.exchange_rate || "1"));
    setValue("discount_amount", String(sourceDoc.discount_amount || "0"));
    setValue("notes", sourceDoc.notes || "");
    setValue("terms_conditions", sourceDoc.terms_conditions || "");
    setValue("payment_terms", sourceDoc.payment_terms || "");
    setValue("items", sourceDoc.items.map((i: any) => {
      const lines = (i.description as string).split("\n");
      return {
        description: lines[0],
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
        tax_rate_id: i.tax_rate_id ? String(i.tax_rate_id) : "",
        sub_items: lines.slice(1).map((l: string) => ({ text: l.replace(/^•\s*/, "").trim() })).filter((s: { text: string }) => s.text),
      };
    }));
  }, [sourceDoc]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => quotationsApi.create(data),
    onSuccess: (result) => router.push(`/quotations/${result.id}`),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    mutation.mutate({
      ...data,
      client_id: Number(data.client_id),
      template_id: data.template_id ? Number(data.template_id) : null,
      exchange_rate: Number(data.exchange_rate),
      discount_amount: Number(data.discount_amount),
      issue_date: new Date(data.issue_date as string).toISOString(),
      expiry_date: data.expiry_date ? new Date(data.expiry_date as string).toISOString() : null,
      items: (data.items as Array<Record<string, any>>).map((item) => {
        const subs = (item.sub_items as Array<{ text: string }> || []).filter((s) => s.text?.trim());
        const desc = subs.length > 0 ? item.description + "\n" + subs.map((s) => "• " + s.text.trim()).join("\n") : item.description;
        return {
          description: desc,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_rate_id: item.tax_rate_id ? Number(item.tax_rate_id) : null,
          sort_order: 0,
        };
      }),
    });
  };

  return (
    <div>
      <Topbar title={fromId ? "Duplicate Quotation" : "New Quotation"} />
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card>
              <CardHeader><h3 className="font-semibold">Quotation Details</h3></CardHeader>
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller name="client_id" control={control} render={({ field }) => (
                  <Select variant="bordered" label="Client *"
                    selectedKeys={field.value ? [field.value] : []}
                    onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}>
                    {clients.map((c) => <SelectItem key={String(c.id)}>{c.company_name}</SelectItem>)}
                  </Select>
                )} />
                <Controller name="template_id" control={control} render={({ field }) => (
                  <Select
                    variant="bordered" label="Template"
                    placeholder={defaultTemplate ? `Default: ${defaultTemplate.name}` : "Select template"}
                    selectedKeys={field.value ? [field.value] : defaultTemplate ? [String(defaultTemplate.id)] : []}
                    onSelectionChange={(keys) => {
                      const val = Array.from(keys)[0] as string ?? "";
                      field.onChange(val);
                      applyTemplate(val);
                    }}
                  >
                    {quotationTemplates.map((t) => (
                      <SelectItem key={String(t.id)} textValue={t.name}>
                        {t.name}{t.items.length > 0 ? ` (${t.items.length} items)` : ""}
                      </SelectItem>
                    ))}
                  </Select>
                )} />
                <Controller name="currency" control={control} render={({ field }) => (
                  <Select variant="bordered" label="Currency" selectedKeys={[field.value]}
                    onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}>
                    {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
                  </Select>
                )} />
                <Input variant="bordered" label="Issue Date" type="date" {...register("issue_date")} />
                <Input variant="bordered" label="Expiry Date" type="date" {...register("expiry_date")} />
                <Input variant="bordered" label="Exchange Rate" type="number" step="0.000001" {...register("exchange_rate")} />
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
                <Input variant="bordered" label="Subject (optional)" {...register("subject")} />
                <Textarea variant="bordered" label="Notes" value={notesValue} {...register("notes")} />
                <Textarea variant="bordered" label="Terms & Conditions" value={termsValue} {...register("terms_conditions")} />
                <Textarea variant="bordered" label="Payment Terms" value={paymentTermsValue} {...register("payment_terms")} />
              </CardBody>
            </Card>

            {mutation.isError && <p className="text-danger text-sm">Failed to create quotation.</p>}
            <div className="flex gap-3">
              <Button type="submit" color="primary" isLoading={mutation.isPending}>Create Quotation</Button>
              <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading...</div>}>
      <NewQuotationForm />
    </Suspense>
  );
}
