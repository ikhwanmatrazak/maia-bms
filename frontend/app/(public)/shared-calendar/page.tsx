"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea, Chip,
} from "@heroui/react";
import {
  ChevronLeft, ChevronRight, Calendar, MapPin, Link2, Users,
  Copy, CopyCheck, LogIn, LogOut, CalendarDays, LayoutList,
  Check, XCircle, Plus, Pencil, Trash2,
} from "lucide-react";
import { publicCalendarApi, calendarApi, authApi } from "@/lib/api";
import { setTokens, setUser, isAuthenticated, getUser, clearAuth } from "@/lib/auth";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const EVENT_COLORS = [
  { label: "Blue",   value: "#006FEE" },
  { label: "Green",  value: "#17c964" },
  { label: "Purple", value: "#9353d3" },
  { label: "Red",    value: "#f31260" },
  { label: "Orange", value: "#f5a524" },
  { label: "Teal",   value: "#06b7db" },
];

type CalEvent = {
  id: number; title: string; description?: string;
  start_at: string; end_at?: string; location?: string;
  meeting_link?: string; color: string;
  organizer_id?: number; organizer_name: string;
  attendee_ids: number[]; my_rsvp?: string;
};
type Attendee = { user_id: number; full_name: string; email: string; status: string };

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function toLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function buildInvitationText(event: CalEvent): string {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateStr = `${dayNames[start.getDay()]} ${monthNames[start.getMonth()]} ${String(start.getDate()).padStart(2,"0")}, ${start.getFullYear()}`;
  const fmtT = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  const offset = -start.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `GMT${sign}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`;
  const timeStr = end ? `${fmtT(start)}—${fmtT(end)} (${tz})` : `${fmtT(start)} (${tz})`;
  const lines = [`You're invited to ${event.title}`, "", dateStr, "", timeStr];
  if (event.meeting_link) lines.push("", event.meeting_link, "", "Tap on the link or paste it in a browser to join.");
  if (event.location) lines.push("", `Location: ${event.location}`);
  return lines.join("\n");
}

