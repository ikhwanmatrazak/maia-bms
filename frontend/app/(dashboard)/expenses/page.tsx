"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem, Textarea, Pagination,
} from "@heroui/react";
import { Trash2 } from "lucide-react";
import { expensesApi } from "@/lib/api";
import { Expense, ExpenseCategory } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD"];
const PAGE_SIZE = 10;
const thisMonth = new Date().toISOString().slice(0, 7);

export default function ExpensesPage() {
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(thisMonth);
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

  const { data: summary } = useQuery({
    queryKey: ["expenses-summary", month],
    queryFn: () => expensesApi.summary(month),
  });

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", search, page, month],
    queryFn: () => expensesApi.list({ ...(search ? { search } : {}), month, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
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
        {/* Summary Bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Input
            type="month"
            size="sm"
            className="w-40"
            variant="bordered"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          {summary && (
            <>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-danger-50 text-sm">
                <span className="text-danger-600">Total Spent</span>
                <span className="font-semibold ml-1 text-danger-700">{formatCurrency(summary.total_amount, "MYR")}</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-default-100 text-sm">
                <span className="text-default-500">{summary.count} expenses</span>
              </div>
              {summary.by_category && Object.entries(summary.by_category).filter(([, v]) => (v as number) > 0).map(([cat, v]) => (
                <div key={cat} className="px-3 py-1.5 rounded-lg bg-default-50 text-sm">
                  <span className="text-default-500">{cat}</span>
                  <span className="font-medium ml-1">{v as number}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Input
            placeholder="Search by description or vendor..."
            size="sm"
            className="w-full sm:max-w-xs"
            variant="bordered"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Button color="primary" onPress={() => setModal(true)}>+ Add Expense</Button>
        </div>

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Expenses" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Description</TableColumn>
            <TableColumn>Category</TableColumn>
            <TableColumn>Vendor</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
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
                  <Button size="sm" color="danger" variant="flat" isIconOnly title="Delete"
                    onPress={() => deleteMutation.mutate(e.id)}><Trash2 size={15} /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex justify-center mt-4">
          <Pagination
            total={page + (expenses.length >= PAGE_SIZE ? 1 : 0)}
            page={page}
            onChange={setPage}
            size="sm"
            showControls
          />
        </div>

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
