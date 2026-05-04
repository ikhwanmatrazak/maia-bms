"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea, Chip, Tooltip,
} from "@heroui/react";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, MapPin, Link2, Users,
  Check, XCircle, Copy, CopyCheck, LogIn, LogOut, CalendarDays, LayoutList,
  Pencil, Trash2,
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
  const pad2 = (n: number) => String(n).padStart(2, "0");

  const [viewDate, setViewDate] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [view, setView] = useState<"month" | "list">("month");
  const [isLoggedIn, setIsLoggedIn] = useState(() => isAuthenticated());
  const [listDateFilter, setListDateFilter] = useState("");

  // Detail modal
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [detail, setDetail] = useState<{ attendees: Attendee[] } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Overflow modal
  const [overflowDay, setOverflowDay] = useState<{ day: number; events: CalEvent[] } | null>(null);

  // Create / edit modals
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE" });
  const [saving, setSaving] = useState(false);
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

  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ["shared-calendar", viewDate.year, viewDate.month],
    queryFn: () => publicCalendarApi.listEvents(viewDate.year, viewDate.month),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => calendarApi.deleteEvent(id),
    onSuccess: () => { setDetailOpen(false); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg || "Failed to delete event");
    },
  });
  const rsvpMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) => calendarApi.rsvp(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-calendar"] }),
  });

  // Calendar grid — weeks array
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

  async function openDetail(ev: CalEvent) {
    setSelected(ev); setDetail(null); setCopiedInvite(false); setDeleteError(null); setDetailOpen(true);
    try { const d = await publicCalendarApi.getEvent(ev.id); setDetail(d); } catch { /* ignore */ }
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

  function openCreate() {
    const now = new Date();
    const h = pad2(now.getHours()), mi = pad2(now.getMinutes());
    const base = `${viewDate.year}-${pad2(viewDate.month)}-${pad2(now.getDate())}T${h}:${mi}`;
    setForm({ title: "", start_at: base, end_at: addOneHour(base), description: "", location: "", meeting_link: "", color: "#006FEE" });
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.title || !form.start_at) return;
    setSaving(true);
    try { await calendarApi.createEvent({ ...form, attendee_ids: [] }); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); setCreateOpen(false); }
    finally { setSaving(false); }
  }

  function openEdit() {
    if (!selected) return;
    setEditForm({ title: selected.title, start_at: toLocal(selected.start_at), end_at: selected.end_at ? toLocal(selected.end_at) : "", description: selected.description ?? "", location: selected.location ?? "", meeting_link: selected.meeting_link ?? "", color: selected.color });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!selected || !editForm.title || !editForm.start_at) return;
    setSaving(true);
    try { await calendarApi.updateEvent(selected.id, editForm); qc.invalidateQueries({ queryKey: ["shared-calendar"] }); setEditOpen(false); setDetailOpen(false); }
    finally { setSaving(false); }
  }

  // List view
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
    <div>
      {/* ── Header — identical style to Topbar ── */}
      <header className="h-14 bg-white border-b border-divider flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">
        <h2 className="text-base font-semibold text-foreground">Shared Calendar</h2>
        <div className="flex items-center gap-1">
          {isLoggedIn ? (
            <>
              <Button color="primary" size="sm" startContent={<Plus size={15} />} onPress={() => openCreate()}>
                New Event
              </Button>
              <div className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl hover:bg-gray-100 ml-1 cursor-default">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(currentUser?.name ?? "U").split(" ").map((w: string) => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-gray-900 hidden sm:block">{currentUser?.name}</span>
              </div>
              <button onClick={() => { clearAuth(); setIsLoggedIn(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                <LogOut size={14} /> <span className="hidden sm:block">Logout</span>
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

      {/* ── Body — same padding/layout as dashboard calendar ── */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* Controls row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-default-100"><ChevronLeft size={20} /></button>
            <h2 className="text-lg font-semibold w-44 text-center">{MONTHS[viewDate.month - 1]} {viewDate.year}</h2>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-default-100"><ChevronRight size={20} /></button>
            <button onClick={() => setViewDate({ year: today.getFullYear(), month: today.getMonth() + 1 })}
              className="text-xs text-primary hover:underline">Today</button>
          </div>
          <div className="flex items-center gap-1 bg-default-100 p-1 rounded-lg">
            <button onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "month" ? "bg-white shadow text-foreground" : "text-default-500 hover:text-foreground"}`}>
              <CalendarDays size={15} /> Month
            </button>
            <button onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "list" ? "bg-white shadow text-foreground" : "text-default-500 hover:text-foreground"}`}>
              <LayoutList size={15} /> List
            </button>
          </div>
        </div>

        {/* ── List View ── */}
        {view === "list" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <input type="date" value={listDateFilter}
                  onChange={e => { const v = e.target.value; setListDateFilter(v); if (v) { const [y,m] = v.split("-").map(Number); setViewDate({ year: y, month: m }); } }}
                  className="w-full px-3 py-2 text-sm border border-divider rounded-xl bg-content1 focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              {listDateFilter ? (
                <button onClick={() => setListDateFilter("")} className="text-xs text-default-500 hover:text-danger px-3 py-2 border border-divider rounded-xl bg-content1">Clear filter</button>
              ) : (
                <p className="text-xs text-default-400">Showing upcoming events only</p>
              )}
            </div>
            {listGroups.length === 0 && (
              <div className="text-center py-16 text-default-400">
                <LayoutList size={40} className="mx-auto mb-3 opacity-30" />
                <p>{listDateFilter ? "No events on this date" : "No upcoming events this month"}</p>
              </div>
            )}
            {listGroups.map(([dateKey, dayEvs]) => {
              const isTodayRow = dateKey === todayStr;
              const [dy, dm, dd] = dateKey.split("-").map(Number);
              const dateLabel = new Date(dy, dm-1, dd).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    {isTodayRow && <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">Today</span>}
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isTodayRow ? "text-primary" : "text-default-500"}`}>{dateLabel}</div>
                  </div>
                  <div className="space-y-2">
                    {dayEvs.map(ev => (
                      <div key={ev.id} onClick={() => openDetail(ev)}
                        className={`flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors border ${isTodayRow ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-content1 border-divider hover:bg-default-50"}`}>
                        <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: ev.color }} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${isTodayRow ? "text-primary" : ""}`}>{ev.title}</p>
                          <p className="text-xs text-default-400 mt-0.5">
                            {fmtTime(ev.start_at)}{ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ""}{ev.location ? ` · ${ev.location}` : ""}
                          </p>
                          {ev.description && <p className="text-xs text-default-500 mt-1 truncate">{ev.description}</p>}
                        </div>
                        <div className="text-xs text-default-400 shrink-0">{ev.organizer_name}</div>
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
            <div className="grid grid-cols-7 border-b border-divider">
              {DAYS.map(d => <div key={d} className="py-2 text-center text-xs font-semibold text-default-500">{d}</div>)}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-divider last:border-0" style={{ minHeight: 100 }}>
                {week.map((day, di) => {
                  const dayEvents = day ? (eventsByDay[day] ?? []) : [];
                  return (
                    <div key={di}
                      onClick={() => day && isLoggedIn && requireLogin(() => openCreate())}
                      className={`border-r border-divider last:border-0 p-1.5 ${day ? (isLoggedIn ? "cursor-pointer hover:bg-default-50" : "") : "bg-default-50/30"} transition-colors`}>
                      {day && (
                        <>
                          <span className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday(day) ? "bg-primary text-white" : "text-default-700"}`}>
                            {day}
                          </span>
                          <div className="mt-0.5 space-y-0.5">
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
      <Modal isOpen={!!overflowDay} onOpenChange={open => { if (!open) setOverflowDay(null); }} size="sm">
        <ModalContent>
          {(onClose) => overflowDay && (
            <>
              <ModalHeader>{MONTHS[viewDate.month - 1]} {overflowDay.day}, {viewDate.year}</ModalHeader>
              <ModalBody>
                <div className="space-y-1 pb-2">
                  {overflowDay.events.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-default-100 cursor-pointer"
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
                    <div className="flex gap-2 pt-2">
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
                <div className="flex justify-end gap-2">
                  {isLoggedIn && (
                    <Button color="danger" variant="light" isLoading={deleteMut.isPending}
                      onPress={() => { if (confirm("Delete this event?")) deleteMut.mutate(selected.id); }}>
                      Delete
                    </Button>
                  )}
                  <Button variant="light" onPress={onClose}>Close</Button>
                  {isLoggedIn && (
                    <Button color="default" variant="flat" startContent={<Pencil size={14} />}
                      onPress={() => { onClose(); openEdit(); }}>
                      Edit Event
                    </Button>
                  )}
                  <Button
                    color={copiedInvite ? "success" : "default"} variant="flat"
                    startContent={copiedInvite ? <CopyCheck size={14} /> : <Copy size={14} />}
                    onPress={() => requireLogin(() => {
                      navigator.clipboard.writeText(buildInvitationText(selected));
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    })}>
                    {copiedInvite ? "Copied!" : "Copy Invite"}
                  </Button>
                  {selected.meeting_link && (
                    <Button color="primary" as="a" href={selected.meeting_link} target="_blank">Join Meeting</Button>
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
