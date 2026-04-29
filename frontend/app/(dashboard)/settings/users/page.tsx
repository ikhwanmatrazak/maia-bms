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
import { TableSkeleton } from "@/components/ui/PageSkeleton";

const ROLES = ["admin", "manager", "staff"];
const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", staff: "Sales" };

const PERMISSION_TREE = [
  { key: "overview", label: "Overview", children: [
    { key: "dashboard", label: "Dashboard" },
    { key: "analytics", label: "Analytics" },
  ]},
  { key: "crm", label: "CRM", children: [
    { key: "clients", label: "Clients" },
    { key: "pipeline", label: "Pipeline" },
  ]},
  { key: "sales", label: "Sales", children: [
    { key: "quotations", label: "Quotations" },
    { key: "invoices", label: "Invoices" },
    { key: "receipts", label: "Receipts" },
  ]},
  { key: "procurement", label: "Procurement", children: [
    { key: "products", label: "Products" },
    { key: "purchase-orders", label: "Purchase Orders" },
    { key: "vendors", label: "Vendors" },
    { key: "delivery-orders", label: "Delivery Orders" },
  ]},
  { key: "finance", label: "Finance", children: [
    { key: "payments", label: "Payments" },
    { key: "credit-notes", label: "Credit Notes" },
    { key: "expenses", label: "Expenses" },
    { key: "bills", label: "Bills" },
    { key: "reports", label: "Reports" },
  ]},
  { key: "projects", label: "Projects", children: [] },
  { key: "calendar", label: "Calendar", children: [] },
  { key: "hr", label: "HR", children: [
    { key: "hr-employees", label: "Employees" },
    { key: "hr-departments", label: "Departments" },
    { key: "hr-leave", label: "Leave" },
    { key: "hr-attendance", label: "Attendance" },
    { key: "hr-payroll", label: "Payroll" },
    { key: "hr-claims", label: "Claims" },
    { key: "hr-performance", label: "Performance" },
  ]},
  { key: "reminders", label: "Reminders", children: [] },
];

// Flat list of all keys (for "select all" and migration compat)
const ALL_PERM_KEYS = PERMISSION_TREE.flatMap(g => [g.key, ...g.children.map(c => c.key)]);

function getAllChildKeys(parentKey: string): string[] {
  const group = PERMISSION_TREE.find(g => g.key === parentKey);
  return group ? group.children.map(c => c.key) : [];
}

// Legacy flat list kept for backward compat reading saved permissions
const PERMISSION_GROUPS = ALL_PERM_KEYS.map(k => ({ key: k }));

