/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Role {
  Admin = "Admin",
  SeniorManager = "Senior Manager",
  Manager = "Manager",
  TeamLead = "Team Lead",
  User = "User",
}

export enum AccessLevel {
  Editor = "Editor", // Add, View, Edit (Only self created)
  Contributor = "Contributor", // Add, View, Edit (self and its team)
  Manager = "Manager", // View, Edit, Delete (for all)
}

export interface User {
  id: string;
  name: string;
  role: Role;
  accessLevel: AccessLevel;
  reportsTo?: string; // ID of the user they report to
  teamName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  targetQuota: number; // Monthly sales quota
  showOnDashboard?: boolean;
}

export interface ClosedWonDetails {
  customerPoNumber: string;
  poDate: string;
  freightTerm: string;
  freightChargedInBill?: string;
  freightCostToAol?: string;
  cartageLabourCharges?: string;
  transporterName: string;
  vehicleNo?: string;
  deliveryTerm: string;
  destinationAddress: string;
  dispatchDate: string;
  dispatchLocation: string;
  warehouseManagedBy: string;
  poAttachmentUrl?: string;
}

export interface SalesLead {
  id: string;
  clientName: string;
  companyName: string;
  email: string;
  phone: string;
  status: "New" | "Contacted" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost";
  value: number; // Deal value
  quantity: number;
  rate: number;
  amount: number;
  assignedToUserId: string;
  createdByUserId: string;
  projectId: string; // Belongs to a workflow project
  items?: OrderItem[];
  notes: string;
  createdAt: string;
  closedWonDetails?: ClosedWonDetails;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  rate: number;
  amount: number;
  hsnCode?: string;
  packing?: string;
  taxes?: string;
}

export interface PaymentBank {
  id: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  address: string;
  createdAt: string;
}

export interface BillingDetails {
  invoiceNumber: string;
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  mappedAt?: string;
  mappedByUserId?: string;
}

export interface OrderOffer {
  id: string;
  clientName: string;
  companyName: string;
  email: string;
  phone: string;
  billingAddress?: string;
  status: "New" | "Contacted" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost";
  totalValue: number;
  items: OrderItem[];
  payment: string;
  paymentCreditPeriod?: string;
  paymentBankId?: string;
  paymentTermsOffer?: string;
  delivery: string;
  otherTerms: string;
  assignedToUserId: string;
  createdByUserId: string;
  notes: string;
  createdAt: string;
  closedWonDetails?: ClosedWonDetails;
  billingDetails?: BillingDetails;
}

export interface ProjectWorkflow {
  id: string;
  name: string;
  description: string;
  status: "Planning" | "Active" | "Completed" | "On Hold";
  clientName: string;
  leadsCount: number;
}

export interface SalesTask {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: "Low" | "Medium" | "High";
  status: "To Do" | "In Progress" | "Review" | "Completed";
  assignedToUserId: string;
  createdByUserId: string;
  projectId: string;
  leadId?: string; // Optional related lead
}

// Action log to show transparency of modifications
export interface ActionLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  actionType: "Create Lead" | "Edit Lead" | "Delete Lead" | "Create Task" | "Edit Task" | "Delete Task" | "Create User" | "Edit User" | "Delete User" | "Create Product" | "Edit Product" | "Delete Product" | "Create Order" | "Edit Order" | "Delete Order" | "Create Category" | "Edit Category" | "Delete Category" | "Create Group" | "Edit Group" | "Delete Group" | "Create Manufacturer" | "Edit Manufacturer" | "Delete Manufacturer" | "Create Freight Term" | "Edit Freight Term" | "Delete Freight Term" | "Create Transporter" | "Edit Transporter" | "Delete Transporter" | "Map Invoice" | "Update Invoice" | "Update Payment" | "Update Order Status" | "Map Customer PO" | "Update Google Drive Settings" | "Create Email Template" | "Update Email Template" | "Delete Email Template" | "Send Email" | "Create Payment Term" | "Edit Payment Term" | "Delete Payment Term" | "Create Payment Credit Period" | "Edit Payment Credit Period" | "Delete Payment Credit Period" | "Update Email Sending Mode" | "Update Single Setted ID Config" | "Update User SMTP Credentials" | "Remove User SMTP Credentials";
  targetType: "Lead" | "Task" | "User" | "Product" | "Order" | "Category" | "Group" | "Manufacturer" | "Freight Term" | "Transporter" | "Settings" | "EmailTemplate" | "Payment Term" | "Payment Credit Period";
  targetId: string;
  targetName: string;
  details: string;
}

