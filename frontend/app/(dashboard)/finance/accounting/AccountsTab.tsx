"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, CardBody, Chip, Modal, ModalContent, ModalHeader,
  ModalBody, ModalFooter, Input, Select, SelectItem,
} from "@heroui/react";
import { accountingApi } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

const TYPE_COLOR: Record<string, "primary" | "success" | "warning" | "danger" | "secondary"> = {
  asset: "primary",
  liability: "warning",
  equity: "secondary",
  revenue: "success",
  expense: "danger",
};

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];

export default function AccountsTab() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", account_type: "expense", description: "" });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: () => accountingApi.listAccounts(),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => accountingApi.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
      setModal(false);
      setForm({ code: "", name: "", account_type: "expense", description: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountingApi.deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] }),
  });

  const grouped: Record<string, any[]> = {};
  for (const acc of accounts ?? []) {
    if (!grouped[acc.account_type]) grouped[acc.account_type] = [];
    grouped[acc.account_type].push(acc);
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={() => setModal(true)}>
          Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-default-400">Loading…</div>
      ) : (
        ACCOUNT_TYPES.map((type) => {
          const rows = grouped[type] ?? [];
          if (rows.length === 0) return null;
          return (
            <Card key={type}>
              <CardBody>
                <div className="flex items-center gap-2 mb-3">
                  <Chip size="sm" color={TYPE_COLOR[type]} variant="flat">
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Chip>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-default-100">
                      <th className="text-left py-1.5 text-default-400 font-medium w-20">Code</th>
                      <th className="text-left py-1.5 text-default-400 font-medium">Name</th>
                      <th className="py-1.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a: any) => (
                      <tr key={a.id} className="border-b border-default-50 last:border-0">
                        <td className="py-2 font-mono text-xs text-default-400">{a.code}</td>
                        <td className="py-2">{a.name}</td>
                        <td className="py-2 text-right">
                          {!a.is_system && (
                            <Button
                              size="sm" isIconOnly variant="light" color="danger"
                              onPress={() => deleteMutation.mutate(a.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          );
        })
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)}>
        <ModalContent>
          <ModalHeader>Add Account</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Account Code" placeholder="e.g. 5999" value={form.code}
                onValueChange={(v) => setForm((f) => ({ ...f, code: v }))} />
              <Select
                label="Type"
                selectedKeys={new Set([form.account_type])}
                onSelectionChange={(keys) => setForm((f) => ({ ...f, account_type: Array.from(keys)[0] as string }))}
              >
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
              </Select>
            </div>
            <Input label="Account Name" placeholder="e.g. Entertainment Expenses" value={form.name}
              onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="Description (optional)" value={form.description}
              onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setModal(false)}>Cancel</Button>
            <Button
              color="primary"
              isLoading={createMutation.isPending}
              isDisabled={!form.code || !form.name}
              onPress={() => createMutation.mutate(form)}
            >
              Add
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
