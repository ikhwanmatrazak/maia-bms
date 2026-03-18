"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, Chip, Button } from "@heroui/react";
import axios from "axios";
import { formatDate, formatCurrency } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export default function VerifyPage() {
  const params = useParams();
  const docType = params.type as string;
  const docNumber = params.number as string;
  const [loadingPay, setLoadingPay] = useState(false);
  const [payError, setPayError] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["verify", docType, docNumber],
    queryFn: () =>
      axios.get(`${API_URL}/verify/${docType}/${docNumber}`).then((r) => r.data),
    retry: false,
  });

  // Only invoices that are unpaid/partial can be paid online
  const canPay =
    docType === "invoice" &&
    data?.status &&
    !["paid", "cancelled"].includes(data.status);

  const handlePayNow = async () => {
    setLoadingPay(true);
    setPayError("");
    try {
      const res = await axios.get(`${API_URL}/gateway/billplz/link/${docNumber}`);
      if (res.data.url) {
        window.location.href = res.data.url;
      } else {
        setPayError("Payment link is not available yet. Please contact us.");
      }
    } catch {
      setPayError("Could not retrieve payment link. Please contact us.");
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full shadow-xl">
        <CardBody className="p-8 text-center">
          {isLoading && <p className="text-gray-400">Verifying document...</p>}
          {isError && (
            <div>
              <div className="text-4xl mb-4">❌</div>
              <h2 className="text-xl font-bold text-danger mb-2">Document Not Found</h2>
              <p className="text-gray-500 text-sm">
                This document could not be verified. It may be invalid or deleted.
              </p>
            </div>
          )}
          {data && (
            <div>
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-success mb-1">Document Verified</h2>
              <p className="text-sm text-gray-500 mb-6">This document is authentic</p>
              <div className="text-left space-y-3 text-sm bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between">
                  <span className="text-gray-400 capitalize">Type</span>
                  <span className="font-medium capitalize">{data.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Number</span>
                  <span className="font-medium">{data.number}</span>
                </div>
                {data.status && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Status</span>
                    <Chip size="sm" variant="flat">{data.status}</Chip>
                  </div>
                )}
                {data.issue_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Issue Date</span>
                    <span>{formatDate(data.issue_date)}</span>
                  </div>
                )}
                {data.total !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total</span>
                    <span className="font-bold">{formatCurrency(data.total, data.currency)}</span>
                  </div>
                )}
                {data.balance_due !== undefined && data.balance_due > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Balance Due</span>
                    <span className="font-bold text-danger">{formatCurrency(data.balance_due, data.currency)}</span>
                  </div>
                )}
                {data.amount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount</span>
                    <span className="font-bold text-success">{formatCurrency(data.amount, data.currency)}</span>
                  </div>
                )}
              </div>

              {canPay && (
                <div className="mt-6">
                  <Button
                    color="primary"
                    className="w-full font-semibold"
                    isLoading={loadingPay}
                    onPress={handlePayNow}
                  >
                    Pay Now via Billplz
                  </Button>
                  {payError && <p className="text-xs text-danger mt-2">{payError}</p>}
                  <p className="text-xs text-gray-400 mt-2">FPX · Credit Card · Debit Card</p>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-4">Issued by MAIA Business Management System</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
