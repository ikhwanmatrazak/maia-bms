"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ id?: number; name: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["hr-departments"],
    queryFn: hrApi.listDepartments,
  });

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      modal?.id ? hrApi.updateDepartment(modal.id, data) : hrApi.createDepartment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-departments"] });
      setModal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrApi.deleteDepartment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-departments"] });
      setDeleting(null);
    },
  });

  return (
    <div>
      <Topbar title="Departments" />
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">Manage company departments</p>
          <button
            onClick={() => setModal({ name: "", description: "" })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg hover:bg-[#2a2a3e]"
          >
            <Plus size={16} /> Add Department
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-gray-400">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>No departments yet. Create your first one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {departments.map((d: any) => (
              <div key={d.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{d.name}</p>
                  {d.description && <p className="text-sm text-gray-400 mt-0.5">{d.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal({ id: d.id, name: d.name, description: d.description || "" })}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleting(d.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">{modal.id ? "Edit Department" : "New Department"}</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Name *</label>
              <input
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                placeholder="e.g. Engineering"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description</label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={modal.description}
                onChange={(e) => setModal({ ...modal, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            {saveMutation.isError && <p className="text-sm text-red-500">Failed to save. Please try again.</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={!modal.name.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate({ name: modal.name.trim(), description: modal.description.trim() })}
                className="px-5 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg hover:bg-[#2a2a3e] disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">Delete Department?</h2>
            <p className="text-sm text-gray-500">This will deactivate the department. Existing employees will not be removed.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting)}
                className="px-5 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
