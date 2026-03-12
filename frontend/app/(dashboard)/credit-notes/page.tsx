"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Chip, Select, SelectItem, Input, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea,
} from "@heroui/react";
import { Plus, Edit2, Trash2, CheckCircle, XCircle, FileDown } from "lucide-react";
import { creditNotesApi, clientsApi, invoicesApi, downloadPdf } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUSES = ["draft", "issued", "applied", "cancelled"] as const;
type CNStatus = typeof STATUSES[number];
const PAGE_SIZE = 10;

const STATUS_COLOR: Record<string, "default" | "primary" | "success" | "danger"> = {
  draft: "default",
  issued: "primary",
  applied: "success",
  cancelled: "danger",
};

interface CreditNoteItem {
  description: string;
  quantity: string;
  unit_price: string;
  sort_order: number;
}

const EMPTY_ITEM: CreditNoteItem = { description: "", quantity: "1", unit_price: "0", sort_order: 0 };

const EMPTY_FORM = {
  client_id: "",
  invoice_id: "",
  currency: "MYR",
  issue_date: new Date().toISOString().slice(0, 10),
  reason: "",
  notes: "",
};

export default function CreditNotesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<CNStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [items, setItems] = useState<CreditNoteItem[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState("");

  const { data: creditNotes = [], isLoading } = useQuery<any[]>({
    queryKey: ["credit-notes", statusFilter, search, page],
    queryFn: () => creditNotesApi.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["clients-all"],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["invoices-all"],
    queryFn: () => invoicesApi.list({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => creditNotesApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => creditNotesApi.update(editId!, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save"),
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => creditNotesApi.issue(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credit-notes"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => creditNotesApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credit-notes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => creditNotesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credit-notes"] }),
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setItems([{ ...EMPTY_ITEM }]);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (cn: any) => {
    setEditId(cn.id);
    setForm({
      client_id: String(cn.client_id),
      invoice_id: cn.invoice_id ? String(cn.invoice_id) : "",
      currency: cn.currency,
      issue_date: cn.issue_date.slice(0, 10),
      reason: cn.reason || "",
      notes: cn.notes || "",
    });
    setItems(
      cn.items?.length > 0
        ? cn.items.map((it: any) => ({
            description: it.description,
            quantity: String(it.quantity),
            unit_price: String(it.unit_price),
            sort_order: it.sort_order,
          }))
        : [{ ...EMPTY_ITEM }]
    );
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditId(null); setError(""); };

  const addItem = () => setItems((p) => [...p, { ...EMPTY_ITEM, sort_order: p.length }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof CreditNoteItem, value: string) =>
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const lineTotal = (it: CreditNoteItem) => (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  const grandTotal = items.reduce((sum, it) => sum + lineTotal(it), 0);

  const handleSubmit = () => {
    if (!form.client_id) { setError("Please select a client"); return; }
    const payload = {
      client_id: Number(form.client_id),
      invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
      currency: form.currency,
      issue_date: new Date(form.issue_date).toISOString(),
      reason: form.reason || null,
      notes: form.notes || null,
      items: items.filter((it) => it.description.trim()).map((it, i) => ({
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        sort_order: i,
      })),
    };
    editId ? updateMutation.mutate(payload) : createMutation.mutate(payload);
  };

  const clientInvoices = form.client_id
    ? invoices.filter((inv: any) => String(inv.client_id) === form.client_id)
    : [];

  const totalValue = creditNotes.reduce((sum, cn) => sum + parseFloat(cn.total || 0), 0);
  const totalAvailable = creditNotes
    .filter((cn) => cn.status === "issued")
    .reduce((sum, cn) => sum + parseFloat(cn.available_balance || 0), 0);
  const countDraft = creditNotes.filter((cn) => cn.status === "draft").length;
  const countIssued = creditNotes.filter((cn) => cn.status === "issued").length;

  return (
    <div>
      <Topbar title="Credit Notes" />
      <div className="p-6">

        {/* Summary Bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
            <span className="text-default-500">Total Value</span>
            <span className="font-semibold ml-1">{formatCurrency(totalValue, "MYR")}</span>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-50 text-sm">
            <span className="text-primary-600">Available Credit</span>
            <span className="font-semibold ml-1 text-primary-700">{formatCurrency(totalAvailable, "MYR")}</span>
          </div>
          {countDraft > 0 && <Chip size="sm" color="default" variant="flat">Draft: {countDraft}</Chip>}
          {countIssued > 0 && <Chip size="sm" color="primary" variant="flat">Issued: {countIssued}</Chip>}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="Search by number or client..."
              size="sm" className="w-56" variant="bordered"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Select
              placeholder="Filter by status"
              className="w-44" size="sm"
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(keys) => { setStatusFilter(Array.from(keys)[0] as CNStatus | ""); setPage(1); }}
            >
              {STATUSES.map((s) => (
                <SelectItem key={s} className="capitalize">{s}</SelectItem>
              ))}
            </Select>
          </div>
          <Button color="primary" startContent={<Plus size={15} />} onPress={openCreate}>
            New Credit Note
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto -mx-1">
          <Table aria-label="Credit Notes" isLoading={isLoading}>
            <TableHeader>
              <TableColumn>Number</TableColumn>
              <TableColumn>Client</TableColumn>
              <TableColumn>Invoice Ref</TableColumn>
              <TableColumn>Date</TableColumn>
              <TableColumn>Reason</TableColumn>
              <TableColumn>Total</TableColumn>
              <TableColumn>Available</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
            </TableHeader>
            <TableBody>
              {creditNotes.map((cn: any) => (
                <TableRow key={cn.id}>
                  <TableCell className="font-medium whitespace-nowrap">{cn.credit_note_number}</TableCell>
                  <TableCell>{cn.client_name}</TableCell>
                  <TableCell className="text-default-400 text-sm">
                    {cn.invoice_id
                      ? invoices.find((inv: any) => inv.id === cn.invoice_id)?.invoice_number || `#${cn.invoice_id}`
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(cn.issue_date)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-default-500 truncate block max-w-xs">{cn.reason || "—"}</span>
                  </TableCell>
                  <TableCell>{formatCurrency(cn.total, cn.currency)}</TableCell>
                  <TableCell>
                    <span className={parseFloat(cn.available_balance) > 0 ? "text-primary font-medium" : "text-default-400"}>
                      {formatCurrency(cn.available_balance, cn.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" color={STATUS_COLOR[cn.status] ?? "default"} variant="flat" className="capitalize">
                      {cn.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-nowrap">
                      {cn.status === "draft" && (
                        <Button size="sm" variant="flat" color="primary" isIconOnly title="Issue"
                          isLoading={issueMutation.isPending} onPress={() => issueMutation.mutate(cn.id)}>
                          <CheckCircle size={15} />
                        </Button>
                      )}
                      {(cn.status === "draft" || cn.status === "issued") && (
                        <Button size="sm" variant="flat" isIconOnly title="Edit" onPress={() => openEdit(cn)}>
                          <Edit2 size={15} />
                        </Button>
                      )}
                      <Button size="sm" variant="flat" isIconOnly title="Download PDF"
                        onPress={() => downloadPdf(creditNotesApi.getPdfUrl(cn.id), `${cn.credit_note_number}.pdf`)}>
                        <FileDown size={15} />
                      </Button>
                      {(cn.status === "draft" || cn.status === "issued") && (
                        <Button size="sm" variant="flat" color="danger" isIconOnly title="Cancel"
                          isLoading={cancelMutation.isPending}
                          onPress={() => { if (confirm("Cancel this credit note?")) cancelMutation.mutate(cn.id); }}>
                          <XCircle size={15} />
                        </Button>
                      )}
                      {cn.status === "cancelled" && (
                        <Button size="sm" variant="flat" color="danger" isIconOnly title="Delete"
                          isLoading={deleteMutation.isPending}
                          onPress={() => { if (confirm("Delete this credit note?")) deleteMutation.mutate(cn.id); }}>
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (creditNotes.length >= PAGE_SIZE ? 1 : 0)}
            page={page}
            onChange={setPage}
            size="sm"
            showControls
          />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editId ? "Edit Credit Note" : "New Credit Note"}</ModalHeader>
          <ModalBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select variant="bordered" label="Client *"
                selectedKeys={form.client_id ? [form.client_id] : []}
                onSelectionChange={(k) => setForm((p) => ({ ...p, client_id: Array.from(k)[0] as string || "", invoice_id: "" }))}>
                {clients.map((c: any) => (
                  <SelectItem key={String(c.id)}>{c.company_name}</SelectItem>
                ))}
              </Select>
              <Select variant="bordered" label="Related Invoice (optional)"
                selectedKeys={form.invoice_id ? [form.invoice_id] : []}
                onSelectionChange={(k) => setForm((p) => ({ ...p, invoice_id: Array.from(k)[0] as string || "" }))}>
                {clientInvoices.map((inv: any) => (
                  <SelectItem key={String(inv.id)}>{inv.invoice_number}</SelectItem>
                ))}
              </Select>
              <Input variant="bordered" label="Issue Date" type="date" value={form.issue_date}
                onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} />
              <Select variant="bordered" label="Currency" selectedKeys={[form.currency]}
                onSelectionChange={(k) => setForm((p) => ({ ...p, currency: Array.from(k)[0] as string }))}>
                {["MYR", "USD", "EUR", "GBP", "SGD"].map((c) => <SelectItem key={c}>{c}</SelectItem>)}
              </Select>
            </div>

            <Input variant="bordered" label="Reason for Credit Note" value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Line Items</p>
                <Button size="sm" variant="flat" startContent={<Plus size={13} />} onPress={addItem}>Add Item</Button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <Input size="sm" variant="bordered" placeholder="Description"
                        value={it.description}
                        onChange={(e) => updateItem(i, "description", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Input size="sm" variant="bordered" placeholder="Qty" type="number" min="0" step="0.01"
                        value={it.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Input size="sm" variant="bordered" placeholder="Unit Price" type="number" min="0" step="0.01"
                        value={it.unit_price}
                        onChange={(e) => updateItem(i, "unit_price", e.target.value)} />
                    </div>
                    <div className="col-span-1 text-sm font-medium text-default-700 text-right whitespace-nowrap">
                      {formatCurrency(lineTotal(it), form.currency)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <Button size="sm" variant="light" color="danger" isIconOnly onPress={() => removeItem(i)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-3 px-1">
                <span className="text-sm text-default-500 mr-3">Total</span>
                <span className="text-sm font-bold">{formatCurrency(grandTotal, form.currency)}</span>
              </div>
            </div>

            <Textarea variant="bordered" label="Internal Notes" value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} minRows={2} />

            {error && <p className="text-danger text-sm">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>Cancel</Button>
            <Button color="primary"
              isLoading={createMutation.isPending || updateMutation.isPending}
              isDisabled={!form.client_id}
              onPress={handleSubmit}>
              {editId ? "Save Changes" : "Create Credit Note"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
