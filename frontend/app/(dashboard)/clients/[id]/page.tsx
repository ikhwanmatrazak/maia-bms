"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Chip, Tab, Tabs } from "@heroui/react";
import { clientsApi, invoicesApi, quotationsApi } from "@/lib/api";
import { formatDate, formatCurrency, statusColor, formatRelative } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";
import { Activity, Invoice, Quotation, Reminder } from "@/types";
import Link from "next/link";

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = Number(params.id);

  const { data: client, isLoading } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => clientsApi.get(clientId),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["clients", clientId, "activities"],
    queryFn: () => clientsApi.getActivities(clientId),
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["clients", clientId, "reminders"],
    queryFn: () => clientsApi.getReminders(clientId),
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices", { client_id: clientId }],
    queryFn: () => invoicesApi.list({ client_id: clientId }),
  });

  const { data: quotations = [] } = useQuery<Quotation[]>({
    queryKey: ["quotations", { client_id: clientId }],
    queryFn: () => quotationsApi.list({ client_id: clientId }),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!client) return <div className="p-6">Client not found</div>;

  const totalBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid), 0);
  const totalBalance = invoices.reduce((sum, inv) => sum + parseFloat(inv.balance_due), 0);

  return (
    <div>
      <Topbar title={client.company_name} />
      <div className="p-6 space-y-6">
        {/* Summary Header */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Billed", value: formatCurrency(totalBilled, client.currency) },
            { label: "Total Paid", value: formatCurrency(totalPaid, client.currency), color: "text-success" },
            { label: "Balance Due", value: formatCurrency(totalBalance, client.currency), color: totalBalance > 0 ? "text-danger" : "text-success" },
            { label: "Currency", value: client.currency },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardBody className="p-4">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color ?? "text-gray-900"}`}>{item.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card className="shadow-sm">
            <CardHeader>
              <h3 className="font-semibold">Contact Info</h3>
            </CardHeader>
            <CardBody className="text-sm space-y-2">
              <div><span className="text-gray-400">Company:</span> <span className="font-medium">{client.company_name}</span></div>
              {client.contact_person && <div><span className="text-gray-400">Person:</span> {client.contact_person}</div>}
              {client.email && <div><span className="text-gray-400">Email:</span> {client.email}</div>}
              {client.phone && <div><span className="text-gray-400">Phone:</span> {client.phone}</div>}
              {client.address && <div><span className="text-gray-400">Address:</span> {client.address}</div>}
              {(client.city || client.country) && (
                <div><span className="text-gray-400">Location:</span> {[client.city, client.country].filter(Boolean).join(", ")}</div>
              )}
              <div>
                <Chip size="sm" color={statusColor(client.status)} variant="flat">{client.status}</Chip>
              </div>
              {client.notes && <div className="pt-2 text-gray-500">{client.notes}</div>}
            </CardBody>
          </Card>

          {/* Tabs for activity/reminders/docs */}
          <div className="lg:col-span-2">
            <Tabs aria-label="Client details">
              <Tab key="invoices" title="Invoices">
                <div className="space-y-2 mt-2">
                  {invoices.length === 0 ? <p className="text-gray-400 text-sm">No invoices</p> : invoices.map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                      <div>
                        <span className="font-medium text-sm">{inv.invoice_number}</span>
                        {inv.due_date && <span className="text-xs text-gray-400 ml-2">Due {formatDate(inv.due_date)}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(inv.total, inv.currency)}</span>
                        <Chip size="sm" color={statusColor(inv.status)} variant="flat">{inv.status}</Chip>
                      </div>
                    </Link>
                  ))}
                </div>
              </Tab>

              <Tab key="quotations" title="Quotations">
                <div className="space-y-2 mt-2">
                  {quotations.length === 0 ? <p className="text-gray-400 text-sm">No quotations</p> : quotations.map((q) => (
                    <Link key={q.id} href={`/quotations/${q.id}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                      <span className="font-medium text-sm">{q.quotation_number}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(q.total, q.currency)}</span>
                        <Chip size="sm" color={statusColor(q.status)} variant="flat">{q.status}</Chip>
                      </div>
                    </Link>
                  ))}
                </div>
              </Tab>

              <Tab key="activity" title="Activity">
                <div className="space-y-3 mt-2">
                  {activities.length === 0 ? <p className="text-gray-400 text-sm">No activity yet</p> : activities.map((a) => (
                    <div key={a.id} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium capitalize">{a.type.replace("_", " ")}</span>
                        <span className="text-gray-500 ml-2">{a.description}</span>
                        <div className="text-xs text-gray-400">{formatRelative(a.occurred_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Tab>

              <Tab key="reminders" title="Reminders">
                <div className="space-y-3 mt-2">
                  {reminders.length === 0 ? <p className="text-gray-400 text-sm">No reminders</p> : reminders.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Chip size="sm" color={r.priority === "high" ? "danger" : r.priority === "medium" ? "warning" : "default"} variant="flat">
                        {r.priority}
                      </Chip>
                      <div>
                        <div className="font-medium text-sm">{r.title}</div>
                        <div className="text-xs text-gray-400">Due {formatDate(r.due_date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Tab>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
