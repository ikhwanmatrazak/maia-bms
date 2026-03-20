"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Users, Building2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  probation: "bg-yellow-100 text-yellow-700",
  resigned: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

export default function EmployeesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr-employees", search, deptFilter, statusFilter],
    queryFn: () => hrApi.listEmployees({ search: search || undefined, department_id: deptFilter || undefined, status: statusFilter || undefined }),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["hr-departments"],
    queryFn: hrApi.listDepartments,
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">{employees.length} employees</p>
        </div>
        <Link
          href="/hr/employees/new"
          className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e] transition-colors"
        >
          <Plus size={16} />
          Add Employee
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search name, ID, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No employees found</p>
            <Link href="/hr/employees/new" className="mt-3 text-sm text-blue-600 hover:underline">
              Add your first employee
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Join Date</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => (
                <tr
                  key={emp.id}
                  onClick={() => router.push(`/hr/employees/${emp.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {emp.photo_url ? (
                        <img src={emp.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                          {emp.full_name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{emp.full_name}</p>
                        <p className="text-xs text-gray-400">{emp.employee_no} · {emp.designation || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                    {emp.department_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {TYPE_LABELS[emp.employment_type] || emp.employment_type}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[emp.employment_status] || "bg-gray-100 text-gray-600"}`}>
                      {emp.employment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">
                    {emp.join_date || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
