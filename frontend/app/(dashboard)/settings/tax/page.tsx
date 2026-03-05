"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip,
} from "@heroui/react";
import { settingsApi } from "@/lib/api";
import { TaxRate } from "@/types";
import { Topbar } from "@/components/ui/Topbar";

export default function TaxRatesPage() {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", rate: "", is_default: false });
  const queryClient = useQueryClient();

  const { data: taxRates = [] } = useQuery<TaxRate[]>({
    queryKey: ["tax-rates"],
    queryFn: settingsApi.getTaxRates,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => settingsApi.createTaxRate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-rates"] });
      setModal(false);
      setForm({ name: "", rate: "", is_default: false });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => settingsApi.updateTaxRate(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tax-rates"] }),
  });

  return (
    <div>
      <Topbar title="Tax Rates" />
      <div className="p-6">
        <div className="flex justify-end mb-4">
          <Button color="primary" onPress={() => setModal(true)}>+ Add Tax Rate</Button>
        </div>

        <Table aria-label="Tax Rates">
          <TableHeader>
            <TableColumn>Name</TableColumn>
            <TableColumn>Rate</TableColumn>
            <TableColumn>Default</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {taxRates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.rate}%</TableCell>
                <TableCell>{t.is_default ? <Chip size="sm" color="primary" variant="flat">Default</Chip> : "—"}</TableCell>
                <TableCell><Chip size="sm" color={t.is_active ? "success" : "default"} variant="flat">{t.is_active ? "Active" : "Inactive"}</Chip></TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => toggleMutation.mutate({ id: t.id, data: { is_active: !t.is_active } })}
                  >
                    {t.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Modal isOpen={modal} onClose={() => setModal(false)}>
          <ModalContent>
            <ModalHeader>Add Tax Rate</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input variant="bordered" label="Name" placeholder="e.g. SST 6%" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input variant="bordered" label="Rate (%)" type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                Set as default tax rate
              </label>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending}
                onPress={() => createMutation.mutate({ ...form, rate: Number(form.rate) })}>Add</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
