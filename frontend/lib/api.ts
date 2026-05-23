import axios, { AxiosError } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearAuth } from "@/lib/auth";

// Download a PDF via fetch (avoids axios baseURL double-path issue with relative API URLs)
export async function downloadPdf(url: string, filename: string) {
  try {
    const token = getAccessToken();
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 100);
  } catch (err) {
    console.error("PDF download failed:", err);
    alert("Failed to download PDF. Please check the console for details.");
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — auto-refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: AxiosError | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearAuth();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        // Retry refresh up to 4 times to handle intermittent server failures
        let data: unknown;
        for (let attempt = 0; attempt <= 3; attempt++) {
          try {
            const res = await axios.post(`${API_URL}/auth/refresh`, {
              refresh_token: refreshToken,
            });
            data = res.data;
            break;
          } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
        const d = data as { access_token: string; refresh_token: string };
        setTokens(d.access_token, d.refresh_token);
        processQueue(null, d.access_token);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${d.access_token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearAuth();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// API helpers
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then((r) => r.data),
  logout: (refresh_token: string) =>
    api.post("/auth/logout", { refresh_token }),
  getMe: () => api.get("/users/me").then((r) => r.data),
};

export const clientsApi = {
  list: (params?: object) => api.get("/clients", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/clients/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/clients", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/clients/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/clients/${id}`),
  getActivities: (id: number) => api.get(`/clients/${id}/activities`).then((r) => r.data),
  addActivity: (id: number, data: object) => api.post(`/clients/${id}/activities`, data).then((r) => r.data),
  getReminders: (id: number) => api.get(`/clients/${id}/reminders`).then((r) => r.data),
  addReminder: (id: number, data: object) => api.post(`/clients/${id}/reminders`, data).then((r) => r.data),
  getDocuments: (id: number) => api.get(`/clients/${id}/documents`).then((r) => r.data),
  uploadDocument: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/clients/${id}/documents`, form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
  deleteDocument: (id: number, filename: string) => api.delete(`/clients/${id}/documents/${filename}`),
  getContacts: (id: number) => api.get(`/clients/${id}/contacts`).then((r) => r.data),
  createContact: (id: number, data: object) => api.post(`/clients/${id}/contacts`, data).then((r) => r.data),
  updateContact: (clientId: number, contactId: number, data: object) => api.put(`/clients/${clientId}/contacts/${contactId}`, data).then((r) => r.data),
  deleteContact: (clientId: number, contactId: number) => api.delete(`/clients/${clientId}/contacts/${contactId}`),
};

export const quotationsApi = {
  list: (params?: object) => api.get("/quotations", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/quotations/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/quotations", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/quotations/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/quotations/${id}/send`).then((r) => r.data),
  email: (id: number, to_email: string) => api.post(`/quotations/${id}/email`, { to_email }).then((r) => r.data),
  convert: (id: number) => api.post(`/quotations/${id}/convert`).then((r) => r.data),
  softDelete: (id: number) => api.delete(`/quotations/${id}`),
  duplicate: (id: number) => api.post(`/quotations/${id}/duplicate`).then((r) => r.data),
  getPdfUrl: (id: number) => `${API_URL}/quotations/${id}/pdf`,
  summary: (month?: string) => api.get("/quotations/summary", { params: month ? { month } : {} }).then((r) => r.data),
  getEmailTracking: (id: number) => api.get(`/quotations/${id}/email-tracking`).then((r) => r.data),
};

export const invoicesApi = {
  list: (params?: object) => api.get("/invoices", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/invoices/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/invoices", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/invoices/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/invoices/${id}/send`).then((r) => r.data),
  email: (id: number, to_email: string) => api.post(`/invoices/${id}/email`, { to_email }).then((r) => r.data),
  cancel: (id: number) => api.post(`/invoices/${id}/cancel`).then((r) => r.data),
  softDelete: (id: number) => api.delete(`/invoices/${id}`),
  duplicate: (id: number) => api.post(`/invoices/${id}/duplicate`).then((r) => r.data),
  recordPayment: (id: number, data: object) => api.post(`/invoices/${id}/payments`, data).then((r) => r.data),
  generateReceipt: (id: number) => api.post(`/invoices/${id}/generate-receipt`).then((r) => r.data),
  getPayments: (id: number) => api.get(`/invoices/${id}/payments`).then((r) => r.data),
  getPdfUrl: (id: number) => `${API_URL}/invoices/${id}/pdf`,
  summary: (month?: string) => api.get("/invoices/summary", { params: month ? { month } : {} }).then((r) => r.data),
  getEmailTracking: (id: number) => api.get(`/invoices/${id}/email-tracking`).then((r) => r.data),
  createPaymentLink: (id: number) => api.post(`/gateway/billplz/bill/${id}`).then((r) => r.data),
};

export const receiptsApi = {
  list: (params?: object) => api.get("/receipts", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/receipts/${id}`).then((r) => r.data),
  send: (id: number) => api.post(`/receipts/${id}/send`).then((r) => r.data),
  email: (id: number, to_email: string) => api.post(`/receipts/${id}/email`, { to_email }).then((r) => r.data),
  softDelete: (id: number) => api.delete(`/receipts/${id}`),
  getPdfUrl: (id: number) => `${API_URL}/receipts/${id}/pdf`,
  summary: (month?: string) => api.get("/receipts/summary", { params: month ? { month } : {} }).then((r) => r.data),
};

export const paymentsApi = {
  list: (params?: object) => api.get("/payments", { params }).then((r) => r.data),
  summary: (month?: string) => api.get("/payments/summary", { params: month ? { month } : {} }).then((r) => r.data),
  uploadProof: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/payments/${id}/upload-proof`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  analyzeProof: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/payments/analyze-proof", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
};

export const expensesApi = {
  list: (params?: object) => api.get("/expenses", { params }).then((r) => r.data),
  create: (data: object) => api.post("/expenses", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/expenses/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/expenses/${id}`),
  getCategories: () => api.get("/expense-categories").then((r) => r.data),
  createCategory: (data: object) => api.post("/expense-categories", data).then((r) => r.data),
  summary: (month?: string) => api.get("/expenses/summary", { params: month ? { month } : {} }).then((r) => r.data),
};

export const remindersApi = {
  list: (params?: object) => api.get("/reminders", { params }).then((r) => r.data),
  create: (data: object) => api.post("/reminders", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/reminders/${id}`, data).then((r) => r.data),
  complete: (id: number) => api.post(`/reminders/${id}/complete`).then((r) => r.data),
};

export const analyticsApi = {
  summary: () => api.get("/analytics/summary").then((r) => r.data),
};

export const reportsApi = {
  revenue: (params?: object) => api.get("/reports/revenue", { params }).then((r) => r.data),
  overdue: () => api.get("/reports/overdue").then((r) => r.data),
  expenses: (params?: object) => api.get("/reports/expenses", { params }).then((r) => r.data),
  pnl: (params?: object) => api.get("/reports/pnl", { params }).then((r) => r.data),
  taxSummary: (params?: object) => api.get("/reports/tax-summary", { params }).then((r) => r.data),
  invoices: (params?: object) => api.get("/reports/invoices", { params }).then((r) => r.data),
  payments: (params?: object) => api.get("/reports/payments", { params }).then((r) => r.data),
  clientSummary: () => api.get("/reports/client-summary").then((r) => r.data),
};

export const settingsApi = {
  getCompany: () => api.get("/settings/company").then((r) => r.data),
  updateCompany: (data: object) => api.put("/settings/company", data).then((r) => r.data),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/settings/company/logo", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  uploadSignature: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/settings/company/signature", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  getTaxRates: () => api.get("/settings/tax-rates").then((r) => r.data),
  createTaxRate: (data: object) => api.post("/settings/tax-rates", data).then((r) => r.data),
  updateTaxRate: (id: number, data: object) => api.put(`/settings/tax-rates/${id}`, data).then((r) => r.data),
  testSmtp: (to_email: string) => api.post("/settings/smtp/test", { to_email }).then((r) => r.data),
  getTemplates: () => api.get("/settings/templates").then((r) => r.data),
  createTemplate: (data: object) => api.post("/settings/templates", data).then((r) => r.data),
  getEmailTemplates: () => api.get("/settings/email-templates").then((r) => r.data),
  updateEmailTemplate: (doc_type: string, data: object) => api.put(`/settings/email-templates/${doc_type}`, data).then((r) => r.data),
};

export const purchaseOrdersApi = {
  list: (params?: object) => api.get("/purchase-orders", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/purchase-orders/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/purchase-orders", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/purchase-orders/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/purchase-orders/${id}/send`).then((r) => r.data),
  receive: (id: number) => api.post(`/purchase-orders/${id}/receive`).then((r) => r.data),
  duplicate: (id: number) => api.post(`/purchase-orders/${id}/duplicate`).then((r) => r.data),
  softDelete: (id: number) => api.delete(`/purchase-orders/${id}`),
  getPdfUrl: (id: number) => `${API_URL}/purchase-orders/${id}/pdf`,
  summary: (month?: string) => api.get("/purchase-orders/summary", { params: month ? { month } : {} }).then((r) => r.data),
};

export const deliveryOrdersApi = {
  list: (params?: object) => api.get("/delivery-orders", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/delivery-orders/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/delivery-orders", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/delivery-orders/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/delivery-orders/${id}/send`).then((r) => r.data),
  deliver: (id: number) => api.post(`/delivery-orders/${id}/deliver`).then((r) => r.data),
  duplicate: (id: number) => api.post(`/delivery-orders/${id}/duplicate`).then((r) => r.data),
  softDelete: (id: number) => api.delete(`/delivery-orders/${id}`),
  getPdfUrl: (id: number) => `${API_URL}/delivery-orders/${id}/pdf`,
  summary: (month?: string) => api.get("/delivery-orders/summary", { params: month ? { month } : {} }).then((r) => r.data),
};

export const usersApi = {
  list: () => api.get("/users").then((r) => r.data),
  create: (data: object) => api.post("/users", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/users/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/users/${id}`),
};

export const productsApi = {
  list: (params?: object) => api.get("/products", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/products/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/products", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/products/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/products/${id}`),
  getRenewals: (days = 30) => api.get("/products/renewals", { params: { days } }).then((r) => r.data),
  getClientSubscriptions: (clientId: number) => api.get("/products/client-subscriptions", { params: { client_id: clientId } }).then((r) => r.data),
  getSubscriptions: (id: number, params?: object) => api.get(`/products/${id}/subscriptions`, { params }).then((r) => r.data),
  createSubscription: (id: number, data: object) => api.post(`/products/${id}/subscriptions`, data).then((r) => r.data),
  updateSubscription: (id: number, subId: number, data: object) => api.put(`/products/${id}/subscriptions/${subId}`, data).then((r) => r.data),
  deleteSubscription: (id: number, subId: number) => api.delete(`/products/${id}/subscriptions/${subId}`),
  createPricing: (id: number, data: object) => api.post(`/products/${id}/pricing`, data).then((r) => r.data),
  updatePricing: (id: number, pricingId: number, data: object) => api.put(`/products/${id}/pricing/${pricingId}`, data).then((r) => r.data),
  deletePricing: (id: number, pricingId: number) => api.delete(`/products/${id}/pricing/${pricingId}`),
};

export const prospectsApi = {
  list: (params?: object) => api.get("/prospects", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/prospects/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/prospects", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/prospects/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/prospects/${id}`),
  convert: (id: number) => api.post(`/prospects/${id}/convert`).then((r) => r.data),
  summary: () => api.get("/prospects/summary").then((r) => r.data),
};

export const vendorsApi = {
  list: (params?: object) => api.get("/vendors", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/vendors/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/vendors", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/vendors/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/vendors/${id}`),
};

export const creditNotesApi = {
  list: (params?: object) => api.get("/credit-notes", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/credit-notes/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/credit-notes", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/credit-notes/${id}`, data).then((r) => r.data),
  issue: (id: number) => api.post(`/credit-notes/${id}/issue`).then((r) => r.data),
  cancel: (id: number) => api.post(`/credit-notes/${id}/cancel`).then((r) => r.data),
  delete: (id: number) => api.delete(`/credit-notes/${id}`),
  getPdfUrl: (id: number) => `${API_URL}/credit-notes/${id}/pdf`,
};

export const billsApi = {
  analyze: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/bills/analyze", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
  list: (params?: object) => api.get("/bills", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/bills/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/bills", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/bills/${id}`, data).then((r) => r.data),
  markPaid: (id: number, reference?: string, receipt?: File) => {
    const form = new FormData();
    if (reference) form.append("payment_reference", reference);
    if (receipt) form.append("receipt", receipt);
    return api.post(`/bills/${id}/mark-paid`, form).then((r) => r.data);
  },
  delete: (id: number) => api.delete(`/bills/${id}`),
};

export const superAdminApi = {
  getStats: () => api.get("/super-admin/stats").then((r) => r.data),
  listTenants: () => api.get("/super-admin/tenants").then((r) => r.data),
  createTenant: (data: object) => api.post("/super-admin/tenants", data).then((r) => r.data),
  updateTenant: (id: number, data: object) => api.put(`/super-admin/tenants/${id}`, data).then((r) => r.data),
  listTenantUsers: (id: number) => api.get(`/super-admin/tenants/${id}/users`).then((r) => r.data),
  addTenantUser: (id: number, data: object) => api.post(`/super-admin/tenants/${id}/users`, data).then((r) => r.data),
  updateTenantUser: (tenantId: number, userId: number, data: object) => api.patch(`/super-admin/tenants/${tenantId}/users/${userId}`, data).then((r) => r.data),
  removeTenantUser: (tenantId: number, userId: number) => api.delete(`/super-admin/tenants/${tenantId}/users/${userId}`),
  switchTenant: (tenantId: number) => api.post(`/super-admin/switch-tenant/${tenantId}`).then((r) => r.data),
  exitTenant: () => api.post("/super-admin/exit-tenant").then((r) => r.data),
  downloadBackup: async () => {
    const response = await api.get("/super-admin/backup", { responseType: "blob" });
    const disposition = response.headers["content-disposition"] || "";
    const match = disposition.match(/filename=([^;]+)/);
    const filename = match ? match[1] : `maia_bms_backup_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "_")}.sql`;
    const url = URL.createObjectURL(new Blob([response.data], { type: "application/sql" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const hrApi = {
  // Stats
  getStats: () => api.get("/hr/stats").then((r) => r.data),

  // Departments
  listDepartments: () => api.get("/hr/departments").then((r) => r.data),
  createDepartment: (data: object) => api.post("/hr/departments", data).then((r) => r.data),
  updateDepartment: (id: number, data: object) => api.put(`/hr/departments/${id}`, data).then((r) => r.data),
  deleteDepartment: (id: number) => api.delete(`/hr/departments/${id}`),

  // Employees
  listEmployees: (params?: object) => api.get("/hr/employees", { params }).then((r) => r.data),
  getMyProfile: () => api.get("/hr/employees/me").then((r) => r.data),
  getEmployee: (id: number) => api.get(`/hr/employees/${id}`).then((r) => r.data),
  getNextEmployeeNo: () => api.get("/hr/employees/next-no").then((r) => r.data.next_no),
  createEmployee: (data: object) => api.post("/hr/employees", data).then((r) => r.data),
  updateEmployee: (id: number, data: object) => api.put(`/hr/employees/${id}`, data).then((r) => r.data),
  deleteEmployee: (id: number) => api.delete(`/hr/employees/${id}`),
  generateOfferLetter: async (id: number, data: object) => {
    const resp = await api.post(`/hr/employees/${id}/offer-letter`, data, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = `Offer_Letter_${id}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },
  getEmploymentTermsDefaults: () => api.get("/hr/employment-terms-defaults").then((r) => r.data),
  saveEmploymentTermsDefaults: (data: object) => api.put("/hr/employment-terms-defaults", data).then((r) => r.data),
  generateEmploymentTerms: async (id: number, data: object) => {
    const resp = await api.post(`/hr/employees/${id}/employment-terms`, data, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = `Employment_Terms_${id}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },
  uploadPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return api.post(`/hr/employees/${id}/photo`, form).then((r) => r.data);
  },
  listDocuments: (id: number) => api.get(`/hr/employees/${id}/documents`).then((r) => r.data),
  uploadDocument: (id: number, name: string, file: File) => {
    const form = new FormData();
    form.append("name", name);
    form.append("file", file);
    return api.post(`/hr/employees/${id}/documents`, form).then((r) => r.data);
  },
  deleteDocument: (empId: number, docId: number) => api.delete(`/hr/employees/${empId}/documents/${docId}`),

  // Leave Types
  listLeaveTypes: () => api.get("/hr/leave-types").then((r) => r.data),
  createLeaveType: (data: object) => api.post("/hr/leave-types", data).then((r) => r.data),
  updateLeaveType: (id: number, data: object) => api.put(`/hr/leave-types/${id}`, data).then((r) => r.data),

  // Leave Balances
  listLeaveBalances: (params?: object) => api.get("/hr/leave-balances", { params }).then((r) => r.data),
  setLeaveBalance: (params: object) => api.post("/hr/leave-balances", null, { params }).then((r) => r.data),
  getProratePreview: (employeeId: number, year: number) => api.get(`/hr/leave-balances/prorate/${employeeId}`, { params: { year } }).then((r) => r.data),
  applyProrate: (employeeId: number, year: number) => api.post(`/hr/leave-balances/prorate/${employeeId}`, null, { params: { year } }).then((r) => r.data),
  syncAllLeaveBalances: (year: number, overwrite: boolean) => api.post("/hr/leave-balances/sync-all", null, { params: { year, overwrite } }).then((r) => r.data),

  // Leave Applications
  listLeave: (params?: object) => api.get("/hr/leave", { params }).then((r) => r.data),
  applyLeave: (data: object) => api.post("/hr/leave", data).then((r) => r.data),
  approveLeave: (id: number) => api.post(`/hr/leave/${id}/approve`).then((r) => r.data),
  rejectLeave: (id: number, reason?: string) => api.post(`/hr/leave/${id}/reject`, null, { params: { reason } }).then((r) => r.data),
  uploadLeaveDocument: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/hr/leave/${id}/document`, form).then((r) => r.data);
  },

  // Attendance
  listAttendance: (params?: object) => api.get("/hr/attendance", { params }).then((r) => r.data),
  createAttendance: (data: object) => api.post("/hr/attendance", data).then((r) => r.data),
  updateAttendance: (id: number, data: object) => api.put(`/hr/attendance/${id}`, data).then((r) => r.data),

  // Public Holidays
  listPublicHolidays: (params?: object) => api.get("/hr/public-holidays", { params }).then((r) => r.data),
  createPublicHoliday: (data: object) => api.post("/hr/public-holidays", data).then((r) => r.data),
  deletePublicHoliday: (id: number) => api.delete(`/hr/public-holidays/${id}`),

  // Salary Structures
  listSalaryStructures: (params?: object) => api.get("/hr/salary-structures", { params }).then((r) => r.data),
  createSalaryStructure: (data: object) => api.post("/hr/salary-structures", data).then((r) => r.data),

  // Payroll
  listPayroll: () => api.get("/hr/payroll").then((r) => r.data),
  getPayrollRun: (id: number) => api.get(`/hr/payroll/${id}`).then((r) => r.data),
  createPayrollRun: (data: object) => api.post("/hr/payroll", data).then((r) => r.data),
  finalizePayroll: (id: number) => api.post(`/hr/payroll/${id}/finalize`).then((r) => r.data),
  deletePayrollRun: (id: number) => api.delete(`/hr/payroll/${id}`),

  // Claims
  listClaims: (params?: object) => api.get("/hr/claims", { params }).then((r) => r.data),
  createClaim: (form: FormData) => api.post("/hr/claims", form).then((r) => r.data),
  approveClaim: (id: number) => api.post(`/hr/claims/${id}/approve`).then((r) => r.data),
  rejectClaim: (id: number, reason?: string) => api.post(`/hr/claims/${id}/reject`, null, { params: { reason } }).then((r) => r.data),

  // Performance
  listPerformance: (params?: object) => api.get("/hr/performance", { params }).then((r) => r.data),
  createPerformance: (data: object) => api.post("/hr/performance", data).then((r) => r.data),
  updatePerformance: (id: number, data: object) => api.put(`/hr/performance/${id}`, data).then((r) => r.data),
};

export const bugReportsApi = {
  create: (data: object) => api.post("/bug-reports", data).then((r) => r.data),
  list: (params?: object) => api.get("/bug-reports", { params }).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/bug-reports/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/bug-reports/${id}`),
};

const multipartConfig = { headers: { "Content-Type": undefined } };

export const userClaimsApi = {
  listMy: () => api.get("/user-claims/my").then((r) => r.data),
  listAll: (status?: string) => api.get("/user-claims/all", { params: status ? { status } : {} }).then((r) => r.data),
  submit: (form: FormData) => api.post("/user-claims", form, multipartConfig).then((r) => r.data),
  extractFromReceipt: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/user-claims/extract", form, multipartConfig).then((r) => r.data);
  },
  approve: (id: number) => api.patch(`/user-claims/${id}/approve`).then((r) => r.data),
  reject: (id: number, reason: string) => {
    const form = new FormData();
    form.append("reason", reason);
    return api.patch(`/user-claims/${id}/reject`, form, multipartConfig).then((r) => r.data);
  },
  delete: (id: number) => api.delete(`/user-claims/${id}`).then((r) => r.data),
};

const formConfig = { headers: { "Content-Type": "multipart/form-data" } };

function toForm(data: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) f.append(k, String(v));
  }
  return f;
}

export const projectsApi = {
  // Dashboard
  getDashboard: () => api.get("/projects/dashboard").then((r) => r.data),

  // Stages
  listStages: () => api.get("/projects/stages").then((r) => r.data),
  createStage: (name: string, color?: string) => api.post("/projects/stages", null, { params: { name, color } }).then((r) => r.data),
  updateStage: (id: number, data: { name?: string; color?: string }) => api.put(`/projects/stages/${id}`, null, { params: data }).then((r) => r.data),
  deleteStage: (id: number) => api.delete(`/projects/stages/${id}`),

  // Projects
  list: (stageId?: number) => api.get("/projects", { params: stageId ? { stage_id: stageId } : {} }).then((r) => r.data),
  get: (id: number) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/projects", toForm(data), formConfig).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/projects/${id}`, toForm(data), formConfig).then((r) => r.data),
  delete: (id: number) => api.delete(`/projects/${id}`),

  // Members
  listMembers: (projectId: number) => api.get(`/projects/${projectId}/members`).then((r) => r.data),
  addMember: (projectId: number, userId: number, role?: string) => api.post(`/projects/${projectId}/members`, null, { params: { user_id: userId, role: role ?? "member" } }).then((r) => r.data),
  removeMember: (projectId: number, userId: number) => api.delete(`/projects/${projectId}/members/${userId}`),

  // Tasks
  listTasks: (projectId: number) => api.get(`/projects/${projectId}/tasks`).then((r) => r.data),
  createTask: (projectId: number, data: Record<string, unknown>) => api.post(`/projects/${projectId}/tasks`, toForm(data), formConfig).then((r) => r.data),
  updateTask: (taskId: number, data: Record<string, unknown>) => api.put(`/projects/tasks/${taskId}`, toForm(data), formConfig).then((r) => r.data),
  deleteTask: (taskId: number) => api.delete(`/projects/tasks/${taskId}`),

  // Time Logs
  logTime: (taskId: number, data: { hours: number; note?: string; logged_date: string }) => api.post(`/projects/tasks/${taskId}/time-logs`, toForm(data as Record<string, unknown>), formConfig).then((r) => r.data),
  listTimeLogs: (taskId: number) => api.get(`/projects/tasks/${taskId}/time-logs`).then((r) => r.data),

  // Milestones
  listMilestones: (projectId: number) => api.get(`/projects/${projectId}/milestones`).then((r) => r.data),
  createMilestone: (projectId: number, data: { title: string; due_date?: string }) => api.post(`/projects/${projectId}/milestones`, toForm(data as Record<string, unknown>), formConfig).then((r) => r.data),
  updateMilestone: (id: number, data: Record<string, unknown>) => api.put(`/projects/milestones/${id}`, toForm(data), formConfig).then((r) => r.data),
  deleteMilestone: (id: number) => api.delete(`/projects/milestones/${id}`),

  // Updates
  listUpdates: (projectId: number) => api.get(`/projects/${projectId}/updates`).then((r) => r.data),
  postUpdate: (projectId: number, content: string, file?: File) => {
    const f = new FormData();
    f.append("content", content);
    if (file) f.append("file", file);
    return api.post(`/projects/${projectId}/updates`, f, formConfig).then((r) => r.data);
  },

  // Meetings
  listMeetings: (projectId: number) => api.get(`/projects/${projectId}/meetings`).then((r) => r.data),
  upcomingMeetings: () => api.get("/projects/meetings/upcoming").then((r) => r.data),
  scheduleMeeting: (projectId: number, data: Record<string, unknown>) => api.post(`/projects/${projectId}/meetings`, toForm(data), formConfig).then((r) => r.data),
  updateMeeting: (meetingId: number, notes: string) => api.put(`/projects/meetings/${meetingId}`, toForm({ notes }), formConfig).then((r) => r.data),
  deleteMeeting: (meetingId: number) => api.delete(`/projects/meetings/${meetingId}`),
};


export const publicCalendarApi = {
  listEvents: (year?: number, month?: number) =>
    axios.get(`${API_URL}/calendar/public/events`, { params: year && month ? { year, month } : {} }).then((r) => r.data),
  getEvent: (id: number) =>
    axios.get(`${API_URL}/calendar/public/events/${id}`).then((r) => r.data),
};

export const designationsApi = {
  list: () => api.get("/hr/designations").then((r) => r.data),
  create: (data: { name: string; job_responsibilities?: string }) => api.post("/hr/designations", data).then((r) => r.data),
  update: (id: number, data: { name?: string; job_responsibilities?: string }) => api.put(`/hr/designations/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/hr/designations/${id}`),
};

export const calendarApi = {
  listEvents: (year?: number, month?: number) =>
    api.get("/calendar/events", { params: year && month ? { year, month } : {} }).then((r) => r.data),
  getEvent: (id: number) => api.get(`/calendar/events/${id}`).then((r) => r.data),
  createEvent: (data: Record<string, unknown>) => api.post("/calendar/events", toForm(data), formConfig).then((r) => r.data),
  updateEvent: (id: number, data: Record<string, unknown>) => api.patch(`/calendar/events/${id}`, toForm(data), formConfig).then((r) => r.data),
  deleteEvent: (id: number) => api.delete(`/calendar/events/${id}`),
  rsvp: (id: number, status: "accepted" | "declined") =>
    api.post(`/calendar/events/${id}/rsvp`, toForm({ status }), formConfig).then((r) => r.data),
  listUsers: () => api.get("/calendar/users").then((r) => r.data),
};

export interface CardSummary {
  id: number;
  slug: string;
  title?: string;
  is_default: boolean;
  name?: string;
  designation?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
}

export interface CardData {
  card_slug: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
  company_name?: string;
  company_logo_url?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_website?: string;
}

export interface CardCreate {
  title?: string;
  name?: string;
  designation?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
}

export const nameCardApi = {
  listMyCards: () => api.get<CardSummary[]>("/me/cards").then((r) => r.data),
  createCard: (data: CardCreate) => api.post<CardSummary>("/me/cards", data).then((r) => r.data),
  updateCard: (id: number, data: CardCreate) => api.put<CardSummary>(`/me/cards/${id}`, data).then((r) => r.data),
  deleteCard: (id: number) => api.delete(`/me/cards/${id}`).then((r) => r.data),
  regenerateCardSlug: (id: number) => api.post<CardSummary>(`/me/cards/${id}/regenerate`).then((r) => r.data),
  uploadPhoto: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ photo_url: string }>("/me/cards/upload-photo", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  getPublicCard: (slug: string) =>
    axios.get<CardData>(`${API_URL}/public/card/${slug}`).then((r) => r.data),
  // Compat
  getMySlug: () => api.get<{ card_slug: string }>("/me/card").then((r) => r.data),
  regenerateSlug: () => api.post<{ card_slug: string }>("/me/card/regenerate").then((r) => r.data),
};
