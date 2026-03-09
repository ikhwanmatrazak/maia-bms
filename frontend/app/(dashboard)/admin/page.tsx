"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Card, CardBody, CardHeader, Button, Chip, Input, Select, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { ArrowRightLeft } from "lucide-react";
import { superAdminApi } from "@/lib/api";
import { setTokens, setSwitchedTenant, getSwitchedTenant } from "@/lib/auth";
import { Topbar } from "@/components/ui/Topbar";
import { formatDate } from "@/lib/utils";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  user_count: number;
}

interface TenantUser {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const PLAN_OPTIONS = ["standard", "professional", "enterprise"];

export default function AdminPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const currentlySwitched = getSwitchedTenant();

  const handleSwitchTenant = async (t: Tenant) => {
    setSwitchingId(t.id);
    try {
      const data = await superAdminApi.switchTenant(t.id);
      setTokens(data.access_token, data.refresh_token);
      setSwitchedTenant(data.switched_tenant_id, data.switched_tenant_name);
      queryClient.clear();
      router.push("/");
    } finally {
      setSwitchingId(null);
    }
  };

  const handleExitTenant = async () => {
    setSwitchingId(-1);
    try {
      const data = await superAdminApi.exitTenant();
      setTokens(data.access_token, data.refresh_token);
      setSwitchedTenant(null, null);
      queryClient.clear();
      router.push("/admin");
    } finally {
      setSwitchingId(null);
    }
  };

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: () => superAdminApi.getStats(),
  });

  // Tenants list
  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["super-admin-tenants"],
    queryFn: () => superAdminApi.listTenants(),
  });

  // Create tenant modal
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "", slug: "", plan: "standard", notes: "",
    admin_name: "", admin_email: "", admin_password: "",
  });
  const [createError, setCreateError] = useState("");

  const createMutation = useMutation({
    mutationFn: () => superAdminApi.createTenant(createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-stats"] });
      setCreateModal(false);
      setCreateForm({ name: "", slug: "", plan: "standard", notes: "", admin_name: "", admin_email: "", admin_password: "" });
      setCreateError("");
    },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || "Failed to create company"),
  });

  // Users modal
  const [usersModal, setUsersModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [addUserForm, setAddUserForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [addUserError, setAddUserError] = useState("");

  const { data: tenantUsers = [] } = useQuery<TenantUser[]>({
    queryKey: ["super-admin-tenant-users", selectedTenant?.id],
    queryFn: () => superAdminApi.listTenantUsers(selectedTenant!.id),
    enabled: !!selectedTenant,
  });

  const addUserMutation = useMutation({
    mutationFn: () => superAdminApi.addTenantUser(selectedTenant!.id, addUserForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenant-users", selectedTenant!.id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      setAddUserForm({ name: "", email: "", password: "", role: "staff" });
      setAddUserError("");
    },
    onError: (e: any) => setAddUserError(e?.response?.data?.detail || "Failed to add user"),
  });

  const openUsers = (t: Tenant) => {
    setSelectedTenant(t);
    setUsersModal(true);
  };

  return (
    <div>
      <Topbar title="Super Admin — Company Management" />
      {currentlySwitched && (
        <div className="flex items-center justify-between px-6 py-2 bg-warning-50 border-b border-warning-200 text-sm">
          <span className="text-warning-700 font-medium">
            Viewing as: <span className="font-bold">{currentlySwitched.name}</span>
          </span>
          <Button size="sm" color="warning" variant="flat" isLoading={switchingId === -1} onPress={handleExitTenant}>
            Exit Company View
          </Button>
        </div>
      )}
      <div className="p-6 space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardBody className="text-center py-4">
                <p className="text-3xl font-bold text-primary">{stats.total_tenants}</p>
                <p className="text-sm text-gray-500 mt-1">Total Companies</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center py-4">
                <p className="text-3xl font-bold text-success">{stats.active_tenants}</p>
                <p className="text-sm text-gray-500 mt-1">Active Companies</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center py-4">
                <p className="text-3xl font-bold text-secondary">{stats.total_users}</p>
                <p className="text-sm text-gray-500 mt-1">Total Users</p>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Tenants table */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h2 className="font-semibold">Companies</h2>
            <Button size="sm" color="primary" onPress={() => setCreateModal(true)}>
              + Add Company
            </Button>
          </CardHeader>
          <CardBody>
            {isLoading ? (
              <p className="text-gray-400 text-sm">Loading...</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
              <Table aria-label="Companies table">
                <TableHeader>
                  <TableColumn>Company</TableColumn>
                  <TableColumn>Plan</TableColumn>
                  <TableColumn>Users</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn>Created</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Chip size="sm" variant="flat" color="secondary" className="capitalize">{t.plan}</Chip>
                      </TableCell>
                      <TableCell>{t.user_count}</TableCell>
                      <TableCell>
                        <Chip size="sm" color={t.is_active ? "success" : "default"} variant="flat">
                          {t.is_active ? "Active" : "Inactive"}
                        </Chip>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{formatDate(t.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="flat" onPress={() => router.push(`/admin/${t.id}/edit`)}>Edit</Button>
                          <Button size="sm" variant="flat" color="primary" onPress={() => openUsers(t)}>Users</Button>
                          <Button
                            size="sm"
                            color="secondary"
                            variant={currentlySwitched?.id === t.id ? "solid" : "flat"}
                            startContent={<ArrowRightLeft size={13} />}
                            isLoading={switchingId === t.id}
                            onPress={() => handleSwitchTenant(t)}
                          >
                            {currentlySwitched?.id === t.id ? "Viewing" : "Switch Tenant"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Create Tenant Modal */}
      <Modal isOpen={createModal} onClose={() => { setCreateModal(false); setCreateError(""); }} size="lg">
        <ModalContent>
          <ModalHeader>Add New Company</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-gray-500 font-medium">Company Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Input variant="bordered" label="Company Name" value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
              <Input variant="bordered" label="Slug (unique ID)" value={createForm.slug}
                placeholder="my-company"
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} />
            </div>
            <Select variant="bordered" label="Plan" selectedKeys={[createForm.plan]}
              onSelectionChange={(keys) => setCreateForm({ ...createForm, plan: Array.from(keys)[0] as string })}>
              {PLAN_OPTIONS.map((p) => <SelectItem key={p} className="capitalize">{p}</SelectItem>)}
            </Select>
            <Input variant="bordered" label="Notes (optional)" value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />

            <p className="text-sm text-gray-500 font-medium pt-2">Admin User</p>
            <Input variant="bordered" label="Admin Name" value={createForm.admin_name}
              onChange={(e) => setCreateForm({ ...createForm, admin_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input variant="bordered" label="Admin Email" type="email" value={createForm.admin_email}
                onChange={(e) => setCreateForm({ ...createForm, admin_email: e.target.value })} />
              <Input variant="bordered" label="Admin Password" type="password" value={createForm.admin_password}
                onChange={(e) => setCreateForm({ ...createForm, admin_password: e.target.value })} />
            </div>
            {createError && <p className="text-danger text-sm">{createError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setCreateModal(false); setCreateError(""); }}>Cancel</Button>
            <Button color="primary" isLoading={createMutation.isPending} onPress={() => createMutation.mutate()}>
              Create Company
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Users Modal */}
      <Modal isOpen={usersModal} onClose={() => setUsersModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>Users — {selectedTenant?.name}</ModalHeader>
          <ModalBody className="space-y-4">
            <div className="overflow-x-auto -mx-1">
            <Table aria-label="Users table">
              <TableHeader>
                <TableColumn>Name</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>Role</TableColumn>
                <TableColumn>Status</TableColumn>
              </TableHeader>
              <TableBody>
                {tenantUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-xs text-gray-500">{u.email}</TableCell>
                    <TableCell><Chip size="sm" variant="flat" className="capitalize">{u.role}</Chip></TableCell>
                    <TableCell>
                      <Chip size="sm" color={u.is_active ? "success" : "default"} variant="flat">
                        {u.is_active ? "Active" : "Inactive"}
                      </Chip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-600">Add User</p>
              <div className="grid grid-cols-2 gap-2">
                <Input size="sm" variant="bordered" label="Name" value={addUserForm.name}
                  onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })} />
                <Input size="sm" variant="bordered" label="Email" type="email" value={addUserForm.email}
                  onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })} />
                <Input size="sm" variant="bordered" label="Password" type="password" value={addUserForm.password}
                  onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })} />
                <Select size="sm" variant="bordered" label="Role" selectedKeys={[addUserForm.role]}
                  onSelectionChange={(keys) => setAddUserForm({ ...addUserForm, role: Array.from(keys)[0] as string })}>
                  <SelectItem key="admin">Admin</SelectItem>
                  <SelectItem key="manager">Manager</SelectItem>
                  <SelectItem key="staff">Staff</SelectItem>
                </Select>
              </div>
              {addUserError && <p className="text-danger text-sm">{addUserError}</p>}
              <Button size="sm" color="primary" isLoading={addUserMutation.isPending} onPress={() => addUserMutation.mutate()}>
                Add User
              </Button>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setUsersModal(false)}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
