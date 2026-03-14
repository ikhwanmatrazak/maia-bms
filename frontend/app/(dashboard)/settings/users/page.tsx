"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip,
} from "@heroui/react";
import { Eye, EyeOff } from "lucide-react";
import { usersApi } from "@/lib/api";
import { User } from "@/types";
import { formatDate } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const ROLES = ["admin", "manager", "staff"];
const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", staff: "Sales" };

export default function UsersPage() {
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });

  const [editModal, setEditModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "staff", new_password: "" });
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [showEditPw, setShowEditPw] = useState(false);

  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateModal(false);
      setShowCreatePw(false);
      setForm({ name: "", email: "", password: "", role: "staff" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditModal(false);
      setEditUser(null);
      setShowEditPw(false);
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

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, new_password: "" });
    setEditModal(true);
  };

  const handleUpdate = () => {
    if (!editUser) return;
    const payload: Record<string, string> = {};
    if (editForm.name !== editUser.name) payload.name = editForm.name;
    if (editForm.email !== editUser.email) payload.email = editForm.email;
    if (editForm.role !== editUser.role) payload.role = editForm.role;
    if (editForm.new_password) payload.password = editForm.new_password;
    if (Object.keys(payload).length === 0) { setEditModal(false); return; }
    updateMutation.mutate({ id: editUser.id, data: payload });
  };

  return (
    <div>
      <Topbar title="Users" />
      <div className="p-6">
        <div className="flex justify-end mb-4">
          <Button color="primary" onPress={() => setCreateModal(true)}>+ Add User</Button>
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
                <TableCell>
                  <Chip size="sm" variant="flat" color={u.role === "admin" ? "danger" : u.role === "manager" ? "warning" : "default"}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Chip>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={u.is_active ? "success" : "default"}>
                    {u.is_active ? "Active" : "Inactive"}
                  </Chip>
                </TableCell>
                <TableCell>{formatDate(u.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="flat" onPress={() => openEdit(u)}>Edit</Button>
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

        {/* Add User Modal */}
        <Modal isOpen={createModal} onClose={() => setCreateModal(false)}>
          <ModalContent>
            <ModalHeader>Add User</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input variant="bordered" label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input variant="bordered" label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input variant="bordered" label="Password" type={showCreatePw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                endContent={<button type="button" onClick={() => setShowCreatePw(p => !p)} className="text-gray-400 hover:text-gray-600">{showCreatePw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
              <Select variant="bordered" label="Role" selectedKeys={[form.role]} onSelectionChange={(k) => setForm({ ...form, role: Array.from(k)[0] as string })}>
                {ROLES.map((r) => <SelectItem key={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setCreateModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending}
                onPress={() => createMutation.mutate(form)}>Create</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Edit User Modal */}
        <Modal isOpen={editModal} onClose={() => setEditModal(false)}>
          <ModalContent>
            <ModalHeader>Edit User</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Input variant="bordered" label="Full Name" value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <Input variant="bordered" label="Email" type="email" value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              <Select variant="bordered" label="Role" selectedKeys={[editForm.role]}
                onSelectionChange={(k) => setEditForm({ ...editForm, role: Array.from(k)[0] as string })}>
                {ROLES.map((r) => <SelectItem key={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </Select>
              <Input variant="bordered" label="New Password" type={showEditPw ? "text" : "password"}
                placeholder="Leave blank to keep current"
                value={editForm.new_password}
                onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                endContent={<button type="button" onClick={() => setShowEditPw(p => !p)} className="text-gray-400 hover:text-gray-600">{showEditPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setEditModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={updateMutation.isPending} onPress={handleUpdate}>
                Save Changes
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
