"use client";

import { Topbar } from "@/components/ui/Topbar";
import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, User, Clock } from "lucide-react";

export default function StaffDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => { setUser(getUser()); }, []);

  const { data: profile } = useQuery({
    queryKey: ["my-employee-profile"],
    queryFn: hrApi.getMyProfile,
    retry: false,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ["my-leave-balances"],
    queryFn: () => hrApi.listLeaveBalances({ employee_id: profile?.id, year: new Date().getFullYear() }),
    enabled: !!profile?.id,
  });

  const { data: claims = [] } = useQuery({
    queryKey: ["my-claims"],
    queryFn: () => hrApi.listClaims({ employee_id: profile?.id }),
    enabled: !!profile?.id,
  });

  const pendingClaims = (claims as any[]).filter((c) => c.status === "pending");
  const approvedClaims = (claims as any[]).filter((c) => c.status === "approved");
  const approvedTotal = approvedClaims.reduce((s: number, c: any) => s + Number(c.amount), 0);

  return (
    <div>
      <Topbar title="My Dashboard" />
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user?.name ?? "—"}</h1>
          {profile && (
            <p className="text-sm text-gray-500 mt-0.5">{profile.employee_no} · {profile.designation || profile.employment_type}</p>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            icon={<Clock size={20} />}
            label="Pending Claims"
            value={String(pendingClaims.length)}
            color="yellow"
          />
          <StatCard
            icon={<FileText size={20} />}
            label="Approved Claims"
            value={`RM ${approvedTotal.toLocaleString()}`}
            color="green"
          />
        </div>

        {/* Leave Balances */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-800">Leave Balances — {new Date().getFullYear()}</h2>
          </div>
          {leaveBalances.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No leave balances set for this year</p>
          ) : (
            <div className="space-y-3">
              {(leaveBalances as any[]).map((b) => (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{b.leave_type_name}</span>
                    <span className="text-gray-500">{b.balance} / {b.entitled} days remaining</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: b.entitled > 0 ? `${Math.round((b.balance / b.entitled) * 100)}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent claims */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-purple-500" />
              <h2 className="font-semibold text-gray-800">My Claims</h2>
            </div>
            <button onClick={() => router.push("/my-claims")} className="text-xs text-blue-600 hover:underline">View all →</button>
          </div>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No claims submitted yet</p>
          ) : (
            <div className="space-y-2">
              {(claims as any[]).slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.claim_type}</p>
                    <p className="text-xs text-gray-400">{c.claim_date} · {c.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">RM {Number(c.amount).toLocaleString()}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.status === "approved" ? "bg-green-100 text-green-700" :
                      c.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile link */}
        <button
          onClick={() => router.push("/my-profile")}
          className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
            <User size={16} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-800">My Profile</p>
            <p className="text-xs text-gray-400">View and update your profile</p>
          </div>
          <span className="ml-auto text-gray-300">›</span>
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    yellow: "bg-yellow-50 text-yellow-600",
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colors[color] ?? "bg-gray-50 text-gray-600"}`}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
