"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, Button, Input, Textarea, Chip } from "@heroui/react";
import { settingsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { CheckCircle } from "lucide-react";

interface EmailTemplate {
  id: number;
  doc_type: string;
  subject: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

const TEMPLATE_TYPES = [
  { key: "invoice",  label: "Invoice",          color: "warning"   as const, icon: "📄" },
  { key: "quotation",label: "Quotation",        color: "primary"   as const, icon: "📋" },
  { key: "receipt",  label: "Receipt",          color: "success"   as const, icon: "🧾" },
  { key: "reminder", label: "Payment Reminder", color: "secondary" as const, icon: "⏰" },
  { key: "renewal",  label: "Renewal Notice",   color: "danger"    as const, icon: "🔄" },
];

const VARIABLES: Record<string, string[]> = {
  invoice:   ["{{company_name}}", "{{client_name}}", "{{invoice_number}}", "{{issue_date}}", "{{due_date}}", "{{currency}}", "{{total}}", "{{balance_due}}"],
  quotation: ["{{company_name}}", "{{client_name}}", "{{quotation_number}}", "{{issue_date}}", "{{expiry_date}}", "{{currency}}", "{{total}}"],
  receipt:   ["{{company_name}}", "{{client_name}}", "{{receipt_number}}", "{{payment_date}}", "{{currency}}", "{{amount}}", "{{payment_method}}"],
  reminder:  ["{{company_name}}", "{{client_name}}", "{{invoice_number}}", "{{due_date}}", "{{currency}}", "{{balance_due}}"],
  renewal:   ["{{company_name}}", "{{client_name}}", "{{product_name}}", "{{next_renewal_date}}", "{{currency}}", "{{amount}}", "{{billing_cycle}}"],
};

export default function EmailTemplatesPage() {
  const [activeKey, setActiveKey] = useState("invoice");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["email-templates"],
    queryFn: settingsApi.getEmailTemplates,
  });

  const activeTemplate = templates.find((t) => t.doc_type === activeKey);
  const activeType = TEMPLATE_TYPES.find((t) => t.key === activeKey)!;

  useEffect(() => {
    if (activeTemplate) {
      setSubject(activeTemplate.subject);
      setBody(activeTemplate.body);
      setSaved(false);
    }
  }, [activeTemplate]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.updateEmailTemplate(activeKey, {
        subject,
        body,
        is_active: activeTemplate?.is_active ?? true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const insertVariable = (v: string) => setBody((prev) => prev + v);

  return (
    <div>
      <Topbar title="Email Templates" />
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-6">
          Customize the email content sent to clients for each document type. Click a variable to insert it into the body.
        </p>

        <div className="flex gap-6 items-start">
          {/* Sidebar */}
          <div className="w-52 shrink-0 flex flex-col gap-1">
            {TEMPLATE_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors w-full ${
                  activeKey === t.key
                    ? "bg-primary text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="text-gray-400 text-sm py-8 text-center">Loading...</div>
            ) : (
              <Card shadow="sm">
                <CardBody className="flex flex-col gap-5 p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{activeType.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{activeType.label}</h3>
                        <p className="text-xs text-gray-400">Email Template</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {saved && (
                        <span className="flex items-center gap-1 text-xs text-success font-medium">
                          <CheckCircle size={14} /> Saved
                        </span>
                      )}
                      <Button
                        size="sm"
                        color="primary"
                        isLoading={mutation.isPending}
                        onPress={() => mutation.mutate()}
                      >
                        Save Template
                      </Button>
                    </div>
                  </div>

                  {/* Subject */}
                  <Input
                    variant="bordered"
                    labelPlacement="outside"
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />

                  {/* Body */}
                  <Textarea
                    variant="bordered"
                    labelPlacement="outside"
                    label="Body"
                    minRows={10}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />

                  {/* Variables */}
                  <div>
                    <p className="text-xs text-gray-400 mb-2 font-medium">Click to insert variable:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(VARIABLES[activeKey] ?? []).map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          className="text-xs font-mono bg-gray-100 hover:bg-primary/10 hover:text-primary px-2 py-1 rounded-lg border border-gray-200 transition-colors"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
