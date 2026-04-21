"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Button, Chip, Tabs, Tab, Input, Textarea, Select, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from "@heroui/react";
import { ArrowLeft, Plus, Clock, Flag, Users, CheckSquare, Calendar, Milestone, MessageSquare } from "lucide-react";
import { projectsApi, api } from "@/lib/api";

const PRIORITY_COLORS: Record<string, "default" | "primary" | "warning" | "danger"> = {
  low: "default", medium: "primary", high: "warning", critical: "danger",
};

const STATUS_COLORS: Record<string, "default" | "primary" | "warning" | "success"> = {
  todo: "default", in_progress: "primary", review: "warning", done: "success",
};

const STATUSES = ["todo", "in_progress", "review", "done"];
const STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done" };

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: project, isLoading } = useQuery({ queryKey: ["project", projectId], queryFn: () => projectsApi.get(projectId) });
  const { data: tasks = [] } = useQuery({ queryKey: ["project-tasks", projectId], queryFn: () => projectsApi.listTasks(projectId) });
  const { data: meetings = [] } = useQuery({ queryKey: ["project-meetings", projectId], queryFn: () => projectsApi.listMeetings(projectId) });
  const { data: updates = [] } = useQuery({ queryKey: ["project-updates", projectId], queryFn: () => projectsApi.listUpdates(projectId) });
  const { data: milestones = [] } = useQuery({ queryKey: ["project-milestones", projectId], queryFn: () => projectsApi.listMilestones(projectId) });
  const { data: members = [] } = useQuery({ queryKey: ["project-members", projectId], queryFn: () => projectsApi.listMembers(projectId) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.get("/users").then((r) => r.data) });

  // Task modal
  const taskModal = useDisclosure();
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignee_id: "", status: "todo", priority: "medium", start_date: "", due_date: "", estimated_hours: "" });

  const createTask = useMutation({
    mutationFn: () => projectsApi.createTask(projectId, { ...taskForm, assignee_id: taskForm.assignee_id || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-tasks", projectId] }); taskModal.onClose(); setTaskForm({ title: "", description: "", assignee_id: "", status: "todo", priority: "medium", start_date: "", due_date: "", estimated_hours: "" }); },
  });

  const updateTaskStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) => projectsApi.updateTask(taskId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
  });

  // Meeting modal
  const meetingModal = useDisclosure();
  const [meetingForm, setMeetingForm] = useState({ title: "", scheduled_at: "", duration_min: "60", location: "", agenda: "", attendee_ids: "" });

  const createMeeting = useMutation({
    mutationFn: () => projectsApi.scheduleMeeting(projectId, { ...meetingForm }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-meetings", projectId] }); meetingModal.onClose(); },
  });

  // Update post
  const [updateContent, setUpdateContent] = useState("");
  const postUpdate = useMutation({
    mutationFn: () => projectsApi.postUpdate(projectId, updateContent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-updates", projectId] }); setUpdateContent(""); },
  });

  // Milestone modal
  const milestoneModal = useDisclosure();
  const [milestoneForm, setMilestoneForm] = useState({ title: "", due_date: "" });
  const createMilestone = useMutation({
    mutationFn: () => projectsApi.createMilestone(projectId, milestoneForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-milestones", projectId] }); milestoneModal.onClose(); },
  });

  if (isLoading) return <div className="p-6 text-center text-default-400">Loading project...</div>;
  if (!project) return <div className="p-6 text-center text-danger">Project not found.</div>;

  // Kanban columns
  const kanbanCols = STATUSES.map((s) => ({ status: s, label: STATUS_LABELS[s], tasks: tasks.filter((t: { status: string }) => t.status === s) }));

  // Gantt data (simple visual)
  const ganttTasks = tasks.filter((t: { start_date?: string; due_date?: string }) => t.start_date && t.due_date);
  const allDates = ganttTasks.flatMap((t: { start_date: string; due_date: string }) => [new Date(t.start_date), new Date(t.due_date)]);
  const minDate = allDates.length ? new Date(Math.min(...allDates.map((d: Date) => d.getTime()))) : new Date();
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map((d: Date) => d.getTime()))) : new Date(Date.now() + 30 * 86400000);
  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / 86400000);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button isIconOnly variant="flat" size="sm" onPress={() => router.push("/projects")}><ArrowLeft size={16} /></Button>
        <div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            {project.stage_name && (
              <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: project.stage_color ?? "#888" }}>{project.stage_name}</span>
            )}
            <Chip size="sm" color={PRIORITY_COLORS[project.priority] ?? "default"} variant="flat">{project.priority}</Chip>
            {project.start_date && <span className="text-xs text-default-400">{project.start_date} → {project.end_date ?? "—"}</span>}
          </div>
        </div>
      </div>

      <Tabs aria-label="Project Tabs">
        {/* ─── Overview ─── */}
        <Tab key="overview" title={<span className="flex items-center gap-1"><Flag size={14} />Overview</span>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-content1 border border-divider rounded-xl p-4 col-span-2">
              <p className="text-sm font-medium mb-1">Description</p>
              <p className="text-sm text-default-500">{project.description || "No description provided."}</p>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div><p className="text-2xl font-bold">{project.member_count}</p><p className="text-xs text-default-400">Members</p></div>
                <div><p className="text-2xl font-bold">{project.task_count}</p><p className="text-xs text-default-400">Tasks</p></div>
                <div><p className="text-2xl font-bold">{project.done_count}</p><p className="text-xs text-default-400">Done</p></div>
              </div>
              {project.task_count > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-default-400 mb-1">
                    <span>Progress</span>
                    <span>{Math.round((project.done_count / project.task_count) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-default-100 rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${Math.round((project.done_count / project.task_count) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="bg-content1 border border-divider rounded-xl p-4">
                <p className="text-sm font-medium mb-2">Milestones</p>
                {milestones.length === 0 ? <p className="text-xs text-default-400">None yet</p> : milestones.map((m: { id: number; title: string; due_date?: string; is_reached: boolean }) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm mb-1">
                    <span className={m.is_reached ? "text-success" : "text-default-400"}>●</span>
                    <span className={m.is_reached ? "line-through text-default-400" : ""}>{m.title}</span>
                    {m.due_date && <span className="text-xs text-default-400 ml-auto">{m.due_date}</span>}
                  </div>
                ))}
                <Button size="sm" variant="flat" className="mt-2 w-full" onPress={milestoneModal.onOpen}><Plus size={14} />Add</Button>
              </div>
              {project.budget && (
                <div className="bg-content1 border border-divider rounded-xl p-4">
                  <p className="text-xs text-default-400">Budget</p>
                  <p className="text-lg font-bold">RM {Number(project.budget).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        </Tab>

        {/* ─── Kanban ─── */}
        <Tab key="tasks" title={<span className="flex items-center gap-1"><CheckSquare size={14} />Tasks</span>}>
          <div className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={taskModal.onOpen}>Add Task</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto">
              {kanbanCols.map((col) => (
                <div key={col.status} className="min-w-[220px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs bg-default-100 rounded-full px-2 py-0.5">{col.tasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.tasks.map((t: { id: number; title: string; priority: string; assignee_name?: string; due_date?: string; estimated_hours?: number; logged_hours: number }) => (
                      <div key={t.id} className="bg-content1 border border-divider rounded-lg p-3">
                        <p className="text-sm font-medium mb-1">{t.title}</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Chip size="sm" color={PRIORITY_COLORS[t.priority] ?? "default"} variant="flat">{t.priority}</Chip>
                          {t.assignee_name && <span className="text-xs text-default-400">{t.assignee_name}</span>}
                        </div>
                        {t.due_date && <p className="text-xs text-default-400 mt-1">Due {t.due_date}</p>}
                        {t.estimated_hours && <p className="text-xs text-default-400">{t.logged_hours}h / {t.estimated_hours}h</p>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {STATUSES.filter((s) => s !== t.status).map((s) => (
                            <button key={s} onClick={() => updateTaskStatus.mutate({ taskId: t.id, status: s })}
                              className="text-xs text-primary hover:underline">{STATUS_LABELS[s]}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {col.tasks.length === 0 && <div className="border-2 border-dashed border-divider rounded-lg p-4 text-center text-xs text-default-300">Empty</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Tab>

        {/* ─── Gantt ─── */}
        <Tab key="gantt" title={<span className="flex items-center gap-1"><Calendar size={14} />Gantt</span>}>
          <div className="mt-4">
            {ganttTasks.length === 0 ? (
              <div className="text-center py-16 text-default-400">
                <Calendar size={40} className="mx-auto mb-3 opacity-40" />
                <p>No tasks with start/end dates. Add dates to tasks to see Gantt chart.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {ganttTasks.map((t: { id: number; title: string; start_date: string; due_date: string; status: string; priority: string }) => {
                    const start = (new Date(t.start_date).getTime() - minDate.getTime()) / 86400000;
                    const dur = Math.max(1, (new Date(t.due_date).getTime() - new Date(t.start_date).getTime()) / 86400000);
                    return (
                      <div key={t.id} className="flex items-center gap-3 mb-2 h-9">
                        <span className="text-sm w-32 shrink-0 truncate text-right">{t.title}</span>
                        <div className="flex-1 relative h-6 bg-default-100 rounded">
                          <div
                            className="absolute h-full rounded"
                            style={{
                              left: `${(start / totalDays) * 100}%`,
                              width: `${Math.min(100 - (start / totalDays) * 100, (dur / totalDays) * 100)}%`,
                              background: t.status === "done" ? "#10b981" : t.priority === "critical" ? "#f31260" : t.priority === "high" ? "#f59e0b" : "#006FEE",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-3 mt-1 ml-[8.5rem]">
                    <span className="text-xs text-default-400">{minDate.toLocaleDateString()}</span>
                    <div className="flex-1" />
                    <span className="text-xs text-default-400">{maxDate.toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Tab>

        {/* ─── Meetings ─── */}
        <Tab key="meetings" title={<span className="flex items-center gap-1"><Clock size={14} />Meetings</span>}>
          <div className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={meetingModal.onOpen}>Schedule Meeting</Button>
            </div>
            <div className="space-y-3">
              {meetings.length === 0 && <div className="text-center py-12 text-default-400">No meetings scheduled.</div>}
              {meetings.map((m: { id: number; title: string; scheduled_at: string; duration_min: number; location?: string; agenda?: string; attendee_names: string[] }) => (
                <div key={m.id} className="bg-content1 border border-divider rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{m.title}</p>
                      <p className="text-sm text-default-500">{new Date(m.scheduled_at).toLocaleString()} · {m.duration_min} min</p>
                      {m.location && <p className="text-sm text-default-400">📍 {m.location}</p>}
                      {m.agenda && <p className="text-sm text-default-500 mt-1">{m.agenda}</p>}
                    </div>
                  </div>
                  {m.attendee_names.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {m.attendee_names.map((n) => <Chip key={n} size="sm" variant="flat">{n}</Chip>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Tab>

        {/* ─── Updates ─── */}
        <Tab key="updates" title={<span className="flex items-center gap-1"><MessageSquare size={14} />Updates</span>}>
          <div className="mt-4">
            <div className="flex gap-2 mb-4">
              <Textarea placeholder="Post an update..." value={updateContent} onValueChange={setUpdateContent} className="flex-1" minRows={2} />
              <Button color="primary" onPress={() => postUpdate.mutate()} isDisabled={!updateContent.trim()} isLoading={postUpdate.isPending} className="self-end">Post</Button>
            </div>
            <div className="space-y-3">
              {updates.length === 0 && <div className="text-center py-12 text-default-400">No updates yet.</div>}
              {updates.map((u: { id: number; user_name: string; content: string; created_at: string; file_url?: string }) => (
                <div key={u.id} className="bg-content1 border border-divider rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{u.user_name}</span>
                    <span className="text-xs text-default-400">{new Date(u.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{u.content}</p>
                </div>
              ))}
            </div>
          </div>
        </Tab>

        {/* ─── Members ─── */}
        <Tab key="members" title={<span className="flex items-center gap-1"><Users size={14} />Members</span>}>
          <div className="mt-4 space-y-2">
            {members.map((m: { id: number; name: string; email: string; project_role: string; user_role: string }) => (
              <div key={m.id} className="flex items-center justify-between bg-content1 border border-divider rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-default-400">{m.email}</p>
                </div>
                <div className="flex gap-2">
                  <Chip size="sm" variant="flat">{m.project_role}</Chip>
                  <Chip size="sm" variant="flat" color="primary">{m.user_role}</Chip>
                </div>
              </div>
            ))}
          </div>
        </Tab>
      </Tabs>

      {/* Task Modal */}
      <Modal isOpen={taskModal.isOpen} onClose={taskModal.onClose} size="lg">
        <ModalContent>
          <ModalHeader>Add Task</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="Title" isRequired value={taskForm.title} onValueChange={(v) => setTaskForm({ ...taskForm, title: v })} />
            <Input label="Description" value={taskForm.description} onValueChange={(v) => setTaskForm({ ...taskForm, description: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Status" selectedKeys={[taskForm.status]} onSelectionChange={(k) => setTaskForm({ ...taskForm, status: Array.from(k)[0] as string ?? "todo" })}>
                {STATUSES.map((s) => <SelectItem key={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </Select>
              <Select label="Priority" selectedKeys={[taskForm.priority]} onSelectionChange={(k) => setTaskForm({ ...taskForm, priority: Array.from(k)[0] as string ?? "medium" })}>
                {["low", "medium", "high", "critical"].map((p) => <SelectItem key={p}>{p}</SelectItem>)}
              </Select>
            </div>
            <Select label="Assignee" selectedKeys={taskForm.assignee_id ? [taskForm.assignee_id] : []} onSelectionChange={(k) => setTaskForm({ ...taskForm, assignee_id: Array.from(k)[0] as string ?? "" })}>
              {members.map((m: { id: number; name: string }) => <SelectItem key={String(m.id)}>{m.name}</SelectItem>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" value={taskForm.start_date} onValueChange={(v) => setTaskForm({ ...taskForm, start_date: v })} />
              <Input label="Due Date" type="date" value={taskForm.due_date} onValueChange={(v) => setTaskForm({ ...taskForm, due_date: v })} />
            </div>
            <Input label="Estimated Hours" type="number" value={taskForm.estimated_hours} onValueChange={(v) => setTaskForm({ ...taskForm, estimated_hours: v })} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={taskModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={createTask.isPending} onPress={() => createTask.mutate()} isDisabled={!taskForm.title}>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Meeting Modal */}
      <Modal isOpen={meetingModal.isOpen} onClose={meetingModal.onClose} size="lg">
        <ModalContent>
          <ModalHeader>Schedule Meeting</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="Title" isRequired value={meetingForm.title} onValueChange={(v) => setMeetingForm({ ...meetingForm, title: v })} />
            <Input label="Date & Time" type="datetime-local" isRequired value={meetingForm.scheduled_at} onValueChange={(v) => setMeetingForm({ ...meetingForm, scheduled_at: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Duration (min)" type="number" value={meetingForm.duration_min} onValueChange={(v) => setMeetingForm({ ...meetingForm, duration_min: v })} />
              <Input label="Location" value={meetingForm.location} onValueChange={(v) => setMeetingForm({ ...meetingForm, location: v })} />
            </div>
            <Textarea label="Agenda" value={meetingForm.agenda} onValueChange={(v) => setMeetingForm({ ...meetingForm, agenda: v })} />
            <Select
              label="Attendees"
              selectionMode="multiple"
              selectedKeys={meetingForm.attendee_ids ? meetingForm.attendee_ids.split(",").filter(Boolean) : []}
              onSelectionChange={(k) => setMeetingForm({ ...meetingForm, attendee_ids: Array.from(k).join(",") })}
            >
              {users.map((u: { id: number; name: string }) => <SelectItem key={String(u.id)}>{u.name}</SelectItem>)}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={meetingModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={createMeeting.isPending} onPress={() => createMeeting.mutate()} isDisabled={!meetingForm.title || !meetingForm.scheduled_at}>Schedule</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Milestone Modal */}
      <Modal isOpen={milestoneModal.isOpen} onClose={milestoneModal.onClose}>
        <ModalContent>
          <ModalHeader>Add Milestone</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="Title" isRequired value={milestoneForm.title} onValueChange={(v) => setMilestoneForm({ ...milestoneForm, title: v })} />
            <Input label="Due Date" type="date" value={milestoneForm.due_date} onValueChange={(v) => setMilestoneForm({ ...milestoneForm, due_date: v })} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={milestoneModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={createMilestone.isPending} onPress={() => createMilestone.mutate()} isDisabled={!milestoneForm.title}>Add</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