export default function UsersPage() {
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });

  const [editModal, setEditModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "staff", new_password: "" });

  const [permModal, setPermModal] = useState(false);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [permSelected, setPermSelected] = useState<string[]>([]);
  const [permUnrestricted, setPermUnrestricted] = useState(true);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [showEditPw, setShowEditPw] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateModal(false);
      setCreateError(null);
      setShowCreatePw(false);
      setForm({ name: "", email: "", password: "", role: "staff" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCreateError(msg || "Failed to create user. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditModal(false);
      setEditError(null);
      setEditUser(null);
      setShowEditPw(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEditError(msg || "Failed to update user. Please try again.");
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

  const openPermissions = (u: User) => {
    setPermUser(u);
    if (u.permissions == null) {
      setPermUnrestricted(true);
      setPermSelected(ALL_PERM_KEYS);
    } else {
      setPermUnrestricted(false);
      setPermSelected(u.permissions);
    }
    setPermModal(true);
  };

  const savePermissions = () => {
    if (!permUser) return;
    const perms = permUnrestricted ? null : permSelected;
    updateMutation.mutate(
      { id: permUser.id, data: { permissions: perms } },
      { onSuccess: () => setPermModal(false) }
    );
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

  if (isLoading) return (
    <div>
      <Topbar title="Users" />
      <div className="p-6"><TableSkeleton rows={6} cols={4} /></div>
    </div>
  );

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
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="flat" onPress={() => openEdit(u)}>Edit</Button>
                    {u.role !== "admin" && (
                      <Button size="sm" variant="flat" color="secondary" onPress={() => openPermissions(u)}>Permissions</Button>
                    )}
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
        <Modal isOpen={createModal} onClose={() => { setCreateModal(false); setCreateError(null); }}>
          <ModalContent>
            <ModalHeader>Add User</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {createError && (
                <div className="text-sm text-danger bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">{createError}</div>
              )}
              <Input variant="bordered" label="Full Name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input variant="bordered" label="Email" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
              <Input variant="bordered" label="Password" type={showCreatePw ? "text" : "password"} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                endContent={<button type="button" onClick={() => setShowCreatePw(p => !p)} className="text-gray-400 hover:text-gray-600">{showCreatePw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
              <Select variant="bordered" label="Role" selectedKeys={[form.role]}
                onSelectionChange={(k) => { const v = Array.from(k)[0] as string; if (v) setForm(f => ({ ...f, role: v })); }}>
                {ROLES.map((r) => <SelectItem key={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => { setCreateModal(false); setCreateError(null); }}>Cancel</Button>
              <Button color="primary" isLoading={createMutation.isPending}
                isDisabled={!form.name || !form.email || !form.password}
                onPress={() => { setCreateError(null); createMutation.mutate(form); }}>Create</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Permissions Modal */}
        <Modal isOpen={permModal} onClose={() => setPermModal(false)} size="md">
          <ModalContent>
            <ModalHeader>Screen Access — {permUser?.name}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permUnrestricted}
                  onChange={(e) => setPermUnrestricted(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-medium">Full access (no restrictions)</span>
              </label>
              {!permUnrestricted && (
                <div className="flex flex-col gap-1 border-t border-divider pt-3">
                  <p className="text-xs text-default-400 mb-2">Select which screens this user can access:</p>
                  {PERMISSION_TREE.map((group) => {
                    const childKeys = group.children.map(c => c.key);
                    const allChildChecked = childKeys.length === 0
                      ? permSelected.includes(group.key)
                      : childKeys.every(k => permSelected.includes(k));
                    const someChildChecked = childKeys.some(k => permSelected.includes(k));

                    const toggleParent = (checked: boolean) => {
                      setPermSelected(prev => {
                        let next = prev.filter(k => k !== group.key && !childKeys.includes(k));
                        if (checked) {
                          next = [...next, group.key, ...childKeys];
                        }
                        return next;
                      });
                    };

                    const toggleChild = (childKey: string, checked: boolean) => {
                      setPermSelected(prev => {
                        let next = checked ? [...prev, childKey] : prev.filter(k => k !== childKey);
                        // Auto-check parent if any child is checked
                        const anyChild = group.children.some(c => next.includes(c.key));
                        if (anyChild && !next.includes(group.key)) next = [...next, group.key];
                        if (!anyChild) next = next.filter(k => k !== group.key);
                        return next;
                      });
                    };

                    return (
                      <div key={group.key} className="mb-1">
                        {/* Parent row */}
                        <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-default-100 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-primary"
                            checked={allChildChecked}
                            ref={el => { if (el) el.indeterminate = !allChildChecked && someChildChecked; }}
                            onChange={e => toggleParent(e.target.checked)}
                          />
                          <span className="text-sm font-semibold text-default-800">{group.label}</span>
                        </label>
                        {/* Children */}
                        {group.children.map(child => (
                          <label key={child.key} className="flex items-center gap-2.5 pl-8 pr-2 py-1 rounded-lg hover:bg-default-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-primary"
                              checked={permSelected.includes(child.key)}
                              onChange={e => toggleChild(child.key, e.target.checked)}
                            />
                            <span className="text-sm text-default-600">{child.label}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setPermModal(false)}>Cancel</Button>
              <Button color="primary" isLoading={updateMutation.isPending} onPress={savePermissions}>Save</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Edit User Modal */}
        <Modal isOpen={editModal} onClose={() => { setEditModal(false); setEditError(null); }}>
          <ModalContent>
            <ModalHeader>Edit User</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {editError && (
                <div className="text-sm text-danger bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">{editError}</div>
              )}
              <Input variant="bordered" label="Full Name" value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
              <Input variant="bordered" label="Email" type="email" value={editForm.email}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
              <Select variant="bordered" label="Role" selectedKeys={[editForm.role]}
                onSelectionChange={(k) => { const v = Array.from(k)[0] as string; if (v) setEditForm(f => ({ ...f, role: v })); }}>
                {ROLES.map((r) => <SelectItem key={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </Select>
              <Input variant="bordered" label="New Password" type={showEditPw ? "text" : "password"}
                placeholder="Leave blank to keep current"
                value={editForm.new_password}
                onChange={(e) => setEditForm(f => ({ ...f, new_password: e.target.value }))}
                endContent={<button type="button" onClick={() => setShowEditPw(p => !p)} className="text-gray-400 hover:text-gray-600">{showEditPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => { setEditModal(false); setEditError(null); }}>Cancel</Button>
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
