"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, CardBody, CardHeader, Chip, Input, Select, SelectItem,
  Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Spinner, Tabs, Tab,
} from "@heroui/react";
import { Upload, Camera, Sparkles, Plus, Trash2, Eye, X, CheckCircle, XCircle, Download, FileText } from "lucide-react";
import { userClaimsApi, MonthlyClaim, downloadPdf } from "@/lib/api";
import { getUser } from "@/lib/auth";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
import { Topbar } from "@/components/ui/Topbar";
import { formatDate } from "@/lib/utils";

const CLAIM_TYPES = [
  "Meals", "Travel", "Accommodation", "Office Supplies",
  "Medical", "Petrol", "Parking", "Other",
];

const STATUS_COLOR: Record<string, "warning" | "success" | "danger" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

interface Claim {
  id: number;
  title: string;
  claim_type: string;
  description: string;
  amount: number;
  claim_date: string;
  receipt_url: string | null;
  status: string;
  rejection_reason: string | null;
  submitted_by_name: string | null;
  created_at: string;
}

const emptyForm = {
  title: "", claim_type: "", description: "", amount: "", claim_date: "",
};

export default function MyClaimsPage() {
  const qc = useQueryClient();
  const user = getUser();
  const isManager = user?.role === "admin" || user?.role === "manager";

  const [tab, setTab] = useState("my");
  const [showSubmit, setShowSubmit] = useState(false);

  // Monthly claims state
  const [genYear, setGenYear] = useState(() => new Date().getFullYear());
  const [genMonth, setGenMonth] = useState(() => new Date().getMonth() + 1);
  const [rejectMonthlyModal, setRejectMonthlyModal] = useState<{ id: number } | null>(null);
  const [rejectMonthlyReason, setRejectMonthlyReason] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: myClaims = [], isLoading: myLoading } = useQuery({
    queryKey: ["user-claims", "my"],
    queryFn: userClaimsApi.listMy,
  });

  const { data: allClaims = [], isLoading: allLoading } = useQuery({
    queryKey: ["user-claims", "all"],
    queryFn: () => userClaimsApi.listAll(),
    enabled: isManager,
  });

  const submitMutation = useMutation({
    mutationFn: (fd: FormData) => userClaimsApi.submit(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-claims"] });
      setShowSubmit(false);
      resetForm();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-claims"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      userClaimsApi.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-claims"] });
      setRejectModal(null);
      setRejectReason("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-claims"] }),
  });

  // Monthly claims
  const { data: myMonthly = [], isLoading: myMonthlyLoading } = useQuery({
    queryKey: ["monthly-claims", "my"],
    queryFn: userClaimsApi.listMyMonthly,
  });
  const { data: allMonthly = [], isLoading: allMonthlyLoading } = useQuery({
    queryKey: ["monthly-claims", "all"],
    queryFn: userClaimsApi.listAllMonthly,
    enabled: isManager,
  });

  const generateMonthlyMutation = useMutation({
    mutationFn: () => userClaimsApi.generateMonthly(genYear, genMonth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-claims"] }),
  });
  const submitMonthlyMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.submitMonthly(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-claims"] }),
  });
  const approveMonthlyMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.approveMonthly(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-claims"] }),
  });
  const rejectMonthlyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      userClaimsApi.rejectMonthly(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-claims"] });
      setRejectMonthlyModal(null);
      setRejectMonthlyReason("");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  const handleFileSelect = async (file: File) => {
    setReceiptFile(file);
    if (file.type.startsWith("image/")) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview(null);
    }
    // Auto-extract
    await handleExtract(file);
  };

  const handleExtract = async (file: File) => {
    setExtracting(true);
    try {
      const data = await userClaimsApi.extractFromReceipt(file);
      setForm((f) => ({
        title: data.title || f.title,
        claim_type: data.claim_type || f.claim_type,
        description: data.description
          ? (data.vendor ? `${data.vendor} — ${data.description}` : data.description)
          : f.description,
        amount: data.amount ? String(data.amount) : f.amount,
        claim_date: data.claim_date || f.claim_date,
      }));
    } finally {
      setExtracting(false);
    }
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCameraStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch {
      alert("Camera not available on this device.");
    }
  };

  const closeCamera = () => {
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setCameraOpen(false);
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `snap_${Date.now()}.jpg`, { type: "image/jpeg" });
      closeCamera();
      setReceiptPreview(URL.createObjectURL(blob));
      await handleFileSelect(file);
    }, "image/jpeg", 0.92);
  };

  const handleSubmit = () => {
    if (!form.title || !form.claim_type || !form.amount || !form.claim_date) {
      alert("Please fill in all required fields.");
      return;
    }
    const fd = new FormData();
    fd.append("title", form.title);
    fd.append("claim_type", form.claim_type);
    fd.append("description", form.description);
    fd.append("amount", form.amount);
    fd.append("claim_date", form.claim_date);
    if (receiptFile) fd.append("receipt", receiptFile);
    submitMutation.mutate(fd);
  };

  const statusChip = (c: Claim) => (
    <div>
      <Chip size="sm" color={STATUS_COLOR[c.status] ?? "default"} variant="flat">{c.status}</Chip>
      {c.rejection_reason && <p className="text-xs text-danger mt-0.5 max-w-[140px] truncate">{c.rejection_reason}</p>}
    </div>
  );

  const receiptBtn = (c: Claim) => c.receipt_url ? (
    <Button size="sm" variant="flat" isIconOnly onPress={() => setViewReceipt(`${API_ORIGIN}/uploads/${c.receipt_url}`)}>
      <Eye size={14} />
    </Button>
  ) : <span className="text-xs text-gray-300">—</span>;

  const myClaimsTable = (claims: Claim[]) => (
    <Table aria-label="My Claims" removeWrapper>
      <TableHeader>
        <TableColumn>Title</TableColumn>
        <TableColumn>Type</TableColumn>
        <TableColumn>Date</TableColumn>
        <TableColumn>Amount</TableColumn>
        <TableColumn>Status</TableColumn>
        <TableColumn>Receipt</TableColumn>
        <TableColumn>Actions</TableColumn>
      </TableHeader>
      <TableBody emptyContent="No claims found">
        {claims.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <div>
                <p className="font-medium text-sm">{c.title}</p>
                {c.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.description}</p>}
              </div>
            </TableCell>
            <TableCell><span className="text-xs">{c.claim_type}</span></TableCell>
            <TableCell><span className="text-xs">{c.claim_date}</span></TableCell>
            <TableCell><span className="font-semibold text-sm">RM {Number(c.amount).toFixed(2)}</span></TableCell>
            <TableCell>{statusChip(c)}</TableCell>
            <TableCell>{receiptBtn(c)}</TableCell>
            <TableCell>
              {c.status === "pending" && (
                <Button size="sm" color="danger" variant="flat" isIconOnly isLoading={deleteMutation.isPending}
                  onPress={() => deleteMutation.mutate(c.id)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const allClaimsTable = (claims: Claim[]) => (
    <Table aria-label="All Claims" removeWrapper>
      <TableHeader>
        <TableColumn>Title</TableColumn>
        <TableColumn>Type</TableColumn>
        <TableColumn>Submitted By</TableColumn>
        <TableColumn>Date</TableColumn>
        <TableColumn>Amount</TableColumn>
        <TableColumn>Status</TableColumn>
        <TableColumn>Receipt</TableColumn>
        <TableColumn>Actions</TableColumn>
      </TableHeader>
      <TableBody emptyContent="No claims found">
        {claims.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <div>
                <p className="font-medium text-sm">{c.title}</p>
                {c.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.description}</p>}
              </div>
            </TableCell>
            <TableCell><span className="text-xs">{c.claim_type}</span></TableCell>
            <TableCell><span className="text-xs">{c.submitted_by_name}</span></TableCell>
            <TableCell><span className="text-xs">{c.claim_date}</span></TableCell>
            <TableCell><span className="font-semibold text-sm">RM {Number(c.amount).toFixed(2)}</span></TableCell>
            <TableCell>{statusChip(c)}</TableCell>
            <TableCell>{receiptBtn(c)}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                {c.status === "pending" && (
                  <>
                    <Button size="sm" color="success" variant="flat" isIconOnly isLoading={approveMutation.isPending}
                      onPress={() => approveMutation.mutate(c.id)}>
                      <CheckCircle size={14} />
                    </Button>
                    <Button size="sm" color="danger" variant="flat" isIconOnly
                      onPress={() => { setRejectModal({ id: c.id }); setRejectReason(""); }}>
                      <XCircle size={14} />
                    </Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div>
      <Topbar title="My Claims" />
      <div className="p-6 space-y-6">

        <div className="flex justify-end">
          <Button color="primary" startContent={<Plus size={16} />} onPress={() => { setShowSubmit(true); resetForm(); }}>
            Submit New Claim
          </Button>
        </div>

        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
          <Tab key="my" title="My Claims">
            <Card><CardBody>
              {myLoading ? <Spinner /> : myClaimsTable(myClaims)}
            </CardBody></Card>
          </Tab>

          {isManager && (
            <Tab key="all" title="All Claims">
              <Card><CardBody>
                {allLoading ? <Spinner /> : allClaimsTable(allClaims)}
              </CardBody></Card>
            </Tab>
          )}

          <Tab key="monthly" title="Monthly Claims">
            <div className="space-y-4">
              {/* Generator bar */}
              <Card><CardBody>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Year</p>
                    <select
                      value={genYear}
                      onChange={(e) => setGenYear(Number(e.target.value))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary"
                    >
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Month</p>
                    <select
                      value={genMonth}
                      onChange={(e) => setGenMonth(Number(e.target.value))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary"
                    >
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    color="primary"
                    startContent={<FileText size={15} />}
                    isLoading={generateMonthlyMutation.isPending}
                    onPress={() => generateMonthlyMutation.mutate()}
                  >
                    Generate Monthly Claim
                  </Button>
                </div>
              </CardBody></Card>

              {/* My monthly claims list */}
              <Card><CardBody>
                <p className="text-sm font-semibold text-gray-700 mb-3">My Monthly Claims</p>
                {myMonthlyLoading ? <Spinner /> : myMonthly.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No monthly claims yet. Select a month above and click Generate.</p>
                ) : (
                  <Table aria-label="My Monthly Claims" removeWrapper>
                    <TableHeader>
                      <TableColumn>Period</TableColumn>
                      <TableColumn>Claims</TableColumn>
                      <TableColumn>Total (RM)</TableColumn>
                      <TableColumn>Status</TableColumn>
                      <TableColumn>Actions</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {myMonthly.map((mc) => (
                        <TableRow key={mc.id}>
                          <TableCell>
                            <span className="font-medium text-sm">
                              {["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mc.month]} {mc.year}
                            </span>
                          </TableCell>
                          <TableCell><span className="text-sm">{mc.claim_count} claim(s)</span></TableCell>
                          <TableCell><span className="font-semibold text-sm">RM {Number(mc.total_amount).toFixed(2)}</span></TableCell>
                          <TableCell>
                            <Chip size="sm" variant="flat" color={
                              mc.status === "approved" ? "success" :
                              mc.status === "rejected" ? "danger" :
                              mc.status === "submitted" ? "primary" : "default"
                            }>
                              {mc.status}
                            </Chip>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {mc.status === "draft" && (
                                <Button size="sm" color="primary" variant="flat"
                                  isLoading={submitMonthlyMutation.isPending}
                                  onPress={() => submitMonthlyMutation.mutate(mc.id)}>
                                  Submit
                                </Button>
                              )}
                              <Button size="sm" variant="flat" startContent={<Download size={13} />}
                                onPress={() => downloadPdf(userClaimsApi.monthlyPdfUrl(mc.id), `Monthly_Claim_${mc.year}_${String(mc.month).padStart(2,"0")}.pdf`)}>
                                PDF
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody></Card>

              {/* Admin: all employees' monthly claims */}
              {isManager && (
                <Card><CardBody>
                  <p className="text-sm font-semibold text-gray-700 mb-3">All Employees — Monthly Claims</p>
                  {allMonthlyLoading ? <Spinner /> : allMonthly.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No monthly claims submitted yet.</p>
                  ) : (
                    <Table aria-label="All Monthly Claims" removeWrapper>
                      <TableHeader>
                        <TableColumn>Employee</TableColumn>
                        <TableColumn>Period</TableColumn>
                        <TableColumn>Claims</TableColumn>
                        <TableColumn>Total (RM)</TableColumn>
                        <TableColumn>Status</TableColumn>
                        <TableColumn>Actions</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {allMonthly.map((mc) => (
                          <TableRow key={mc.id}>
                            <TableCell><span className="text-sm">{mc.submitted_by_name ?? "—"}</span></TableCell>
                            <TableCell>
                              <span className="font-medium text-sm">
                                {["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mc.month]} {mc.year}
                              </span>
                            </TableCell>
                            <TableCell><span className="text-sm">{mc.claim_count}</span></TableCell>
                            <TableCell><span className="font-semibold text-sm">RM {Number(mc.total_amount).toFixed(2)}</span></TableCell>
                            <TableCell>
                              <Chip size="sm" variant="flat" color={
                                mc.status === "approved" ? "success" :
                                mc.status === "rejected" ? "danger" :
                                mc.status === "submitted" ? "primary" : "default"
                              }>
                                {mc.status}
                              </Chip>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {mc.status === "submitted" && (
                                  <>
                                    <Button size="sm" color="success" variant="flat" isIconOnly
                                      isLoading={approveMonthlyMutation.isPending}
                                      onPress={() => approveMonthlyMutation.mutate(mc.id)}>
                                      <CheckCircle size={14} />
                                    </Button>
                                    <Button size="sm" color="danger" variant="flat" isIconOnly
                                      onPress={() => { setRejectMonthlyModal({ id: mc.id }); setRejectMonthlyReason(""); }}>
                                      <XCircle size={14} />
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" variant="flat" startContent={<Download size={13} />}
                                  onPress={() => downloadPdf(userClaimsApi.monthlyPdfUrl(mc.id), `Monthly_Claim_${mc.year}_${String(mc.month).padStart(2,"0")}_${mc.submitted_by_name ?? "staff"}.pdf`)}>
                                  PDF
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardBody></Card>
              )}
            </div>
          </Tab>
        </Tabs>

        {/* Reject Monthly Modal */}
        <Modal isOpen={!!rejectMonthlyModal} onClose={() => setRejectMonthlyModal(null)}>
          <ModalContent>
            <ModalHeader>Reject Monthly Claim</ModalHeader>
            <ModalBody>
              <Textarea label="Reason" labelPlacement="outside" variant="bordered"
                placeholder="Reason for rejection..." value={rejectMonthlyReason}
                onChange={(e) => setRejectMonthlyReason(e.target.value)} />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setRejectMonthlyModal(null)}>Cancel</Button>
              <Button color="danger" isLoading={rejectMonthlyMutation.isPending}
                onPress={() => rejectMonthlyModal && rejectMonthlyMutation.mutate({ id: rejectMonthlyModal.id, reason: rejectMonthlyReason })}>
                Reject
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Submit Modal */}
        <Modal isOpen={showSubmit} onClose={() => setShowSubmit(false)} size="2xl" scrollBehavior="inside">
          <ModalContent>
            <ModalHeader>Submit Claim</ModalHeader>
            <ModalBody className="space-y-4">

              {/* Receipt Upload Section */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-600 mb-3">Receipt / Supporting Document</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="flat" startContent={<Upload size={14} />}
                    onPress={() => fileInputRef.current?.click()}>
                    Upload File
                  </Button>
                  <Button size="sm" variant="flat" color="secondary" startContent={<Camera size={14} />}
                    onPress={openCamera}>
                    Snap Photo
                  </Button>
                  {receiptFile && (
                    <Button size="sm" variant="flat" color="primary" startContent={<Sparkles size={14} />}
                      isLoading={extracting}
                      onPress={() => receiptFile && handleExtract(receiptFile)}>
                      {extracting ? "Extracting..." : "Re-extract with AI"}
                    </Button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

                {extracting && (
                  <div className="flex items-center gap-2 mt-3 text-sm text-primary">
                    <Spinner size="sm" /> AI is reading your receipt...
                  </div>
                )}

                {receiptPreview && (
                  <div className="mt-3 relative inline-block">
                    <img src={receiptPreview} alt="Receipt" className="max-h-40 rounded-lg border" />
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                      className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-0.5">
                      <X size={12} />
                    </button>
                  </div>
                )}
                {receiptFile && !receiptPreview && (
                  <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle size={12} className="text-success" /> {receiptFile.name}
                  </p>
                )}
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Title *" labelPlacement="outside" variant="bordered"
                  placeholder="e.g. Team lunch" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} className="col-span-2" />

                <Select label="Claim Type *" labelPlacement="outside" variant="bordered"
                  placeholder="Select type" selectedKeys={form.claim_type ? [form.claim_type] : []}
                  onSelectionChange={(keys) => setForm({ ...form, claim_type: Array.from(keys)[0] as string })}>
                  {CLAIM_TYPES.map((t) => <SelectItem key={t}>{t}</SelectItem>)}
                </Select>

                <Input label="Amount (RM) *" labelPlacement="outside" variant="bordered"
                  type="number" placeholder="0.00" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />

                <Input label="Claim Date *" labelPlacement="outside" variant="bordered"
                  type="date" value={form.claim_date}
                  onChange={(e) => setForm({ ...form, claim_date: e.target.value })} className="col-span-2" />

                <Textarea label="Description" labelPlacement="outside" variant="bordered"
                  placeholder="Details about this claim..." value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-2" />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setShowSubmit(false)}>Cancel</Button>
              <Button color="primary" isLoading={submitMutation.isPending} onPress={handleSubmit}>
                Submit Claim
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Camera Modal */}
        <Modal isOpen={cameraOpen} onClose={closeCamera} size="xl">
          <ModalContent>
            <ModalHeader>Snap Receipt Photo</ModalHeader>
            <ModalBody>
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg" />
              <canvas ref={canvasRef} className="hidden" />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={closeCamera}>Cancel</Button>
              <Button color="primary" startContent={<Camera size={16} />} onPress={snapPhoto}>
                Capture
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Reject Modal */}
        <Modal isOpen={!!rejectModal} onClose={() => setRejectModal(null)}>
          <ModalContent>
            <ModalHeader>Reject Claim</ModalHeader>
            <ModalBody>
              <Textarea label="Reason" labelPlacement="outside" variant="bordered"
                placeholder="Reason for rejection..." value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)} />
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setRejectModal(null)}>Cancel</Button>
              <Button color="danger" isLoading={rejectMutation.isPending}
                onPress={() => rejectModal && rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason })}>
                Reject
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Receipt Viewer */}
        <Modal isOpen={!!viewReceipt} onClose={() => setViewReceipt(null)} size="2xl">
          <ModalContent>
            <ModalHeader>Receipt</ModalHeader>
            <ModalBody>
              {viewReceipt && (
                viewReceipt.endsWith(".pdf")
                  ? <iframe src={viewReceipt} className="w-full h-96" />
                  : <img src={viewReceipt} alt="Receipt" className="w-full rounded-lg" />
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setViewReceipt(null)}>Close</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

      </div>
    </div>
  );
}
