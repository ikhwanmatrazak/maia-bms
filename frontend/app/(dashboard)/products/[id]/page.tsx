"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Chip, Select, SelectItem, Switch, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Card, CardBody, CardHeader,
} from "@heroui/react";
import { productsApi, clientsApi } from "@/lib/api";
import { Product, ProductPricing, ProductSubscription, Client, BillingCycle, SubscriptionStatus } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { Plus, Edit, Trash2, RefreshCw } from "lucide-react";

const CYCLE_LABEL: Record<string, string> = {
  one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually",
};
const CYCLE_COLOR: Record<string, "default" | "primary" | "secondary" | "success"> = {
  one_time: "default", monthly: "primary", quarterly: "secondary", annually: "success",
};
const STATUS_COLOR: Record<string, "success" | "warning" | "danger"> = {
  active: "success", paused: "warning", cancelled: "danger",
};

function addCycle(date: Date, cycle: string): Date {
  const d = new Date(date);
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (cycle === "annually") d.setFullYear(d.getFullYear() + 1);
  return d;
}

const EMPTY_SUB = {
  client_id: "",
  start_date: new Date().toISOString().split("T")[0],
  next_renewal_date: "",
  billing_cycle: "monthly" as BillingCycle,
  amount: "",
  status: "active" as SubscriptionStatus,
  notes: "",
};

type Tab = "details" | "subscriptions";

