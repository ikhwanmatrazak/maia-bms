"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { Card, CardBody, Button } from "@heroui/react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function PaymentResultContent() {
  const searchParams = useSearchParams();

  // Billplz appends billplz[id], billplz[paid], billplz[x_signature] to redirect URL
  const billplzPaid = searchParams.get("billplz[paid]");
  const invoiceNumber = searchParams.get("invoice");

  // Determine result — billplz[paid] is "true" or "false"
  const paid = billplzPaid === "true";
  const pending = billplzPaid === null; // direct visit without Billplz params

  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceNumber) return;
    // Poll invoice status from public verify endpoint
    axios
      .get(`${API_URL}/verify/invoice/${invoiceNumber}`)
      .then((r) => setInvoiceStatus(r.data.status))
      .catch(() => {});
  }, [invoiceNumber]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="max-w-sm w-full shadow-xl">
        <CardBody className="p-8 text-center space-y-4">
          {pending ? (
            <>
              <div className="text-5xl">🔄</div>
              <h2 className="text-xl font-bold text-gray-700">Processing Payment</h2>
              <p className="text-sm text-gray-500">
                Your payment is being processed. Please wait a moment and check your email for confirmation.
              </p>
            </>
          ) : paid ? (
            <>
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold text-success">Payment Successful!</h2>
              <p className="text-sm text-gray-500">
                Thank you! Your payment for invoice{" "}
                <span className="font-semibold">{invoiceNumber}</span> has been received.
              </p>
              <p className="text-xs text-gray-400">
                A receipt will be sent to your email shortly.
              </p>
            </>
          ) : (
            <>
              <div className="text-5xl">❌</div>
              <h2 className="text-xl font-bold text-danger">Payment Failed</h2>
              <p className="text-sm text-gray-500">
                Your payment was not completed. Please try again or contact us for assistance.
              </p>
              {invoiceNumber && (
                <Button
                  color="primary"
                  size="sm"
                  onPress={() =>
                    window.location.href = `${window.location.origin}/verify/invoice/${invoiceNumber}`
                  }
                >
                  Try Again
                </Button>
              )}
            </>
          )}

          {invoiceStatus && invoiceStatus === "paid" && !paid && (
            <p className="text-xs text-success">Invoice has been marked as paid.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <PaymentResultContent />
    </Suspense>
  );
}
