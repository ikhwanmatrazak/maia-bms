export type UserRole = "admin" | "manager" | "staff";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
}

export type ClientStatus = "active" | "inactive";

export interface Client {
  id: number;
  company_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  currency: string;
  notes?: string;
  status: ClientStatus;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  outstanding_balance?: string;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "online" | "other";

export interface DocumentItem {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate_id?: number;
  tax_amount: string;
  line_total: string;
  sort_order: number;
}

export interface Quotation {
  id: number;
  quotation_number: string;
  client_id: number;
  client_name?: string;
  client_email?: string;
  status: QuotationStatus;
  currency: string;
  exchange_rate: string;
  issue_date: string;
  expiry_date?: string;
  subtotal: string;
  discount_amount: string;
  tax_total: string;
  total: string;
  notes?: string;
  terms_conditions?: string;
  payment_terms?: string;
  template_id?: number;
  created_by?: number;
  sent_at?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
  items: DocumentItem[];
}

export interface Invoice {
  id: number;
  invoice_number: string;
  quotation_id?: number;
  client_id: number;
  client_name?: string;
  client_email?: string;
  status: InvoiceStatus;
  currency: string;
  exchange_rate: string;
  issue_date: string;
  due_date?: string;
  subtotal: string;
  discount_amount: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  balance_due: string;
  notes?: string;
  terms_conditions?: string;
  payment_terms?: string;
  template_id?: number;
  created_by?: number;
  sent_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  items: DocumentItem[];
}

export interface Receipt {
  id: number;
  receipt_number: string;
  invoice_id: number;
  client_id: number;
  client_name?: string;
  client_email?: string;
  currency: string;
  exchange_rate: string;
  amount: string;
  payment_method: PaymentMethod;
  payment_date: string;
  notes?: string;
  template_id?: number;
  created_by?: number;
  sent_at?: string;
  created_at: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  receipt_id?: number;
  amount: string;
  currency: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  proof_file_url?: string;
  notes?: string;
  recorded_by?: number;
  created_at: string;
  client_name?: string;
  invoice_number?: string;
}

export interface TaxRate {
  id: number;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface CompanySettings {
  id: number;
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  default_currency: string;
  default_payment_terms: number;
  invoice_prefix: string;
  quotation_prefix: string;
  receipt_prefix: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  company_registration_no?: string;
  sst_no?: string;
  tin_no?: string;
  payment_terms_text?: string;
  payment_info?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  signature_image_url?: string;
  primary_color: string;
  accent_color: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  client_id: number;
  user_id?: number;
  type: string;
  description: string;
  occurred_at: string;
  created_at: string;
}

export interface Reminder {
  id: number;
  client_id?: number;
  user_id: number;
  title: string;
  description?: string;
  due_date: string;
  is_completed: boolean;
  completed_at?: string;
  priority: "low" | "medium" | "high";
  created_at: string;
}

export interface Expense {
  id: number;
  category_id?: number;
  category?: string;
  description: string;
  amount: string;
  currency: string;
  exchange_rate: string;
  expense_date: string;
  vendor?: string;
  receipt_url?: string;
  notes?: string;
  created_by?: number;
  created_at: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  color: string;
  is_active: boolean;
}

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";
export type DeliveryOrderStatus = "draft" | "sent" | "delivered" | "cancelled";

export interface PurchaseOrderItem {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate_id?: number;
  tax_amount: string;
  line_total: string;
  sort_order: number;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_address?: string;
  status: PurchaseOrderStatus;
  currency: string;
  exchange_rate: string;
  issue_date: string;
  expected_delivery_date?: string;
  subtotal: string;
  discount_amount: string;
  tax_total: string;
  total: string;
  notes?: string;
  terms_conditions?: string;
  created_by?: number;
  sent_at?: string;
  received_at?: string;
  created_at: string;
  updated_at: string;
  items: PurchaseOrderItem[];
}

export interface DeliveryOrderItem {
  id: number;
  description: string;
  quantity: string;
  unit?: string;
  sort_order: number;
}

export interface DeliveryOrder {
  id: number;
  do_number: string;
  client_id: number;
  client_name?: string;
  status: DeliveryOrderStatus;
  issue_date: string;
  delivery_date?: string;
  delivery_address?: string;
  notes?: string;
  created_by?: number;
  sent_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  items: DeliveryOrderItem[];
}

export type BillingCycle = "one_time" | "monthly" | "quarterly" | "annually";
export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface ProductPricing {
  id: number;
  product_id: number;
  name: string;
  description?: string;
  amount: string;
  billing_cycle: BillingCycle;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  unit_price: string;
  currency: string;
  unit_label?: string;
  billing_cycle: BillingCycle;
  category?: string;
  is_active: boolean;
  email_subject?: string;
  email_body?: string;
  document_template_id?: number;
  active_subscription_count: number;
  pricing: ProductPricing[];
  created_at: string;
  updated_at: string;
}

export interface ProductSubscription {
  id: number;
  product_id: number;
  client_id: number;
  client_name: string;
  product_name: string;
  start_date: string;
  next_renewal_date?: string;
  billing_cycle: BillingCycle;
  amount: string;
  status: SubscriptionStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type BillStatus = "pending" | "paid" | "overdue";

export interface Bill {
  id: number;
  vendor_name?: string;
  vendor_address?: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_reg_no?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  bill_number?: string;
  description?: string;
  issue_date?: string;
  due_date?: string;
  amount?: number;
  currency: string;
  status: BillStatus;
  paid_at?: string;
  payment_reference?: string;
  file_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
