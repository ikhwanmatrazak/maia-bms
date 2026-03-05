"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, CardBody, CardHeader, Chip,
  Input, Select, SelectItem, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure,
} from "@heroui/react";
import { api } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

type TemplateItem = { description: string; quantity: number; unit_price: number; sub_items?: string[] };
type DocTemplate = {
  id: number; name: string; type: string; style: string; is_default: boolean;
  items: TemplateItem[]; notes: string; terms_conditions: string;
  currency: string; exchange_rate: number; discount_amount: number;
  expiry_days: number; due_days: number;
};
type FormState = {
  name: string; type: string; style: string;
  items: TemplateItem[]; notes: string; terms_conditions: string;
  currency: string; exchange_rate: string; discount_amount: string;
  expiry_days: string; due_days: string;
};

const BLANK_ITEM = (): TemplateItem => ({ description: "", quantity: 1, unit_price: 0, sub_items: [] });
const TYPE_LABELS: Record<string, string> = { quotation: "Quotation", invoice: "Invoice", receipt: "Receipt" };
const STYLE_LABELS: Record<string, string> = { professional: "Professional", minimal: "Minimal" };
const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];
const emptyForm = (): FormState => ({
  name: "", type: "quotation", style: "professional",
  items: [BLANK_ITEM()], notes: "", terms_conditions: "",
  currency: "MYR", exchange_rate: "1", discount_amount: "0",
  expiry_days: "0", due_days: "0",
});

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [nameError, setNameError] = useState("");

  const { data: templates = [], isLoading } = useQuery<DocTemplate[]>({
    queryKey: ["templates"],
    queryFn: () => api.get("/settings/templates").then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, ...rest }: FormState & { id?: number }) =>
      id
        ? api.put(`/settings/templates/${id}`, rest).then((r) => r.data)
        : api.post("/settings/templates", rest).then((r) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); onClose(); },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => api.put(`/settings/templates/${id}`, { is_default: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setNameError(""); onOpen(); };

  const openEdit = (t: DocTemplate) => {
    setEditId(t.id);
    setForm({
      name: t.name, type: t.type, style: t.style,
      items: t.items.length ? t.items.map((i) => ({ ...i, sub_items: i.sub_items || [] })) : [BLANK_ITEM()],
      notes: t.notes || "", terms_conditions: t.terms_conditions || "",
      currency: t.currency || "MYR",
      exchange_rate: String(t.exchange_rate ?? 1),
      discount_amount: String(t.discount_amount ?? 0),
      expiry_days: String(t.expiry_days ?? 0),
      due_days: String(t.due_days ?? 0),
    });
    setNameError("");
    onOpen();
  };

  const handleSave = () => {
    if (!form.name.trim()) { setNameError("Template name is required"); return; }
    const cleanItems = form.items
      .filter((i) => i.description.trim())
      .map((i) => ({ ...i, sub_items: (i.sub_items || []).filter((s) => s.trim()) }));
    saveMutation.mutate({
      ...form,
      items: cleanItems,
      exchange_rate: Number(form.exchange_rate),
      discount_amount: Number(form.discount_amount),
      expiry_days: Number(form.expiry_days),
      due_days: Number(form.due_days),
      ...(editId ? { id: editId } : {}),
    });
  };

  const updateItem = (idx: number, field: keyof TemplateItem, value: string) =>
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: field === "description" ? value : Number(value) };
      return { ...f, items };
    });

  const addSubItem = (idx: number) =>
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], sub_items: [...(items[idx].sub_items || []), ""] };
      return { ...f, items };
    });

  const updateSubItem = (idx: number, subIdx: number, value: string) =>
    setForm((f) => {
      const items = [...f.items];
      const sub = [...(items[idx].sub_items || [])];
      sub[subIdx] = value;
      items[idx] = { ...items[idx], sub_items: sub };
      return { ...f, items };
    });

  const removeSubItem = (idx: number, subIdx: number) =>
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], sub_items: (items[idx].sub_items || []).filter((_, i) => i !== subIdx) };
      return { ...f, items };
    });

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, BLANK_ITEM()] }));
  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const grouped = (["quotation", "invoice", "receipt"] as const).map((type) => ({
    type, items: templates.filter((t) => t.type === type),
  }));

  return (
    <div>
      <Topbar title="Document Templates" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-default-500">
            Templates pre-fill line items, notes and terms when creating quotations or invoices.
          </p>
          <Button color="primary" size="sm" onPress={openCreate}>+ New Template</Button>
        </div>

        {isLoading ? (
          <p className="text-default-400 text-sm">Loading...</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ type, items }) => (
              <Card key={type} shadow="sm">
                <CardHeader className="pb-0">
                  <h2 className="font-semibold text-foreground">{TYPE_LABELS[type]} Templates</h2>
                </CardHeader>
                <CardBody>
                  {items.length === 0 ? (
                    <p className="text-sm text-default-400">No templates yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-divider bg-default-50">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-medium text-foreground text-sm">{t.name}</span>
                            <Chip size="sm" variant="flat" color="default">{STYLE_LABELS[t.style] ?? t.style}</Chip>
                            {t.items.length > 0 && (
                              <span className="text-xs text-default-400">{t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
                            )}
                            {t.is_default && <Chip size="sm" variant="dot" color="success">Default</Chip>}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="flat" onPress={() => openEdit(t)}>Edit</Button>
                            {!t.is_default && (
                              <Button size="sm" variant="flat" isLoading={setDefaultMutation.isPending}
                                onPress={() => setDefaultMutation.mutate(t.id)}>
                                Set Default
                              </Button>
                            )}
                            <Button size="sm" variant="flat" color="danger"
                              onPress={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editId ? "Edit Template" : "New Template"}</ModalHeader>
          <ModalBody className="gap-5">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Template Name *" variant="bordered" className="sm:col-span-1"
                value={form.name} onValueChange={(v) => { setForm((f) => ({ ...f, name: v })); setNameError(""); }}
                isInvalid={!!nameError} errorMessage={nameError}
              />
              {!editId && (
                <Select label="Document Type" variant="bordered" selectedKeys={[form.type]}
                  onSelectionChange={(k) => setForm((f) => ({ ...f, type: Array.from(k)[0] as string }))}>
                  <SelectItem key="quotation">Quotation</SelectItem>
                  <SelectItem key="invoice">Invoice</SelectItem>
                  <SelectItem key="receipt">Receipt</SelectItem>
                </Select>
              )}
              <Select label="PDF Style" variant="bordered" selectedKeys={[form.style]}
                onSelectionChange={(k) => setForm((f) => ({ ...f, style: Array.from(k)[0] as string }))}>
                <SelectItem key="professional">Professional</SelectItem>
                <SelectItem key="minimal">Minimal</SelectItem>
              </Select>
            </div>

            {/* Document defaults */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Default Currency" variant="bordered" selectedKeys={[form.currency]}
                onSelectionChange={(k) => setForm((f) => ({ ...f, currency: Array.from(k)[0] as string }))}>
                {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
              </Select>
              <Input label="Default Exchange Rate" variant="bordered" type="number" step="0.000001" min="0"
                value={form.exchange_rate} onValueChange={(v) => setForm((f) => ({ ...f, exchange_rate: v }))} />
              <Input
                label="Default Discount Amount" variant="bordered" type="number" step="0.01" min="0"
                startContent={<span className="text-xs text-default-400">{form.currency}</span>}
                value={form.discount_amount} onValueChange={(v) => setForm((f) => ({ ...f, discount_amount: v }))} />
              {form.type === "quotation" && (
                <Input label="Valid For (days)" variant="bordered" type="number" min="0"
                  description="Expiry date = issue date + this many days. 0 = no default."
                  value={form.expiry_days} onValueChange={(v) => setForm((f) => ({ ...f, expiry_days: v }))} />
              )}
              {form.type === "invoice" && (
                <Input label="Due In (days)" variant="bordered" type="number" min="0"
                  description="Due date = issue date + this many days. 0 = no default."
                  value={form.due_days} onValueChange={(v) => setForm((f) => ({ ...f, due_days: v }))} />
              )}
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm text-foreground">Default Line Items</p>
                <Button size="sm" variant="flat" onPress={addItem}>+ Add Item</Button>
              </div>
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 mb-1 px-1">
                <span className="col-span-6 text-xs text-default-400">Description</span>
                <span className="col-span-2 text-xs text-default-400">Qty</span>
                <span className="col-span-3 text-xs text-default-400">Unit Price</span>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx}>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <Input variant="bordered" size="sm" placeholder="e.g. Web Development Service"
                          value={item.description} onValueChange={(v) => updateItem(idx, "description", v)} />
                      </div>
                      <div className="col-span-2">
                        <Input variant="bordered" size="sm" type="number" min="0" step="0.01"
                          value={String(item.quantity)} onValueChange={(v) => updateItem(idx, "quantity", v)} />
                      </div>
                      <div className="col-span-3">
                        <Input variant="bordered" size="sm" type="number" min="0" step="0.01"
                          value={String(item.unit_price)} onValueChange={(v) => updateItem(idx, "unit_price", v)} />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeItem(idx)}>×</Button>
                      </div>
                    </div>
                    {/* Sub items */}
                    <div className="pl-4 mt-1 space-y-1">
                      {(item.sub_items || []).map((sub, subIdx) => (
                        <div key={subIdx} className="flex items-center gap-1">
                          <span className="text-default-300 text-xs flex-shrink-0">↳</span>
                          <Input
                            variant="underlined" size="sm" placeholder="Sub item description"
                            classNames={{ inputWrapper: "h-7 min-h-0", input: "text-xs" }}
                            value={sub} onValueChange={(v) => updateSubItem(idx, subIdx, v)}
                          />
                          <button type="button" className="text-default-400 hover:text-danger text-xs px-1 flex-shrink-0"
                            onClick={() => removeSubItem(idx, subIdx)}>✕</button>
                        </div>
                      ))}
                      <button type="button" className="text-xs text-default-400 hover:text-default-600"
                        onClick={() => addSubItem(idx)}>+ sub item</button>
                    </div>
                  </div>
                ))}
                {form.items.length === 0 && (
                  <p className="text-xs text-default-400 py-2">No items — template will start with an empty list.</p>
                )}
              </div>
            </div>

            {/* Notes & Terms */}
            <Textarea label="Default Notes" variant="bordered" minRows={2}
              placeholder="e.g. Payment due within 30 days."
              value={form.notes} onValueChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
            <Textarea label="Default Terms & Conditions" variant="bordered" minRows={2}
              placeholder="e.g. All prices are subject to 8% SST."
              value={form.terms_conditions} onValueChange={(v) => setForm((f) => ({ ...f, terms_conditions: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>Cancel</Button>
            <Button color="primary" onPress={handleSave} isLoading={saveMutation.isPending}>
              {editId ? "Save Changes" : "Create Template"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
