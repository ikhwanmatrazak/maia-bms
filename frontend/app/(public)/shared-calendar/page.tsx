"use client";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea, Chip, Tooltip,
} from "@heroui/react";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, MapPin, Link2, Users,
  Check, XCircle, Copy, CopyCheck, LogIn, LogOut, CalendarDays, LayoutList,
  Pencil, Trash2, Search,
} from "lucide-react";
import { publicCalendarApi, calendarApi, authApi } from "@/lib/api";
import { setTokens, setUser, isAuthenticated, getUser, clearAuth } from "@/lib/auth";

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS_FULL  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
function generateJitsiLink(title: string): string {
  const slug = (title || "meeting").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, "0")).join("");
  return `https://meet.jit.si/maia-${slug}-${hex}`;
}
function addOneHour(dt: string) {
  if (!dt) return "";
  const d = new Date(dt); d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function buildInvitationText(event: CalEvent): string {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dateStr = `${dayNames[start.getDay()]} ${MONTHS_SHORT[start.getMonth()]} ${String(start.getDate()).padStart(2,"0")}, ${start.getFullYear()}`;
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
  const pad2 = (n: number) => String(n).padStart(2, "0");

  // Default to list view on mobile
  const [view, setView] = useState<"month" | "list">("month");
  useEffect(() => {
    if (window.innerWidth < 640) setView("list");
  }, []);

  const [viewDate, setViewDate] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [isLoggedIn, setIsLoggedIn] = useState(() => isAuthenticated());
  const [listDateFilter, setListDateFilter] = useState("");

  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [overflowDay, setOverflowDay] = useState<{ day: number; events: CalEvent[] } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE", attendee_ids: [] as number[] });
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE", attendee_ids: [] as number[] });
  const [editAttendeeSearch, setEditAttendeeSearch] = useState("");

  const [quickLoginOpen, setQuickLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const currentUser = isLoggedIn ? getUser() : null;

  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ["shared-calendar", viewDate.year, viewDate.month],
    queryFn: () => publicCalendarApi.listEvents(viewDate.year, viewDate.month),
  });

  const { data: allUsers = [] } = useQuery<{ id: number; full_name: string; email: string }[]>({
    queryKey: ["calendar-users"],
    queryFn: () => calendarApi.listUsers(),
    enabled: isLoggedIn,
  });

  const { data: detail, isFetching: detailLoading } = useQuery<{ attendees: Attendee[] } & CalEvent>({
    queryKey: ["shared-calendar-event", selected?.id],
    queryFn: () => publicCalendarApi.getEvent(selected!.id),
    enabled: !!selected && detailOpen,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => calendarApi.deleteEvent(id),
    onSuccess: () => { setDetailOpen(false); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); qc.removeQueries({ queryKey: ["shared-calendar-event"] }); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg || "Failed to delete event");
    },
  });
  const rsvpMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) => calendarApi.rsvp(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-calendar"] });
      qc.invalidateQueries({ queryKey: ["shared-calendar-event", selected?.id] });
    },
  });

  // Calendar grid
  const firstDay = new Date(viewDate.year, viewDate.month - 1, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    const monthStart = new Date(viewDate.year, viewDate.month - 1, 1);
    const monthEnd = new Date(viewDate.year, viewDate.month, 0, 23, 59, 59);
    for (const e of events) {
      const start = new Date(e.start_at);
      const end = e.end_at ? new Date(e.end_at) : start;
      const from = start < monthStart ? monthStart : start;
      const to = end > monthEnd ? monthEnd : end;
      const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      while (cur <= toDay) {
        const d = cur.getDate();
        if (!map[d]) map[d] = [];
        if (!map[d].find(x => x.id === e.id)) map[d].push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [events, viewDate]);

  const isToday = (d: number | null) =>
    d !== null && d === today.getDate() && viewDate.month === today.getMonth() + 1 && viewDate.year === today.getFullYear();

  function prevMonth() { setViewDate(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { ...v, month: v.month - 1 }); }
  function nextMonth() { setViewDate(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { ...v, month: v.month + 1 }); }

  function openDetail(ev: CalEvent) {
    setSelected(ev); setCopiedInvite(false); setDeleteError(null); setDetailOpen(true);
  }

  function requireLogin(action: () => void) {
    if (isLoggedIn) { action(); return; }
    setPendingAction(() => action);
    setQuickLoginOpen(true);
  }

  async function handleQuickLogin() {
    setLoginError(null); setLoginLoading(true);
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      setTokens(res.access_token, res.refresh_token);
      setUser({ id: res.id, name: res.name, email: res.email, role: res.role, is_super_admin: res.is_super_admin, tenant_id: res.tenant_id, permissions: res.permissions });
      setIsLoggedIn(true); setQuickLoginOpen(false); setLoginEmail(""); setLoginPassword("");
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } catch { setLoginError("Invalid email or password"); }
    finally { setLoginLoading(false); }
  }

  function toggleAttendee(id: number) {
    setForm(f => ({ ...f, attendee_ids: f.attendee_ids.includes(id) ? f.attendee_ids.filter(x => x !== id) : [...f.attendee_ids, id] }));
  }
  function toggleEditAttendee(id: number) {
    setEditForm(f => ({ ...f, attendee_ids: f.attendee_ids.includes(id) ? f.attendee_ids.filter(x => x !== id) : [...f.attendee_ids, id] }));
  }

  function openCreate() {
    const now = new Date();
    const base = `${viewDate.year}-${pad2(viewDate.month)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    setForm({ title: "", start_at: base, end_at: addOneHour(base), description: "", location: "", meeting_link: "", color: "#006FEE", attendee_ids: [] });
    setAttendeeSearch("");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.title || !form.start_at) return;
    setSaving(true);
    try { await calendarApi.createEvent({ ...form, attendee_ids: form.attendee_ids.join(",") }); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); setCreateOpen(false); }
    finally { setSaving(false); }
  }

  function openEdit() {
    if (!selected) return;
    setEditForm({ title: selected.title, start_at: toLocal(selected.start_at), end_at: selected.end_at ? toLocal(selected.end_at) : "", description: selected.description ?? "", location: selected.location ?? "", meeting_link: selected.meeting_link ?? "", color: selected.color, attendee_ids: [...(selected.attendee_ids ?? [])] });
    setEditAttendeeSearch("");
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!selected || !editForm.title || !editForm.start_at) return;
    setSaving(true);
    try { await calendarApi.updateEvent(selected.id, { ...editForm, attendee_ids: editForm.attendee_ids.join(",") }); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); qc.invalidateQueries({ queryKey: ["shared-calendar-event", selected.id] }); setEditOpen(false); setDetailOpen(false); }
    finally { setSaving(false); }
  }

  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;
  const listGroups = useMemo(() => {
    const expandedEntries: { dateKey: string; ev: CalEvent }[] = [];
    for (const ev of events) {
      const start = new Date(ev.start_at);
      const end = ev.end_at ? new Date(ev.end_at) : start;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= endDay) {
        const dateKey = `${cur.getFullYear()}-${pad2(cur.getMonth()+1)}-${pad2(cur.getDate())}`;
        if (!listDateFilter && dateKey < todayStr) { cur.setDate(cur.getDate()+1); continue; }
        if (listDateFilter && dateKey !== listDateFilter) { cur.setDate(cur.getDate()+1); continue; }
        expandedEntries.push({ dateKey, ev });
        cur.setDate(cur.getDate()+1);
      }
    }
    expandedEntries.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || new Date(a.ev.start_at).getTime() - new Date(b.ev.start_at).getTime());
    const groups: Record<string, CalEvent[]> = {};
    for (const { dateKey, ev } of expandedEntries) {
      if (!groups[dateKey]) groups[dateKey] = [];
      if (!groups[dateKey].find(x => x.id === ev.id)) groups[dateKey].push(ev);
    }
    return Object.entries(groups);
  }, [events, listDateFilter, todayStr]);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <header className="h-14 bg-white border-b border-divider flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">
        <h2 className="text-base font-semibold text-foreground">Shared Calendar</h2>
        <div className="flex items-center gap-1">
          {isLoggedIn ? (
            <>
              <Button color="primary" size="sm" startContent={<Plus size={15} />} onPress={() => openCreate()}
                className="hidden sm:flex">
                New Event
              </Button>
              <Button color="primary" size="sm" isIconOnly onPress={() => openCreate()} className="sm:hidden">
                <Plus size={16} />
              </Button>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl ml-1">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(currentUser?.name ?? "U").split(" ").map((w: string) => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-gray-900 hidden sm:block">{currentUser?.name}</span>
              </div>
              <button onClick={() => { clearAuth(); setIsLoggedIn(false); }}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                <LogOut size={14} />
                <span className="hidden sm:block">Logout</span>
              </button>
            </>
          ) : (
            <button onClick={() => setQuickLoginOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/30">
              <LogIn size={14} /> Login
            </button>
          )}
        </div>
      </header>

      <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto">

        {/* ── Controls row ── */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
          <div className="flex items-center gap-1 sm:gap-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-default-100 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-sm sm:text-lg font-semibold w-28 sm:w-44 text-center">
              {MONTHS_SHORT[viewDate.month - 1]} {viewDate.year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-default-100 transition-colors">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setViewDate({ year: today.getFullYear(), month: today.getMonth() + 1 })}
              className="hidden sm:block text-xs text-primary hover:underline">Today</button>
          </div>
          <div className="flex items-center gap-0.5 bg-default-100 p-1 rounded-lg">
            <button onClick={() => setView("month")}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${view === "month" ? "bg-white shadow text-foreground" : "text-default-500 hover:text-foreground"}`}>
              <CalendarDays size={14} />
              <span className="hidden sm:inline">Month</span>
            </button>
            <button onClick={() => setView("list")}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${view === "list" ? "bg-white shadow text-foreground" : "text-default-500 hover:text-foreground"}`}>
              <LayoutList size={14} />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {/* ── List View ── */}
        {view === "list" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input type="date" value={listDateFilter}
                onChange={e => { const v = e.target.value; setListDateFilter(v); if (v) { const [y,m] = v.split("-").map(Number); setViewDate({ year: y, month: m }); } }}
                className="flex-1 sm:flex-none sm:w-48 px-3 py-2 text-sm border border-divider rounded-xl bg-content1 focus:outline-none focus:ring-2 focus:ring-primary/20" />
              {listDateFilter ? (
                <button onClick={() => setListDateFilter("")}
                  className="text-xs text-default-500 hover:text-danger px-3 py-2 border border-divider rounded-xl bg-content1 whitespace-nowrap">
                  Clear
                </button>
              ) : (
                <p className="text-xs text-default-400 hidden sm:block">Upcoming only</p>
              )}
            </div>

            {listGroups.length === 0 && (
              <div className="text-center py-16 text-default-400">
                <LayoutList size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">{listDateFilter ? "No events on this date" : "No upcoming events this month"}</p>
              </div>
            )}
            {listGroups.map(([dateKey, dayEvs]) => {
              const isTodayRow = dateKey === todayStr;
              const [dy, dm, dd] = dateKey.split("-").map(Number);
              const dateLabel = new Date(dy, dm-1, dd).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              const dateLabelShort = new Date(dy, dm-1, dd).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    {isTodayRow && <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">Today</span>}
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isTodayRow ? "text-primary" : "text-default-500"}`}>
                      <span className="sm:hidden">{dateLabelShort}</span>
                      <span className="hidden sm:block">{dateLabel}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dayEvs.map(ev => (
                      <div key={ev.id} onClick={() => openDetail(ev)}
                        className={`flex items-start gap-3 rounded-xl px-3 sm:px-4 py-3 cursor-pointer transition-colors border active:scale-[0.99] ${isTodayRow ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-content1 border-divider hover:bg-default-50"}`}>
                        <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: ev.color }} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${isTodayRow ? "text-primary" : ""}`}>{ev.title}</p>
                          <p className="text-xs text-default-400 mt-0.5">
                            {fmtTime(ev.start_at)}{ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ""}
                            {ev.location ? ` · ${ev.location}` : ""}
                          </p>
                          {ev.description && <p className="text-xs text-default-500 mt-1 truncate">{ev.description}</p>}
                        </div>
                        <div className="text-xs text-default-400 shrink-0 hidden sm:block">{ev.organizer_name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Month View ── */}
        {view === "month" && (
          <div className="bg-content1 border border-divider rounded-xl overflow-hidden">
            {/* Day headers — short on mobile */}
            <div className="grid grid-cols-7 border-b border-divider">
              {DAYS_FULL.map((d, i) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-default-500">
                  <span className="hidden sm:block">{d}</span>
                  <span className="sm:hidden">{DAYS_SHORT[i]}</span>
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-divider last:border-0">
                {week.map((day, di) => {
                  const dayEvents = day ? (eventsByDay[day] ?? []) : [];
                  return (
                    <div key={di}
                      onClick={() => {
                        if (!day) return;
                        if (dayEvents.length > 0) { setOverflowDay({ day, events: dayEvents }); return; }
                        if (isLoggedIn) requireLogin(() => openCreate());
                      }}
                      className={`border-r border-divider last:border-0 p-1 sm:p-1.5 transition-colors min-h-[56px] sm:min-h-[100px] ${!day ? "bg-default-50/30" : "cursor-pointer hover:bg-default-50 active:bg-default-100"}`}>
                      {day && (
                        <>
                          <span className={`text-xs sm:text-sm font-medium inline-flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded-full ${isToday(day) ? "bg-primary text-white font-bold" : "text-default-700"}`}>
                            {day}
                          </span>

                          {/* Mobile: colored dots */}
                          <div className="flex flex-wrap gap-0.5 mt-1 sm:hidden">
                            {dayEvents.slice(0, 4).map(ev => (
                              <span key={ev.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                            ))}
                            {dayEvents.length > 4 && (
                              <span className="text-[9px] text-default-400 leading-none mt-0.5">+{dayEvents.length - 4}</span>
                            )}
                          </div>

                          {/* Desktop: full event pills */}
                          <div className="hidden sm:block mt-0.5 space-y-0.5">
                            {dayEvents.slice(0, 3).map(ev => (
                              <Tooltip key={ev.id} content={ev.title} placement="top">
                                <div onClick={e => { e.stopPropagation(); openDetail(ev); }}
                                  className="text-xs px-1.5 py-0.5 rounded truncate text-white font-medium cursor-pointer hover:opacity-80"
                                  style={{ backgroundColor: ev.color }}>
                                  {fmtTime(ev.start_at)} {ev.title}
                                </div>
                              </Tooltip>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="text-xs text-primary pl-1 cursor-pointer hover:underline"
                                onClick={e => { e.stopPropagation(); setOverflowDay({ day, events: dayEvents }); }}>
                                +{dayEvents.length - 3} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Day Overflow Modal ── */}
      <Modal isOpen={!!overflowDay} onOpenChange={open => { if (!open) setOverflowDay(null); }} size="sm" placement="center">
        <ModalContent>
          {(onClose) => overflowDay && (
            <>
              <ModalHeader>{MONTHS[viewDate.month - 1]} {overflowDay.day}, {viewDate.year}</ModalHeader>
              <ModalBody>
                <div className="space-y-1 pb-2">
                  {overflowDay.events.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-default-100 cursor-pointer active:bg-default-200 transition-colors"
                      onClick={() => { onClose(); openDetail(ev); }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ev.title}</p>
                        <p className="text-xs text-default-400">{fmtTime(ev.start_at)}{ev.end_at ? ` — ${fmtTime(ev.end_at)}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Event Detail Modal ── */}
      <Modal isOpen={detailOpen} onOpenChange={open => { setDetailOpen(open); if (!open) setDeleteError(null); }}
        size="lg" scrollBehavior="outside" placement="center">
        <ModalContent>
          {(onClose) => selected && (
            <>
              <ModalHeader>
                <div className="flex items-center gap-2 pr-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
                  <span className="leading-snug">{selected.title}</span>
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
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin size={16} className="text-default-400 mt-0.5 shrink-0" />
                      <span>{selected.location}</span>
                    </div>
                  )}
                  {selected.meeting_link && (
                    <div className="flex items-start gap-2 text-sm">
                      <Link2 size={16} className="text-default-400 mt-0.5 shrink-0" />
                      <a href={selected.meeting_link} target="_blank" rel="noreferrer"
                        className="text-primary hover:underline break-all">
                        {selected.meeting_link}
                      </a>
                    </div>
                  )}
                  {selected.description && (
                    <p className="text-sm text-default-600 bg-default-50 p-3 rounded-lg">{selected.description}</p>
                  )}
                  <div className="text-xs text-default-400">Organized by {selected.organizer_name}</div>
                  <div>
                    <div className="flex items-center gap-1 mb-2 text-sm font-medium">
                      <Users size={14} /> Attendees
                    </div>
                    {detailLoading ? (
                      <div className="space-y-1.5">
                        {[1,2].map(i => <div key={i} className="h-5 bg-default-100 rounded animate-pulse" />)}
                      </div>
                    ) : detail?.attendees && detail.attendees.length > 0 ? (
                      <div className="space-y-1">
                        {detail.attendees.map(a => (
                          <div key={a.user_id} className="flex items-center justify-between text-sm gap-2">
                            <span className="truncate">{a.full_name || a.email}</span>
                            <Chip size="sm" variant="flat"
                              color={a.status === "accepted" ? "success" : a.status === "declined" ? "danger" : "default"}>
                              {a.status}
                            </Chip>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-default-400">No attendees</p>
                    )}
                  </div>
                  {isLoggedIn && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" color="success" variant="flat" startContent={<Check size={14} />}
                        onPress={() => rsvpMut.mutate({ id: selected.id, status: "accepted" })}>Accept</Button>
                      <Button size="sm" color="danger" variant="flat" startContent={<XCircle size={14} />}
                        onPress={() => rsvpMut.mutate({ id: selected.id, status: "declined" })}>Decline</Button>
                    </div>
                  )}
                  {!isLoggedIn && (
                    <button onClick={() => { setDetailOpen(false); setQuickLoginOpen(true); }}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline pt-1">
                      <LogIn size={13} /> Login to accept, decline, edit or copy
                    </button>
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
                <div className="flex flex-wrap justify-end gap-2">
                  {isLoggedIn && (
                    <Button color="danger" variant="light" size="sm" isLoading={deleteMut.isPending}
                      onPress={() => { if (confirm("Delete this event?")) deleteMut.mutate(selected.id); }}>
                      Delete
                    </Button>
                  )}
                  <Button variant="light" size="sm" onPress={onClose}>Close</Button>
                  {isLoggedIn && (
                    <Button color="default" variant="flat" size="sm" startContent={<Pencil size={13} />}
                      onPress={() => { onClose(); openEdit(); }}>
                      Edit
                    </Button>
                  )}
                  <Button size="sm"
                    color={copiedInvite ? "success" : "default"} variant="flat"
                    startContent={copiedInvite ? <CopyCheck size={13} /> : <Copy size={13} />}
                    onPress={() => requireLogin(() => {
                      navigator.clipboard.writeText(buildInvitationText(selected));
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    })}>
                    {copiedInvite ? "Copied!" : "Copy Invite"}
                  </Button>
                  {selected.meeting_link && (
                    <Button color="primary" size="sm" as="a" href={selected.meeting_link} target="_blank">
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
      <Modal isOpen={quickLoginOpen}
        onOpenChange={open => { setQuickLoginOpen(open); if (!open) { setLoginError(null); setPendingAction(null); } }}
        size="sm" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2"><LogIn size={18} /> Login to continue</ModalHeader>
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
      <Modal isOpen={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setAttendeeSearch(""); }} size="lg" scrollBehavior="outside" placement="center">
        <ModalContent>
          {(onClose) => {
            const filteredUsers = allUsers.filter(u =>
              u.full_name?.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
              u.email?.toLowerCase().includes(attendeeSearch.toLowerCase())
            );
            return (
              <>
                <ModalHeader>New Event</ModalHeader>
                <ModalBody>
                  <div className="space-y-3">
                    <Input label="Title" value={form.title} onValueChange={v => setForm(f => ({ ...f, title: v }))} isRequired />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Start" type="datetime-local" value={form.start_at} onValueChange={v => setForm(f => ({ ...f, start_at: v, end_at: f.end_at && f.end_at > v ? f.end_at : addOneHour(v) }))} isRequired />
                      <Input label="End" type="datetime-local" value={form.end_at} onValueChange={v => setForm(f => ({ ...f, end_at: v }))} />
                    </div>
                    <Input label="Location" value={form.location} onValueChange={v => setForm(f => ({ ...f, location: v }))} />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-default-500">Meeting URL</label>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, meeting_link: generateJitsiLink(f.title) }))}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Link2 size={11} /> Auto-generate Jitsi link
                        </button>
                      </div>
                      <Input placeholder="https://meet.jit.si/..."
                        startContent={<Link2 size={14} className="text-default-400 shrink-0" />}
                        value={form.meeting_link} onValueChange={v => setForm(f => ({ ...f, meeting_link: v }))} />
                    </div>
                    <Textarea label="Description" value={form.description} onValueChange={v => setForm(f => ({ ...f, description: v }))} />
                    <div>
                      <p className="text-sm text-default-600 mb-2">Color</p>
                      <div className="flex gap-3">
                        {EVENT_COLORS.map(c => (
                          <button key={c.value} title={c.label}
                            className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c.value }}
                            onClick={() => setForm(f => ({ ...f, color: c.value }))} />
                        ))}
                      </div>
                    </div>
                    {/* Invite Team Members */}
                    <div>
                      <p className="text-xs font-semibold text-default-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Users size={12} /> Invite Team Members
                        {form.attendee_ids.length > 0 && (
                          <Chip size="sm" color="primary" variant="flat" className="ml-1">{form.attendee_ids.length}</Chip>
                        )}
                      </p>
                      <div className="relative mb-1.5">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400" />
                        <input type="text" placeholder="Search by name or email…"
                          value={attendeeSearch} onChange={e => setAttendeeSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-default-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
                      </div>
                      <div className="overflow-y-auto space-y-0.5 border border-default-100 rounded-lg" style={{ maxHeight: 180 }}>
                        {filteredUsers.length === 0 && (
                          <p className="text-sm text-default-400 text-center py-4">{attendeeSearch ? "No match found" : "No team members found."}</p>
                        )}
                        {filteredUsers.map(u => (
                          <div key={u.id} onClick={() => toggleAttendee(u.id)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${form.attendee_ids.includes(u.id) ? "bg-primary/10 text-primary" : "hover:bg-default-100"}`}>
                            <div>
                              <p className="text-sm font-medium leading-tight">{u.full_name}</p>
                              <p className="text-xs text-default-400">{u.email}</p>
                            </div>
                            {form.attendee_ids.includes(u.id) && <Check size={15} className="shrink-0" />}
                          </div>
                        ))}
                      </div>
                      {form.attendee_ids.length > 0 && (
                        <p className="text-xs text-default-400 mt-1.5">Invitations will be sent to {form.attendee_ids.length} member{form.attendee_ids.length > 1 ? "s" : ""}</p>
                      )}
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>Cancel</Button>
                  <Button color="primary" isLoading={saving} onPress={handleCreate}>Create</Button>
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>

      {/* ── Edit Event Modal ── */}
      <Modal isOpen={editOpen} onOpenChange={open => { setEditOpen(open); if (!open) setEditAttendeeSearch(""); }} size="lg" scrollBehavior="outside" placement="center">
        <ModalContent>
          {(onClose) => {
            const filteredUsers = allUsers.filter(u =>
              u.full_name?.toLowerCase().includes(editAttendeeSearch.toLowerCase()) ||
              u.email?.toLowerCase().includes(editAttendeeSearch.toLowerCase())
            );
            return (
              <>
                <ModalHeader>Edit Event</ModalHeader>
                <ModalBody>
                  <div className="space-y-3">
                    <Input label="Title" value={editForm.title} onValueChange={v => setEditForm(f => ({ ...f, title: v }))} isRequired />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Start" type="datetime-local" value={editForm.start_at} onValueChange={v => setEditForm(f => ({ ...f, start_at: v, end_at: f.end_at && f.end_at > v ? f.end_at : addOneHour(v) }))} isRequired />
                      <Input label="End" type="datetime-local" value={editForm.end_at} onValueChange={v => setEditForm(f => ({ ...f, end_at: v }))} />
                    </div>
                    <Input label="Location" value={editForm.location} onValueChange={v => setEditForm(f => ({ ...f, location: v }))} />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-default-500">Meeting URL</label>
                        <button type="button"
                          onClick={() => setEditForm(f => ({ ...f, meeting_link: generateJitsiLink(f.title) }))}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Link2 size={11} /> Auto-generate Jitsi link
                        </button>
                      </div>
                      <Input placeholder="https://meet.jit.si/..."
                        startContent={<Link2 size={14} className="text-default-400 shrink-0" />}
                        value={editForm.meeting_link} onValueChange={v => setEditForm(f => ({ ...f, meeting_link: v }))} />
                    </div>
                    <Textarea label="Description" value={editForm.description} onValueChange={v => setEditForm(f => ({ ...f, description: v }))} />
                    <div>
                      <p className="text-sm text-default-600 mb-2">Color</p>
                      <div className="flex gap-3">
                        {EVENT_COLORS.map(c => (
                          <button key={c.value} title={c.label}
                            className={`w-8 h-8 rounded-full border-2 transition-transform ${editForm.color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c.value }}
                            onClick={() => setEditForm(f => ({ ...f, color: c.value }))} />
                        ))}
                      </div>
                    </div>
                    {/* Team Members */}
                    <div>
                      <p className="text-xs font-semibold text-default-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Users size={12} /> Team Members
                        {editForm.attendee_ids.length > 0 && (
                          <Chip size="sm" color="primary" variant="flat" className="ml-1">{editForm.attendee_ids.length}</Chip>
                        )}
                      </p>
                      <div className="relative mb-1.5">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400" />
                        <input type="text" placeholder="Search by name or email…"
                          value={editAttendeeSearch} onChange={e => setEditAttendeeSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-default-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
                      </div>
                      <div className="overflow-y-auto space-y-0.5 border border-default-100 rounded-lg" style={{ maxHeight: 180 }}>
                        {filteredUsers.length === 0 && (
                          <p className="text-sm text-default-400 text-center py-4">{editAttendeeSearch ? "No match found" : "No team members found."}</p>
                        )}
                        {filteredUsers.map(u => (
                          <div key={u.id} onClick={() => toggleEditAttendee(u.id)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${editForm.attendee_ids.includes(u.id) ? "bg-primary/10 text-primary" : "hover:bg-default-100"}`}>
                            <div>
                              <p className="text-sm font-medium leading-tight">{u.full_name}</p>
                              <p className="text-xs text-default-400">{u.email}</p>
                            </div>
                            {editForm.attendee_ids.includes(u.id) && <Check size={15} className="shrink-0" />}
                          </div>
                        ))}
                      </div>
                      {editForm.attendee_ids.length > 0 && (
                        <p className="text-xs text-default-400 mt-1.5">Invitations will be sent to {editForm.attendee_ids.length} member{editForm.attendee_ids.length > 1 ? "s" : ""}</p>
                      )}
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>Cancel</Button>
                  <Button color="primary" isLoading={saving} onPress={handleEdit}>Save</Button>
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>
    </div>
  );
}
