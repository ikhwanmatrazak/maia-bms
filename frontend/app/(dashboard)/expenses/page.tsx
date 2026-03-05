"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem, Textarea,
} from "@heroui/react";
import { expensesApi } from "@/lib/api";
import { Expense, ExpenseCategory } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];

export default function ExpensesPage() {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    currency: "MYR",
    expense_date: new Date().toISOString().split("T")[0],
    category_id: "",
    vendor: "",
    notes: "",
  });
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: () => expensesApi.list(),
  });

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["expense-categories"],
    queryFn: expensesApi.getCategories,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setModal(false);
      setForm({ description: "", amount: "", currency: "MYR", expense_date: new Date().toISOString().split("T")[0], category_id: "", vendor: "", notes: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const submit = () => {
    createMutation.mutate({
      ...form,
      amount: Number(form.amount),
      category_id: form.category_id ? Number(form.category_id) : null,
      expense_date: new Date(form.expense_date).toISOString(),
    });
  };

  return (
    <div>
      <Topbar title="Expenses" />
      <div className="p-6">
        <div className="flex justify-end mb-4">
          <Button color="primary" onPress={() => setModal(true)}>+ Add Expense</Button>
        </div>

        <Table aria-label="Expenses" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Description</TableColumn>
            <TableColumn>Category</TableColumn>
            <TableColumn>Vendor</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{formatDate(e.expense_date)}</TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell>{e.category ?? "—"}</TableCell>
                <TableCell>{e.vendor ?? "—"}</TableCell>
                <TableCell className="font-medium">{formatCurrency(e.amount, e.currency)}</TableCell>
                <TableCell>
                  <Button size="sm" color="danger" variant="flat"
                    onPress={() => deleteMutation.mutate(e.id)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Modal isOpen={modal} onClose={() => setModal(false)} size="lg">
          <ModalContent>
            <ModalHeader>Add Expense</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <Input variant="bordered" label="Description *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input variant="bordered" label="Amount *" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <Select variant="bordered" label="Currency" selectedKeys={[form.currency]} onSelectionChange={(k) => setForm({ ...form, currency: Array.from(k)[0] as string })}>
                  {CURRENCIES.map((c) => <SelectItem key={c}>{c}</SelectItem>)}
                </Select>
              </div>
              <Input variant="bordered" label="Date" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              <Select variant="bordered" label="Category" selectedKeys={form.category_id ? [form.category_id] : []}
                onSelectionChange={(k) => setForm({ ...form, category_id: Array.from(k)[0] as string })}>
                {categories.map((c) => <SelectItem key={String(c.id)}>{c.name}</SelectItem>)}
              </Select>
              <Input variant="bordered" label="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
              <Textarea variant="bordered" label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending} onPress={submit}>Add</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
