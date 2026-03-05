import axios, { AxiosError } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearAuth } from "@/lib/auth";

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
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        setTokens(data.access_token, data.refresh_token);
        processQueue(null, data.access_token);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
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
};

export const quotationsApi = {
  list: (params?: object) => api.get("/quotations", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/quotations/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/quotations", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/quotations/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/quotations/${id}/send`).then((r) => r.data),
  convert: (id: number) => api.post(`/quotations/${id}/convert`).then((r) => r.data),
  getPdfUrl: (id: number) => `${API_URL}/quotations/${id}/pdf`,
};

export const invoicesApi = {
  list: (params?: object) => api.get("/invoices", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/invoices/${id}`).then((r) => r.data),
  create: (data: object) => api.post("/invoices", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/invoices/${id}`, data).then((r) => r.data),
  send: (id: number) => api.post(`/invoices/${id}/send`).then((r) => r.data),
  cancel: (id: number) => api.post(`/invoices/${id}/cancel`).then((r) => r.data),
  recordPayment: (id: number, data: object) => api.post(`/invoices/${id}/payments`, data).then((r) => r.data),
  getPayments: (id: number) => api.get(`/invoices/${id}/payments`).then((r) => r.data),
  getPdfUrl: (id: number) => `${API_URL}/invoices/${id}/pdf`,
};

export const receiptsApi = {
  list: (params?: object) => api.get("/receipts", { params }).then((r) => r.data),
  get: (id: number) => api.get(`/receipts/${id}`).then((r) => r.data),
  send: (id: number) => api.post(`/receipts/${id}/send`).then((r) => r.data),
  getPdfUrl: (id: number) => `${API_URL}/receipts/${id}/pdf`,
};

export const paymentsApi = {
  list: (params?: object) => api.get("/payments", { params }).then((r) => r.data),
  uploadProof: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/payments/${id}/upload-proof`, form, {
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
};

export const remindersApi = {
  list: (params?: object) => api.get("/reminders", { params }).then((r) => r.data),
  create: (data: object) => api.post("/reminders", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/reminders/${id}`, data).then((r) => r.data),
  complete: (id: number) => api.post(`/reminders/${id}/complete`).then((r) => r.data),
};

export const reportsApi = {
  revenue: (params?: object) => api.get("/reports/revenue", { params }).then((r) => r.data),
  overdue: () => api.get("/reports/overdue").then((r) => r.data),
  expenses: (params?: object) => api.get("/reports/expenses", { params }).then((r) => r.data),
  pnl: (params?: object) => api.get("/reports/pnl", { params }).then((r) => r.data),
  taxSummary: (params?: object) => api.get("/reports/tax-summary", { params }).then((r) => r.data),
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
};

export const usersApi = {
  list: () => api.get("/users").then((r) => r.data),
  create: (data: object) => api.post("/users", data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/users/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/users/${id}`),
};
