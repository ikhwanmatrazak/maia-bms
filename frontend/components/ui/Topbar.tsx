"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Popover, PopoverTrigger, PopoverContent,
} from "@heroui/react";
import { Bell, User, LogOut, Settings, ChevronDown, Check } from "lucide-react";
import { remindersApi, authApi, usersApi } from "@/lib/api";
import { clearAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";

export function Topbar({ title }: { title?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", new_password: "", confirm_password: "" });
  const [pwError, setPwError] = useState("");

  useEffect(() => setMounted(true), []);

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "overdue"],
    queryFn: () => remindersApi.list({ filter: "overdue" }),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.getMe,
  });

  const displayUser = mounted ? me : null;

  const updateMutation = useMutation({
    mutationFn: (data: object) => usersApi.update(me?.id, data),
    onSuccess: (updated: any) => {
      queryClient.setQueryData(["me"], (old: any) => ({ ...old, ...updated }));
      import("@/lib/auth").then(({ setUser, getUser: gu }) => {
        const stored = gu();
        if (stored) setUser({ ...stored, ...updated });
      });
      setEditModal(false);
      setPwError("");
    },
  });

  const handleLogout = async () => {
    const { getRefreshToken } = await import("@/lib/auth");
    const rt = getRefreshToken();
    if (rt) { try { await authApi.logout(rt); } catch {} }
    clearAuth();
    queryClient.clear();
    router.push("/login");
  };

  const openEdit = () => {
    setEditForm({ name: me?.name ?? "", new_password: "", confirm_password: "" });
    setPwError("");
    setProfileOpen(false);
    setEditModal(true);
  };

  const handleSave = () => {
    const payload: Record<string, string> = {};
    if (editForm.name.trim() && editForm.name !== me?.name) payload.name = editForm.name.trim();
    if (editForm.new_password) {
      if (editForm.new_password !== editForm.confirm_password) { setPwError("Passwords do not match"); return; }
      if (editForm.new_password.length < 6) { setPwError("Password must be at least 6 characters"); return; }
      payload.password = editForm.new_password;
    }
    if (Object.keys(payload).length === 0) { setEditModal(false); return; }
    setPwError("");
    updateMutation.mutate(payload);
  };

  const overdueCount = reminders.length;
  const initials = (displayUser?.name ?? "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const ROLE_COLOR: Record<string, string> = {
    admin: "text-primary bg-primary/10",
    manager: "text-secondary bg-secondary/10",
    staff: "text-default-600 bg-default-100",
  };

  return (
    <>
      <header className="h-14 bg-white border-b border-divider flex items-center justify-between px-6 sticky top-0 z-40">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>

        <div className="flex items-center gap-1">
          {/* Notification Bell */}
          <Popover isOpen={notifOpen} onOpenChange={setNotifOpen} placement="bottom-end">
            <PopoverTrigger>
              <button className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <Bell size={18} className={overdueCount > 0 ? "text-danger" : "text-gray-400"} />
                {overdueCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                    {overdueCount > 9 ? "9+" : overdueCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="font-semibold text-sm">Notifications</span>
                {overdueCount > 0 && <span className="text-xs text-danger font-medium">{overdueCount} overdue</span>}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {overdueCount === 0 ? (
                  <div className="flex flex-col items-center py-8 text-gray-400">
                    <Check size={22} className="text-success mb-2" />
                    <p className="text-sm">All caught up!</p>
                  </div>
                ) : (
                  reminders.slice(0, 10).map((r: any) => (
                    <div key={r.id} className="px-4 py-3 border-b last:border-0 hover:bg-gray-50">
                      <div className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          r.priority === "high" ? "bg-danger" : r.priority === "medium" ? "bg-warning" : "bg-gray-300"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(r.due_date)}</p>
                        </div>
                        <span className={`text-[11px] font-medium capitalize shrink-0 ${
                          r.priority === "high" ? "text-danger" : r.priority === "medium" ? "text-warning" : "text-gray-400"
                        }`}>{r.priority}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {overdueCount > 0 && (
                <div className="px-4 py-2.5 border-t text-center">
                  <button className="text-xs text-primary font-medium hover:underline"
                    onClick={() => { setNotifOpen(false); router.push("/reminders"); }}>
                    View all reminders →
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Profile dropdown */}
          <Popover isOpen={profileOpen} onOpenChange={setProfileOpen} placement="bottom-end">
            <PopoverTrigger>
              <button className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-xl hover:bg-gray-100 transition-colors ml-1">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{displayUser?.name ?? "User"}</p>
                  <p className="text-[11px] text-gray-400 leading-tight capitalize">{displayUser?.role ?? ""}</p>
                </div>
                <ChevronDown size={12} className="text-gray-400 hidden sm:block" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-56">
              {/* User info header */}
              <div className="px-4 py-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{displayUser?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{displayUser?.email}</p>
                    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize mt-0.5 ${ROLE_COLOR[displayUser?.role ?? ""] ?? ""}`}>
                      {displayUser?.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button onClick={openEdit}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <User size={14} className="text-gray-400" />
                  Edit Profile
                </button>
                <button onClick={() => { setProfileOpen(false); router.push("/settings"); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <Settings size={14} className="text-gray-400" />
                  Settings
                </button>
                <div className="border-t my-1" />
                <button onClick={() => { setProfileOpen(false); handleLogout(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-danger hover:bg-danger/5 transition-colors">
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Edit Profile Modal */}
      <Modal isOpen={editModal} onClose={() => setEditModal(false)}>
        <ModalContent>
          <ModalHeader>Edit Profile</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <Input variant="bordered" labelPlacement="outside" label="Full Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <div className="border-t pt-1">
              <p className="text-xs text-gray-400 mb-3">Leave blank to keep your current password.</p>
              <div className="flex flex-col gap-3">
                <Input variant="bordered" labelPlacement="outside" label="New Password" type="password"
                  placeholder="••••••••"
                  value={editForm.new_password}
                  onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })} />
                <Input variant="bordered" labelPlacement="outside" label="Confirm Password" type="password"
                  placeholder="••••••••"
                  value={editForm.confirm_password}
                  onChange={(e) => setEditForm({ ...editForm, confirm_password: e.target.value })} />
              </div>
              {pwError && <p className="text-xs text-danger mt-2">{pwError}</p>}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditModal(false)}>Cancel</Button>
            <Button color="primary" isLoading={updateMutation.isPending} onPress={handleSave}>
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