export default function ProductDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("details");

  // Detail form
  const [detailForm, setDetailForm] = useState<Partial<Product>>({});
  const [detailDirty, setDetailDirty] = useState(false);

  // Pricing modal
  const [pricingModal, setPricingModal] = useState(false);
  const [editPricing, setEditPricing] = useState<ProductPricing | null>(null);
  const [pricingForm, setPricingForm] = useState({ name: "", description: "", amount: "", billing_cycle: "one_time" as BillingCycle, sort_order: 0 });

  // Subscription modal
  const [subModal, setSubModal] = useState(false);
  const [editSub, setEditSub] = useState<ProductSubscription | null>(null);
  const [subForm, setSubForm] = useState({ ...EMPTY_SUB });

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["products", id],
    queryFn: () => productsApi.get(id),
  });

  const { data: subscriptions = [] } = useQuery<ProductSubscription[]>({
    queryKey: ["products", id, "subscriptions"],
    queryFn: () => productsApi.getSubscriptions(id),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  useEffect(() => {
    if (product) {
      setDetailForm({
        name: product.name,
        description: product.description ?? "",
        unit_price: product.unit_price,
        currency: product.currency,
        unit_label: product.unit_label ?? "",
        billing_cycle: product.billing_cycle,
        category: product.category ?? "",
        is_active: product.is_active,
      });
      setDetailDirty(false);
    }
  }, [product]);

  const updateMutation = useMutation({
    mutationFn: (data: object) => productsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", id] });
      setDetailDirty(false);
    },
  });

  const createSubMutation = useMutation({
    mutationFn: (data: object) => productsApi.createSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", id, "subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["products-renewals"] });
      setSubModal(false);
    },
  });

  const updateSubMutation = useMutation({
    mutationFn: ({ subId, data }: { subId: number; data: object }) =>
      productsApi.updateSubscription(id, subId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", id, "subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["products-renewals"] });
      setSubModal(false);
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: (subId: number) => productsApi.deleteSubscription(id, subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", id, "subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["products-renewals"] });
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: (data: object) => productsApi.createPricing(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products", id] }); setPricingModal(false); },
  });

  const updatePricingMutation = useMutation({
    mutationFn: ({ pricingId, data }: { pricingId: number; data: object }) => productsApi.updatePricing(id, pricingId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products", id] }); setPricingModal(false); },
  });

  const deletePricingMutation = useMutation({
    mutationFn: (pricingId: number) => productsApi.deletePricing(id, pricingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", id] }),
  });

  const openAddPricing = () => {
    setEditPricing(null);
    setPricingForm({ name: "", description: "", amount: "", billing_cycle: "one_time", sort_order: product?.pricing.length ?? 0 });
    setPricingModal(true);
  };

  const openEditPricing = (p: ProductPricing) => {
    setEditPricing(p);
    setPricingForm({ name: p.name, description: p.description ?? "", amount: p.amount, billing_cycle: p.billing_cycle, sort_order: p.sort_order });
    setPricingModal(true);
  };

  const submitPricing = () => {
    const payload = { ...pricingForm, amount: Number(pricingForm.amount) };
    if (editPricing) {
      updatePricingMutation.mutate({ pricingId: editPricing.id, data: payload });
    } else {
      createPricingMutation.mutate(payload);
    }
  };

  const openAddSub = () => {
    setEditSub(null);
    setSubForm({
      ...EMPTY_SUB,
      billing_cycle: (product?.billing_cycle ?? "monthly") as BillingCycle,
      amount: String(product?.unit_price ?? ""),
    });
    setSubModal(true);
  };

  const openEditSub = (sub: ProductSubscription) => {
    setEditSub(sub);
    setSubForm({
      client_id: String(sub.client_id),
      start_date: sub.start_date.split("T")[0],
      next_renewal_date: sub.next_renewal_date ? sub.next_renewal_date.split("T")[0] : "",
      billing_cycle: sub.billing_cycle,
      amount: sub.amount,
      status: sub.status,
      notes: sub.notes ?? "",
    });
    setSubModal(true);
  };

  const handleSubFormChange = (key: string, value: string) => {
    setSubForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-compute next_renewal_date when start_date or billing_cycle changes
      if ((key === "start_date" || key === "billing_cycle") && next.billing_cycle !== "one_time" && next.start_date) {
        const d = addCycle(new Date(next.start_date), next.billing_cycle);
        next.next_renewal_date = d.toISOString().split("T")[0];
      }
      return next;
    });
  };

  const submitSub = () => {
    const payload = {
      client_id: Number(subForm.client_id),
      start_date: new Date(subForm.start_date).toISOString(),
      next_renewal_date: subForm.next_renewal_date ? new Date(subForm.next_renewal_date).toISOString() : null,
      billing_cycle: subForm.billing_cycle,
      amount: Number(subForm.amount),
      status: subForm.status,
      notes: subForm.notes || null,
    };
    if (editSub) {
      updateSubMutation.mutate({ subId: editSub.id, data: payload });
    } else {
      createSubMutation.mutate(payload);
    }
  };

  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!product) return <div className="p-6">Product not found</div>;

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const mrr = activeSubs
    .filter((s) => s.billing_cycle === "monthly")
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const arr = activeSubs
    .filter((s) => s.billing_cycle === "annually")
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);

  return (
    <div>
      <Topbar title={product.name} />
      <div className="p-6">

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 border-b">
          {(["details", "subscriptions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "subscriptions" ? `Subscriptions (${subscriptions.length})` : "Details"}
            </button>
          ))}
        </div>

        {/* DETAILS TAB */}
        {tab === "details" && (
          <div className="space-y-6">
            {/* Product Info */}
            <Card>
              <CardHeader><h3 className="font-semibold">Product Information</h3></CardHeader>
              <CardBody className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input variant="bordered" label="Product Name" value={String(detailForm.name ?? "")}
                    onChange={(e) => { setDetailForm({ ...detailForm, name: e.target.value }); setDetailDirty(true); }} />
                  <Input variant="bordered" label="Category" placeholder="e.g. SaaS, Support" value={String(detailForm.category ?? "")}
                    onChange={(e) => { setDetailForm({ ...detailForm, category: e.target.value }); setDetailDirty(true); }} />
                  <Input variant="bordered" label="Base Price" type="number" step="0.01" value={String(detailForm.unit_price ?? "")}
                    onChange={(e) => { setDetailForm({ ...detailForm, unit_price: e.target.value as any }); setDetailDirty(true); }} />
                  <Input variant="bordered" label="Currency" value={String(detailForm.currency ?? "MYR")}
                    onChange={(e) => { setDetailForm({ ...detailForm, currency: e.target.value }); setDetailDirty(true); }} />
                  <Select variant="bordered" label="Billing Cycle"
                    selectedKeys={detailForm.billing_cycle ? [detailForm.billing_cycle] : []}
                    onSelectionChange={(k) => { setDetailForm({ ...detailForm, billing_cycle: Array.from(k)[0] as BillingCycle }); setDetailDirty(true); }}>
                    <SelectItem key="one_time">One-time</SelectItem>
                    <SelectItem key="monthly">Monthly</SelectItem>
                    <SelectItem key="quarterly">Quarterly</SelectItem>
                    <SelectItem key="annually">Annually</SelectItem>
                  </Select>
                  <Input variant="bordered" label="Unit Label" placeholder="e.g. month, user, license"
                    value={String(detailForm.unit_label ?? "")}
                    onChange={(e) => { setDetailForm({ ...detailForm, unit_label: e.target.value }); setDetailDirty(true); }} />
                </div>
                <Textarea variant="bordered" label="Description" value={String(detailForm.description ?? "")}
                  onChange={(e) => { setDetailForm({ ...detailForm, description: e.target.value }); setDetailDirty(true); }} />
                <Switch isSelected={!!detailForm.is_active} size="sm"
                  onValueChange={(v) => { setDetailForm({ ...detailForm, is_active: v }); setDetailDirty(true); }}>
                  Active
                </Switch>
              </CardBody>
            </Card>

            <div className="flex justify-end">
              <Button color="primary" isDisabled={!detailDirty} isLoading={updateMutation.isPending}
                onPress={() => updateMutation.mutate(detailForm)}>
                Save Changes
              </Button>
            </div>

            {/* Pricing Tiers */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <h3 className="font-semibold">Pricing Tiers</h3>
                    <p className="text-xs text-default-400 mt-0.5">Define multiple price components — e.g. one-time setup + monthly fee</p>
                  </div>
                  <Button size="sm" color="primary" variant="flat" startContent={<Plus size={13} />} onPress={openAddPricing}>
                    Add Tier
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                {(!product.pricing || product.pricing.length === 0) ? (
                  <p className="text-sm text-default-400 py-6 text-center">
                    No pricing tiers yet. Add components like "Onboarding Fee" or "Monthly Subscription".
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-default-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-default-500 font-medium text-xs">Name</th>
                        <th className="text-left px-4 py-2.5 text-default-500 font-medium text-xs">Billing</th>
                        <th className="text-right px-4 py-2.5 text-default-500 font-medium text-xs">Amount</th>
                        <th className="w-px px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.pricing.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-default-50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{p.name}</p>
                            {p.description && <p className="text-xs text-default-400">{p.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <Chip size="sm" color={CYCLE_COLOR[p.billing_cycle]} variant="flat">
                              {CYCLE_LABEL[p.billing_cycle]}
                            </Chip>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(p.amount, product.currency)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1">
                              <Button size="sm" variant="light" isIconOnly onPress={() => openEditPricing(p)}><Edit size={13} /></Button>
                              <Button size="sm" variant="light" color="danger" isIconOnly
                                onPress={() => { if (confirm(`Remove "${p.name}"?`)) deletePricingMutation.mutate(p.id); }}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50 border-t">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-xs text-default-500 font-medium">Total (one-time + first period)</td>
                        <td className="px-4 py-3 text-right font-bold">
                          {formatCurrency(
                            String(product.pricing.reduce((s, p) => s + parseFloat(p.amount), 0)),
                            product.currency
                          )}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* SUBSCRIPTIONS TAB */}
        {tab === "subscriptions" && (
          <div className="space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Active Subscribers", value: activeSubs.length },
                { label: "MRR", value: formatCurrency(String(mrr), product.currency) },
                { label: "ARR", value: formatCurrency(String(arr), product.currency) },
              ].map((s) => (
                <Card key={s.label} className="shadow-sm">
                  <CardBody className="p-4">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </CardBody>
                </Card>
              ))}
            </div>

            <div className="flex justify-end">
              <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={openAddSub}>
                Add Subscriber
              </Button>
            </div>

            {subscriptions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No subscribers yet.</p>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Client</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Start Date</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Next Renewal</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Cycle</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Amount</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Days Left</th>
                      <th className="w-px px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => {
                      const days = sub.next_renewal_date ? daysUntil(sub.next_renewal_date) : null;
                      return (
                        <tr key={sub.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{sub.client_name}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDate(sub.start_date)}</td>
                          <td className="px-4 py-3">
                            {sub.next_renewal_date ? formatDate(sub.next_renewal_date) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Chip size="sm" color={CYCLE_COLOR[sub.billing_cycle]} variant="flat">
                              {CYCLE_LABEL[sub.billing_cycle]}
                            </Chip>
                          </td>
                          <td className="px-4 py-3 font-medium">{formatCurrency(sub.amount, product.currency)}</td>
                          <td className="px-4 py-3">
                            <Chip size="sm" color={STATUS_COLOR[sub.status]} variant="flat" className="capitalize">
                              {sub.status}
                            </Chip>
                          </td>
                          <td className="px-4 py-3">
                            {days !== null && sub.status === "active" ? (
                              <span className={`font-semibold ${days <= 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-gray-600"}`}>
                                {days <= 0 ? "Overdue" : `${days}d`}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <Button size="sm" variant="light" isIconOnly onPress={() => openEditSub(sub)}><Edit size={13} /></Button>
                              <Button size="sm" variant="light" color="danger" isIconOnly
                                onPress={() => { if (confirm("Remove this subscription?")) deleteSubMutation.mutate(sub.id); }}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscription Modal */}
      <Modal isOpen={subModal} onClose={() => setSubModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>{editSub ? "Edit Subscription" : "Add Subscriber"}</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select variant="bordered" label="Client *"
              selectedKeys={subForm.client_id ? [subForm.client_id] : []}
              onSelectionChange={(k) => handleSubFormChange("client_id", Array.from(k)[0] as string)}
              isDisabled={!!editSub}>
              {clients.map((c) => (
                <SelectItem key={String(c.id)}>{c.company_name}</SelectItem>
              ))}
            </Select>
            <div className="flex gap-2">
              <Select variant="bordered" label="Billing Cycle" className="flex-1"
                selectedKeys={[subForm.billing_cycle]}
                onSelectionChange={(k) => handleSubFormChange("billing_cycle", Array.from(k)[0] as string)}>
                <SelectItem key="one_time">One-time</SelectItem>
                <SelectItem key="monthly">Monthly</SelectItem>
                <SelectItem key="quarterly">Quarterly</SelectItem>
                <SelectItem key="annually">Annually</SelectItem>
              </Select>
              <Input variant="bordered" label="Amount" type="number" step="0.01" className="flex-1"
                value={subForm.amount}
                onChange={(e) => handleSubFormChange("amount", e.target.value)}
                startContent={<span className="text-xs text-gray-400">{product.currency}</span>} />
            </div>
            <div className="flex gap-2">
              <Input variant="bordered" label="Start Date" type="date" className="flex-1"
                value={subForm.start_date}
                onChange={(e) => handleSubFormChange("start_date", e.target.value)} />
              <Input variant="bordered" label="Next Renewal Date" type="date" className="flex-1"
                value={subForm.next_renewal_date}
                onChange={(e) => handleSubFormChange("next_renewal_date", e.target.value)} />
            </div>
            {editSub && (
              <Select variant="bordered" label="Status"
                selectedKeys={[subForm.status]}
                onSelectionChange={(k) => setSubForm({ ...subForm, status: Array.from(k)[0] as SubscriptionStatus })}>
                <SelectItem key="active">Active</SelectItem>
                <SelectItem key="paused">Paused</SelectItem>
                <SelectItem key="cancelled">Cancelled</SelectItem>
              </Select>
            )}
            <Textarea variant="bordered" label="Notes" value={subForm.notes}
              onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })} minRows={2} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setSubModal(false)}>Cancel</Button>
            <Button color="primary"
              isLoading={createSubMutation.isPending || updateSubMutation.isPending}
              isDisabled={!subForm.client_id || !subForm.amount}
              onPress={submitSub}>
              {editSub ? "Save Changes" : "Add Subscriber"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Pricing Tier Modal */}
      <Modal isOpen={pricingModal} onClose={() => setPricingModal(false)}>
        <ModalContent>
          <ModalHeader>{editPricing ? "Edit Pricing Tier" : "Add Pricing Tier"}</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Input variant="bordered" label="Name *" placeholder="e.g. Onboarding Fee, Monthly Subscription"
              value={pricingForm.name}
              onChange={(e) => setPricingForm({ ...pricingForm, name: e.target.value })} />
            <Input variant="bordered" label="Description" placeholder="Optional details"
              value={pricingForm.description}
              onChange={(e) => setPricingForm({ ...pricingForm, description: e.target.value })} />
            <div className="flex gap-2">
              <Input variant="bordered" label="Amount" type="number" step="0.01" className="flex-1"
                value={pricingForm.amount}
                onChange={(e) => setPricingForm({ ...pricingForm, amount: e.target.value })}
                startContent={<span className="text-xs text-gray-400">{product?.currency}</span>} />
              <Select variant="bordered" label="Billing" className="flex-1"
                selectedKeys={[pricingForm.billing_cycle]}
                onSelectionChange={(k) => setPricingForm({ ...pricingForm, billing_cycle: Array.from(k)[0] as BillingCycle })}>
                <SelectItem key="one_time">One-time</SelectItem>
                <SelectItem key="monthly">Monthly</SelectItem>
                <SelectItem key="quarterly">Quarterly</SelectItem>
                <SelectItem key="annually">Annually</SelectItem>
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setPricingModal(false)}>Cancel</Button>
            <Button color="primary"
              isLoading={createPricingMutation.isPending || updatePricingMutation.isPending}
              isDisabled={!pricingForm.name || !pricingForm.amount}
              onPress={submitPricing}>
              {editPricing ? "Save Changes" : "Add Tier"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
