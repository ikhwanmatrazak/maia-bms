"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { Plus, Edit2, Check } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  half_day: "bg-yellow-100 text-yellow-700",
  late: "bg-orange-100 text-orange-700",
  public_holiday: "bg-blue-100 text-blue-700",
  leave: "bg-purple-100 text-purple-700",
};

const now = new Date();
const DEFAULT_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

export default function AttendancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [empFilter, setEmpFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);

  const emptyForm = { employee_id: "", date: new Date().toISOString().split("T")[0], check_in: "", check_out: "", work_hours: "", overtime_hours: "0", status: "present", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["hr-attendance", month, empFilter],
    queryFn: () => hrApi.listAttendance({ month, employee_id: empFilter || undefined }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => hrApi.listEmployees(),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => hrApi.createAttendance(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-attendance"] }); setShowModal(false); setForm(emptyForm); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => hrApi.updateAttendance(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-attendance"] }); setShowModal(false); setEditRecord(null); },
  });

  const openEdit = (r: any) => {
    setEditRecord(r);
    setForm({
      employee_id: String(r.employee_id),
      date: r.date,
      check_in: r.check_in ? new Date(r.check_in).toISOString().slice(0, 16) : "",
      check_out: r.check_out ? new Date(r.check_out).toISOString().slice(0, 16) : "",
      work_hours: r.work_hours ? String(r.work_hours) : "",
      overtime_hours: r.overtime_hours ? String(r.overtime_hours) : "0",
      status: r.status,
      notes: r.notes || "",
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    const data: any = {
      employee_id: Number(form.employee_id),
      date: form.date,
      status: form.status,
      notes: form.notes || null,
      check_in: form.check_in || null,
      check_out: form.check_out || null,
      work_hours: form.work_hours ? Number(form.work_hours) : null,
      overtime_hours: Number(form.overtime_hours || 0),
    };
    if (editRecord) updateMutation.mutate({ id: editRecord.id, data });
    else createMutation.mutate(data);
  };

  // Summary stats
  const totalRecords = records.length;
  const presentCount = records.filter((r: any) => r.status === "present").length;
  const absentCount = records.filter((r: any) => r.status === "absent").length;
  const totalHours = records.reduce((sum: number, r: any) => sum + (r.work_hours || 0), 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">{totalRecords} records for {month}</p>
        </div>
        <button onClick={() => { setEditRecord(null); setForm(emptyForm); setShowModal(true); }} className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e]">
          <Plus size={16} /> Add Record
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Records", totalRecords, "text-gray-900"],
          ["Present", presentCount, "text-green-700"],
          ["Absent", absentCount, "text-red-700"],
          ["Total Hours", totalHours.toFixed(1), "text-blue-700"],
        ].map(([label, val, color]) => (
          <div key={String(label)} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
          <option value="">All Employees</option>
          {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
        ) : records.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No attendance records for this period</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Check In</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Check Out</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Hours</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">OT</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.employee_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.date}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{r.work_hours ?? "—"}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-orange-600">{r.overtime_hours || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-gray-600"><Edit2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold">{editRecord ? "Edit" : "Add"} Attendance</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employee</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.employee_id} onChange={e => set("employee_id", e.target.value)}>
                <option value="">Select employee</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.date} onChange={e => set("date", e.target.value)} /></div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                  <option value="late">Late</option>
                  <option value="leave">On Leave</option>
                  <option value="public_holiday">Public Holiday</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Check In</label><input type="datetime-local" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.check_in} onChange={e => set("check_in", e.target.value)} /></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Check Out</label><input type="datetime-local" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.check_out} onChange={e => set("check_out", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Work Hours</label><input type="number" step="0.25" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.work_hours} onChange={e => set("work_hours", e.target.value)} /></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Overtime Hours</label><input type="number" step="0.25" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.overtime_hours} onChange={e => set("overtime_hours", e.target.value)} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label><input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button disabled={!form.employee_id || !form.date || createMutation.isPending || updateMutation.isPending} onClick={handleSubmit} className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