export interface TeamTabSettings {
  id: string; // Document ID (usually the lowercase slugified teamName)
  teamName: string; // The team name like "SME West Coast"
  visibleTabs: string[]; // List of tab IDs like ["dashboard", "leads", "workflows", "products"]
  visibleSubTabs?: { [key: string]: string[] }; // Optional map of tab ID to visible sub-tab IDs
  visibleSubSubTabs?: { [key: string]: { [key: string]: string[] } }; // Optional map of tab ID to (subTab ID to visible subSubTab IDs)
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } }; // Optional map of tab ID to operation permissions (view, edit, add)
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean }; // Optional map of tab or sub-tab ID to boolean indicating if level-wise filtering is enabled
}

export interface Client {
  id: string;
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  gst: string;
  city: string;
  pincode: string;
  address: string;
  createdAt: string;
  createdByUserId?: string;
  assignedToUserId?: string;
  teamName?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProductGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface Manufacturer {
  id: string;
  name: string;
  createdAt: string;
}

export interface FreightTerm {
  id: string;
  name: string;
  createdAt: string;
}

export interface TransporterName {
  id: string;
  name: string;
  contactPerson?: string;
  emailId?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface WarehouseManagedBy {
  id: string;
  name: string;
  warehouseName?: string;
  dispatchLocation?: string;
  warehouseManager?: string;
  emailId?: string;
  mobileNo?: string;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  isDefault?: boolean;
  to?: string;
  cc?: string;
  bcc?: string;
  assignedForm?: "create_order" | "edit_order" | "invoice_issuance" | "payment_reminder" | "payment_reminder_consolidated" | "any";
}

export interface EmailAutoSelectSettings {
  indentAutoSelect: boolean;
  ordersAutoSelect: boolean;
}

export type EmailSendingMode = "single_setted_id" | "logged_in_user_id";

export interface SmtpCredentials {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromName?: string;
  secure?: boolean;
}

export interface EmailSendingConfig {
  mode: EmailSendingMode;
  singleConfig?: SmtpCredentials;
  userConfigs?: Record<string, SmtpCredentials>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DispatchLocation {
  id: string;
  name: string;
  createdAt: string;
}

export interface PaymentLocation {
  id: string;
  name: string;
  createdAt: string;
}

export interface PaymentDetails {
  id: string; // Document ID (orderId)
  orderId: string;
  amountReceived: number;
  pendingAmount: number;
  paymentStatus: "Unpaid" | "Partial paid" | "Fully paid";
  paymentReceivedDate?: string;
  utrId?: string;
  comments?: string;
  updatedAt?: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  group: string;
  manufacturer: string;
  teamName?: string; // For team segregation matching
  createdAt: string;
  createdByUserId?: string;
  hsnCode?: string;
}

export interface PaymentTerm {
  id: string;
  name: string;
  createdAt: string;
}

export interface PaymentCreditPeriod {
  id: string;
  name: string;
  createdAt: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  createdAt: string;
  createdByUserId?: string;
  createdByUserName?: string;
}

export type BugType = "Bug / Error" | "Enhancement / New Feature" | "Improvement";
export type BugPriority = "Low" | "Medium" | "High" | "Critical";
export type BugStatus = "Pending" | "In Progress" | "Completed" | "Rejected";

export interface BugRequest {
  id: string;
  title: string;
  description: string;
  type: BugType;
  priority: BugPriority;
  status: BugStatus;
  isCompleted: boolean;
  screenshotUrl?: string;
  screenshotName?: string;
  createdByUserId: string;
  createdByUserName: string;
  createdByEmail?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolvedByUserName?: string;
  adminNotes?: string;
}


