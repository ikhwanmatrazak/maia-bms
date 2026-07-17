"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, Button, Chip, Select, SelectItem, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea,
} from "@heroui/react";
import { remindersApi, clientsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { TableSkeleton } from "@/components/ui/PageSkeleton";
import { Bell, Repeat, Trash2, RotateCcw } from "lucide-react";

const PAGE_SIZE = 10;

const FILTERS = [
  { key: "", label: "Active" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

const PRIORITIES = ["low", "medium", "high"];

const RECURRENCE_LABELS: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  weekly: "Weekly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const DAYS_OF_WEEK = [
  { key: "0", label: "Monday" },
  { key: "1", label: "Tuesday" },
  { key: "2", label: "Wednesday" },
  { key: "3", label: "Thursday" },
  { key: "4", label: "Friday" },
  { key: "5", label: "Saturday" },
  { key: "6", label: "Sunday" },
];

const ACTION_LABELS: Record<string, string> = {
  reminder: "Reminder only",
  create_invoice: "Create Invoice",
};

const emptyForm = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  recurrence_type: "one_time",
  day_of_month: "",
  day_of_week: "0",
  action_type: "reminder",
  client_id: "",
};

export default function RemindersPage() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const queryClient = useQueryClient();

  const { data: reminders = [], isLoading } = useQuery<any[]>({
    queryKey: ["reminders", filter],
    queryFn: () => remindersApi.list(filter ? { filter } : {}),
  });

  const { data: clientsData } = useQuery<any>({
    queryKey: ["clients", "all"],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });
  const clients: any[] = clientsData?.items ?? clientsData ?? [];

  const totalPages = Math.max(1, Math.ceil(reminders.length / PAGE_SIZE));
  const paged = reminders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setModal(true);
  };

  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      title: r.title,
      description: r.description || "",
      due_date: r.due_date ? r.due_date.slice(0, 10) : "",
      priority: r.priority,
      recurrence_type: r.recurrence_type,
      day_of_month: r.day_of_month?.toString() || "",
      day_of_week: r.day_of_week?.toString() ?? "0",
      action_type: r.action_type,
      client_id: r.client_id?.toString() || "",
    });
    setModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: object) => remindersApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["reminders"] }); setModal(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => remindersApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["reminders"] }); setModal(false); },
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => remindersApi.complete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => remindersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const submit = () => {
    const payload: any = {
      title: form.title,
      description: form.description || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : new Date().toISOString(),
      priority: form.priority,
      recurrence_type: form.recurrence_type,
      action_type: form.action_type,
      client_id: form.client_id ? Number(form.client_id) : null,
    };
    if (form.recurrence_type === "monthly" || form.recurrence_type === "quarterly" || form.recurrence_type === "yearly") {
      payload.day_of_month = form.day_of_month ? Number(form.day_of_month) : null;
    }
    if (form.recurrence_type === "weekly") {
      payload.day_of_week = Number(form.day_of_week);
    }

    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const priorityColor = (p: string) =>
    p === "high" ? "danger" : p === "medium" ? "warning" : "default";

  const recurrenceBadge = (r: any) => {
    if (r.recurrence_type === "one_time") return null;
    let label = RECURRENCE_LABELS[r.recurrence_type] || r.recurrence_type;
    if (r.recurrence_type === "monthly" || r.recurrence_type === "quarterly") {
      if (r.day_of_month) label += ` (day ${r.day_of_month})`;
    }
    if (r.recurrence_type === "weekly" && r.day_of_week != null) {
      label += ` (${DAYS_OF_WEEK[r.day_of_week]?.label ?? ""})`;
    }
    return label;
  };

  if (isLoading) return (
    <div>
      <Topbar title="Reminders" />
      <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>
    </div>
  );

  return (
    <div>
      <Topbar title="Reminders" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "solid" : "flat"}
                color={filter === f.key ? "primary" : "default"}
                onPress={() => { setFilter(f.key); setPage(1); }}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Button color="primary" onPress={openCreate}>+ New Reminder</Button>
        </div>

        <div className="space-y-3">
          {reminders.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <Bell size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No reminders yet</p>
              <Button size="sm" color="primary" variant="flat" className="mt-3" onPress={openCreate}>
                Create your first reminder
              </Button>
            </div>
          ) : paged.map((r) => (
            <Card key={r.id} className={`shadow-sm ${r.is_completed ? "opacity-50" : ""}`}>
              <CardBody className="flex flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Chip size="sm" color={priorityColor(r.priority)} variant="flat" className="shrink-0 mt-0.5">
                    {r.priority}
                  </Chip>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${r.is_completed ? "line-through text-gray-400" : ""}`}>
                      {r.title}
                    </div>
                    {r.client_name && (
                      <div className="text-xs text-primary font-medium mt-0.5">{r.client_name}</div>
                    )}
                    {r.description && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {r.next_fire_at && !r.is_completed && (
                        <span className="text-xs text-gray-400">
                          Next: {new Date(r.next_fire_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      {recurrenceBadge(r) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          <Repeat size={10} />
                          {recurrenceBadge(r)}
                        </span>
                      )}
                      {r.action_type === "create_invoice" && (
                        <span className="text-[11px] text-success bg-success/10 px-2 py-0.5 rounded-full">
                          Invoice reminder
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!r.is_completed && (
                    <>
                      <Button size="sm" variant="flat" onPress={() => openEdit(r)}>Edit</Button>
                      <Button
                        size="sm" color="success" variant="flat"
                        isLoading={completeMutation.isPending}
                        onPress={() => completeMutation.mutate(r.id)}
                      >
                        Done
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm" variant="flat" color="danger" isIconOnly
                    isLoading={deleteMutation.isPending}
                    onPress={() => {
                      if (confirm("Delete this reminder?")) deleteMutation.mutate(r.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <Pagination total={totalPages} page={page} onChange={setPage} size="sm" showControls />
          </div>
        )}

        {/* Create / Edit Modal */}
        <Modal isOpen={modal} onClose={() => setModal(false)} size="lg">
          <ModalContent>
            <ModalHeader>{editId ? "Edit Reminder" : "New Reminder"}</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              {/* Title */}
              <Input
                variant="bordered" label="Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />

              {/* Client */}
              <Select
                variant="bordered" label="Client (optional)"
                selectedKeys={form.client_id ? [form.client_id] : []}
                onSelectionChange={(k) => setForm({ ...form, client_id: Array.from(k)[0] as string ?? "" })}
              >
                {clients.map((c: any) => (
                  <SelectItem key={c.id.toString()}>{c.company_name}</SelectItem>
                ))}
              </Select>

              {/* Action type */}
              <Select
                variant="bordered" label="Action"
                selectedKeys={[form.action_type]}
                onSelectionChange={(k) => setForm({ ...form, action_type: Array.from(k)[0] as string })}
              >
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <SelectItem key={key}>{label}</SelectItem>
                ))}
              </Select>

              {/* Recurrence */}
              <Select
                variant="bordered" label="Recurrence"
                selectedKeys={[form.recurrence_type]}
                onSelectionChange={(k) => setForm({ ...form, recurrence_type: Array.from(k)[0] as string })}
              >
                {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key}>{label}</SelectItem>
                ))}
              </Select>

              {/* Day of month (monthly / quarterly / yearly) */}
              {["monthly", "quarterly", "yearly"].includes(form.recurrence_type) && (
                <Input
                  variant="bordered" label="Day of Month (1–31)"
                  type="number" min={1} max={31}
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
                  placeholder="e.g. 25"
                />
              )}

              {/* Day of week (weekly) */}
              {form.recurrence_type === "weekly" && (
                <Select
                  variant="bordered" label="Day of Week"
                  selectedKeys={[form.day_of_week]}
                  onSelectionChange={(k) => setForm({ ...form, day_of_week: Array.from(k)[0] as string })}
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.key}>{d.label}</SelectItem>
                  ))}
                </Select>
              )}

              {/* Start date */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {form.recurrence_type === "one_time" ? "Reminder Date *" : "Start Date (first occurrence)"}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>

              {/* Priority */}
              <Select
                variant="bordered" label="Priority"
                selectedKeys={[form.priority]}
                onSelectionChange={(k) => setForm({ ...form, priority: Array.from(k)[0] as string })}
              >
                {PRIORITIES.map((p) => <SelectItem key={p} className="capitalize">{p}</SelectItem>)}
              </Select>

              {/* Description */}
              <Textarea
                variant="bordered" label="Notes (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                minRows={2}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setModal(false)}>Cancel</Button>
              <Button
                color="primary"
                isLoading={createMutation.isPending || updateMutation.isPending}
                isDisabled={!form.title.trim()}
                onPress={submit}
              >
                {editId ? "Save Changes" : "Create Reminder"}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
