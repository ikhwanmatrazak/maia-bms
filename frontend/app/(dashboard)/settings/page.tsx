"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Textarea } from "@heroui/react";
import { settingsApi } from "@/lib/api";
import { CompanySettings } from "@/types";
import { Topbar } from "@/components/ui/Topbar";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["settings", "company"],
    queryFn: settingsApi.getCompany,
  });

  const [company, setCompany] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [smtp, setSmtp] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const s = settings as unknown as Record<string, string>;
      setCompany({
        name: s.name ?? "",
        email: s.email ?? "",
        phone: s.phone ?? "",
        website: s.website ?? "",
        default_currency: s.default_currency ?? "",
        default_payment_terms: s.default_payment_terms ?? "",
        invoice_prefix: s.invoice_prefix ?? "",
        quotation_prefix: s.quotation_prefix ?? "",
        receipt_prefix: s.receipt_prefix ?? "",
        company_registration_no: s.company_registration_no ?? "",
        sst_no: s.sst_no ?? "",
        address: s.address ?? "",
      });
      setPayment({
        payment_terms_text: s.payment_terms_text ?? "",
        bank_name: s.bank_name ?? "",
        bank_account_no: s.bank_account_no ?? "",
        bank_account_name: s.bank_account_name ?? "",
      });
      setSmtp({
        smtp_host: s.smtp_host ?? "",
        smtp_port: s.smtp_port ?? "",
        smtp_user: s.smtp_user ?? "",
        smtp_password: "",
        smtp_from_email: s.smtp_from_email ?? "",
        smtp_from_name: s.smtp_from_name ?? "",
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: object) => settingsApi.updateCompany(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const smtpTestMutation = useMutation({
    mutationFn: (email: string) => settingsApi.testSmtp(email),
    onSuccess: () => setSmtpTestResult("Test email sent successfully!"),
    onError: () => setSmtpTestResult("Failed to send test email. Check SMTP settings."),
  });

  const f = (obj: Record<string, string>, key: string, setter: (v: Record<string, string>) => void) => ({
    value: obj[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setter({ ...obj, [key]: e.target.value }),
  });

  return (
    <div>
      <Topbar title="Settings" />
      <div className="p-6 space-y-6">
        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            {
              href: "/settings/tax", label: "Tax Rates", desc: "Manage GST, SST, and other tax rates",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
              ),
            },
            {
              href: "/settings/templates", label: "Document Templates", desc: "Manage quotation, invoice & receipt templates",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              ),
            },
            {
              href: "/settings/email-templates", label: "Email Templates", desc: "Customize email content for each document type",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              ),
            },
            {
              href: "/settings/users", label: "Users", desc: "Manage team members and permissions",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              ),
            },
          ] as const).map((item) => (
            <Link key={item.href} href={item.href}>
              <Card shadow="sm" isPressable className="w-full h-full">
                <CardBody className="p-4 flex flex-col gap-2">
                  {item.icon}
                  <p className="font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-default-400">{item.desc}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        {/* Company Info */}
        <Card>
          <CardHeader><h3 className="font-semibold">Company Information</h3></CardHeader>
          <CardBody>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <Input variant="bordered" labelPlacement="outside" label="Company Name" {...f(company, "name", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Email" type="email" {...f(company, "email", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Phone" {...f(company, "phone", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Website" {...f(company, "website", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Default Currency" {...f(company, "default_currency", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Payment Terms (days)" type="number" {...f(company, "default_payment_terms", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Invoice Prefix" {...f(company, "invoice_prefix", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Quotation Prefix" {...f(company, "quotation_prefix", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Receipt Prefix" {...f(company, "receipt_prefix", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="Company Reg. No." {...f(company, "company_registration_no", setCompany)} />
                <Input variant="bordered" labelPlacement="outside" label="SST No." {...f(company, "sst_no", setCompany)} />
              </div>
              <Textarea variant="bordered" labelPlacement="outside" label="Address" {...f(company, "address", setCompany)} />
              <div>
                <Button color="primary" isLoading={updateMutation.isPending} onPress={() => updateMutation.mutate(company)}>Save</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Logo Upload */}
        <Card>
          <CardHeader><h3 className="font-semibold">Company Logo</h3></CardHeader>
          <CardBody className="flex flex-col gap-3">
            {settings?.logo_url && (
              <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}${settings.logo_url}`} alt="Logo" className="h-16 object-contain" />
            )}
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) logoMutation.mutate(file);
              }}
            />
          </CardBody>
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader><h3 className="font-semibold">Payment Settings</h3></CardHeader>
          <CardBody>
            <div className="flex flex-col gap-6">
              <Textarea variant="bordered" labelPlacement="outside" label="Default Payment Terms"
                description='Default text added to quotations and invoices, e.g. "Payment due within 30 days from invoice date"'
                {...f(payment, "payment_terms_text", setPayment)} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Input variant="bordered" labelPlacement="outside" label="Bank Name" {...f(payment, "bank_name", setPayment)} />
                <Input variant="bordered" labelPlacement="outside" label="Account No." {...f(payment, "bank_account_no", setPayment)} />
                <Input variant="bordered" labelPlacement="outside" label="Account Name" {...f(payment, "bank_account_name", setPayment)} />
              </div>
              <div>
                <Button color="primary" isLoading={updateMutation.isPending} onPress={() => updateMutation.mutate(payment)}>Save Payment Settings</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* SMTP */}
        <Card>
          <CardHeader><h3 className="font-semibold">SMTP Settings</h3></CardHeader>
          <CardBody>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <Input variant="bordered" labelPlacement="outside" label="SMTP Host" {...f(smtp, "smtp_host", setSmtp)} />
                <Input variant="bordered" labelPlacement="outside" label="SMTP Port" type="number" {...f(smtp, "smtp_port", setSmtp)} />
                <Input variant="bordered" labelPlacement="outside" label="SMTP User" {...f(smtp, "smtp_user", setSmtp)} />
                <Input variant="bordered" labelPlacement="outside" label="SMTP Password" type="password" {...f(smtp, "smtp_password", setSmtp)} />
                <Input variant="bordered" labelPlacement="outside" label="From Email" type="email" {...f(smtp, "smtp_from_email", setSmtp)} />
                <Input variant="bordered" labelPlacement="outside" label="From Name" {...f(smtp, "smtp_from_name", setSmtp)} />
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <Button color="primary" isLoading={updateMutation.isPending} onPress={() => updateMutation.mutate(smtp)}>Save SMTP</Button>
                <div className="flex gap-2 items-center">
                  <Input
                    variant="bordered"
                    size="sm"
                    placeholder="test@email.com"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                    className="w-48"
                  />
                  <Button size="sm" variant="flat" isLoading={smtpTestMutation.isPending}
                    onPress={() => smtpTestMutation.mutate(smtpTestEmail)}>Test</Button>
                </div>
                {smtpTestResult && <p className={`text-sm ${smtpTestResult.includes("success") ? "text-success" : "text-danger"}`}>{smtpTestResult}</p>}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
