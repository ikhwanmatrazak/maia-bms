"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, CardHeader, Button, Input, Textarea, Select, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Chip, Switch,
} from "@heroui/react";
import { Edit2, Trash2, Plus } from "lucide-react";
import { vendorsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

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
  bank_name: string | null;
  bank_account_number: string | null;
  notes: string | null;
  is_active: boolean;
}

const EMPTY_FORM = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "Malaysia",
  postal_code: "",
  payment_terms: "",
  bank_name: "",
  bank_account_number: "",
  notes: "",
  is_active: true,
};

const PAYMENT_TERMS_OPTIONS = ["Net 7", "Net 14", "Net 30", "Net 60", "COD", "Advance Payment", "50% Deposit"];

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors", search],
    queryFn: () => vendorsApi.list(search ? { search } : {}),
  });

  const createMutation = useMutation({
    mutationFn: () => vendorsApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      closeModal();
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save vendor"),
  });

  const updateMutation = useMutation({
    mutationFn: () => vendorsApi.update(editVendor!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      closeModal();
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save vendor"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vendorsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors"] }),
  });

  const openCreate = () => {
    setEditVendor(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditVendor(v);
    setForm({
      name: v.name,
      contact_person: v.contact_person || "",
      email: v.email || "",
      phone: v.phone || "",
      address: v.address || "",
      city: v.city || "",
      state: v.state || "",
      country: v.country || "Malaysia",
      postal_code: v.postal_code || "",
      payment_terms: v.payment_terms || "",
      bank_name: v.bank_name || "",
      bank_account_number: v.bank_account_number || "",
      notes: v.notes || "",
      is_active: v.is_active,
    });
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditVendor(null);
    setError("");
  };

  const f = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <Topbar title="Vendors" />
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Input
            placeholder="Search vendors..."
            size="sm"
            className="w-full sm:w-64"
            variant="bordered"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button color="primary" size="sm" startContent={<Plus size={15} />} onPress={openCreate}>
            Add Vendor
          </Button>
        </div>

        <Card>
          <CardBody>
            {isLoading ? (
              <p className="text-gray-400 text-sm">Loading...</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <Table aria-label="Vendors">
                  <TableHeader>
                    <TableColumn>Name</TableColumn>
                    <TableColumn>Contact</TableColumn>
                    <TableColumn>Email / Phone</TableColumn>
                    <TableColumn>Payment Terms</TableColumn>
                    <TableColumn>Status</TableColumn>
                    <TableColumn className="w-px">Actions</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="No vendors yet. Add your first vendor.">
                    {vendors.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell className="text-sm text-gray-500">{v.contact_person || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          <div>{v.email || "—"}</div>
                          {v.phone && <div>{v.phone}</div>}
                        </TableCell>
                        <TableCell>
                          {v.payment_terms ? (
                            <Chip size="sm" variant="flat" color="default">{v.payment_terms}</Chip>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Chip size="sm" color={v.is_active ? "success" : "default"} variant="flat">
                            {v.is_active ? "Active" : "Inactive"}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-nowrap">
                            <Button size="sm" variant="flat" isIconOnly title="Edit" onPress={() => openEdit(v)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              size="sm" variant="flat" color="danger" isIconOnly title="Delete"
                              isLoading={deleteMutation.isPending}
                              onPress={() => { if (confirm(`Delete vendor "${v.name}"?`)) deleteMutation.mutate(v.id); }}
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
            )}
          </CardBody>
        </Card>
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editVendor ? `Edit — ${editVendor.name}` : "Add New Vendor"}</ModalHeader>
          <ModalBody className="space-y-4">
            {/* Basic Info */}
            <p className="text-sm font-medium text-gray-500">Basic Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input variant="bordered" label="Vendor Name *" value={form.name} onChange={f("name")} />
              <Input variant="bordered" label="Contact Person" value={form.contact_person} onChange={f("contact_person")} />
              <Input variant="bordered" label="Email" type="email" value={form.email} onChange={f("email")} />
              <Input variant="bordered" label="Phone" value={form.phone} onChange={f("phone")} />
            </div>

            {/* Address */}
            <p className="text-sm font-medium text-gray-500 pt-1">Address</p>
            <Textarea variant="bordered" label="Street Address" value={form.address} onChange={f("address")} minRows={2} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input variant="bordered" label="City" value={form.city} onChange={f("city")} />
              <Input variant="bordered" label="State" value={form.state} onChange={f("state")} />
              <Input variant="bordered" label="Postal Code" value={form.postal_code} onChange={f("postal_code")} />
              <Input variant="bordered" label="Country" value={form.country} onChange={f("country")} />
            </div>

            {/* Payment Info */}
            <p className="text-sm font-medium text-gray-500 pt-1">Payment Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                variant="bordered"
                label="Payment Terms"
                selectedKeys={form.payment_terms ? [form.payment_terms] : []}
                onSelectionChange={(keys) => setForm((p) => ({ ...p, payment_terms: Array.from(keys)[0] as string || "" }))}
              >
                {PAYMENT_TERMS_OPTIONS.map((t) => <SelectItem key={t}>{t}</SelectItem>)}
              </Select>
              <Input variant="bordered" label="Bank Name" value={form.bank_name} onChange={f("bank_name")} />
              <Input variant="bordered" label="Bank Account Number" value={form.bank_account_number} onChange={f("bank_account_number")} className="sm:col-span-2" />
            </div>

            {/* Notes & Status */}
            <Textarea variant="bordered" label="Notes" value={form.notes} onChange={f("notes")} minRows={2} />
            <div className="flex items-center gap-3">
              <Switch
                isSelected={form.is_active}
                onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                size="sm"
              >
                Active
              </Switch>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>Cancel</Button>
            <Button
              color="primary"
              isLoading={isPending}
              isDisabled={!form.name.trim()}
              onPress={() => editVendor ? updateMutation.mutate() : createMutation.mutate()}
            >
              {editVendor ? "Save Changes" : "Create Vendor"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
