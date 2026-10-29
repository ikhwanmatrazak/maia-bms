"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, CardBody, Modal, ModalContent, ModalHeader,
  ModalBody, ModalFooter, Input, Textarea, Select, SelectItem, Chip,
} from "@heroui/react";
import { accountingApi } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

const REF_COLOR: Record<string, "primary" | "success" | "warning" | "default"> = {
  invoice: "success",
  payment_voucher: "warning",
  manual: "default",
};

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EntriesTab() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [lines, setLines] = useState([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["accounting-entries"],
    queryFn: () => accountingApi.listEntries({ limit: 100 }),
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: () => accountingApi.listAccounts(),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => accountingApi.createEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-entries"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
      setModal(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountingApi.deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-entries"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
  });

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split("T")[0], description: "" });
    setLines([
      { account_id: "", debit: "", credit: "", description: "" },
      { account_id: "", debit: "", credit: "", description: "" },
    ]);
  };

  const updateLine = (i: number, field: string, val: string) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const addLine = () => setLines((prev) => [...prev, { account_id: "", debit: "", credit: "", description: "" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = () => {
    const payload = {
      date: form.date,
      description: form.description,
      lines: lines
        .filter((l) => l.account_id)
        .map((l) => ({
          account_id: Number(l.account_id),
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description || null,
        })),
    };
    createMutation.mutate(payload);
  };

  const items = entries?.items ?? [];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={() => setModal(true)}>
          New Entry
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="text-center p-8 text-default-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center p-8 text-default-400">
              No entries yet. Click <strong>Sync</strong> to import from invoices &amp; vouchers.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-100 bg-default-50">
                  <th className="text-left py-2.5 px-4 text-default-400 font-medium">Entry #</th>
                  <th className="text-left py-2.5 px-4 text-default-400 font-medium">Date</th>
                  <th className="text-left py-2.5 px-4 text-default-400 font-medium">Description</th>
                  <th className="text-left py-2.5 px-4 text-default-400 font-medium">Source</th>
                  <th className="text-right py-2.5 px-4 text-default-400 font-medium">Amount (MYR)</th>
                  <th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e: any) => (
                  <tr key={e.id} className="border-b border-default-50 hover:bg-default-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-xs">{e.entry_number}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="py-2.5 px-4 max-w-xs truncate text-default-700">{e.description}</td>
                    <td className="py-2.5 px-4">
                      <Chip size="sm" color={REF_COLOR[e.reference_type] ?? "default"} variant="flat">
                        {e.reference_type?.replace("_", " ") ?? "manual"}
                      </Chip>
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium">{e.total.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">
                      {e.reference_type === "manual" && (
                        <Button
                          size="sm" isIconOnly variant="light" color="danger"
                          isLoading={deleteMutation.isPending}
                          onPress={() => deleteMutation.mutate(e.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* New Entry Modal */}
      <Modal isOpen={modal} onClose={() => { setModal(false); resetForm(); }} size="3xl">
        <ModalContent>
          <ModalHeader>New Journal Entry</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={form.date}
                onValueChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              <Input label="Description" value={form.description}
                onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} />
            </div>

            <div className="text-xs font-semibold text-default-400 uppercase tracking-wide">Lines</div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Select
                    label="Account"
                    size="sm"
                    selectedKeys={line.account_id ? new Set([line.account_id]) : new Set()}
                    onSelectionChange={(keys) => updateLine(i, "account_id", Array.from(keys)[0] as string)}
                  >
                    {(accounts ?? []).map((a: any) => (
                      <SelectItem key={String(a.id)}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input label="Debit" size="sm" type="number" value={line.debit}
                    onValueChange={(v) => updateLine(i, "debit", v)} />
                </div>
                <div className="col-span-3">
                  <Input label="Credit" size="sm" type="number" value={line.credit}
                    onValueChange={(v) => updateLine(i, "credit", v)} />
                </div>
                <div className="col-span-1">
                  <Button size="sm" isIconOnly variant="light" color="danger" onPress={() => removeLine(i)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}

            <Button size="sm" variant="flat" onPress={addLine} startContent={<Plus size={12} />}>
              Add Line
            </Button>

            <div className={`flex justify-between text-sm font-medium p-3 rounded-lg ${balanced ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700"}`}>
              <span>Total Debit: {totalDebit.toFixed(2)}</span>
              <span>{balanced ? "✓ Balanced" : "✗ Not balanced"}</span>
              <span>Total Credit: {totalCredit.toFixed(2)}</span>
            </div>

            {createMutation.error && (
              <div className="text-danger text-sm">
                {(createMutation.error as any)?.response?.data?.detail ?? "Something went wrong."}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => { setModal(false); resetForm(); }}>Cancel</Button>
            <Button
              color="primary"
              isLoading={createMutation.isPending}
              isDisabled={!balanced || !form.description || totalDebit === 0}
              onPress={handleSubmit}
            >
              Save Entry
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
