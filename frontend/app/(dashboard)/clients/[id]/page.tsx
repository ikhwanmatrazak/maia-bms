"use client";

import { useParams } from "next/navigation";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, CardHeader, Chip, Tab, Tabs,
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem, Textarea, Pagination,
} from "@heroui/react";
import { Pencil, Upload, Trash2, FileText, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { clientsApi, invoicesApi, quotationsApi, productsApi } from "@/lib/api";
import { formatDate, formatCurrency, statusColor, formatRelative } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { Activity, Invoice, Quotation, Reminder, ProductSubscription } from "@/types";
import Link from "next/link";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];
const PAGE_SIZE = 5;

const CYCLE_LABEL: Record<string, string> = {
  one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually",
};
const CYCLE_COLOR: Record<string, "default" | "primary" | "secondary" | "success"> = {
  one_time: "default", monthly: "primary", quarterly: "secondary", annually: "success",
};
const SUB_STATUS_COLOR: Record<string, "success" | "warning" | "danger"> = {
  active: "success", paused: "warning", cancelled: "danger",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function usePage<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { page, setPage, total, paged };
}

type ClientDocument = {
  filename: string;
  original_name: string;
  size: number;
  uploaded_at: string;
  url: string;
};

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = Number(params.id);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => clientsApi.get(clientId),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["clients", clientId, "activities"],
    queryFn: () => clientsApi.getActivities(clientId),
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["clients", clientId, "reminders"],
    queryFn: () => clientsApi.getReminders(clientId),
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices", { client_id: clientId }],
    queryFn: () => invoicesApi.list({ client_id: clientId }),
  });

  const { data: quotations = [] } = useQuery<Quotation[]>({
    queryKey: ["quotations", { client_id: clientId }],
    queryFn: () => quotationsApi.list({ client_id: clientId }),
  });

  const { data: subscriptions = [] } = useQuery<ProductSubscription[]>({
    queryKey: ["client-subscriptions", clientId],
    queryFn: () => productsApi.getClientSubscriptions(clientId),
  });

  const { data: documents = [] } = useQuery<ClientDocument[]>({
    queryKey: ["client-documents", clientId],
    queryFn: () => clientsApi.getDocuments(clientId),
  });

  // Pagination state per tab
  const invPager = usePage(invoices);
  const quotPager = usePage(quotations);
  const docPager = usePage(documents);
  const actPager = usePage(activities);
  const remPager = usePage(reminders);
  const subPager = usePage(subscriptions);

  const updateMutation = useMutation({
    mutationFn: (data: object) => clientsApi.update(clientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setEditModal(false);
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: (file: File) => clientsApi.uploadDocument(clientId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (filename: string) => clientsApi.deleteDocument(clientId, filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] }),
  });

  const openEdit = () => {
    setEditForm({
      company_name: client?.company_name ?? "",
      contact_person: client?.contact_person ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      address: client?.address ?? "",
      city: client?.city ?? "",
      country: client?.country ?? "",
      currency: client?.currency ?? "MYR",
      status: client?.status ?? "active",
      notes: client?.notes ?? "",
    });
    setEditModal(true);
  };

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!client) return <div className="p-6">Client not found</div>;

  const totalBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid), 0);
  const totalBalance = invoices.reduce((sum, inv) => sum + parseFloat(inv.balance_due), 0);
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "";

  return (
    <div>
      <Topbar title={client.company_name} />
      <div className="p-6 space-y-6">

        {/* Client Info */}
        <Card className="shadow-sm">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">{client.company_name}</h3>
              <Chip size="sm" color={statusColor(client.status)} variant="flat">{client.status}</Chip>
            </div>
            <Button size="sm" variant="flat" onPress={openEdit} startContent={<Pencil size={13} />}>Edit</Button>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              {client.contact_person && (
                <div><span className="text-gray-400 block text-xs mb-0.5">Contact Person</span><span className="font-medium">{client.contact_person}</span></div>
              )}
              {client.email && (
                <div><span className="text-gray-400 block text-xs mb-0.5">Email</span><span className="font-medium">{client.email}</span></div>
              )}
              {client.phone && (
                <div><span className="text-gray-400 block text-xs mb-0.5">Phone</span><span className="font-medium">{client.phone}</span></div>
              )}
              <div><span className="text-gray-400 block text-xs mb-0.5">Currency</span><span className="font-medium">{client.currency}</span></div>
              {client.address && (
                <div className="sm:col-span-2"><span className="text-gray-400 block text-xs mb-0.5">Address</span><span className="font-medium">{client.address}</span></div>
              )}
              {(client.city || client.country) && (
                <div><span className="text-gray-400 block text-xs mb-0.5">Location</span><span className="font-medium">{[client.city, client.country].filter(Boolean).join(", ")}</span></div>
              )}
              {client.notes && (
                <div className="sm:col-span-4"><span className="text-gray-400 block text-xs mb-0.5">Notes</span><span className="text-gray-600">{client.notes}</span></div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Billed", value: formatCurrency(totalBilled, client.currency) },
            { label: "Total Paid", value: formatCurrency(totalPaid, client.currency), color: "text-success" },
            { label: "Balance Due", value: formatCurrency(totalBalance, client.currency), color: totalBalance > 0 ? "text-danger" : "text-success" },
            { label: "Total Invoices", value: String(invoices.length) },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardBody className="p-4">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color ?? "text-gray-900"}`}>{item.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs aria-label="Client details">

          {/* Quotations — first */}
          <Tab key="quotations" title={`Quotations${quotations.length > 0 ? ` (${quotations.length})` : ""}`}>
            <div className="space-y-2 mt-2">
              {quotations.length === 0 ? (
                <p className="text-gray-400 text-sm">No quotations</p>
              ) : (
                <>
                  {quotPager.paged.map((q) => (
                    <Link key={q.id} href={`/quotations/${q.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 rounded-lg border hover:bg-gray-50">
                      <span className="font-semibold text-base truncate">{q.quotation_number}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">{formatCurrency(q.total, q.currency)}</span>
                        <Chip size="sm" color={statusColor(q.status)} variant="flat">{q.status}</Chip>
                      </div>
                    </Link>
                  ))}
                  {quotPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={quotPager.total} page={quotPager.page} onChange={quotPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

          {/* Invoices */}
          <Tab key="invoices" title={`Invoices${invoices.length > 0 ? ` (${invoices.length})` : ""}`}>
            <div className="space-y-2 mt-2">
              {invoices.length === 0 ? (
                <p className="text-gray-400 text-sm">No invoices</p>
              ) : (
                <>
                  {invPager.paged.map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 rounded-lg border hover:bg-gray-50">
                      <div className="min-w-0">
                        <span className="font-semibold text-base">{inv.invoice_number}</span>
                        {inv.due_date && <span className="text-xs text-gray-400 ml-2">Due {formatDate(inv.due_date)}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">{formatCurrency(inv.total, inv.currency)}</span>
                        <Chip size="sm" color={statusColor(inv.status)} variant="flat">{inv.status}</Chip>
                      </div>
                    </Link>
                  ))}
                  {invPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={invPager.total} page={invPager.page} onChange={invPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

          {/* Documents */}
          <Tab key="documents" title={`Documents${documents.length > 0 ? ` (${documents.length})` : ""}`}>
            <div className="mt-3 space-y-3">
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Click to upload document</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, Images — any file type accepted</p>
                {uploadDocMutation.isPending && <p className="text-xs text-primary mt-2">Uploading...</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadDocMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              {documents.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No documents uploaded yet</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {docPager.paged.map((doc) => (
                      <div key={doc.filename} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                        <FileText size={18} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.original_name}</p>
                          <p className="text-xs text-gray-400">{formatBytes(doc.size)} · {formatDate(doc.uploaded_at)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a href={`${apiBase}${doc.url}`} target="_blank" rel="noopener noreferrer" download={doc.original_name}>
                            <Button isIconOnly size="sm" variant="light"><Download size={14} /></Button>
                          </a>
                          <Button isIconOnly size="sm" variant="light" color="danger"
                            isLoading={deleteDocMutation.isPending}
                            onPress={() => deleteDocMutation.mutate(doc.filename)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {docPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={docPager.total} page={docPager.page} onChange={docPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

          {/* Activity */}
          <Tab key="activity" title="Activity">
            <div className="space-y-3 mt-2">
              {activities.length === 0 ? (
                <p className="text-gray-400 text-sm">No activity yet</p>
              ) : (
                <>
                  {actPager.paged.map((a) => (
                    <div key={a.id} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium capitalize">{a.type.replace("_", " ")}</span>
                        <span className="text-gray-500 ml-2">{a.description}</span>
                        <div className="text-xs text-gray-400">{formatRelative(a.occurred_at)}</div>
                      </div>
                    </div>
                  ))}
                  {actPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={actPager.total} page={actPager.page} onChange={actPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

          {/* Reminders */}
          <Tab key="reminders" title="Reminders">
            <div className="space-y-3 mt-2">
              {reminders.length === 0 ? (
                <p className="text-gray-400 text-sm">No reminders</p>
              ) : (
                <>
                  {remPager.paged.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Chip size="sm" color={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "default"} variant="flat">
                        {r.priority}
                      </Chip>
                      <div>
                        <div className="font-medium text-sm">{r.title}</div>
                        <div className="text-xs text-gray-400">Due {formatDate(r.due_date)}</div>
                      </div>
                    </div>
                  ))}
                  {remPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={remPager.total} page={remPager.page} onChange={remPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

          {/* Products */}
          <Tab key="products" title={`Products${subscriptions.length > 0 ? ` (${subscriptions.length})` : ""}`}>
            <div className="mt-2">
              {subscriptions.length === 0 ? (
                <p className="text-gray-400 text-sm">No product subscriptions</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {subPager.paged.map((sub) => {
                      const daysLeft = sub.next_renewal_date
                        ? Math.ceil((new Date(sub.next_renewal_date).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <Link key={sub.id} href={`/products/${sub.product_id}`}
                          className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 rounded-lg border hover:bg-gray-50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-base">{sub.product_name}</span>
                              <Chip size="sm" color={SUB_STATUS_COLOR[sub.status]} variant="flat" className="capitalize">
                                {sub.status}
                              </Chip>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <Chip size="sm" color={CYCLE_COLOR[sub.billing_cycle]} variant="flat">
                                {CYCLE_LABEL[sub.billing_cycle]}
                              </Chip>
                              {sub.next_renewal_date && (
                                <span className="text-xs text-gray-400">
                                  Renews {formatDate(sub.next_renewal_date)}
                                  {daysLeft !== null && (
                                    <span className={`ml-1 font-medium ${daysLeft <= 0 ? "text-danger" : daysLeft <= 7 ? "text-warning" : "text-gray-500"}`}>
                                      {daysLeft <= 0 ? "(overdue)" : `(${daysLeft}d)`}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-semibold">{formatCurrency(sub.amount, client.currency)}</span>
                        </Link>
                      );
                    })}
                  </div>
                  {subPager.total > 1 && (
                    <div className="flex justify-center pt-2">
                      <Pagination total={subPager.total} page={subPager.page} onChange={subPager.setPage} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>
        </Tabs>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editModal} onClose={() => setEditModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>Edit Client</ModalHeader>
          <ModalBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input variant="bordered" label="Company Name *" className="sm:col-span-2"
              value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} />
            <Input variant="bordered" label="Contact Person"
              value={editForm.contact_person} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} />
            <Input variant="bordered" label="Email" type="email"
              value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <Input variant="bordered" label="Phone"
              value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            <Select variant="bordered" label="Currency" selectedKeys={[editForm.currency]}
              onSelectionChange={(k) => setEditForm({ ...editForm, currency: Array.from(k)[0] as string })}>
              {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
            </Select>
            <Textarea variant="bordered" label="Address" className="sm:col-span-2"
              value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            <Input variant="bordered" label="City"
              value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
            <Input variant="bordered" label="Country"
              value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
            <Select variant="bordered" label="Status" selectedKeys={[editForm.status]}
              onSelectionChange={(k) => setEditForm({ ...editForm, status: Array.from(k)[0] as string })}>
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="inactive">Inactive</SelectItem>
            </Select>
            <Textarea variant="bordered" label="Notes" className="sm:col-span-2"
              value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditModal(false)}>Cancel</Button>
            <Button color="primary" isLoading={updateMutation.isPending}
              onPress={() => updateMutation.mutate(editForm)}>Save Changes</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
