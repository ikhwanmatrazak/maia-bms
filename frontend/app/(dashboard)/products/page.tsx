"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Chip, Select, SelectItem, Switch,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import Link from "next/link";
import { Plus, Trash2, Edit, RefreshCw } from "lucide-react";
import { productsApi } from "@/lib/api";
import { Product, ProductSubscription } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const CYCLE_LABEL: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

const CYCLE_COLOR: Record<string, "default" | "primary" | "secondary" | "success"> = {
  one_time: "default",
  monthly: "primary",
  quarterly: "secondary",
  annually: "success",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  unit_price: "",
  currency: "MYR",
  unit_label: "",
  billing_cycle: "monthly",
  category: "",
  is_active: true,
};

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products", search],
    queryFn: () => productsApi.list(search ? { search } : {}),
  });

  const { data: renewals = [] } = useQuery<ProductSubscription[]>({
    queryKey: ["products-renewals"],
    queryFn: () => productsApi.getRenewals(30),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => productsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCreateModal(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const totalActiveSubs = products.reduce((sum, p) => sum + p.active_subscription_count, 0);

  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);

  const handleCreate = () => {
    createMutation.mutate({ ...form, unit_price: Number(form.unit_price) || 0 });
  };

  return (
    <div>
      <Topbar title="Products & Services" />
      <div className="p-6 space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Products", value: products.length },
            { label: "Active Subscriptions", value: totalActiveSubs },
            { label: "Renewals (30 days)", value: renewals.length, warn: renewals.length > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.warn ? "text-warning" : ""}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Products grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Products & Services</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Search..."
                size="sm"
                className="w-44"
                variant="bordered"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={() => setCreateModal(true)}>
                New Product
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No products yet.</p>
              <p className="text-xs mt-1">Add products and services to track subscriptions and renewals.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${!p.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/products/${p.id}`} className="font-semibold text-gray-900 hover:text-primary truncate block">
                        {p.name}
                      </Link>
                      {p.category && <span className="text-xs text-gray-400">{p.category}</span>}
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button as={Link} href={`/products/${p.id}`} size="sm" variant="light" isIconOnly title="Edit">
                        <Edit size={13} />
                      </Button>
                      <Button size="sm" variant="light" color="danger" isIconOnly title="Delete"
                        onPress={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {p.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                  )}

                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(p.unit_price, p.currency)}</p>
                      <p className="text-xs text-gray-400">
                        {p.unit_label ? `/ ${p.unit_label}` : ""}
                        {p.billing_cycle !== "one_time" ? ` · ${CYCLE_LABEL[p.billing_cycle]}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <Chip size="sm" color={CYCLE_COLOR[p.billing_cycle]} variant="flat">
                        {CYCLE_LABEL[p.billing_cycle]}
                      </Chip>
                      <p className="text-xs text-gray-400 mt-1">
                        {p.active_subscription_count} subscriber{p.active_subscription_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {!p.is_active && (
                    <Chip size="sm" color="default" variant="flat" className="mt-2">Inactive</Chip>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Renewals */}
        {renewals.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw size={16} className="text-warning" />
              <h2 className="font-semibold text-gray-800">
                Upcoming Renewals <span className="text-warning text-sm font-normal">(next 30 days)</span>
              </h2>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Product</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Renewal Date</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Cycle</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs uppercase tracking-wide">Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((r) => {
                    const days = r.next_renewal_date ? daysUntil(r.next_renewal_date) : null;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{r.client_name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          <Link href={`/products/${r.product_id}`} className="hover:text-primary">{r.product_name}</Link>
                        </td>
                        <td className="px-4 py-3">{r.next_renewal_date ? formatDate(r.next_renewal_date) : "—"}</td>
                        <td className="px-4 py-3 font-medium">{formatCurrency(r.amount, "MYR")}</td>
                        <td className="px-4 py-3">
                          <Chip size="sm" color={CYCLE_COLOR[r.billing_cycle]} variant="flat">
                            {CYCLE_LABEL[r.billing_cycle]}
                          </Chip>
                        </td>
                        <td className="px-4 py-3">
                          {days !== null ? (
                            <span className={`font-semibold ${days <= 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-gray-600"}`}>
                              {days <= 0 ? "Overdue" : `${days}d`}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Product Modal */}
      <Modal isOpen={createModal} onClose={() => setCreateModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>New Product / Service</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Input variant="bordered" label="Name *" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input variant="bordered" label="Description" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input variant="bordered" label="Category" placeholder="e.g. SaaS, Support, Consulting" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <div className="flex gap-2">
              <Input variant="bordered" label="Price" type="number" step="0.01" value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className="flex-1" />
              <Input variant="bordered" label="Currency" value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-24" />
            </div>
            <div className="flex gap-2">
              <Select variant="bordered" label="Billing Cycle" className="flex-1"
                selectedKeys={[form.billing_cycle]}
                onSelectionChange={(k) => setForm({ ...form, billing_cycle: Array.from(k)[0] as string })}>
                <SelectItem key="one_time">One-time</SelectItem>
                <SelectItem key="monthly">Monthly</SelectItem>
                <SelectItem key="quarterly">Quarterly</SelectItem>
                <SelectItem key="annually">Annually</SelectItem>
              </Select>
              <Input variant="bordered" label="Unit Label" placeholder="month / user / license" value={form.unit_label}
                onChange={(e) => setForm({ ...form, unit_label: e.target.value })} className="flex-1" />
            </div>
            <Switch isSelected={form.is_active} onValueChange={(v) => setForm({ ...form, is_active: v })} size="sm">
              Active
            </Switch>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateModal(false)}>Cancel</Button>
            <Button color="primary" isLoading={createMutation.isPending} isDisabled={!form.name} onPress={handleCreate}>
              Create Product
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
