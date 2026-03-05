"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Chip } from "@heroui/react";
import { quotationsApi, downloadPdf } from "@/lib/api";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const queryClient = useQueryClient();

  const { data: q, isLoading } = useQuery({
    queryKey: ["quotations", id],
    queryFn: () => quotationsApi.get(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => quotationsApi.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations", id] }),
  });

  const convertMutation = useMutation({
    mutationFn: () => quotationsApi.convert(id),
    onSuccess: (data) => router.push(`/invoices/${data.invoice_id}`),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!q) return <div className="p-6">Quotation not found</div>;

  return (
    <div>
      <Topbar title={q.quotation_number} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Chip color={statusColor(q.status)} variant="flat">{q.status}</Chip>
            <span className="text-gray-500 text-sm">{q.quotation_number}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {q.status === "draft" && (
              <Button size="sm" color="primary" isLoading={sendMutation.isPending} onPress={() => sendMutation.mutate()}>
                Send to Client
              </Button>
            )}
            {(q.status === "sent" || q.status === "accepted") && (
              <Button size="sm" color="success" isLoading={convertMutation.isPending} onPress={() => convertMutation.mutate()}>
                Convert to Invoice
              </Button>
            )}
            <Button size="sm" variant="flat" onPress={() => downloadPdf(quotationsApi.getPdfUrl(id), (q?.quotation_number || "quotation-" + id) + ".pdf")}>
              Download PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader><h3 className="font-semibold">Details</h3></CardHeader>
          <CardBody className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-400">Issue Date</p><p className="font-medium">{formatDate(q.issue_date)}</p></div>
            {q.expiry_date && <div><p className="text-gray-400">Expiry</p><p className="font-medium">{formatDate(q.expiry_date)}</p></div>}
            <div><p className="text-gray-400">Currency</p><p className="font-medium">{q.currency}</p></div>
            <div><p className="text-gray-400">Exchange Rate</p><p className="font-medium">{q.exchange_rate}</p></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-semibold">Line Items</h3></CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit Price</th>
                <th className="pb-2 text-right">Tax</th>
                <th className="pb-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                {q.items.map((item: { id: number; description: string; quantity: string; unit_price: string; tax_amount: string; line_total: string }) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">
                      {item.description.includes("\n") ? (
                        <div>
                          <span>{item.description.split("\n")[0]}</span>
                          {item.description.split("\n").slice(1).map((sub: string, i: number) => (
                            <div key={i} className="text-gray-500 text-xs pl-2 mt-0.5">{sub}</div>
                          ))}
                        </div>
                      ) : item.description}
                    </td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unit_price, q.currency)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.tax_amount, q.currency)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.line_total, q.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(q.subtotal, q.currency)}</span></div>
              {parseFloat(q.discount_amount) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{formatCurrency(q.discount_amount, q.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(q.tax_total, q.currency)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(q.total, q.currency)}</span></div>
            </div>
          </CardBody>
        </Card>

        {q.notes && (
          <Card><CardHeader><h3 className="font-semibold">Notes</h3></CardHeader>
            <CardBody><p className="text-sm text-gray-600">{q.notes}</p></CardBody>
          </Card>
        )}
        {q.payment_terms && (
          <Card><CardHeader><h3 className="font-semibold">Payment Terms</h3></CardHeader>
            <CardBody><p className="text-sm text-gray-600 whitespace-pre-line">{q.payment_terms}</p></CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
