"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, Button, Chip, Select, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea,
} from "@heroui/react";
import { remindersApi } from "@/lib/api";
import { Reminder } from "@/types";
import { formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const FILTERS = [
  { key: "", label: "Active" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

const PRIORITIES = ["low", "medium", "high"];

export default function RemindersPage() {
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", due_date: "", priority: "medium" });
  const queryClient = useQueryClient();

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["reminders", filter],
    queryFn: () => remindersApi.list(filter ? { filter } : {}),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => remindersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      setModal(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => remindersApi.complete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const submit = () => {
    createMutation.mutate({
      ...form,
      due_date: new Date(form.due_date).toISOString(),
    });
  };

  return (
    <div>
      <Topbar title="Reminders" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "solid" : "flat"}
                color={filter === f.key ? "primary" : "default"}
                
                onPress={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Button color="primary" onPress={() => setModal(true)}>+ New</Button>
        </div>

        <div className="space-y-3">
          {reminders.length === 0 ? (
            <p className="text-gray-400 text-sm">No reminders</p>
          ) : reminders.map((r) => (
            <Card key={r.id} className={`shadow-sm ${r.is_completed ? "opacity-60" : ""}`}>
              <CardBody className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Chip
                    size="sm"
                    color={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "default"}
                    variant="flat"
                  >
                    {r.priority}
                  </Chip>
                  <div>
                    <div className={`font-medium text-sm ${r.is_completed ? "line-through text-gray-400" : ""}`}>
                      {r.title}
                    </div>
                    {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">Due {formatDate(r.due_date)}</div>
                  </div>
                </div>
                {!r.is_completed && (
                  <Button
                    size="sm"
                    color="success"
                    variant="flat"
                    isLoading={completeMutation.isPending}
                    onPress={() => completeMutation.mutate(r.id)}
                  >
                    Complete
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>

        <Modal isOpen={modal} onClose={() => setModal(false)}>
          <ModalContent>
            <ModalHeader>New Reminder</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <Input variant="bordered" label="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Textarea variant="bordered" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input variant="bordered" label="Due Date *" type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              <Select variant="bordered" label="Priority" selectedKeys={[form.priority]} onSelectionChange={(k) => setForm({ ...form, priority: Array.from(k)[0] as string })}>
                {PRIORITIES.map((p) => <SelectItem key={p} className="capitalize">{p}</SelectItem>)}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending} onPress={submit}>Create</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
