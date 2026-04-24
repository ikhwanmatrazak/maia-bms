"use client";
import { Topbar } from "@/components/ui/Topbar";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea, Select, SelectItem, Chip, Tooltip } from "@heroui/react";
import { ChevronLeft, ChevronRight, Plus, X, Calendar, MapPin, Link2, Users, Check, XCircle } from "lucide-react";
import { calendarApi } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const EVENT_COLORS = [
  { label: "Blue", value: "#006FEE" },
  { label: "Green", value: "#17c964" },
  { label: "Purple", value: "#9353d3" },
  { label: "Red", value: "#f31260" },
  { label: "Orange", value: "#f5a524" },
  { label: "Teal", value: "#06b7db" },
];

type CalEvent = {
  id: number; title: string; description?: string;
  start_at: string; end_at?: string; location?: string;
  meeting_link?: string; color: string;
  organizer_id: number; organizer_name: string;
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
  // Convert ISO to local datetime-local input value
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const today = new Date();

  const [viewDate, setViewDate] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDay, setCreateDay] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", start_at: "", end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE", attendee_ids: [] as number[] });
  const [saving, setSaving] = useState(false);

  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ["calendar", viewDate.year, viewDate.month],
    queryFn: () => calendarApi.listEvents(viewDate.year, viewDate.month),
  });
  const { data: allUsers = [] } = useQuery<{ id: number; full_name: string; email: string }[]>({
    queryKey: ["calendar-users"],
    queryFn: () => calendarApi.listUsers(),
  });
  const { data: detail } = useQuery<{ attendees: Attendee[] } & CalEvent>({
    queryKey: ["calendar-event", selected?.id],
    queryFn: () => calendarApi.getEvent(selected!.id),
    enabled: !!selected,
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => calendarApi.createEvent(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calendar"] }); setCreateOpen(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => calendarApi.deleteEvent(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calendar"] }); setDetailOpen(false); setSelected(null); },
  });
  const rsvpMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) => calendarApi.rsvp(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar-event", selected?.id] }),
  });

  // Build calendar grid
  const { weeks } = useMemo(() => {
    const first = new Date(viewDate.year, viewDate.month - 1, 1);
    const last = new Date(viewDate.year, viewDate.month, 0);
    const startDay = first.getDay();
    const days: (number | null)[] = Array(startDay).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks };
  }, [viewDate]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (const e of events) {
      const d = new Date(e.start_at).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return map;
  }, [events]);

  function prevMonth() {
    setViewDate(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 });
  }
  function nextMonth() {
    setViewDate(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 });
  }

  function openCreate(day?: number) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = viewDate.year, m = viewDate.month, d = day ?? now.getDate();
    const h = pad(now.getHours()), mi = pad(now.getMinutes());
    const base = `${y}-${pad(m)}-${pad(d)}T${h}:${mi}`;
    setForm({ title: "", start_at: base, end_at: "", description: "", location: "", meeting_link: "", color: "#006FEE", attendee_ids: [] });
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.title || !form.start_at) return;
    setSaving(true);
    try {
      await createMut.mutateAsync({
        ...form,
        attendee_ids: form.attendee_ids.join(","),
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleAttendee(id: number) {
    setForm(f => ({
      ...f,
      attendee_ids: f.attendee_ids.includes(id)
        ? f.attendee_ids.filter(x => x !== id)
        : [...f.attendee_ids, id],
    }));
  }

  const isToday = (d: number | null) =>
    d !== null && d === today.getDate() && viewDate.month === today.getMonth() + 1 && viewDate.year === today.getFullYear();

  return (
    <div>
    <Topbar title="Shared Calendar" />
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button color="primary" startContent={<Plus size={16} />} onPress={() => openCreate()}>
          New Event
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-default-100"><ChevronLeft size={20} /></button>
        <h2 className="text-lg font-semibold w-44 text-center">{MONTHS[viewDate.month - 1]} {viewDate.year}</h2>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-default-100"><ChevronRight size={20} /></button>
        <button onClick={() => setViewDate({ year: today.getFullYear(), month: today.getMonth() + 1 })}
          className="ml-2 text-xs text-primary hover:underline">Today</button>
      </div>

      {/* Calendar grid */}
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-divider">
          {DAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-default-500">{d}</div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-divider last:border-0" style={{ minHeight: 100 }}>
            {week.map((day, di) => {
              const dayEvents = day ? (eventsByDay[day] ?? []) : [];
              return (
                <div
                  key={di}
                  onClick={() => day && openCreate(day)}
                  className={`border-r border-divider last:border-0 p-1.5 cursor-pointer hover:bg-default-50 transition-colors ${!day ? "bg-default-50/30" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday(day) ? "bg-primary text-white" : "text-default-700"}`}>
                        {day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <Tooltip key={ev.id} content={ev.title} placement="top">
                            <div
                              onClick={e => { e.stopPropagation(); setSelected(ev); setDetailOpen(true); }}
                              className="text-xs px-1.5 py-0.5 rounded truncate text-white font-medium cursor-pointer hover:opacity-80"
                              style={{ backgroundColor: ev.color }}
                            >
                              {fmtTime(ev.start_at)} {ev.title}
                            </div>
                          </Tooltip>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-default-400 pl-1">+{dayEvents.length - 3} more</div>
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

      {/* ── Event Detail Modal ─────────────────────────────── */}
      <Modal isOpen={detailOpen} onOpenChange={setDetailOpen} size="lg">
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

                  {/* Attendees */}
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

                  {/* RSVP buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" color="success" variant="flat" startContent={<Check size={14} />}
                      onPress={() => rsvpMut.mutate({ id: selected.id, status: "accepted" })}>
                      Accept
                    </Button>
                    <Button size="sm" color="danger" variant="flat" startContent={<XCircle size={14} />}
                      onPress={() => rsvpMut.mutate({ id: selected.id, status: "declined" })}>
                      Decline
                    </Button>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => deleteMut.mutate(selected.id)}>
                  Delete Event
                </Button>
                <Button variant="light" onPress={onClose}>Close</Button>
                {selected.meeting_link && (
                  <Button color="primary" as="a" href={selected.meeting_link} target="_blank">
                    Join Meeting
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Create Event Modal ─────────────────────────────── */}
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>New Event</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Title *"
                    placeholder="e.g. Weekly Stand-up"
                    value={form.title}
                    onValueChange={v => setForm(f => ({ ...f, title: v }))}
                    isRequired
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Start *"
                      type="datetime-local"
                      value={form.start_at}
                      onValueChange={v => setForm(f => ({ ...f, start_at: v }))}
                      isRequired
                    />
                    <Input
                      label="End *"
                      type="datetime-local"
                      value={form.end_at}
                      onValueChange={v => setForm(f => ({ ...f, end_at: v }))}
                      isRequired
                    />
                  </div>
                  <Input
                    label="Location"
                    placeholder="e.g. Conference Room A"
                    startContent={<MapPin size={14} className="text-default-400" />}
                    value={form.location}
                    onValueChange={v => setForm(f => ({ ...f, location: v }))}
                  />
                  <Input
                    label="Meeting Link"
                    placeholder="https://meet.google.com/..."
                    startContent={<Link2 size={14} className="text-default-400" />}
                    value={form.meeting_link}
                    onValueChange={v => setForm(f => ({ ...f, meeting_link: v }))}
                  />
                  <Textarea
                    label="Description / Agenda"
                    placeholder="What's the meeting about?"
                    value={form.description}
                    onValueChange={v => setForm(f => ({ ...f, description: v }))}
                    minRows={2}
                  />

                  {/* Color picker */}
                  <div>
                    <p className="text-sm font-medium mb-2">Color</p>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map(c => (
                        <button
                          key={c.value}
                          title={c.label}
                          onClick={() => setForm(f => ({ ...f, color: c.value }))}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Attendees */}
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Users size={14} /> Invite Team Members
                      {form.attendee_ids.length > 0 && (
                        <Chip size="sm" color="primary" variant="flat">{form.attendee_ids.length} selected</Chip>
                      )}
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-divider rounded-lg p-2">
                      {allUsers.map(u => (
                        <div
                          key={u.id}
                          onClick={() => toggleAttendee(u.id)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            form.attendee_ids.includes(u.id) ? "bg-primary/10 text-primary" : "hover:bg-default-100"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium">{u.full_name}</p>
                            <p className="text-xs text-default-400">{u.email}</p>
                          </div>
                          {form.attendee_ids.includes(u.id) && <Check size={16} />}
                        </div>
                      ))}
                      {allUsers.length === 0 && (
                        <div className="text-center py-4">
                          <p className="text-sm text-default-400">No team members found.</p>
                          <a href="/settings/users" className="text-xs text-primary hover:underline">Add users in Settings →</a>
                        </div>
                      )}
                    </div>
                    {form.attendee_ids.length > 0 && (
                      <p className="text-xs text-default-400 mt-1">
                        Invitation emails will be sent to {form.attendee_ids.length} member{form.attendee_ids.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="primary" isLoading={saving} onPress={handleCreate} isDisabled={!form.title || !form.start_at || !form.end_at}>
                  Create & Send Invitations
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
    </div>
  );
}
