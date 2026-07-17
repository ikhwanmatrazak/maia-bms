"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Popover, PopoverTrigger, PopoverContent,
} from "@heroui/react";
import { Bell, User, LogOut, Settings, ChevronDown, Check, Building2, X, Menu, Eye, EyeOff, CalendarDays } from "lucide-react";
import { remindersApi, authApi, usersApi, superAdminApi, calendarApi } from "@/lib/api";
import { clearAuth, getSwitchedTenant, setSwitchedTenant, setTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { useSidebarToggle } from "@/app/(dashboard)/layout";

export function Topbar({ title }: { title?: string }) {
  const onMenuToggle = useSidebarToggle();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exitingTenant, setExitingTenant] = useState(false);
  const switchedTenant = mounted ? getSwitchedTenant() : null;

  const handleExitTenant = async () => {
    setExitingTenant(true);
    try {
      const data = await superAdminApi.exitTenant();
      setTokens(data.access_token, data.refresh_token);
      setSwitchedTenant(null, null);
      queryClient.clear();
      router.push("/admin");
    } finally {
      setExitingTenant(false);
    }
  };
  const [calOpen, setCalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const { data: calEvents = [] } = useQuery<any[]>({
    queryKey: ["calendar", now.getFullYear(), now.getMonth() + 1],
    queryFn: () => calendarApi.listEvents(now.getFullYear(), now.getMonth() + 1),
    refetchInterval: 10 * 60 * 1000,
  });

  const todayEvents = calEvents.filter((e) => {
    const start = e.start_at?.slice(0, 10);
    const end = e.end_at?.slice(0, 10);
    return start <= todayStr && todayStr <= (end ?? start);
  });

  const upcomingEvents = calEvents
    .filter((e) => e.start_at?.slice(0, 10) > todayStr)
    .sort((a: any, b: any) => a.start_at.localeCompare(b.start_at))
    .slice(0, 5);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", new_password: "", confirm_password: "" });
  const [pwError, setPwError] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["reminder-notifications"],
    queryFn: () => remindersApi.listNotifications({ unread_only: true }),
    refetchInterval: 5 * 60 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => remindersApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => remindersApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-notifications"] }),
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
    setShowNewPw(false);
    setShowConfirmPw(false);
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

  const overdueCount = notifications.length;
  const initials = (displayUser?.name ?? "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const ROLE_LABEL: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    staff: "Sales",
  };

  return (
    <>
      {switchedTenant && (
        <div className="flex items-center justify-between px-6 py-1.5 bg-warning-50 border-b border-warning-200 text-sm sticky top-0 z-50">
          <div className="flex items-center gap-2 text-warning-700">
            <Building2 size={14} />
            <span>Viewing as company: <span className="font-bold">{switchedTenant.name}</span></span>
          </div>
          <button
            onClick={handleExitTenant}
            disabled={exitingTenant}
            className="flex items-center gap-1 text-xs font-medium text-warning-700 hover:text-warning-900 px-2 py-0.5 rounded hover:bg-warning-100 transition-colors"
          >
            <X size={12} />
            {exitingTenant ? "Exiting..." : "Exit Company View"}
          </button>
        </div>
      )}
      <header className="h-14 bg-white border-b border-divider flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          {/* Hamburger — mobile only */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Menu size={20} className="text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Calendar quick-view */}
          <Popover isOpen={calOpen} onOpenChange={setCalOpen} placement="bottom-end">
            <PopoverTrigger>
              <button className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <CalendarDays size={18} className={todayEvents.length > 0 ? "text-primary" : "text-gray-400"} />
                {todayEvents.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                    {todayEvents.length > 9 ? "9+" : todayEvents.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-96 shadow-xl rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 bg-primary text-white flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold leading-none">{now.getDate()}</p>
                  <p className="font-semibold text-sm mt-0.5">{now.toLocaleDateString("en-MY", { weekday: "long" })}</p>
                  <p className="text-primary-200 text-xs mt-0.5">{now.toLocaleDateString("en-MY", { month: "long", year: "numeric" })}</p>
                </div>
                <CalendarDays size={36} className="text-white/20" />
              </div>

              {/* Today's events */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Today's Events</p>
                </div>
                {todayEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-4 text-gray-300">
                    <CalendarDays size={28} className="mb-1.5" />
                    <p className="text-xs text-gray-400">No events scheduled for today</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todayEvents.map((e: any) => (
                      <div key={e.id} className="flex items-start gap-3 bg-primary/5 border border-primary/10 rounded-xl px-3 py-2">
                        <div className="w-1 self-stretch rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                          {e.start_at && (
                            <p className="text-xs text-primary mt-0.5">
                              {new Date(e.start_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                              {e.end_at ? ` – ${new Date(e.end_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </p>
                          )}
                          {e.location && <p className="text-xs text-gray-400 truncate mt-0.5">· {e.location}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming events */}
              {upcomingEvents.length > 0 && (
                <div className="px-4 pb-3 border-t pt-3 max-h-48 overflow-y-auto">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Upcoming</p>
                  <div className="space-y-1.5">
                    {upcomingEvents.map((e: any) => (
                      <div key={e.id} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex flex-col items-center justify-center shrink-0 gap-0">
                          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide leading-none">{new Date(e.start_at).toLocaleDateString("en-MY", { month: "short" })}</span>
                          <span className="text-base font-bold text-gray-700 leading-none mt-0.5">{new Date(e.start_at).getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{e.title}</p>
                          <p className="text-xs text-gray-400">{new Date(e.start_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-4 py-2.5 border-t bg-gray-50 text-center">
                <button
                  className="text-xs text-primary font-semibold hover:underline"
                  onClick={() => { setCalOpen(false); router.push("/calendar"); }}
                >
                  Open Full Calendar →
                </button>
              </div>
            </PopoverContent>
          </Popover>

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
            <PopoverContent className="p-0 w-96">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="font-semibold text-sm">Reminders</span>
                {overdueCount > 0 && (
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => markAllReadMutation.mutate()}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {overdueCount === 0 ? (
                  <div className="flex flex-col items-center py-8 text-gray-400">
                    <Check size={22} className="text-success mb-2" />
                    <p className="text-sm">All caught up!</p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n: any) => (
                    <div key={n.id} className="px-4 py-3 border-b last:border-0 bg-white hover:bg-gray-50">
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-warning" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                          {n.client_name && (
                            <p className="text-xs text-primary mt-0.5">{n.client_name}</p>
                          )}
                          {n.body && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{n.body}</p>
                          )}
                          <p className="text-[11px] text-gray-300 mt-1">
                            {new Date(n.fired_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                          </p>
                          {n.action_type === "create_invoice" && (
                            <button
                              className="mt-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-3 py-1 rounded-lg transition-colors"
                              onClick={() => {
                                markReadMutation.mutate(n.id);
                                setNotifOpen(false);
                                const q = n.client_id ? `?client_id=${n.client_id}` : "";
                                router.push(`/invoices/new${q}`);
                              }}
                            >
                              Create Invoice →
                            </button>
                          )}
                        </div>
                        <button
                          className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5"
                          onClick={() => markReadMutation.mutate(n.id)}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t bg-gray-50 text-center">
                <button
                  className="text-xs text-primary font-semibold hover:underline"
                  onClick={() => { setNotifOpen(false); router.push("/reminders"); }}
                >
                  Manage reminders →
                </button>
              </div>
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
                  <p className="text-[11px] text-gray-400 leading-tight">{ROLE_LABEL[displayUser?.role ?? ""] ?? ""}</p>
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
                <Input variant="bordered" labelPlacement="outside" label="New Password"
                  type={showNewPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={editForm.new_password}
                  onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                  endContent={<button type="button" onClick={() => setShowNewPw(p => !p)} className="text-gray-400 hover:text-gray-600">{showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
                <Input variant="bordered" labelPlacement="outside" label="Confirm Password"
                  type={showConfirmPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={editForm.confirm_password}
                  onChange={(e) => setEditForm({ ...editForm, confirm_password: e.target.value })}
                  endContent={<button type="button" onClick={() => setShowConfirmPw(p => !p)} className="text-gray-400 hover:text-gray-600">{showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
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
