"use client";
import { Topbar } from "@/components/ui/Topbar";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Chip } from "@heroui/react";
import { FolderOpen, CheckSquare, Clock, TrendingUp, Users } from "lucide-react";
import { projectsApi } from "@/lib/api";

const PRIORITY_COLORS: Record<string, "default" | "primary" | "warning" | "danger"> = {
  low: "default", medium: "primary", high: "warning", critical: "danger",
};

export default function ProjectsDashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["projects-dashboard"], queryFn: projectsApi.getDashboard });

  if (isLoading) return <div className="p-6 text-center text-default-400">Loading dashboard...</div>;

  const d = data ?? { projects_total: 0, projects_completed: 0, my_tasks: [], upcoming_meetings: [], crm: {}, sales: {} };

  return (
    <div>
    <Topbar title="Business Dashboard" />
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Business Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<FolderOpen size={20} />} label="Total Projects" value={d.projects_total} color="primary" />
        <StatCard icon={<CheckSquare size={20} />} label="Completed" value={d.projects_completed} color="success" />
        <StatCard icon={<CheckSquare size={20} />} label="My Open Tasks" value={d.my_tasks.length} color="warning" />
        <StatCard icon={<Clock size={20} />} label="Meetings This Week" value={d.upcoming_meetings.length} color="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Tasks */}
        <div className="bg-content1 border border-divider rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare size={18} className="text-primary" />
            <h2 className="font-semibold">My Tasks Due This Week</h2>
          </div>
          {d.my_tasks.length === 0 ? (
            <p className="text-default-400 text-sm text-center py-6">No tasks due this week 🎉</p>
          ) : (
            <div className="space-y-2">
              {d.my_tasks.map((t: { id: number; title: string; status: string; priority: string; due_date?: string; project_name: string }) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-divider last:border-0">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-default-400">{t.project_name} · {t.due_date}</p>
                  </div>
                  <Chip size="sm" color={PRIORITY_COLORS[t.priority] ?? "default"} variant="flat">{t.priority}</Chip>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Meetings */}
        <div className="bg-content1 border border-divider rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-secondary" />
            <h2 className="font-semibold">Upcoming Meetings</h2>
          </div>
          {d.upcoming_meetings.length === 0 ? (
            <p className="text-default-400 text-sm text-center py-6">No meetings this week</p>
          ) : (
            <div className="space-y-2">
              {d.upcoming_meetings.map((m: { id: number; title: string; scheduled_at: string; duration_min: number; location?: string; project_name?: string }) => (
                <div key={m.id} className="py-2 border-b border-divider last:border-0">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-default-400">{new Date(m.scheduled_at).toLocaleString()} · {m.duration_min} min</p>
                  {m.location && <p className="text-xs text-default-400">📍 {m.location}</p>}
                  {m.project_name && <p className="text-xs text-primary">{m.project_name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CRM Pipeline */}
        {Object.keys(d.crm).length > 0 && (
          <div className="bg-content1 border border-divider rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-success" />
              <h2 className="font-semibold">CRM Pipeline</h2>
            </div>
            <div className="space-y-2">
              {Object.entries(d.crm).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center py-1">
                  <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                  <Chip size="sm" variant="flat">{String(count)}</Chip>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Overview */}
        {d.sales && Object.keys(d.sales).length > 0 && (
          <div className="bg-content1 border border-divider rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-warning" />
              <h2 className="font-semibold">Sales Overview</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-default-500">Draft Quotations</span>
                <span className="font-semibold">{d.sales.quotes_draft}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-default-500">Sent Invoices</span>
                <span className="font-semibold">{d.sales.invoices_sent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-default-500">Outstanding</span>
                <span className="font-semibold text-warning">RM {Number(d.sales.outstanding).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={() => router.push("/projects")} className="text-sm text-primary hover:underline">View all projects →</button>
      </div>
    </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-content1 border border-divider rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-${color}/10 text-${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-default-400">{label}</p>
      </div>
    </div>
  );
}