export default function SharedCalendarPage() {
  const qc = useQueryClient();
  const today = new Date();
  const [viewDate, setViewDate] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [view, setView] = useState<"month" | "list">("month");
  const [isLoggedIn, setIsLoggedIn] = useState(() => isAuthenticated());

  // Detail modal
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [detail, setDetail] = useState<{ attendees: Attendee[] } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE" });
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE" });

  // Quick login modal
  const [quickLoginOpen, setQuickLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const currentUser = isLoggedIn ? getUser() : null;

  // Fetch events — public endpoint (no auth needed)
  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ["shared-calendar", viewDate.year, viewDate.month],
    queryFn: () => publicCalendarApi.listEvents(viewDate.year, viewDate.month),
  });

  const rsvpMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) =>
      calendarApi.rsvp(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-calendar"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => calendarApi.deleteEvent(id),
    onSuccess: () => {
      setDetailOpen(false);
      qc.invalidateQueries({ queryKey: ["shared-calendar"] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg || "Failed to delete event");
    },
  });

  // Calendar grid
  const firstDay = new Date(viewDate.year, viewDate.month - 1, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const evByDay = useMemo(() => {
    const m: Record<number, CalEvent[]> = {};
    events.forEach(e => {
      const d = new Date(e.start_at).getDate();
      if (!m[d]) m[d] = [];
      m[d].push(e);
    });
    return m;
  }, [events]);

  const listEvents = useMemo(() =>
    [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events]);

  function prevMonth() {
    setViewDate(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setViewDate(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { ...v, month: v.month + 1 });
  }

  async function openDetail(ev: CalEvent) {
    setSelected(ev);
    setCopiedInvite(false);
    setDeleteError(null);
    setDetail(null);
    setDetailOpen(true);
    try {
      const d = await publicCalendarApi.getEvent(ev.id);
      setDetail(d);
    } catch { /* ignore */ }
  }

  function requireLogin(action: () => void) {
    if (isLoggedIn) { action(); return; }
    setPendingAction(() => action);
    setQuickLoginOpen(true);
  }

  async function handleQuickLogin() {
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      setTokens(res.access_token, res.refresh_token);
      setUser({ id: res.id, name: res.name, email: res.email, role: res.role, is_super_admin: res.is_super_admin, tenant_id: res.tenant_id, permissions: res.permissions });
      setIsLoggedIn(true);
      setQuickLoginOpen(false);
      setLoginEmail("");
      setLoginPassword("");
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } catch {
      setLoginError("Invalid email or password");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.title || !form.start_at) return;
    setSaving(true);
    try {
      await calendarApi.createEvent({ ...form, attendee_ids: [] });
      qc.invalidateQueries({ queryKey: ["shared-calendar"] });
      setCreateOpen(false);
      setForm({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE" });
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!selected) return;
    setEditForm({
      title: selected.title,
      start_at: toLocal(selected.start_at),
      end_at: selected.end_at ? toLocal(selected.end_at) : "",
      description: selected.description || "",
      location: selected.location || "",
      meeting_link: selected.meeting_link || "",
      color: selected.color,
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!selected || !editForm.title || !editForm.start_at) return;
    setSaving(true);
    try {
      await calendarApi.updateEvent(selected.id, editForm);
      qc.invalidateQueries({ queryKey: ["shared-calendar"] });
      setEditOpen(false);
      setDetailOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <div className="border-b border-divider px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-primary" />
          <span className="font-semibold text-base">Shared Calendar</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              <span className="text-sm text-default-500 hidden sm:block">{currentUser?.name}</span>
              <Button size="sm" color="primary" startContent={<Plus size={14} />}
                onPress={() => setCreateOpen(true)}>
                New Event
              </Button>
              <Button size="sm" variant="light" startContent={<LogOut size={14} />}
                onPress={() => { clearAuth(); setIsLoggedIn(false); }}>
                Logout
              </Button>
            </>
          ) : (
            <Button size="sm" color="primary" variant="flat" startContent={<LogIn size={14} />}
              onPress={() => setQuickLoginOpen(true)}>
              Login
            </Button>
          )}
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">

        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button isIconOnly size="sm" variant="flat" onPress={prevMonth}><ChevronLeft size={16} /></Button>
            <span className="font-semibold w-44 text-center">{MONTHS[viewDate.month - 1]} {viewDate.year}</span>
            <Button isIconOnly size="sm" variant="flat" onPress={nextMonth}><ChevronRight size={16} /></Button>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={view === "month" ? "flat" : "light"} isIconOnly onPress={() => setView("month")}><CalendarDays size={16} /></Button>
            <Button size="sm" variant={view === "list" ? "flat" : "light"} isIconOnly onPress={() => setView("list")}><LayoutList size={16} /></Button>
          </div>
        </div>

        {/* Month view */}
        {view === "month" && (
          <div>
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-default-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-divider rounded-xl overflow-hidden border border-divider">
              {cells.map((day, i) => {
                const isToday = day === today.getDate() && viewDate.month === today.getMonth() + 1 && viewDate.year === today.getFullYear();
                const dayEvents = day ? (evByDay[day] ?? []) : [];
                return (
                  <div key={i} className={`bg-background min-h-[90px] p-1 ${!day ? "opacity-0 pointer-events-none" : ""}`}>
                    {day && (
                      <>
                        <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-0.5 ${isToday ? "bg-primary text-white font-bold" : "text-default-600"}`}>{day}</div>
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id}
                            className="text-xs rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer hover:opacity-80 text-white"
                            style={{ backgroundColor: ev.color }}
                            onClick={() => openDetail(ev)}>
                            {fmtTime(ev.start_at)} {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && <div className="text-xs text-default-400 pl-1">+{dayEvents.length - 3}</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <div className="space-y-2">
            {listEvents.length === 0 && <p className="text-default-400 text-center py-12">No events this month</p>}
            {listEvents.map(ev => (
              <div key={ev.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-divider hover:bg-default-50 cursor-pointer"
                onClick={() => openDetail(ev)}>
                <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-default-400">{fmtDate(ev.start_at)}{ev.end_at ? ` — ${fmtTime(ev.end_at)}` : ""}</p>
                </div>
                {ev.meeting_link && <Link2 size={14} className="text-default-300 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Event Detail Modal ── */}
      <Modal isOpen={detailOpen} onOpenChange={open => { setDetailOpen(open); if (!open) setDeleteError(null); }} size="lg">
        <ModalContent>
          {(onClose) => selected && (
            <>
              <ModalHeader>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selected.color }} />
                  {selected.title}
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <Calendar size={16} className="text-default-400 mt-0.5 shrink-0" />
                    <div>
                      <p>{fmtDate(selected.start_at)} {fmtTime(selected.start_at)}</p>
                      {selected.end_at && <p className="text-default-400">until {fmtTime(selected.end_at)}</p>}
                    </div>
                  </div>
                  {selected.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={16} className="text-default-400 shrink-0" />
                      <span>{selected.location}</span>
                    </div>
                  )}
                  {selected.meeting_link && (
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 size={16} className="text-default-400 shrink-0" />
                      <a href={selected.meeting_link} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">
                        {selected.meeting_link}
                      </a>
                    </div>
                  )}
                  {selected.description && (
                    <p className="text-sm text-default-600 bg-default-50 p-3 rounded-lg">{selected.description}</p>
                  )}
                  <div className="text-xs text-default-400">Organized by {selected.organizer_name}</div>

                  {detail?.attendees && detail.attendees.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1 mb-2 text-sm font-medium">
                        <Users size={14} /> Attendees
                      </div>
                      <div className="space-y-1">
                        {detail.attendees.map(a => (
                          <div key={a.user_id} className="flex items-center justify-between text-sm">
                            <span>{a.full_name || a.email}</span>
                            <Chip size="sm" variant="flat"
                              color={a.status === "accepted" ? "success" : a.status === "declined" ? "danger" : "default"}>
                              {a.status}
                            </Chip>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isLoggedIn && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" color="success" variant="flat" startContent={<Check size={14} />}
                        onPress={() => rsvpMut.mutate({ id: selected.id, status: "accepted" })}>
                        Accept
                      </Button>
                      <Button size="sm" color="danger" variant="flat" startContent={<XCircle size={14} />}
                        onPress={() => rsvpMut.mutate({ id: selected.id, status: "declined" })}>
                        Decline
                      </Button>
                    </div>
                  )}

                  {!isLoggedIn && (
                    <div className="text-xs text-default-400 bg-default-50 rounded-lg p-3 flex items-center gap-2">
                      <LogIn size={13} />
                      Login to add, edit, delete, or copy this event
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter className="flex-col items-stretch gap-2">
                {deleteError && (
                  <div className="w-full px-3 py-2 bg-danger-50 text-danger text-xs rounded-lg border border-danger-100 flex justify-between items-center">
                    <span>{deleteError}</span>
                    <button onClick={() => setDeleteError(null)} className="ml-2 font-bold">✕</button>
                  </div>
                )}
                <div className="flex justify-end gap-2 flex-wrap">
                  {isLoggedIn && (
                    <Button color="danger" variant="light" isLoading={deleteMut.isPending}
                      startContent={<Trash2 size={14} />}
                      onPress={() => { if (confirm("Delete this event?")) deleteMut.mutate(selected.id); }}>
                      Delete
                    </Button>
                  )}
                  <Button variant="light" onPress={onClose}>Close</Button>
                  {isLoggedIn && (
                    <Button color="default" variant="flat" startContent={<Pencil size={14} />}
                      onPress={() => { onClose(); openEdit(); }}>
                      Edit
                    </Button>
                  )}
                  <Button
                    color={copiedInvite ? "success" : "default"}
                    variant="flat"
                    startContent={copiedInvite ? <CopyCheck size={14} /> : <Copy size={14} />}
                    onPress={() => requireLogin(() => {
                      navigator.clipboard.writeText(buildInvitationText(selected));
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    })}
                  >
                    {copiedInvite ? "Copied!" : "Copy Invite"}
                  </Button>
                  {selected.meeting_link && (
                    <Button color="primary" as="a" href={selected.meeting_link} target="_blank">
                      Join Meeting
                    </Button>
                  )}
                </div>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Quick Login Modal ── */}
      <Modal isOpen={quickLoginOpen} onOpenChange={open => { setQuickLoginOpen(open); if (!open) { setLoginError(null); setPendingAction(null); } }} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <LogIn size={18} /> Login to continue
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3 pb-1">
                  {loginError && <p className="text-danger text-sm bg-danger-50 p-2 rounded-lg">{loginError}</p>}
                  <Input label="Email" type="email" value={loginEmail} onValueChange={setLoginEmail} autoFocus />
                  <Input label="Password" type="password" value={loginPassword} onValueChange={setLoginPassword}
                    onKeyDown={e => e.key === "Enter" && handleQuickLogin()} />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" isLoading={loginLoading} onPress={handleQuickLogin}>Login</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Create Event Modal ── */}
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>New Event</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input label="Title" value={form.title} onValueChange={v => setForm(f => ({ ...f, title: v }))} isRequired />
                  <Input label="Start" type="datetime-local" value={form.start_at} onValueChange={v => setForm(f => ({ ...f, start_at: v }))} isRequired />
                  <Input label="End" type="datetime-local" value={form.end_at} onValueChange={v => setForm(f => ({ ...f, end_at: v }))} />
                  <Input label="Location" value={form.location} onValueChange={v => setForm(f => ({ ...f, location: v }))} />
                  <Input label="Meeting Link" value={form.meeting_link} onValueChange={v => setForm(f => ({ ...f, meeting_link: v }))} />
                  <Textarea label="Description" value={form.description} onValueChange={v => setForm(f => ({ ...f, description: v }))} />
                  <div>
                    <p className="text-sm text-default-600 mb-2">Color</p>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map(c => (
                        <button key={c.value} title={c.label}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setForm(f => ({ ...f, color: c.value }))} />
                      ))}
                    </div>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" isLoading={saving} onPress={handleCreate}>Create</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Edit Event Modal ── */}
      <Modal isOpen={editOpen} onOpenChange={setEditOpen} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit Event</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input label="Title" value={editForm.title} onValueChange={v => setEditForm(f => ({ ...f, title: v }))} isRequired />
                  <Input label="Start" type="datetime-local" value={editForm.start_at} onValueChange={v => setEditForm(f => ({ ...f, start_at: v }))} isRequired />
                  <Input label="End" type="datetime-local" value={editForm.end_at} onValueChange={v => setEditForm(f => ({ ...f, end_at: v }))} />
                  <Input label="Location" value={editForm.location} onValueChange={v => setEditForm(f => ({ ...f, location: v }))} />
                  <Input label="Meeting Link" value={editForm.meeting_link} onValueChange={v => setEditForm(f => ({ ...f, meeting_link: v }))} />
                  <Textarea label="Description" value={editForm.description} onValueChange={v => setEditForm(f => ({ ...f, description: v }))} />
                  <div>
                    <p className="text-sm text-default-600 mb-2">Color</p>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map(c => (
                        <button key={c.value} title={c.label}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${editForm.color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setEditForm(f => ({ ...f, color: c.value }))} />
                      ))}
                    </div>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" isLoading={saving} onPress={handleEdit}>Save</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

    </div>
  );
}
