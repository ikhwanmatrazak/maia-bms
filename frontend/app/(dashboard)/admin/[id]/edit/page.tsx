"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea, Chip,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { superAdminApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { Pencil, Trash2, UserPlus } from "lucide-react";


export default function EditCompanyPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["super-admin-tenants"],
    queryFn: () => superAdminApi.listTenants(),
  });

  const tenant = (tenants as any[]).find((t) => t.id === Number(id));

  const [form, setForm] = useState({
    name: "",
    is_active: true,
    notes: "",
  });
  const [error, setError] = useState("");
  const [addUserForm, setAddUserForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [addUserError, setAddUserError] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", role: "staff", is_active: true, password: "" });
  const [editUserError, setEditUserError] = useState("");

  const { data: tenantUsers = [], refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["super-admin-tenant-users", Number(id)],
    queryFn: () => superAdminApi.listTenantUsers(Number(id)),
    enabled: !!id,
  });

  const editUserMutation = useMutation({
    mutationFn: () => {
      const payload: any = { name: editUserForm.name, email: editUserForm.email, role: editUserForm.role, is_active: editUserForm.is_active };
      if (editUserForm.password) payload.password = editUserForm.password;
      return superAdminApi.updateTenantUser(Number(id), editingUser.id, payload);
    },
    onSuccess: () => {
      refetchUsers();
      setEditingUser(null);
      setEditUserError("");
    },
    onError: (e: any) => setEditUserError(e?.response?.data?.detail || "Failed to update user"),
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: number) => superAdminApi.removeTenantUser(Number(id), userId),
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: () => superAdminApi.addTenantUser(Number(id), addUserForm),
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      setAddUserForm({ name: "", email: "", password: "", role: "staff" });
      setAddUserError("");
      setShowAddUser(false);
    },
    onError: (e: any) => setAddUserError(e?.response?.data?.detail || "Failed to add user"),
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name,
        is_active: tenant.is_active,
        notes: tenant.notes || "",
      });
    }
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: () => superAdminApi.updateTenant(Number(id), form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      router.push("/admin");
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save"),
  });

  if (isLoading) {
    return (
      <div>
        <Topbar title="Edit Company" />
        <div className="p-6 text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div>
        <Topbar title="Edit Company" />
        <div className="p-6 text-danger text-sm">Company not found.</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={`Edit — ${tenant.name}`} />
      <div className="p-6 space-y-6">
        {/* Company Details */}
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">Company Details</h2></CardHeader>
          <CardBody className="p-6 pt-2 flex flex-col gap-6">
            <Input
              variant="bordered"
              labelPlacement="outside"
              label="Company Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Select
              variant="bordered"
              labelPlacement="outside"
              disableLabelAnimation
              label="Status"
              selectedKeys={[form.is_active ? "active" : "inactive"]}
              onSelectionChange={(keys) => setForm({ ...form, is_active: Array.from(keys)[0] === "active" })}
            >
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="inactive">Inactive</SelectItem>
            </Select>

            <Textarea
              variant="bordered"
              labelPlacement="outside"
              label="Notes"
              placeholder="Optional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              minRows={3}
            />

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="flat" onPress={() => router.push("/admin")}>Cancel</Button>
              <Button color="primary" isLoading={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                Save Changes
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h2 className="font-semibold text-sm">Users</h2>
            <Button size="sm" color="primary" startContent={<UserPlus size={13} />}
              onPress={() => { setShowAddUser(true); setEditingUser(null); }}>
              Add User
            </Button>
          </CardHeader>
          <CardBody className="p-6 pt-0 space-y-4">
            <Table aria-label="Tenant users" removeWrapper>
              <TableHeader>
                <TableColumn>Name</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>Role</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody emptyContent="No users yet.">
                {(tenantUsers as any[]).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-xs text-gray-500">{u.email}</TableCell>
                    <TableCell><Chip size="sm" variant="flat" className="capitalize">{u.role}</Chip></TableCell>
                    <TableCell>
                      <Chip size="sm" color={u.is_active ? "success" : "default"} variant="flat">
                        {u.is_active ? "Active" : "Inactive"}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm" variant="flat" isIconOnly
                          onPress={() => {
                            setEditingUser(u);
                            setEditUserForm({ name: u.name, email: u.email, role: u.role, is_active: u.is_active, password: "" });
                            setEditUserError("");
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="sm" variant="flat" color="danger" isIconOnly
                          isLoading={removeUserMutation.isPending}
                          onPress={() => {
                            if (confirm(`Remove user ${u.name}?`)) removeUserMutation.mutate(u.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Edit User Form */}
            {editingUser && (
              <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">Edit — {editingUser.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="Name"
                    value={editUserForm.name}
                    onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })} />
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="Email" type="email"
                    value={editUserForm.email}
                    onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })} />
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="New Password (optional)" type="password"
                    value={editUserForm.password}
                    onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })} />
                  <Select size="sm" variant="bordered" labelPlacement="outside" disableLabelAnimation label="Role"
                    selectedKeys={[editUserForm.role]}
                    onSelectionChange={(keys) => setEditUserForm({ ...editUserForm, role: Array.from(keys)[0] as string })}>
                    <SelectItem key="admin">Admin</SelectItem>
                    <SelectItem key="manager">Manager</SelectItem>
                    <SelectItem key="staff">Staff</SelectItem>
                  </Select>
                  <Select size="sm" variant="bordered" labelPlacement="outside" disableLabelAnimation label="Status"
                    selectedKeys={[editUserForm.is_active ? "active" : "inactive"]}
                    onSelectionChange={(keys) => setEditUserForm({ ...editUserForm, is_active: Array.from(keys)[0] === "active" })}>
                    <SelectItem key="active">Active</SelectItem>
                    <SelectItem key="inactive">Inactive</SelectItem>
                  </Select>
                </div>
                {editUserError && <p className="text-danger text-sm">{editUserError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" onPress={() => setEditingUser(null)}>Cancel</Button>
                  <Button size="sm" color="primary" isLoading={editUserMutation.isPending} onPress={() => editUserMutation.mutate()}>
                    Save User
                  </Button>
                </div>
              </div>
            )}

            {/* Add User Form */}
            {showAddUser && (
              <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">New User</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="Name"
                    value={addUserForm.name}
                    onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })} />
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="Email" type="email"
                    value={addUserForm.email}
                    onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })} />
                  <Input size="sm" variant="bordered" labelPlacement="outside" label="Password" type="password"
                    value={addUserForm.password}
                    onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })} />
                  <Select size="sm" variant="bordered" labelPlacement="outside" disableLabelAnimation label="Role"
                    selectedKeys={[addUserForm.role]}
                    onSelectionChange={(keys) => setAddUserForm({ ...addUserForm, role: Array.from(keys)[0] as string })}>
                    <SelectItem key="admin">Admin</SelectItem>
                    <SelectItem key="manager">Manager</SelectItem>
                    <SelectItem key="staff">Staff</SelectItem>
                  </Select>
                </div>
                {addUserError && <p className="text-danger text-sm">{addUserError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" onPress={() => { setShowAddUser(false); setAddUserError(""); }}>Cancel</Button>
                  <Button size="sm" color="primary" isLoading={addUserMutation.isPending} onPress={() => addUserMutation.mutate()}>
                    Add User
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
