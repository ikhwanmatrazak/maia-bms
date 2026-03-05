"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip,
} from "@heroui/react";
import { usersApi } from "@/lib/api";
import { User } from "@/types";
import { formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const ROLES = ["admin", "manager", "staff"];

export default function UsersPage() {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setModal(false);
      setForm({ name: "", email: "", password: "", role: "staff" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => usersApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <Topbar title="Users" />
      <div className="p-6">
        <div className="flex justify-end mb-4">
          <Button color="primary" onPress={() => setModal(true)}>+ Add User</Button>
        </div>

        <Table aria-label="Users">
          <TableHeader>
            <TableColumn>Name</TableColumn>
            <TableColumn>Email</TableColumn>
            <TableColumn>Role</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Since</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Chip size="sm" variant="flat" color={u.role === "admin" ? "danger" : u.role === "manager" ? "warning" : "default"}>{u.role}</Chip></TableCell>
                <TableCell><Chip size="sm" variant="flat" color={u.is_active ? "success" : "default"}>{u.is_active ? "Active" : "Inactive"}</Chip></TableCell>
                <TableCell>{formatDate(u.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="flat"
                      onPress={() => toggleMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })}>
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" color="danger" variant="flat"
                      onPress={() => deleteMutation.mutate(u.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Modal isOpen={modal} onClose={() => setModal(false)}>
          <ModalContent>
            <ModalHeader>Add User</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input variant="bordered" label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input variant="bordered" label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input variant="bordered" label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <Select variant="bordered" label="Role" selectedKeys={[form.role]} onSelectionChange={(k) => setForm({ ...form, role: Array.from(k)[0] as string })}>
                {ROLES.map((r) => <SelectItem key={r} className="capitalize">{r}</SelectItem>)}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending}
                onPress={() => createMutation.mutate(form)}>Create</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
