/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { User, OrderOffer, Role, PaymentBank, EmailTemplate, PaymentDetails, PaymentReceiptRecord, BadDebtor, EmailSentLog, EmailSentStatusSummary, EmailDeliveryStatus } from "../types";
import { saveLog, savePaymentDetails, saveBadDebtor, deleteBadDebtorDoc, saveEmailSentLog } from "../lib/firebaseService";
import { auth } from "../firebase";
import { openOrDownloadDocument } from "../lib/googleDriveService";
import { replaceTemplateVars, resolveUserHierarchyInfo, formatEmailBodyForSending } from "../lib/templateUtils";
import { dispatchSystemEmail } from "../lib/emailService";
import { formatDate, getOrderTotalInvoiceAmount, formatIndianNumber, formatIndianCurrency } from "../utils";

const formatINR = formatIndianNumber;
import { canViewOrderOffer } from "../data";
import EmailSentStatusCell from "./EmailSentStatusCell";
import Papa from "papaparse";
import {
  Search,
  Check,
  Loader2,
  FileText,
  Building2,
  Calendar,
  IndianRupee,
  ExternalLink,
  Receipt,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  CreditCard,
  Truck,
  MapPin,
  User2,
  Info,
  ListOrdered,
  Send,
  CheckSquare,
  Square,
  AlertTriangle,
  Clock,
  BellRing,
  CheckCircle2,
  X,
  Edit3,
  Save,
  MessageSquare,
  Hash,
  Banknote,
  Lock,
  Layers,
  Eye,
  FileSpreadsheet,
  Code,
  Plus,
  Trash2,
  History,
  Upload,
  Download,
  Clipboard,
  AlertCircle,
  FileUp
} from "lucide-react";

/**
 * Helper to safely format email preview HTML without creating invalid br tags inside table structures
 */
export function formatEmailPreviewHtml(bodyStr: string): string {
  if (!bodyStr) return "";
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(bodyStr);
  if (!hasHtmlTags) {
    return bodyStr.replace(/\n/g, "<br/>");
  }
  const tableRegex = /(<table[\s\S]*?<\/table>)/gi;
  const parts = bodyStr.split(tableRegex);
  return parts.map((part) => {
    if (part.toLowerCase().startsWith("<table")) {
      return part.replace(/<br\s*\/?>/gi, "").replace(/\s*\n\s*/g, " ");
    } else {
      return part.replace(/\n/g, "<br/>");
    }
  }).join("");
}

/**
 * Helper to get payment details for any order, automatically synthesizing payment details for Bad Debtors
 */
export function getPaymentDetailsForOrder(
  order: OrderOffer,
  paymentDetailsList: PaymentDetails[] = []
): PaymentDetails | undefined {
  if ((order.isBadDebtor || order.id?.startsWith("bd-")) && order.badDebtorRecord) {
    const bd = order.badDebtorRecord;
    const totalReceived =
      (bd.receipts || []).reduce((sum, r) => sum + (r.amount || 0), 0) ||
      (bd.amountReceived || 0);
    const invoiceAmt = bd.invoiceAmount || (bd as any).orderAmount || order.totalValue || 0;
    const pendingAmt = Math.max(0, invoiceAmt - totalReceived);
    const status =
      pendingAmt <= 0 && invoiceAmt > 0
        ? "Paid"
        : totalReceived > 0
        ? "Partial Paid"
        : "Bad Debt";

    return {
      id: `pd-${order.id}`,
      orderId: order.id,
      amountReceived: totalReceived,
      pendingAmount: pendingAmt,
      paymentStatus: status as any,
      receipts: bd.receipts || [],
      paymentReceivedDate: bd.dueDate,
      createdAt: bd.createdAt || new Date().toISOString(),
      updatedAt: bd.updatedAt || new Date().toISOString(),
    };
  }

  return paymentDetailsList.find((p) => p.orderId === order.id);
}

/**
 * Generates formatted HTML table for consolidated invoice details
 */
export function generateConsolidatedInvoiceTableHTML(orders: OrderOffer[], paymentDetailsList: PaymentDetails[]) {
  const rows = orders.map((o) => {
    const pDet = getPaymentDetailsForOrder(o, paymentDetailsList);
    const totalAmt = getOrderTotalInvoiceAmount(o);
    const receivedAmt = pDet ? pDet.amountReceived : 0;
    const pendingAmt = pDet ? pDet.pendingAmount : Math.max(0, totalAmt - receivedAmt);
    const actualDispatchDate = getOrderActualDispatchDate(o);
    const dueInfo = calculateDueDate(actualDispatchDate, o.payment);
    const invNum = o.billingDetails?.invoiceNumber || "N/A";
    const poNum = o.closedWonDetails?.customerPoNumber || "N/A";
    const dispDate = actualDispatchDate ? formatDate(actualDispatchDate) : "N/A";
    const dueDateColor = dueInfo.isOverdue ? "#dc2626" : "#1e293b";

    return `<tr style="background-color:#ffffff;">` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; font-weight:bold; color:#0f172a; text-align:left;">${invNum}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; color:#334155; text-align:left;">${poNum}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-size:11px; color:#475569; text-align:left;">${dispDate}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; font-weight:bold; color:${dueDateColor}; text-align:left;">${dueInfo.dueDateFormatted}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; color:#0f172a;">₹${formatIndianNumber(totalAmt)}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; color:#166534; font-weight:bold;">₹${formatIndianNumber(receivedAmt)}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; font-weight:800; color:#dc2626;">₹${formatIndianNumber(pendingAmt)}</td>` +
    `</tr>`;
  }).join("");

  const grandTotalValue = orders.reduce((sum, o) => sum + getOrderTotalInvoiceAmount(o), 0);
  const grandTotalReceived = orders.reduce((sum, o) => {
    const p = getPaymentDetailsForOrder(o, paymentDetailsList);
    return sum + (p ? p.amountReceived : 0);
  }, 0);
  const grandTotalPending = orders.reduce((sum, o) => {
    const p = getPaymentDetailsForOrder(o, paymentDetailsList);
    const tot = getOrderTotalInvoiceAmount(o);
    const rec = p ? p.amountReceived : 0;
    return sum + (p ? p.pendingAmount : Math.max(0, tot - rec));
  }, 0);

  const tableHtml = `<div style="margin:16px 0; overflow-x:auto;">` +
    `<table border="0" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:12px; border:1px solid #047857; background-color:#ffffff; text-align:left;">` +
      `<thead>` +
        `<tr style="background-color:#065f46; color:#ffffff; font-weight:bold; font-family:monospace; font-size:11px; text-transform:uppercase;">` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">INVOICE #</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">CUSTOMER PO #</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">ACTUAL DISPATCH DATE</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">DUE DATE</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:right; color:#ffffff; background-color:#065f46;">INVOICE AMOUNT</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:right; color:#ffffff; background-color:#065f46;">PAYMENT RECEIVED</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:right; color:#ffffff; background-color:#065f46;">PENDING AMOUNT</th>` +
        `</tr>` +
      `</thead>` +
      `<tbody>` +
        `${rows}` +
        `<tr style="background-color:#ecfdf5; font-weight:bold; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:12px;">` +
          `<td colspan="4" style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#065f46; font-weight:bold;">CONSOLIDATED OUTSTANDING TOTAL:</td>` +
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#0f172a; font-family:monospace; font-weight:bold;">₹${formatIndianNumber(grandTotalValue)}</td>` +
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#166534; font-family:monospace; font-weight:bold;">₹${formatIndianNumber(grandTotalReceived)}</td>` +
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#dc2626; font-family:monospace; font-size:13px; font-weight:800;">₹${formatIndianNumber(grandTotalPending)}</td>` +
        `</tr>` +
      `</tbody>` +
    `</table>` +
  `</div>`;

  return tableHtml.replace(/\s*\n\s*/g, " ");
}

/**
 * Helper to check if an order is 100% fully paid
 */
export function isOrderFullyPaid(order: OrderOffer, pDetails?: PaymentDetails): boolean {
  const totalAmt = order.totalValue || 0;
  const receivedAmt = pDetails ? pDetails.amountReceived : 0;
  const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - receivedAmt);
  const status = (pDetails?.paymentStatus || "").toLowerCase();

  if (status.includes("fully") || status === "paid") {
    return true;
  }
  if (totalAmt > 0 && receivedAmt >= totalAmt) {
    return true;
  }
  if (pDetails && pendingAmt <= 0 && receivedAmt > 0) {
    return true;
  }
  return false;
}

/**
 * Helper to get the Actual Dispatch Date filled by the billing team
 */
export function getOrderActualDispatchDate(order: OrderOffer): string | undefined {
  return order.billingDetails?.actualDispatchDate || order.billingDetails?.dispatchDate;
}

/**
 * Calculates Due Date based on Dispatch Date + Payment Days
 */
export function calculateDueDate(dispatchDateStr?: string, paymentTermsStr?: string) {
  if (!dispatchDateStr) {
    return {
      dueDateFormatted: "Pending Dispatch",
      dueDateObj: null,
      daysRemaining: null,
      isOverdue: false,
      statusLabel: "Pending Dispatch",
      paymentDaysCount: 0,
    };
  }

  const dispatchDate = new Date(dispatchDateStr);
  if (isNaN(dispatchDate.getTime())) {
    return {
      dueDateFormatted: "Invalid Date",
      dueDateObj: null,
      daysRemaining: null,
      isOverdue: false,
      statusLabel: "Invalid Date",
      paymentDaysCount: 0,
    };
  }

  // Extract numeric days from payment terms string
  let days = 30; // default 30 days if not specified
  if (paymentTermsStr) {
    const match = paymentTermsStr.match(/\d+/);
    if (match) {
      days = parseInt(match[0], 10);
    } else {
      const lower = paymentTermsStr.toLowerCase();
      if (lower.includes("immediate") || lower.includes("advance") || lower.includes("cod")) {
        days = 0;
      }
    }
  }

  const dueDate = new Date(dispatchDate);
  dueDate.setDate(dueDate.getDate() + days);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueCheck = new Date(dueDate);
  dueCheck.setHours(0, 0, 0, 0);

  const diffTime = dueCheck.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dueDateFormatted = formatDate(dueDate);

  let statusLabel = "";
  let isOverdue = false;

  if (diffDays < 0) {
    isOverdue = true;
    statusLabel = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;
  } else if (diffDays === 0) {
    statusLabel = "Due Today";
  } else {
    statusLabel = `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  return {
    dueDateFormatted,
    dueDateObj: dueDate,
    daysRemaining: diffDays,
    isOverdue,
    statusLabel,
    paymentDaysCount: days,
  };
}

interface PaymentListViewProps {
  activeUserId: string;
  users: User[];
  orders: OrderOffer[];
  badDebtors?: BadDebtor[];
  onEditOrder: (order: OrderOffer) => void;
  paymentBanks?: PaymentBank[];
  visibleSubTabs?: { [key: string]: string[] };
  emailTemplates?: EmailTemplate[];
  emailSentLogs?: EmailSentLog[];
  paymentDetailsList?: PaymentDetails[];
  onNavigateToBilling?: (orderId: string) => void;
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function PaymentListView({
  activeUserId,
  users,
  orders = [],
  badDebtors = [],
  onEditOrder,
  paymentBanks = [],
  visibleSubTabs,
  emailTemplates = [],
  emailSentLogs = [],
  paymentDetailsList = [],
  onNavigateToBilling,
  teamPermissions,
  levelWiseFilters,
}: PaymentListViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || {
    id: activeUserId,
    name: "User",
    role: Role.User,
    teamName: "Sales",
    email: "",
  };

  const getEffectivePaymentReminderStatus = (order: OrderOffer): EmailSentStatusSummary | undefined => {
    if (emailSentLogs && emailSentLogs.length > 0) {
      const logsForOrder = emailSentLogs
        .filter((l) => l.orderId === order.id && (l.category === "payment_reminder" || l.category === "payment_reminder_consolidated"))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (logsForOrder.length > 0) {
        const latest = logsForOrder[0];
        return {
          to: latest.to,
          cc: latest.cc,
          bcc: latest.bcc,
          status: latest.status,
          timestamp: latest.timestamp,
          subject: latest.subject,
          error: latest.error,
          sentByUserName: latest.senderUserName,
        };
      }
    }
    return order.paymentReminderEmailStatus;
  };

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.view !== false;

  // Helper function to resolve sales person (assigned user name)
  const getAssignedUserName = (userId?: string) => {
    if (!userId) return "Unassigned";
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || "Unassigned";
  };

  // Helper function to resolve sales persons for a party with multiple orders
  const getPartySalesPersons = (partyOrders: OrderOffer[]) => {
    const names = Array.from(
      new Set(
        partyOrders
          .map((o) => getAssignedUserName(o.assignedToUserId))
          .filter(Boolean)
      )
    );
    if (names.length === 0) return "Unassigned";
    return names.join(", ");
  };

  // Debtors & Fully Paid tab states
  const [expandedOrderIds, setExpandedOrderIds] = useState<{ [key: string]: boolean }>({});
  const [expandedDebtorPartyKeys, setExpandedDebtorPartyKeys] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [fullyPaidSearchTerm, setFullyPaidSearchTerm] = useState("");
  const [confirmEditOrder, setConfirmEditOrder] = useState<OrderOffer | null>(null);

  // Payment Details Modal state
  const [editingPaymentOrder, setEditingPaymentOrder] = useState<OrderOffer | null>(null);
  const [previousAmountReceived, setPreviousAmountReceived] = useState<number>(0);
  const [paymentForm, setPaymentForm] = useState<{
    amountReceived: string;
    lastEnteredAmount: string;
    pendingAmount: string;
    paymentStatus: "Unpaid" | "Partial paid" | "Fully paid";
    paymentReceivedDate: string;
    utrId: string;
    comments: string;
  }>({
    amountReceived: "0",
    lastEnteredAmount: "0",
    pendingAmount: "0",
    paymentStatus: "Unpaid",
    paymentReceivedDate: new Date().toISOString().split("T")[0],
    utrId: "",
    comments: "",
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentSaveSuccess, setPaymentSaveSuccess] = useState<string | null>(null);

  // Bulk Receipts Import state
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [isSavingBulkImport, setIsSavingBulkImport] = useState(false);

  // Bad Debtors tab states & modals
  const [badDebtorsSearchTerm, setBadDebtorsSearchTerm] = useState("");
  const [badDebtorsFilter, setBadDebtorsFilter] = useState<"all" | "pending" | "fully_received">("all");
  const [showBadDebtorModal, setShowBadDebtorModal] = useState(false);
  const [editingBadDebtor, setEditingBadDebtor] = useState<BadDebtor | null>(null);
  const [isSavingBadDebtor, setIsSavingBadDebtor] = useState(false);

  // Bad Debtors Payment Receipts management states
  const [managingBadDebtorPayment, setManagingBadDebtorPayment] = useState<BadDebtor | null>(null);
  const [showBadDebtorPaymentModal, setShowBadDebtorPaymentModal] = useState(false);
  const [confirmDeleteReceiptId, setConfirmDeleteReceiptId] = useState<string | null>(null);
  const [badDebtorPaymentForm, setBadDebtorPaymentForm] = useState({
    amount: "",
    paymentReceivedDate: new Date().toISOString().split("T")[0],
    utrId: "",
    comments: "",
  });
  const [isSavingBadDebtorPayment, setIsSavingBadDebtorPayment] = useState(false);

  const [badDebtorForm, setBadDebtorForm] = useState<{
    companyName: string;
    clientName: string;
    email: string;
    phone: string;
    customerPo: string;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceAmount: string;
    dueDate: string;
    overdueDays: string;
    comments: string;
    status: "Bad Debt" | "Written Off" | "In Recovery" | "Paid" | "Partial Paid";
    assignedToUserId: string;
  }>({
    companyName: "",
    clientName: "",
    email: "",
    phone: "",
    customerPo: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    invoiceAmount: "",
    dueDate: new Date().toISOString().split("T")[0],
    overdueDays: "0",
    comments: "",
    status: "Bad Debt",
    assignedToUserId: "",
  });

  // Bulk Import Bad Debtors state
  const [showBadDebtorsImportModal, setShowBadDebtorsImportModal] = useState(false);
  const [badDebtorsImportText, setBadDebtorsImportText] = useState("");
  const [badDebtorsImportFileName, setBadDebtorsImportFileName] = useState("");
  const [isSavingBadDebtorsImport, setIsSavingBadDebtorsImport] = useState(false);

  // Parsed and validated bulk rows mapped against invoice numbers
  const parsedBulkRows = useMemo(() => {
    if (!bulkInputText.trim()) return [];

    const parseResult = Papa.parse<Record<string, string>>(bulkInputText.trim(), {
      header: true,
      skipEmptyLines: "greedy",
    });

    let rowsData = parseResult.data || [];
    if (rowsData.length === 0) return [];

    return rowsData.map((row, index) => {
      const getVal = (keys: string[]) => {
        const normKeys = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
        for (const [k, v] of Object.entries(row)) {
          const normKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normKeys.includes(normKey) && v !== undefined && v !== null) {
            return String(v).trim();
          }
        }
        return "";
      };

      const rawInvoiceNo = getVal([
        "Invoice Number",
        "Invoice #",
        "InvoiceNo",
        "Invoice",
        "Inv No",
        "Invoice_Number",
        "Bill No",
        "Bill Number",
        "Order ID",
        "PO Number",
      ]);

      const rawAmountStr = getVal([
        "Amount Received",
        "Amount",
        "Payment Amount",
        "Amt",
        "Received Amount",
        "Received",
        "Value",
        "Total",
      ]);

      const rawDateStr = getVal([
        "Payment Date",
        "Date",
        "Received Date",
        "Payment Received Date",
        "Txn Date",
      ]);

      const rawUtr = getVal([
        "UTR",
        "UTR ID",
        "UTR Number",
        "Ref",
        "Reference Number",
        "Txn ID",
        "UTR/Ref",
      ]);

      const rawComments = getVal([
        "Comments",
        "Notes",
        "Remarks",
        "Description",
        "Remark",
      ]);

      const cleanAmountStr = rawAmountStr.replace(/[^0-9.-]/g, "");
      const amount = parseFloat(cleanAmountStr);

      let formattedDate = new Date().toISOString().split("T")[0];
      if (rawDateStr) {
        const d = new Date(rawDateStr);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toISOString().split("T")[0];
        }
      }

      if (!rawInvoiceNo) {
        return {
          rowIndex: index + 1,
          rawInvoiceNo: "(Empty)",
          rawAmount: amount || 0,
          rawDate: formattedDate,
          rawUtr,
          rawComments,
          isValid: false,
          validationError: "Missing invoice number",
        };
      }

      if (isNaN(amount) || amount <= 0) {
        return {
          rowIndex: index + 1,
          rawInvoiceNo,
          rawAmount: 0,
          rawDate: formattedDate,
          rawUtr,
          rawComments,
          isValid: false,
          validationError: "Invalid or zero payment amount",
        };
      }

      const normInv = rawInvoiceNo.toLowerCase().trim();
      const matchedOrder = orders.find((o) => {
        const invNum = (o.billingDetails?.invoiceNumber || "").toLowerCase().trim();
        const orderId = o.id.toLowerCase().trim();
        const poNum = (o.closedWonDetails?.customerPoNumber || "").toLowerCase().trim();
        const piNum = (o.closedWonDetails?.piNumber || "").toLowerCase().trim();
        return (
          invNum === normInv ||
          orderId === normInv ||
          (poNum && poNum === normInv) ||
          (piNum && piNum === normInv)
        );
      });

      if (!matchedOrder) {
        return {
          rowIndex: index + 1,
          rawInvoiceNo,
          rawAmount: amount,
          rawDate: formattedDate,
          rawUtr,
          rawComments,
          isValid: false,
          validationError: `Invoice #${rawInvoiceNo} not found in system`,
        };
      }

      const orderTotal = getOrderTotalInvoiceAmount(matchedOrder);
      const existingP = getPaymentDetailsForOrder(matchedOrder, paymentDetailsList);
      const existingReceiptsSum = (existingP?.receipts || []).reduce((sum, r) => sum + (r.amount || 0), 0);
      const currentReceived = (existingP?.receipts && existingP.receipts.length > 0)
        ? existingReceiptsSum
        : (existingP?.amountReceived || 0);

      const newTotalReceived = currentReceived + amount;
      const newPendingAmount = Math.max(0, orderTotal - newTotalReceived);
      let newStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
      if (newTotalReceived >= orderTotal && orderTotal > 0) newStatus = "Fully paid";
      else if (newTotalReceived > 0) newStatus = "Partial paid";

      return {
        rowIndex: index + 1,
        rawInvoiceNo,
        rawAmount: amount,
        rawDate: formattedDate,
        rawUtr,
        rawComments,
        isValid: true,
        matchedOrder,
        matchedClientName: matchedOrder.clientName,
        matchedCompanyName: matchedOrder.companyName,
        orderTotal,
        currentReceived,
        newTotalReceived,
        newPendingAmount,
        newStatus,
      };
    });
  }, [bulkInputText, orders, paymentDetailsList]);

  // Handle CSV/TSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setBulkInputText(text);
      }
    };
    reader.readAsText(file);
  };

  // Download Sample CSV Template
  const handleDownloadSampleCSV = () => {
    const sampleData = `Invoice Number,Amount Received,Payment Date,UTR Number,Comments\nINV-2026-001,25000,2026-08-25,UTR987654321,Partial payment received via HDFC\nINV-2026-002,150000,2026-08-26,UTR123456789,Full settlement cleared`;
    const blob = new Blob([sampleData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "payment_receipts_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy Sample Header
  const handleCopySampleTemplate = () => {
    const sampleData = `Invoice Number\tAmount Received\tPayment Date\tUTR Number\tComments\nINV-2026-001\t25000\t2026-08-25\tUTR987654321\tPartial payment received via HDFC`;
    navigator.clipboard.writeText(sampleData);
    alert("Sample CSV header copied to clipboard! You can paste it directly into Excel, Google Sheets, or the text area.");
  };

  // Execute Batch Bulk Import
  const handleExecuteBulkImport = async () => {
    const validRows = parsedBulkRows.filter((r) => r.isValid && r.matchedOrder);
    if (validRows.length === 0) {
      alert("No valid rows available to import.");
      return;
    }

    setIsSavingBulkImport(true);
    try {
      // Group valid rows by orderId
      const orderGroupMap = new Map<string, { order: OrderOffer; rows: typeof validRows }>();
      for (const row of validRows) {
        const o = row.matchedOrder!;
        if (!orderGroupMap.has(o.id)) {
          orderGroupMap.set(o.id, { order: o, rows: [] });
        }
        orderGroupMap.get(o.id)!.rows.push(row);
      }

      let importedCount = 0;
      for (const [orderId, { order, rows }] of orderGroupMap.entries()) {
        const existingP = getPaymentDetailsForOrder(order, paymentDetailsList);
        const existingReceipts = existingP?.receipts || [];
        const invoiceNo = order.billingDetails?.invoiceNumber || orderId;

        const newReceipts: PaymentReceiptRecord[] = rows.map((r, i) => ({
          id: `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`,
          orderId: orderId,
          invoiceNumber: invoiceNo,
          amount: r.rawAmount,
          paymentReceivedDate: r.rawDate,
          utrId: r.rawUtr,
          comments: r.rawComments || "Bulk Imported",
          createdAt: new Date().toISOString(),
          createdBy: activeUser.name || activeUser.email || "System (Bulk Import)",
        }));

        const updatedReceipts = [...existingReceipts, ...newReceipts];
        const totalReceived = updatedReceipts.reduce((sum, rec) => sum + (rec.amount || 0), 0);
        const orderTotal = order.totalValue || 0;
        const pendAmt = Math.max(0, orderTotal - totalReceived);

        let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
        if (totalReceived >= orderTotal && orderTotal > 0) autoStatus = "Fully paid";
        else if (totalReceived > 0) autoStatus = "Partial paid";

        const record: PaymentDetails = {
          id: orderId,
          orderId: orderId,
          invoiceNumber: invoiceNo,
          amountReceived: totalReceived,
          lastEnteredAmount: rows[rows.length - 1].rawAmount,
          pendingAmount: pendAmt,
          paymentStatus: autoStatus,
          paymentReceivedDate: rows[rows.length - 1].rawDate,
          utrId: rows[rows.length - 1].rawUtr,
          comments: rows[rows.length - 1].rawComments || "Bulk Imported Payment Receipts",
          receipts: updatedReceipts,
          updatedAt: new Date().toISOString(),
          updatedByUserId: activeUser.id,
          updatedByUserName: activeUser.name,
        };

        await savePaymentDetails(record);

        await saveLog({
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Add Payment Receipt",
          targetType: "Order",
          targetId: orderId,
          targetName: order.companyName || order.clientName || "Order",
          details: `Bulk imported ${rows.length} receipt(s) for Invoice #${invoiceNo}. Total Received updated to ₹${formatIndianNumber(totalReceived)}, Pending=₹${formatIndianNumber(pendAmt)}`,
        });

        importedCount += rows.length;
      }

      setPaymentSaveSuccess(`Successfully imported ${importedCount} payment receipt(s) across ${orderGroupMap.size} invoice(s)! Pending amounts automatically updated.`);
      setTimeout(() => setPaymentSaveSuccess(null), 6000);

      setBulkInputText("");
      setBulkFileName("");
      setShowBulkImportModal(false);
    } catch (err: any) {
      console.error("Bulk import error:", err);
      alert(`Bulk import failed: ${err.message || "Please check CSV data format."}`);
    } finally {
      setIsSavingBulkImport(false);
    }
  };

  // Payment Reminder tab states
  const [reminderSearchTerm, setReminderSearchTerm] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<{ [key: string]: boolean }>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);

  // Consolidated Payment Reminder tab states
  const [consolidatedSearchTerm, setConsolidatedSearchTerm] = useState("");
  const [expandedPartyKeys, setExpandedPartyKeys] = useState<Record<string, boolean>>({});
  const [selectedConsolidatedPartyKeys, setSelectedConsolidatedPartyKeys] = useState<Record<string, boolean>>({});
  const [selectedConsolidatedTemplateId, setSelectedConsolidatedTemplateId] = useState<string>("");
  const [isSendingConsolidatedBulkEmail, setIsSendingConsolidatedBulkEmail] = useState(false);

  // Consolidated Email Modal state
  const [consolidatedEmailParty, setConsolidatedEmailParty] = useState<{
    partyKey: string;
    companyName: string;
    clientName: string;
    email: string;
    phone: string;
    orders: OrderOffer[];
    totalPendingAmount: number;
    totalOrderValue: number;
    totalReceivedAmount: number;
    invoiceCount: number;
  } | null>(null);

  const [consolidatedTemplateId, setConsolidatedTemplateId] = useState<string>("");
  const [consolidatedTo, setConsolidatedTo] = useState("");
  const [consolidatedCc, setConsolidatedCc] = useState("");
  const [consolidatedBcc, setConsolidatedBcc] = useState("");
  const [consolidatedSubject, setConsolidatedSubject] = useState("");
  const [consolidatedBody, setConsolidatedBody] = useState("");
  const [consolidatedPreviewMode, setConsolidatedPreviewMode] = useState<"edit" | "preview">("edit");
  const [isSendingConsolidatedEmail, setIsSendingConsolidatedEmail] = useState(false);

  // Only mapped orders (orders with invoice details attached)
  const mappedOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!o.billingDetails?.invoiceNumber) return false;
      const isLevelFilterEnabled = !!levelWiseFilters?.["payment_list"];
      return canViewOrderOffer(activeUserId, o, users, isLevelFilterEnabled);
    });
  }, [orders, activeUserId, users, levelWiseFilters]);

  // Base list calculations (checking fully paid status)
  const checkFullyPaid = (order: OrderOffer) => {
    const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
    return isOrderFullyPaid(order, pDetails);
  };

  // Helper to check if an order's payment due status is today or overdue (1 or more days)
  const isOrderDueTodayOrOverdue = (order: OrderOffer) => {
    const actualDispatchDate = getOrderActualDispatchDate(order);
    const dueInfo = calculateDueDate(actualDispatchDate, order.payment);
    // daysRemaining is <= 0 when due today (0) or overdue (< 0, i.e. 1+ days overdue)
    return dueInfo.daysRemaining !== null && dueInfo.daysRemaining <= 0;
  };

  const debtorsBase = useMemo(() => mappedOrders.filter((o) => !checkFullyPaid(o)), [mappedOrders, paymentDetailsList]);
  const reminderBase = useMemo(
    () => mappedOrders.filter((o) => !checkFullyPaid(o) && isOrderDueTodayOrOverdue(o)),
    [mappedOrders, paymentDetailsList]
  );
  const fullyPaidBase = useMemo(() => mappedOrders.filter((o) => checkFullyPaid(o)), [mappedOrders, paymentDetailsList]);

  // Helper to build party-wise consolidated structures
  const buildPartyMap = (ordersList: OrderOffer[]) => {
    const map = new Map<string, {
      partyKey: string;
      companyName: string;
      clientName: string;
      email: string;
      phone: string;
      orders: OrderOffer[];
      totalOrderValue: number;
      totalReceivedAmount: number;
      totalPendingAmount: number;
      invoiceCount: number;
      oldestDueDateFormatted: string;
      isAnyOverdue: boolean;
      maxDaysOverdue: number;
    }>();

    ordersList.forEach((order) => {
      const company = (order.companyName || "").trim();
      const client = (order.clientName || "").trim();
      const key = (company || client || "Unspecified Party").toLowerCase();

      const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
      const totalAmt = getOrderTotalInvoiceAmount(order);
      const receivedAmt = pDetails ? pDetails.amountReceived : 0;
      const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - receivedAmt);
      const actualDispatchDate = getOrderActualDispatchDate(order);
      const dueInfo = order.isBadDebtor && order.badDebtorRecord
        ? {
            dueDateFormatted: formatDate(order.badDebtorRecord.dueDate),
            dueDateObj: new Date(order.badDebtorRecord.dueDate),
            daysRemaining: -order.badDebtorRecord.overdueDays,
            isOverdue: true,
            statusLabel: `${order.badDebtorRecord.overdueDays} Days Overdue (Bad Debt)`
          }
        : calculateDueDate(actualDispatchDate, order.payment);

      if (!map.has(key)) {
        map.set(key, {
          partyKey: key,
          companyName: company || client || "Unspecified Party",
          clientName: client || company || "Contact Person",
          email: order.email || "",
          phone: order.phone || "",
          orders: [order],
          totalOrderValue: totalAmt,
          totalReceivedAmount: receivedAmt,
          totalPendingAmount: pendingAmt,
          invoiceCount: 1,
          oldestDueDateFormatted: dueInfo.dueDateFormatted,
          isAnyOverdue: dueInfo.isOverdue,
          maxDaysOverdue: dueInfo.isOverdue ? Math.abs(dueInfo.daysRemaining || 0) : 0,
        });
      } else {
        const item = map.get(key)!;
        item.orders.push(order);
        item.totalOrderValue += totalAmt;
        item.totalReceivedAmount += receivedAmt;
        item.totalPendingAmount += pendingAmt;
        item.invoiceCount += 1;
        if (!item.email && order.email) item.email = order.email;
        if (!item.phone && order.phone) item.phone = order.phone;
        if (dueInfo.isOverdue) {
          item.isAnyOverdue = true;
          const currentOverdueDays = Math.abs(dueInfo.daysRemaining || 0);
          if (currentOverdueDays > item.maxDaysOverdue) {
            item.maxDaysOverdue = currentOverdueDays;
            item.oldestDueDateFormatted = dueInfo.dueDateFormatted;
          }
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalPendingAmount - a.totalPendingAmount);
  };

  // Debtors party-wise consolidation (all unpaid invoices)
  const consolidatedDebtorParties = useMemo(
    () => buildPartyMap(debtorsBase),
    [debtorsBase, paymentDetailsList]
  );

  // Helper: Convert Bad Debtors to OrderOffer compatible format for Reminder subtabs
  const badDebtorsReminderOrders: OrderOffer[] = useMemo(() => {
    return (badDebtors || [])
      .filter((bd) => {
        const totalReceived = (bd.receipts || []).reduce((sum, r) => sum + (r.amount || 0), 0) || (bd.amountReceived || 0);
        const pending = Math.max(0, bd.invoiceAmount - totalReceived);
        return bd.status !== "Paid" && pending > 0 && bd.invoiceAmount > 0;
      })
      .map((bd) => {
        const id = bd.id.startsWith("bd-") ? bd.id : `bd-${bd.id}`;
        const totalReceived = (bd.receipts || []).reduce((sum, r) => sum + (r.amount || 0), 0) || (bd.amountReceived || 0);
        const invAmt = bd.invoiceAmount || (bd as any).orderAmount || 0;
        return {
          id,
          clientName: bd.clientName || bd.companyName,
          companyName: bd.companyName,
          email: bd.email || "",
          phone: bd.phone || "",
          billingAddress: "",
          status: "Closed Won" as const,
          totalValue: invAmt,
          items: [{
            id: `item-${bd.id}`,
            productName: `Bad Debt Invoice #${bd.invoiceNumber}`,
            quantity: 1,
            rate: invAmt,
            amount: invAmt,
            gstPercent: 0,
          }],
          payment: `Due Date: ${bd.dueDate}`,
          delivery: "",
          otherTerms: bd.comments || "Bad Debt Account",
          assignedToUserId: bd.assignedToUserId || bd.createdByUserId || activeUserId,
          createdByUserId: bd.createdByUserId || activeUserId,
          notes: `[BAD DEBT] ${bd.comments || ""}`,
          createdAt: bd.createdAt || new Date().toISOString(),
          billingDetails: {
            invoiceNumber: bd.invoiceNumber,
            invoiceDate: bd.invoiceDate,
            actualDispatchDate: bd.invoiceDate,
            dispatchDate: bd.invoiceDate,
          },
          closedWonDetails: {
            customerPoNumber: bd.customerPo || "",
            poDate: bd.invoiceDate,
            dispatchDate: bd.invoiceDate,
            piNumber: "",
            freightTerm: "",
            freightChargedInBill: "No",
          },
          isBadDebtor: true,
          badDebtorRecord: {
            ...bd,
            invoiceAmount: invAmt,
            orderAmount: invAmt,
            amountReceived: totalReceived,
            pendingAmount: Math.max(0, invAmt - totalReceived),
          },
        };
      });
  }, [badDebtors, activeUserId]);

  const reminderBaseWithBadDebtors = useMemo(
    () => [...reminderBase, ...badDebtorsReminderOrders],
    [reminderBase, badDebtorsReminderOrders]
  );

  const filteredBadDebtors = useMemo(() => {
    return (badDebtors || []).filter((bd) => {
      // 1. Status Filter (pending vs fully_received)
      const totalRec = (bd.receipts || []).reduce((sum, r) => sum + (r.amount || 0), 0) || (bd.amountReceived || 0);
      const pendingAmt = Math.max(0, (bd.invoiceAmount || 0) - totalRec);

      if (badDebtorsFilter === "pending" && pendingAmt <= 0) return false;
      if (badDebtorsFilter === "fully_received" && pendingAmt > 0) return false;

      // 2. Search Term Filter
      if (!badDebtorsSearchTerm.trim()) return true;
      const term = badDebtorsSearchTerm.toLowerCase().trim();
      const salesPerson = getAssignedUserName(bd.assignedToUserId).toLowerCase();

      return (
        (bd.companyName || "").toLowerCase().includes(term) ||
        (bd.clientName || "").toLowerCase().includes(term) ||
        (bd.email || "").toLowerCase().includes(term) ||
        (bd.customerPo || "").toLowerCase().includes(term) ||
        (bd.invoiceNumber || "").toLowerCase().includes(term) ||
        (bd.status || "").toLowerCase().includes(term) ||
        (bd.comments || "").toLowerCase().includes(term) ||
        salesPerson.includes(term)
      );
    });
  }, [badDebtors, badDebtorsSearchTerm, badDebtorsFilter, users]);

  // Payment Reminder party-wise consolidation (only due today or overdue invoices, including bad debtors)
  const consolidatedReminderParties = useMemo(
    () => buildPartyMap(reminderBaseWithBadDebtors),
    [reminderBaseWithBadDebtors, paymentDetailsList]
  );

  // Sub-tabs config & state
  const allSubTabs = [
    { id: "debtors", label: "Debtors", icon: FileText, count: consolidatedDebtorParties.length },
    { id: "bad_debtors", label: "Bad Debtors", icon: AlertTriangle, count: (badDebtors || []).length },
    { id: "payment_reminder", label: "Payment Reminder", icon: BellRing, count: reminderBaseWithBadDebtors.length },
    { id: "payment_reminder_consolidated", label: "Payment Reminder Consolidated", icon: Layers, count: consolidatedReminderParties.length },
    { id: "fully_paid", label: "Fully Paid", icon: CheckCircle2, count: fullyPaidBase.length },
  ];

  const visibleTabsForPayment = visibleSubTabs?.["payment_list"] || allSubTabs.map((t) => t.id);
  const filteredSubTabs = useMemo(() => {
    return allSubTabs.filter((t) => visibleTabsForPayment.includes(t.id));
  }, [JSON.stringify(visibleTabsForPayment), reminderBaseWithBadDebtors.length, badDebtors.length, consolidatedDebtorParties.length, consolidatedReminderParties.length, fullyPaidBase.length]);

  const [activeSubTab, setActiveSubTab] = useState<string>(filteredSubTabs[0]?.id || "debtors");

  useEffect(() => {
    if (filteredSubTabs.length > 0 && !filteredSubTabs.some((t) => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubTabs[0].id);
    }
  }, [filteredSubTabs, activeSubTab]);

  // Auto-select template if available (prefer payment_reminder template)
  useEffect(() => {
    if (emailTemplates.length > 0 && !selectedTemplateId) {
      const reminderTmpl =
        emailTemplates.find((t) => t.assignedForm === "payment_reminder") ||
        emailTemplates.find((t) => t.isDefault) ||
        emailTemplates[0];
      setSelectedTemplateId(reminderTmpl.id);
    }
  }, [emailTemplates, selectedTemplateId]);

  // Handlers for Consolidated Payment Reminder Email Modal
  const openConsolidatedEmailModal = (party: typeof consolidatedReminderParties[0]) => {
    const matchedTmpl =
      emailTemplates.find((t) => t.assignedForm === "payment_reminder_consolidated") ||
      emailTemplates.find((t) => t.assignedForm === "payment_reminder") ||
      emailTemplates.find((t) => t.isDefault) ||
      emailTemplates[0];

    const tmplId = matchedTmpl?.id || "";
    setConsolidatedTemplateId(tmplId);
    setConsolidatedEmailParty(party);

    const invTableHtml = generateConsolidatedInvoiceTableHTML(party.orders, paymentDetailsList);
    const todayFormatted = formatDate(new Date().toISOString());

    const replaceVars = (text: string) => {
      if (!text) return "";
      return replaceTemplateVars(text, {
        companyName: party.companyName,
        clientName: party.clientName,
        email: party.email,
        phone: party.phone,
        totalPendingAmount: party.totalPendingAmount,
        invoiceCount: party.invoiceCount,
        invoiceTable: invTableHtml,
        todayDate: todayFormatted,
        creatorName: activeUser.name,
        creatorEmail: activeUser.email,
        currentUserEmail: activeUser.email,
      });
    };

    let defaultSub = `Consolidated Payment Reminder Notice - ${party.companyName} (Outstanding: ₹${formatIndianNumber(party.totalPendingAmount)})`;
    let defaultBody = `Dear ${party.clientName || party.companyName},\n\nWe hope this email finds you well.\n\nThis is a consolidated payment reminder regarding pending invoices for ${party.companyName}.\n\nBelow is the invoice-wise details of your pending balance:\n\n${invTableHtml}\n\nConsolidated Total Pending Amount: ₹${formatIndianNumber(party.totalPendingAmount)}\n\nKindly review and process the pending payment at your earliest convenience. If payment has already been remitted, please share the UTR / transaction receipt details.\n\nThank you for your cooperation!`;

    if (matchedTmpl) {
      defaultSub = matchedTmpl.subject ? replaceVars(matchedTmpl.subject) : defaultSub;
      defaultBody = matchedTmpl.body ? replaceVars(matchedTmpl.body) : defaultBody;
    }

    setConsolidatedTo(matchedTmpl?.to ? replaceVars(matchedTmpl.to) : party.email);
    setConsolidatedCc(matchedTmpl?.cc ? replaceVars(matchedTmpl.cc) : "");
    setConsolidatedBcc(matchedTmpl?.bcc ? replaceVars(matchedTmpl.bcc) : "");
    setConsolidatedSubject(defaultSub);
    setConsolidatedBody(defaultBody);
    setConsolidatedPreviewMode("edit");
  };

  const handleConsolidatedTemplateChange = (tmplId: string) => {
    setConsolidatedTemplateId(tmplId);
    if (!consolidatedEmailParty) return;

    const matchedTmpl = emailTemplates.find((t) => t.id === tmplId);
    if (!matchedTmpl) return;

    const invTableHtml = generateConsolidatedInvoiceTableHTML(consolidatedEmailParty.orders, paymentDetailsList);
    const todayFormatted = formatDate(new Date().toISOString());

    const replaceVars = (text: string) => {
      if (!text) return "";
      return replaceTemplateVars(text, {
        companyName: consolidatedEmailParty.companyName,
        clientName: consolidatedEmailParty.clientName,
        email: consolidatedEmailParty.email,
        phone: consolidatedEmailParty.phone,
        totalPendingAmount: consolidatedEmailParty.totalPendingAmount,
        invoiceCount: consolidatedEmailParty.invoiceCount,
        invoiceTable: invTableHtml,
        todayDate: todayFormatted,
        creatorName: activeUser.name,
        creatorEmail: activeUser.email,
        currentUserEmail: activeUser.email,
      });
    };

    if (matchedTmpl.to) setConsolidatedTo(replaceVars(matchedTmpl.to));
    if (matchedTmpl.cc) setConsolidatedCc(replaceVars(matchedTmpl.cc));
    if (matchedTmpl.bcc) setConsolidatedBcc(replaceVars(matchedTmpl.bcc));
    if (matchedTmpl.subject) setConsolidatedSubject(replaceVars(matchedTmpl.subject));
    if (matchedTmpl.body) setConsolidatedBody(replaceVars(matchedTmpl.body));
  };

  const handleSendConsolidatedEmail = async () => {
    if (!consolidatedEmailParty) return;
    if (!consolidatedTo.trim()) {
      alert("Please specify a recipient email address (To).");
      return;
    }

    setIsSendingConsolidatedEmail(true);
    try {
      const cleanEmailList = (str: string) => str.split(/[,;]/).map((s) => s.trim()).filter(Boolean).join(", ");
      const toClean = cleanEmailList(consolidatedTo);
      const ccClean = consolidatedCc ? cleanEmailList(consolidatedCc) : undefined;
      const bccClean = consolidatedBcc ? cleanEmailList(consolidatedBcc) : undefined;

      const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(consolidatedBody);

      const emailResult = await dispatchSystemEmail({
        to: toClean,
        cc: ccClean,
        bcc: bccClean,
        subject: consolidatedSubject,
        text: formattedHtml,
        html: formattedHtml,
        htmlBody: formattedHtml,
        plainText: formattedText,
        senderUserId: activeUser?.id,
        senderUserName: activeUser?.name,
        senderEmail: activeUser?.email,
        fromName: `${activeUser?.name || "Sales Portal"} - Aroma Organics`,
        replyTo: activeUser?.email,
        category: "payment_reminder_consolidated",
        companyName: consolidatedEmailParty.companyName,
      });

      if (!emailResult.ok) {
        throw new Error(emailResult.message || "Failed to send consolidated payment reminder email.");
      }

      for (let i = 0; i < consolidatedEmailParty.orders.length; i++) {
        const order = consolidatedEmailParty.orders[i];
        const newSummary: EmailSentStatusSummary = {
          to: toClean,
          cc: ccClean,
          bcc: bccClean,
          status: "Sent",
          timestamp: new Date().toISOString(),
          subject: consolidatedSubject,
          sentByUserName: activeUser?.name,
        };

        if (onEditOrder) {
          await onEditOrder({
            ...order,
            paymentReminderEmailStatus: newSummary,
          });
        }

        await saveLog({
          id: `log-consolidated-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Send Email",
          targetType: "Order",
          targetId: order.id,
          targetName: order.companyName || order.clientName || "Order",
          details: `Sent Consolidated Payment Reminder email to ${consolidatedEmailParty.companyName} (${toClean}) covering ${consolidatedEmailParty.invoiceCount} invoices for total pending ₹${formatIndianNumber(consolidatedEmailParty.totalPendingAmount)}`,
        });
      }

      setSendSuccessMsg(
        `Successfully sent consolidated payment reminder email to ${consolidatedEmailParty.companyName} (${toClean})!`
      );
      setConsolidatedEmailParty(null);
    } catch (err: any) {
      console.error("Error sending consolidated payment reminder:", err);
      alert(`Failed to send consolidated payment reminder email: ${err.message || "Please check configuration and try again."}`);
    } finally {
      setIsSendingConsolidatedEmail(false);
    }
  };

  // Filter for Debtors (Excludes Fully Paid)
  const debtorsOrders = debtorsBase.filter((order) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
    const assignedName = getAssignedUserName(order.assignedToUserId).toLowerCase();
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      assignedName.includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
      pDetails?.utrId?.toLowerCase().includes(term) ||
      pDetails?.paymentStatus?.toLowerCase().includes(term)
    );
  });

  // Filter for Debtors Consolidated Party-wise (All Unpaid Invoices)
  const filteredConsolidatedDebtors = useMemo(() => {
    if (!searchTerm.trim()) return consolidatedDebtorParties;
    const term = searchTerm.toLowerCase();
    return consolidatedDebtorParties.filter((p) => {
      const matchParty =
        p.companyName.toLowerCase().includes(term) ||
        p.clientName.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.phone.toLowerCase().includes(term) ||
        getPartySalesPersons(p.orders).toLowerCase().includes(term);

      const matchInvoice = p.orders.some(
        (o) => {
          const pDetails = getPaymentDetailsForOrder(o, paymentDetailsList);
          const assignedName = getAssignedUserName(o.assignedToUserId).toLowerCase();
          return (
            assignedName.includes(term) ||
            o.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
            o.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
            pDetails?.utrId?.toLowerCase().includes(term) ||
            pDetails?.paymentStatus?.toLowerCase().includes(term)
          );
        }
      );

      return matchParty || matchInvoice;
    });
  }, [consolidatedDebtorParties, searchTerm, paymentDetailsList]);

  // Filter for Payment Reminder (Only Due Today or Overdue by 1+ days, including bad debtors)
  const reminderOrders = reminderBaseWithBadDebtors.filter((order) => {
    if (!reminderSearchTerm.trim()) return true;
    const term = reminderSearchTerm.toLowerCase();
    const assignedName = getAssignedUserName(order.assignedToUserId).toLowerCase();
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      assignedName.includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term)
    );
  });

  // Filter for Fully Paid (Only Fully Paid)
  const fullyPaidOrders = fullyPaidBase.filter((order) => {
    if (!fullyPaidSearchTerm.trim()) return true;
    const term = fullyPaidSearchTerm.toLowerCase();
    const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
    const assignedName = getAssignedUserName(order.assignedToUserId).toLowerCase();
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      assignedName.includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
      pDetails?.utrId?.toLowerCase().includes(term) ||
      pDetails?.paymentStatus?.toLowerCase().includes(term)
    );
  });

  // Filter for Consolidated Payment Reminders (Only Due Today or Overdue by 1+ days)
  const filteredConsolidatedParties = useMemo(() => {
    if (!consolidatedSearchTerm.trim()) return consolidatedReminderParties;
    const term = consolidatedSearchTerm.toLowerCase();
    return consolidatedReminderParties.filter((p) => {
      const matchParty =
        p.companyName.toLowerCase().includes(term) ||
        p.clientName.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.phone.toLowerCase().includes(term) ||
        getPartySalesPersons(p.orders).toLowerCase().includes(term);

      const matchInvoice = p.orders.some(
        (o) =>
          getAssignedUserName(o.assignedToUserId).toLowerCase().includes(term) ||
          o.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
          o.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term)
      );

      return matchParty || matchInvoice;
    });
  }, [consolidatedReminderParties, consolidatedSearchTerm]);

  // Consolidated Email Template Auto-Selection Effect
  useEffect(() => {
    if (emailTemplates.length > 0 && !selectedConsolidatedTemplateId) {
      const matched =
        emailTemplates.find((t) => t.assignedForm === "payment_reminder_consolidated") ||
        emailTemplates.find((t) => t.assignedForm === "payment_reminder") ||
        emailTemplates.find((t) => t.isDefault) ||
        emailTemplates[0];
      if (matched) {
        setSelectedConsolidatedTemplateId(matched.id);
      }
    }
  }, [emailTemplates, selectedConsolidatedTemplateId]);

  // Consolidated Selection Helpers
  const toggleSelectConsolidatedParty = (partyKey: string) => {
    setSelectedConsolidatedPartyKeys((prev) => ({
      ...prev,
      [partyKey]: !prev[partyKey],
    }));
  };

  const selectedConsolidatedParties = useMemo(() => {
    return filteredConsolidatedParties.filter((p) => selectedConsolidatedPartyKeys[p.partyKey]);
  }, [filteredConsolidatedParties, selectedConsolidatedPartyKeys]);

  const selectedConsolidatedCount = selectedConsolidatedParties.length;
  const allConsolidatedSelected =
    filteredConsolidatedParties.length > 0 &&
    filteredConsolidatedParties.every((p) => selectedConsolidatedPartyKeys[p.partyKey]);

  const toggleSelectAllConsolidatedParties = () => {
    if (allConsolidatedSelected) {
      setSelectedConsolidatedPartyKeys({});
    } else {
      const next: Record<string, boolean> = {};
      filteredConsolidatedParties.forEach((p) => {
        next[p.partyKey] = true;
      });
      setSelectedConsolidatedPartyKeys(next);
    }
  };

  // Bulk Consolidated Payment Reminders Handler
  const handleSendBulkConsolidatedReminders = async () => {
    if (selectedConsolidatedParties.length === 0) return;

    setIsSendingConsolidatedBulkEmail(true);
    setSendSuccessMsg(null);

    const template = emailTemplates.find((t) => t.id === selectedConsolidatedTemplateId);
    const tmplName = template?.name || "Consolidated Payment Reminder";

    try {
      let sentCount = 0;
      let totalPendingSent = 0;

      for (let i = 0; i < selectedConsolidatedParties.length; i++) {
        const party = selectedConsolidatedParties[i];
        const invTableHtml = generateConsolidatedInvoiceTableHTML(party.orders, paymentDetailsList);
        const todayFormatted = formatDate(new Date().toISOString());

        const replaceVars = (text: string) => {
          if (!text) return "";
          return replaceTemplateVars(text, {
            companyName: party.companyName,
            clientName: party.clientName,
            email: party.email,
            phone: party.phone,
            totalPendingAmount: party.totalPendingAmount,
            invoiceCount: party.invoiceCount,
            invoiceTable: invTableHtml,
            todayDate: todayFormatted,
            creatorName: activeUser.name,
            creatorEmail: activeUser.email,
            currentUserEmail: activeUser.email,
          });
        };

        let subject = template?.subject
          ? replaceVars(template.subject)
          : `Consolidated Payment Reminder Notice - ${party.companyName} (Outstanding: ₹${formatIndianNumber(party.totalPendingAmount)})`;

        let body = template?.body
          ? replaceVars(template.body)
          : `Dear ${party.clientName || party.companyName},\n\nWe hope this email finds you well.\n\nThis is a consolidated payment reminder regarding pending invoices for ${party.companyName}.\n\nBelow is the invoice-wise details of your pending balance:\n\n${invTableHtml}\n\nConsolidated Total Pending Amount: ₹${formatIndianNumber(party.totalPendingAmount)}\n\nKindly review and process the pending payment at your earliest convenience. If payment has already been remitted, please share the UTR / transaction receipt details.\n\nThank you for your cooperation!`;

        const cleanEmailList = (str: string) => str.split(/[,;]/).map((s) => s.trim()).filter(Boolean).join(", ");
        const toClean = template?.to ? cleanEmailList(replaceVars(template.to)) : party.email;
        const ccClean = template?.cc ? cleanEmailList(replaceVars(template.cc)) : undefined;
        const bccClean = template?.bcc ? cleanEmailList(replaceVars(template.bcc)) : undefined;

        if (!toClean) {
          console.warn(`Skipping party ${party.companyName} - no recipient email address available.`);
          continue;
        }

        const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(body);

        const emailResult = await dispatchSystemEmail({
          to: toClean,
          cc: ccClean,
          bcc: bccClean,
          subject: subject,
          text: formattedHtml,
          html: formattedHtml,
          htmlBody: formattedHtml,
          plainText: formattedText,
          senderUserId: activeUser?.id,
          senderUserName: activeUser?.name,
          senderEmail: activeUser?.email,
          fromName: `${activeUser?.name || "Sales Portal"} - Aroma Organics`,
          replyTo: activeUser?.email,
          category: "payment_reminder_consolidated",
          companyName: party.companyName,
        });

        if (!emailResult.ok) {
          throw new Error(emailResult.message || "Failed to send consolidated payment reminder email.");
        }

        for (let j = 0; j < party.orders.length; j++) {
          const order = party.orders[j];
          const newSummary: EmailSentStatusSummary = {
            to: toClean,
            cc: ccClean,
            bcc: bccClean,
            status: "Sent",
            timestamp: new Date().toISOString(),
            subject: subject,
            sentByUserName: activeUser?.name,
          };

          if (onEditOrder) {
            await onEditOrder({
              ...order,
              paymentReminderEmailStatus: newSummary,
            });
          }

          await saveLog({
            id: `log-bulk-consolidated-${Date.now()}-${i}-${j}`,
            timestamp: new Date().toISOString(),
            userId: activeUser.id,
            userName: activeUser.name,
            actionType: "Send Email",
            targetType: "Order",
            targetId: order.id,
            targetName: order.companyName || order.clientName || "Order",
            details: `Sent Bulk Consolidated Payment Reminder email using template "${tmplName}" to ${party.companyName} (${toClean}) covering ${party.invoiceCount} invoices for total pending ₹${formatIndianNumber(party.totalPendingAmount)}`,
          });
        }

        sentCount++;
        totalPendingSent += party.totalPendingAmount;
      }

      setSendSuccessMsg(
        `Successfully sent ${sentCount} consolidated payment reminder email${
          sentCount === 1 ? "" : "s"
        } (Total Pending: ₹${formatIndianNumber(totalPendingSent)}) using template "${tmplName}"!`
      );
      setSelectedConsolidatedPartyKeys({});
    } catch (err: any) {
      console.error("Error sending bulk consolidated payment reminders:", err);
      alert(`Failed to send bulk consolidated payment reminders: ${err.message || "Please check configuration and try again."}`);
    } finally {
      setIsSendingConsolidatedBulkEmail(false);
    }
  };

  const currentPaymentDetails = useMemo(() => {
    if (!editingPaymentOrder) return null;
    return getPaymentDetailsForOrder(editingPaymentOrder, paymentDetailsList) || null;
  }, [paymentDetailsList, editingPaymentOrder]);

  const orderReceipts = useMemo(() => {
    if (!currentPaymentDetails?.receipts) return [];
    return [...currentPaymentDetails.receipts].sort((a, b) =>
      (b.paymentReceivedDate || b.createdAt || "").localeCompare(a.paymentReceivedDate || a.createdAt || "")
    );
  }, [currentPaymentDetails]);

  // Open Payment Details Update Modal
  const openPaymentModal = (order: OrderOffer) => {
    const existingP = getPaymentDetailsForOrder(order, paymentDetailsList);
    const orderTotal = getOrderTotalInvoiceAmount(order);
    const receipts = existingP?.receipts || [];
    const receiptsSum = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);

    const initialReceived = receipts.length > 0 ? receiptsSum : (existingP ? existingP.amountReceived : 0);
    const initialPending = Math.max(0, orderTotal - initialReceived);

    setPreviousAmountReceived(initialReceived);

    let initialStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
    if (existingP?.paymentStatus) {
      const s = existingP.paymentStatus.toLowerCase();
      if (s.includes("fully") || s === "paid") initialStatus = "Fully paid";
      else if (s.includes("partial")) initialStatus = "Partial paid";
      else initialStatus = "Unpaid";
    } else {
      if (initialReceived >= orderTotal && orderTotal > 0) initialStatus = "Fully paid";
      else if (initialReceived > 0) initialStatus = "Partial paid";
      else initialStatus = "Unpaid";
    }

    setPaymentForm({
      amountReceived: initialReceived.toString(),
      lastEnteredAmount: "0",
      pendingAmount: initialPending.toString(),
      paymentStatus: initialStatus,
      paymentReceivedDate: new Date().toISOString().split("T")[0],
      utrId: "",
      comments: existingP?.comments || "",
    });
    setEditingPaymentOrder(order);
  };

  // Add a new individual payment receipt record directly to paymentDetails.receipts
  const handleAddPaymentReceipt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingPaymentOrder) return;

    const entryAmt = parseFloat(paymentForm.lastEnteredAmount) || 0;
    if (entryAmt <= 0) {
      alert("Please enter a valid payment amount greater than 0.");
      return;
    }

    setIsSavingPayment(true);
    try {
      const existingP = getPaymentDetailsForOrder(editingPaymentOrder, paymentDetailsList);
      const existingReceipts = existingP?.receipts || [];

      const currentInvoiceNum = editingPaymentOrder.billingDetails?.invoiceNumber || editingPaymentOrder.id;

      const newReceipt: PaymentReceiptRecord = {
        id: `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        orderId: editingPaymentOrder.id,
        invoiceNumber: currentInvoiceNum,
        amount: entryAmt,
        paymentReceivedDate: paymentForm.paymentReceivedDate || new Date().toISOString().split("T")[0],
        utrId: paymentForm.utrId.trim(),
        comments: paymentForm.comments.trim(),
        createdAt: new Date().toISOString(),
        createdBy: activeUser.name || activeUser.email || "System",
      };

      const updatedReceipts = [...existingReceipts, newReceipt];
      const totalReceived = updatedReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

      const orderTotal = getOrderTotalInvoiceAmount(editingPaymentOrder);
      const pendAmt = Math.max(0, orderTotal - totalReceived);

      let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
      if (totalReceived >= orderTotal && orderTotal > 0) autoStatus = "Fully paid";
      else if (totalReceived > 0) autoStatus = "Partial paid";

      const record: PaymentDetails = {
        id: editingPaymentOrder.id,
        orderId: editingPaymentOrder.id,
        invoiceNumber: currentInvoiceNum,
        amountReceived: totalReceived,
        lastEnteredAmount: entryAmt,
        pendingAmount: pendAmt,
        paymentStatus: autoStatus,
        paymentReceivedDate: paymentForm.paymentReceivedDate,
        utrId: paymentForm.utrId.trim(),
        comments: paymentForm.comments.trim(),
        receipts: updatedReceipts,
        updatedAt: new Date().toISOString(),
        updatedByUserId: activeUser.id,
        updatedByUserName: activeUser.name,
      };

      await savePaymentDetails(record);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Add Payment Receipt",
        targetType: "Order",
        targetId: editingPaymentOrder.id,
        targetName: editingPaymentOrder.companyName || editingPaymentOrder.clientName || "Order",
        details: `Saved Payment Receipt for Invoice #${editingPaymentOrder.billingDetails?.invoiceNumber}: Amount=₹${formatIndianNumber(entryAmt)}, Date=${paymentForm.paymentReceivedDate}, UTR=${paymentForm.utrId || "N/A"}. Total Received=₹${formatIndianNumber(totalReceived)}`,
      });

      setPaymentSaveSuccess(`Payment record of ₹${formatIndianNumber(entryAmt)} added successfully!`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);

      setPaymentForm((prev) => ({
        ...prev,
        lastEnteredAmount: "0",
        amountReceived: totalReceived.toString(),
        pendingAmount: pendAmt.toString(),
        paymentStatus: autoStatus,
        utrId: "",
        comments: "",
      }));
      setPreviousAmountReceived(totalReceived);
    } catch (err: any) {
      console.error("Error saving payment receipt record:", err);
      alert(`Failed to save payment receipt: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Delete a payment receipt record from paymentDetails.receipts
  const handleDeletePaymentReceipt = async (receiptId: string) => {
    if (!editingPaymentOrder) return;
    if (!window.confirm("Are you sure you want to delete this payment receipt record?")) return;

    setIsSavingPayment(true);
    try {
      const existingP = getPaymentDetailsForOrder(editingPaymentOrder, paymentDetailsList);
      const existingReceipts = existingP?.receipts || [];
      const recToDelete = existingReceipts.find((r) => r.id === receiptId);

      const remainingReceipts = existingReceipts.filter((r) => r.id !== receiptId);
      const newTotalReceived = remainingReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
      const orderTotal = getOrderTotalInvoiceAmount(editingPaymentOrder);
      const pendAmt = Math.max(0, orderTotal - newTotalReceived);

      let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
      if (newTotalReceived >= orderTotal && orderTotal > 0) autoStatus = "Fully paid";
      else if (newTotalReceived > 0) autoStatus = "Partial paid";

      const record: PaymentDetails = {
        id: editingPaymentOrder.id,
        orderId: editingPaymentOrder.id,
        amountReceived: newTotalReceived,
        lastEnteredAmount: 0,
        pendingAmount: pendAmt,
        paymentStatus: autoStatus,
        paymentReceivedDate: remainingReceipts[0]?.paymentReceivedDate || new Date().toISOString().split("T")[0],
        utrId: remainingReceipts[0]?.utrId || "",
        comments: remainingReceipts[0]?.comments || "",
        receipts: remainingReceipts,
        updatedAt: new Date().toISOString(),
        updatedByUserId: activeUser.id,
        updatedByUserName: activeUser.name,
      };

      await savePaymentDetails(record);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Delete Payment Record",
        targetType: "Order",
        targetId: editingPaymentOrder.id,
        targetName: editingPaymentOrder.companyName || editingPaymentOrder.clientName || "Order",
        details: `Deleted Payment Receipt ID ${receiptId} (Amount: ₹${formatIndianNumber(recToDelete?.amount || 0)}). New Total Received=₹${formatIndianNumber(newTotalReceived)}`,
      });

      setPaymentSaveSuccess(`Payment record deleted successfully.`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);

      setPaymentForm((prev) => ({
        ...prev,
        lastEnteredAmount: "0",
        amountReceived: newTotalReceived.toString(),
        pendingAmount: pendAmt.toString(),
        paymentStatus: autoStatus,
      }));
      setPreviousAmountReceived(newTotalReceived);
    } catch (err: any) {
      console.error("Error deleting payment receipt:", err);
      alert(`Failed to delete payment receipt: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Save Payment Details to Firestore "payment_details" collection
  const handleSavePaymentDetails = async () => {
    if (!editingPaymentOrder) return;

    const lastAmt = parseFloat(paymentForm.lastEnteredAmount) || 0;
    if (lastAmt > 0) {
      await handleAddPaymentReceipt();
      setEditingPaymentOrder(null);
      return;
    }

    setIsSavingPayment(true);
    setPaymentSaveSuccess(null);

    try {
      const amtRec = parseFloat(paymentForm.amountReceived) || 0;
      const pendAmt = parseFloat(paymentForm.pendingAmount) || 0;
      const existingP = getPaymentDetailsForOrder(editingPaymentOrder, paymentDetailsList);

      const record: PaymentDetails = {
        id: editingPaymentOrder.id,
        orderId: editingPaymentOrder.id,
        invoiceNumber: editingPaymentOrder.billingDetails?.invoiceNumber || editingPaymentOrder.id,
        amountReceived: amtRec,
        lastEnteredAmount: 0,
        pendingAmount: pendAmt,
        paymentStatus: paymentForm.paymentStatus,
        paymentReceivedDate: paymentForm.paymentReceivedDate,
        utrId: paymentForm.utrId.trim(),
        comments: paymentForm.comments.trim(),
        receipts: existingP?.receipts || [],
        updatedAt: new Date().toISOString(),
        updatedByUserId: activeUser.id,
        updatedByUserName: activeUser.name,
      };

      await savePaymentDetails(record);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Payment Details",
        targetType: "Order",
        targetId: editingPaymentOrder.id,
        targetName: editingPaymentOrder.companyName || editingPaymentOrder.clientName || "Order",
        details: `Updated Payment Summary for Invoice #${editingPaymentOrder.billingDetails?.invoiceNumber}: Status=${paymentForm.paymentStatus}, Total Received=₹${formatIndianNumber(amtRec)}, Pending=₹${formatIndianNumber(pendAmt)}`,
      });

      setPaymentSaveSuccess(`Payment details for ${editingPaymentOrder.clientName} updated successfully!`);
      setEditingPaymentOrder(null);

      setTimeout(() => {
        setPaymentSaveSuccess(null);
      }, 4000);
    } catch (err: any) {
      console.error("Error saving payment details:", err);
      alert(`Failed to save payment details: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Checkbox Select All logic for Payment Reminder
  const allSelected =
    reminderOrders.length > 0 &&
    reminderOrders.every((o) => selectedOrderIds[o.id]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrderIds({});
    } else {
      const newSel: { [key: string]: boolean } = {};
      reminderOrders.forEach((o) => {
        newSel[o.id] = true;
      });
      setSelectedOrderIds(newSel);
    }
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const selectedCount = Object.keys(selectedOrderIds).filter(
    (id) => selectedOrderIds[id]
  ).length;

  // Send Email Reminder Handler
  const handleSendPaymentReminders = async () => {
    const selectedList = reminderOrders.filter((o) => selectedOrderIds[o.id]);
    if (selectedList.length === 0) return;

    setIsSendingEmail(true);
    setSendSuccessMsg(null);

    const template = emailTemplates.find((t) => t.id === selectedTemplateId);
    const tmplName = template?.name || "Payment Reminder Notification";

    try {
      for (let i = 0; i < selectedList.length; i++) {
        const order = selectedList[i];
        const actualDispatchDate = getOrderActualDispatchDate(order);
        const dueInfo = calculateDueDate(
          actualDispatchDate,
          order.payment
        );

        const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
        const totalAmt = getOrderTotalInvoiceAmount(order);
        const amtReceived = pDetails ? pDetails.amountReceived : 0;
        const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - amtReceived);
        let pStatus = pDetails?.paymentStatus || "Unpaid";
        if (!pDetails) {
          if (amtReceived >= totalAmt && totalAmt > 0) pStatus = "Fully paid";
          else if (amtReceived > 0) pStatus = "Partial paid";
          else pStatus = "Unpaid";
        }

        let subject = template?.subject || `Payment Reminder: Invoice #${order.billingDetails?.invoiceNumber}`;
        let body = template?.body || `Dear ${order.clientName},\n\nThis is a friendly reminder that invoice #${order.billingDetails?.invoiceNumber} for total amount ₹${formatIndianNumber(totalAmt)} (Received: ₹${formatIndianNumber(amtReceived)}, Pending: ₹${formatIndianNumber(pendingAmt)}) is due on ${dueInfo.dueDateFormatted}.\n\nThank you for your business!`;

        const hierarchy = resolveUserHierarchyInfo(activeUser.id, order.assignedToUserId, users);

        const replaceAllVars = (str: string) => {
          return replaceTemplateVars(str, {
            recordId: order.id,
            clientName: order.clientName,
            companyName: order.companyName,
            email: order.email || "",
            phone: order.phone || "",
            billingAddress: order.billingAddress || "",
            status: order.status,
            totalValue: totalAmt,
            amountReceived: amtReceived,
            pendingAmount: pendingAmt,
            paymentStatus: pStatus,
            dueDate: dueInfo.dueDateFormatted,
            invoiceNumber: order.billingDetails?.invoiceNumber || "",
            invoiceFileLink: order.billingDetails?.invoiceFileUrl || "",
            customerPoNumber: order.closedWonDetails?.customerPoNumber || "",
            payment: order.payment || "",
            paymentTermsOffer: order.paymentTermsOffer || "",
            paymentCreditPeriod: order.paymentCreditPeriod || "",
            dispatchDate: actualDispatchDate ? formatDate(actualDispatchDate) : "",
            ...hierarchy,
          });
        };

        subject = replaceAllVars(subject);
        body = replaceAllVars(body);

        const cleanEmailList = (str: string) => {
          return str.split(/[,;]/).map(s => s.trim()).filter(Boolean).join(", ");
        };

        const dynamicTo = cleanEmailList(template?.to ? replaceAllVars(template.to) : (order.email || ""));
        const dynamicCc = template?.cc ? cleanEmailList(replaceAllVars(template.cc)) : undefined;
        const dynamicBcc = template?.bcc ? cleanEmailList(replaceAllVars(template.bcc)) : undefined;

        if (!dynamicTo) {
          throw new Error(`No recipient email found for client ${order.clientName || order.companyName}`);
        }

        const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(body);

        const emailResult = await dispatchSystemEmail({
          orderId: order.id,
          companyName: order.companyName,
          clientName: order.clientName,
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          subject,
          text: formattedHtml,
          html: formattedHtml,
          htmlBody: formattedHtml,
          plainText: formattedText,
          senderUserId: activeUser?.id,
          senderUserName: activeUser?.name,
          senderEmail: activeUser?.email,
          fromName: `${activeUser?.name || "Sales Portal"} - Aroma Organics`,
          replyTo: activeUser?.email,
          category: "payment_reminder"
        });

        const deliveryStatus: EmailDeliveryStatus = (emailResult.ok && emailResult.deliveryStatus !== "Failed") ? "Sent" : "Failed";

        const newSummary: EmailSentStatusSummary = {
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          status: deliveryStatus,
          timestamp: new Date().toISOString(),
          subject,
          error: emailResult.ok ? undefined : emailResult.message,
          sentByUserName: activeUser?.name,
        };

        onEditOrder({
          ...order,
          paymentReminderEmailStatus: newSummary,
        });

        if (!emailResult.ok || deliveryStatus === "Failed") {
          throw new Error(emailResult.message || "Failed to send payment reminder email.");
        }

        await saveLog({
          id: `log-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Send Email",
          targetType: "Order",
          targetId: order.id,
          targetName: order.companyName || order.clientName || "Order",
          details: `Sent Payment Reminder using template "${tmplName}" to ${order.clientName} (${order.email || "N/A"}) for Invoice #${order.billingDetails?.invoiceNumber} (Due: ${dueInfo.dueDateFormatted})`,
        });
      }

      setSendSuccessMsg(
        `Successfully sent ${selectedList.length} payment reminder email${
          selectedList.length === 1 ? "" : "s"
        } using template "${tmplName}"!`
      );
      setSelectedOrderIds({});
    } catch (err: any) {
      console.error("Error sending payment reminders:", err);
      alert(`Failed to send payment reminders: ${err.message || "Please try again."}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Helper function to calculate overdue days from due date string
  const computeOverdueDays = (dueDateStr: string): number => {
    if (!dueDateStr) return 0;
    const due = new Date(dueDateStr);
    if (isNaN(due.getTime())) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
    return Math.max(0, diffDays);
  };

  // Parsed and validated bulk rows for Bad Debtors
  const parsedBadDebtorImportRows = useMemo(() => {
    if (!badDebtorsImportText.trim()) return [];

    const parseResult = Papa.parse<Record<string, string>>(badDebtorsImportText.trim(), {
      header: true,
      skipEmptyLines: "greedy",
    });

    let rowsData = parseResult.data || [];
    if (rowsData.length === 0) return [];

    return rowsData.map((row, index) => {
      const getVal = (keys: string[]) => {
        const normKeys = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
        for (const [k, v] of Object.entries(row)) {
          const normKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normKeys.includes(normKey) && v !== undefined && v !== null) {
            return String(v).trim();
          }
        }
        return "";
      };

      const companyName = getVal(["companyname", "company", "partyname", "customername"]);
      const clientName = getVal(["clientname", "contactname", "contact", "person"]);
      const email = getVal(["email", "clientemail", "emailaddress"]);
      const phone = getVal(["phone", "mobile", "contactnumber"]);
      const customerPo = getVal(["customerpo", "ponumber", "po", "custpo"]);
      const invoiceNumber = getVal(["invoicenumber", "invoiceno", "billnumber", "billno"]);
      const invoiceDate = getVal(["invoicedate", "billdate", "date"]) || new Date().toISOString().split("T")[0];
      const rawAmt = getVal(["invoiceamount", "invoiceamt", "amount", "orderamount", "totalamount", "billamount", "value", "ordervalue"]);
      const dueDate = getVal(["duedate", "paymentduedate"]) || new Date().toISOString().split("T")[0];
      const rawOverdue = getVal(["overduedays", "overdue", "days"]);
      const comments = getVal(["comments", "remarks", "notes"]);
      const statusRaw = getVal(["status", "baddebtstatus"]) || "Bad Debt";

      const invoiceAmount = parseFloat(rawAmt.replace(/[^0-9.]/g, "")) || 0;
      const overdueDays = parseInt(rawOverdue, 10) || computeOverdueDays(dueDate);

      let validationError = "";
      if (!companyName) validationError = "Company Name missing";
      else if (!invoiceNumber) validationError = "Invoice Number missing";
      else if (invoiceAmount <= 0) validationError = "Invalid Invoice Amount";

      return {
        rowIndex: index + 1,
        companyName,
        clientName,
        email,
        phone,
        customerPo,
        invoiceNumber,
        invoiceDate,
        invoiceAmount,
        orderAmount: invoiceAmount,
        dueDate,
        overdueDays,
        comments,
        status: (["Bad Debt", "Written Off", "In Recovery", "Paid"].includes(statusRaw) ? statusRaw : "Bad Debt") as any,
        isValid: !validationError,
        validationError,
      };
    });
  }, [badDebtorsImportText]);

  // Execute Bad Debtors Bulk Import
  const handleExecuteBadDebtorsBulkImport = async () => {
    const validRows = parsedBadDebtorImportRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert("No valid bad debtor rows found to import.");
      return;
    }

    setIsSavingBadDebtorsImport(true);
    try {
      let importedCount = 0;
      for (const row of validRows) {
        const bdRecord: BadDebtor = {
          id: `bd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: row.companyName,
          clientName: row.clientName,
          email: row.email,
          phone: row.phone,
          customerPo: row.customerPo,
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate,
          invoiceAmount: row.invoiceAmount,
          orderAmount: row.invoiceAmount,
          dueDate: row.dueDate,
          overdueDays: row.overdueDays,
          comments: row.comments || "Bulk Imported Bad Debt Details",
          status: row.status,
          amountReceived: 0,
          pendingAmount: row.invoiceAmount,
          createdAt: new Date().toISOString(),
          createdByUserId: activeUser.id,
          createdByUserName: activeUser.name,
        };

        await saveBadDebtor(bdRecord);
        importedCount++;
      }

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Bulk Import Bad Debtors",
        targetType: "BadDebtors",
        targetId: "bulk-import",
        targetName: "Bad Debtors Collection",
        details: `Successfully bulk imported ${importedCount} Bad Debtor record(s).`,
      });

      setPaymentSaveSuccess(`Successfully bulk imported ${importedCount} bad debtor record(s)!`);
      setTimeout(() => setPaymentSaveSuccess(null), 5000);

      setBadDebtorsImportText("");
      setBadDebtorsImportFileName("");
      setShowBadDebtorsImportModal(false);
    } catch (err: any) {
      console.error("Error bulk importing bad debtors:", err);
      alert(`Bulk import failed: ${err.message || "Please check CSV data format."}`);
    } finally {
      setIsSavingBadDebtorsImport(false);
    }
  };

  // Helper for downloading Sample Bad Debtors CSV
  const handleDownloadBadDebtorsSampleCSV = () => {
    const csvContent =
      "Company Name,Client Name,Email,Phone,Customer PO,Invoice Number,Invoice Date,Invoice Amount,Due Date,Overdue Days,Comments,Status\n" +
      "Acme Supplies Ltd,John Doe,john@acme.com,+919876543210,PO-2025-984,INV-2025-088,2025-01-10,125000,2025-02-10,180,Account defaulted payment repeatedly,Bad Debt\n" +
      "Beta Enterprises,Jane Smith,jane@beta.com,+919876543211,PO-2025-102,INV-2025-092,2025-02-01,85000,2025-03-01,150,In legal recovery process,In Recovery";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "bad_debtors_sample_import.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper: Calculate total payments received for Bad Debtor
  const getBadDebtorTotalReceived = (bd: BadDebtor): number => {
    if (bd.receipts && bd.receipts.length > 0) {
      return bd.receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    }
    return bd.amountReceived || 0;
  };

  // Helper: Calculate pending amount for Bad Debtor
  const getBadDebtorPendingAmount = (bd: BadDebtor): number => {
    const totalRec = getBadDebtorTotalReceived(bd);
    return Math.max(0, (bd.invoiceAmount || 0) - totalRec);
  };

  // Add Bad Debtor Payment Receipt Record
  const handleAddBadDebtorPaymentReceipt = async () => {
    if (!managingBadDebtorPayment) return;

    const entryAmt = parseFloat(badDebtorPaymentForm.amount) || 0;
    if (entryAmt <= 0) {
      alert("Please enter a valid payment receipt amount.");
      return;
    }

    setIsSavingBadDebtorPayment(true);
    try {
      const existingReceipts = managingBadDebtorPayment.receipts || [];
      const newReceipt: PaymentReceiptRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        orderId: managingBadDebtorPayment.id,
        invoiceNumber: managingBadDebtorPayment.invoiceNumber,
        amount: entryAmt,
        paymentReceivedDate: badDebtorPaymentForm.paymentReceivedDate,
        utrId: badDebtorPaymentForm.utrId.trim() || undefined,
        comments: badDebtorPaymentForm.comments.trim() || undefined,
        createdAt: new Date().toISOString(),
        createdBy: activeUser.name,
      };

      const updatedReceipts = [...existingReceipts, newReceipt];
      const totalReceived = updatedReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
      const pendingAmount = Math.max(0, (managingBadDebtorPayment.invoiceAmount || 0) - totalReceived);

      let newStatus = managingBadDebtorPayment.status || "Bad Debt";
      if (pendingAmount <= 0 && managingBadDebtorPayment.invoiceAmount > 0) {
        newStatus = "Paid";
      } else if (totalReceived > 0 && newStatus !== "Written Off" && newStatus !== "In Recovery") {
        newStatus = "Partial Paid";
      }

      const updatedBd: BadDebtor = {
        ...managingBadDebtorPayment,
        receipts: updatedReceipts,
        amountReceived: totalReceived,
        pendingAmount: pendingAmount,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };

      await saveBadDebtor(updatedBd);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Bad Debtor",
        targetType: "BadDebtor",
        targetId: updatedBd.id,
        targetName: updatedBd.companyName,
        details: `Logged payment receipt for Bad Debtor Invoice #${updatedBd.invoiceNumber}: Amount=₹${formatIndianNumber(entryAmt)}, Date=${badDebtorPaymentForm.paymentReceivedDate}, Total Received=₹${formatIndianNumber(totalReceived)}, Pending=₹${formatIndianNumber(pendingAmount)}`,
      });

      setManagingBadDebtorPayment(updatedBd);
      setBadDebtorPaymentForm({
        amount: "",
        paymentReceivedDate: new Date().toISOString().split("T")[0],
        utrId: "",
        comments: "",
      });
      setPaymentSaveSuccess(`Payment receipt of ₹${formatIndianNumber(entryAmt)} saved for ${updatedBd.companyName}.`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);
    } catch (err: any) {
      console.error("Error saving bad debtor payment receipt:", err);
      alert(`Failed to save payment receipt: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingBadDebtorPayment(false);
    }
  };

  // Delete Bad Debtor Payment Receipt Record
  const handleDeleteBadDebtorPaymentReceipt = async (receiptId: string, receiptIndex?: number) => {
    if (!managingBadDebtorPayment) return;

    setIsSavingBadDebtorPayment(true);
    try {
      const existingReceipts = managingBadDebtorPayment.receipts || [];
      const recToDelete = existingReceipts.find(
        (r, idx) => (receiptId && r.id === receiptId) || (receiptIndex !== undefined && idx === receiptIndex)
      );
      const updatedReceipts = existingReceipts.filter((r, idx) => {
        if (receiptId && r.id) return r.id !== receiptId;
        if (receiptIndex !== undefined) return idx !== receiptIndex;
        return true;
      });
      const totalReceived = updatedReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
      const pendingAmount = Math.max(0, (managingBadDebtorPayment.invoiceAmount || 0) - totalReceived);

      let newStatus = managingBadDebtorPayment.status || "Bad Debt";
      if (pendingAmount <= 0 && managingBadDebtorPayment.invoiceAmount > 0) {
        newStatus = "Paid";
      } else if (totalReceived > 0 && newStatus !== "Written Off" && newStatus !== "In Recovery") {
        newStatus = "Partial Paid";
      } else if (totalReceived === 0 && (newStatus === "Paid" || newStatus === "Partial Paid")) {
        newStatus = "Bad Debt";
      }

      const updatedBd: BadDebtor = {
        ...managingBadDebtorPayment,
        receipts: updatedReceipts,
        amountReceived: totalReceived,
        pendingAmount: pendingAmount,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };

      await saveBadDebtor(updatedBd);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Bad Debtor",
        targetType: "BadDebtor",
        targetId: updatedBd.id,
        targetName: updatedBd.companyName,
        details: `Deleted payment receipt (Amount: ₹${formatIndianNumber(recToDelete?.amount || 0)}) for Invoice #${updatedBd.invoiceNumber}. New Total Received=₹${formatIndianNumber(totalReceived)}`,
      });

      setManagingBadDebtorPayment(updatedBd);
      setPaymentSaveSuccess(`Payment receipt deleted for ${updatedBd.companyName}.`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);
    } catch (err: any) {
      console.error("Error deleting bad debtor payment receipt:", err);
      alert(`Failed to delete payment receipt: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingBadDebtorPayment(false);
      setConfirmDeleteReceiptId(null);
    }
  };

  // Save / Update Single Bad Debtor
  const handleSaveBadDebtor = async () => {
    if (!badDebtorForm.companyName.trim()) {
      alert("Please enter Company Name.");
      return;
    }
    if (!badDebtorForm.invoiceNumber.trim()) {
      alert("Please enter Invoice Number.");
      return;
    }
    const invAmt = parseFloat(badDebtorForm.invoiceAmount) || 0;
    if (invAmt <= 0) {
      alert("Please enter a valid Invoice Amount.");
      return;
    }

    setIsSavingBadDebtor(true);
    try {
      const recordId = editingBadDebtor ? editingBadDebtor.id : `bd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const existingReceipts = editingBadDebtor?.receipts || [];
      const totalRec = existingReceipts.reduce((sum, r) => sum + (r.amount || 0), 0) || (editingBadDebtor?.amountReceived || 0);
      const pendingAmt = Math.max(0, invAmt - totalRec);

      const bdRecord: BadDebtor = {
        id: recordId,
        companyName: badDebtorForm.companyName.trim(),
        clientName: badDebtorForm.clientName.trim(),
        email: badDebtorForm.email.trim(),
        phone: badDebtorForm.phone.trim(),
        customerPo: badDebtorForm.customerPo.trim(),
        invoiceNumber: badDebtorForm.invoiceNumber.trim(),
        invoiceDate: badDebtorForm.invoiceDate,
        invoiceAmount: invAmt,
        orderAmount: invAmt,
        dueDate: badDebtorForm.dueDate,
        overdueDays: parseInt(badDebtorForm.overdueDays, 10) || computeOverdueDays(badDebtorForm.dueDate),
        comments: badDebtorForm.comments.trim(),
        status: badDebtorForm.status,
        assignedToUserId: badDebtorForm.assignedToUserId || undefined,
        assignedToUserName: badDebtorForm.assignedToUserId ? getAssignedUserName(badDebtorForm.assignedToUserId) : undefined,
        amountReceived: totalRec,
        pendingAmount: pendingAmt,
        receipts: existingReceipts,
        createdAt: editingBadDebtor?.createdAt || new Date().toISOString(),
        createdByUserId: editingBadDebtor?.createdByUserId || activeUser.id,
        createdByUserName: editingBadDebtor?.createdByUserName || activeUser.name,
        updatedAt: new Date().toISOString(),
      };

      await saveBadDebtor(bdRecord);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: editingBadDebtor ? "Update Bad Debtor" : "Add Bad Debtor",
        targetType: "BadDebtor",
        targetId: recordId,
        targetName: badDebtorForm.companyName.trim(),
        details: `${editingBadDebtor ? "Updated" : "Added"} Bad Debtor record for Invoice #${badDebtorForm.invoiceNumber}: Amount=₹${formatIndianNumber(invAmt)}, Overdue=${bdRecord.overdueDays}d`,
      });

      setPaymentSaveSuccess(`Bad debtor record for ${badDebtorForm.companyName} saved successfully.`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);

      setShowBadDebtorModal(false);
      setEditingBadDebtor(null);
    } catch (err: any) {
      console.error("Error saving bad debtor:", err);
      alert(`Failed to save bad debtor: ${err.message || "Please check connection."}`);
    } finally {
      setIsSavingBadDebtor(false);
    }
  };

  // Delete Bad Debtor
  const handleDeleteBadDebtor = async (id: string, companyName: string) => {
    if (!window.confirm(`Are you sure you want to delete the bad debtor record for ${companyName}?`)) {
      return;
    }

    try {
      await deleteBadDebtorDoc(id);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Delete Bad Debtor",
        targetType: "BadDebtor",
        targetId: id,
        targetName: companyName,
        details: `Deleted Bad Debtor record for ${companyName}`,
      });

      setPaymentSaveSuccess(`Bad debtor record deleted.`);
      setTimeout(() => setPaymentSaveSuccess(null), 4000);
    } catch (err: any) {
      console.error("Error deleting bad debtor:", err);
      alert(`Failed to delete bad debtor: ${err.message || "Please check connection."}`);
    }
  };

  if (!teamCanView) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
        <AlertTriangle size={48} className="mx-auto text-rose-500 mb-4" />
        <h3 className="text-base font-bold text-slate-800">Workspace Access Restricted</h3>
        <p className="text-sm text-slate-500 mt-2">
          Your team (<strong>{activeUser.teamName || "No Team Assigned"}</strong>) does not have permission to view the <strong>Payment List</strong> workspace. Please contact a Platform Administrator to request permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <CreditCard size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Payment List Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitor debtor invoices, update payment receipts, pending amounts, and send payment reminders.
            </p>
          </div>
        </div>
      </div>

      {/* Save Success Banner */}
      {paymentSaveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs flex items-center justify-between font-medium animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{paymentSaveSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setPaymentSaveSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sub-tabs Row */}
      <div className="flex border-b border-slate-200/85 pb-0.5 overflow-x-auto gap-2 scrollbar-thin whitespace-nowrap">
        {filteredSubTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold font-mono uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer -mb-0.5 ${
                isActive
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={13} className={isActive ? "text-emerald-600" : "text-slate-400"} />
              {tab.label}
              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-mono font-extrabold px-1.5 py-0.2 rounded-full ml-1">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

            {/* SUB-TAB 1: DEBTORS */}
      {activeSubTab === "debtors" && (
        <div className="space-y-4">
          {/* Summary KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Debtor Parties</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">{filteredConsolidatedDebtors.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Parties with outstanding balances</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
                <Building2 size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Pending Invoices</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">
                  {filteredConsolidatedDebtors.reduce((sum, p) => sum + p.invoiceCount, 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Consolidated invoices due</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
                <FileSpreadsheet size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Consolidated Outstanding</p>
                <p className="text-xl font-black font-mono text-rose-600 mt-1">
                  ₹{formatIndianNumber(filteredConsolidatedDebtors.reduce((sum, p) => sum + p.totalPendingAmount, 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Grand total balance due</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <IndianRupee size={20} />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 border border-slate-200/85 rounded-xl shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search party name, client contact, email, phone, PO number, or invoice number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => setShowBulkImportModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <FileSpreadsheet size={15} />
                <span>Bulk Import Receipts</span>
              </button>
              <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                Showing <b>{filteredConsolidatedDebtors.length}</b> debtor parties
              </div>
            </div>
          </div>

          {/* Debtors Table */}
          {filteredConsolidatedDebtors.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center shadow-2xs">
              <div className="inline-flex p-4 rounded-full bg-emerald-50 text-emerald-600 mb-3">
                <Layers size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Pending Debtor Parties</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {searchTerm
                  ? "No debtor parties matched your search keywords."
                  : "All client payments are 100% cleared or no mapped invoices with outstanding balances were found."}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/85 text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                      <th className="py-3 px-3 w-10 text-center"></th>
                      <th className="py-3 px-3 w-8 text-center">#</th>
                      <th className="py-3 px-4">Party / Client Company</th>
                      <th className="py-3 px-4">Contact Info</th>
                      <th className="py-3 px-4">Sales Person</th>
                      <th className="py-3 px-3 text-center">Pending Invoices</th>
                      <th className="py-3 px-4 text-right">Total Invoice Value</th>
                      <th className="py-3 px-4 text-right">Payment Received</th>
                      <th className="py-3 px-4 text-right">Total Pending Outstanding</th>
                      <th className="py-3 px-3 text-center">Due Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredConsolidatedDebtors.map((party, idx) => {
                      const isExpanded = !!expandedDebtorPartyKeys[party.partyKey];
                      return (
                        <React.Fragment key={party.partyKey}>
                          <tr className={`transition-colors hover:bg-emerald-50/20 ${isExpanded ? "bg-slate-50/25" : ""}`}>
                            {/* Expand toggle */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDebtorPartyKeys((prev) => ({
                                    ...prev,
                                    [party.partyKey]: !prev[party.partyKey],
                                  }))
                                }
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Toggle invoice breakdown"
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                                  <Building2 size={15} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{party.companyName}</p>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <User2 size={11} className="text-slate-400" />
                                    <span>{party.clientName}</span>
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-0.5 text-[11px] text-slate-600">
                                {party.email && (
                                  <div className="flex items-center gap-1">
                                    <Mail size={11} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-slate-700">{party.email}</span>
                                  </div>
                                )}
                                {party.phone && (
                                  <div className="flex items-center gap-1">
                                    <Phone size={11} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-slate-500">{party.phone}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                <User2 size={12} className="text-emerald-600 shrink-0" />
                                <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[140px]" title={getPartySalesPersons(party.orders)}>
                                  {getPartySalesPersons(party.orders)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                {party.invoiceCount} {party.invoiceCount === 1 ? "Invoice" : "Invoices"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                              ₹{formatIndianNumber(party.totalOrderValue)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                              ₹{formatIndianNumber(party.totalReceivedAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 text-sm">
                              ₹{formatIndianNumber(party.totalPendingAmount)}
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              {party.isAnyOverdue ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle size={10} />
                                  Overdue ({party.maxDaysOverdue}d)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Clock size={10} />
                                  Due Soon
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDebtorPartyKeys((prev) => ({
                                    ...prev,
                                    [party.partyKey]: !prev[party.partyKey],
                                  }))
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs transition-all cursor-pointer"
                              >
                                {isExpanded ? "Hide Invoices" : "View Invoices"}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Row: Invoice Breakdown */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan={11} className="p-4">
                                <div className="space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet size={16} className="text-emerald-600" />
                                      <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide font-mono">
                                        Consolidated Invoice Details for {party.companyName}
                                      </span>
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">
                                      {party.invoiceCount} Pending Invoices • Consolidated Pending:{" "}
                                      <strong className="text-rose-600 font-extrabold">
                                        ₹{formatIndianNumber(party.totalPendingAmount)}
                                      </strong>
                                    </span>
                                  </div>

                                  {/* Invoices Table */}
                                  <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
                                    <table className="w-full text-left text-xs min-w-[900px]">
                                      <thead>
                                        <tr className="bg-emerald-50/60 text-slate-700 font-mono font-bold text-[10px] uppercase border-b border-emerald-100">
                                          <th className="p-2.5">Invoice #</th>
                                          <th className="p-2.5">PO #</th>
                                          <th className="p-2.5">Sales Person</th>
                                          <th className="p-2.5">Actual Dispatch Date</th>
                                          <th className="p-2.5">Due Date & Status</th>
                                          <th className="p-2.5 text-right">Invoice Amount</th>
                                          <th className="p-2.5 text-right">Payment Received</th>
                                          <th className="p-2.5 text-right">Pending Amount</th>
                                          <th className="p-2.5 text-center">Invoice File</th>
                                          <th className="p-2.5 text-center">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {party.orders.map((o) => {
                                          const pDet = getPaymentDetailsForOrder(o, paymentDetailsList);
                                          const tot = getOrderTotalInvoiceAmount(o);
                                          const rec = pDet ? pDet.amountReceived : 0;
                                          const pend = pDet ? pDet.pendingAmount : Math.max(0, tot - rec);
                                          const actualDispatchDate = getOrderActualDispatchDate(o);
                                          const due = calculateDueDate(actualDispatchDate, o.payment);

                                          return (
                                            <tr key={o.id} className="hover:bg-slate-50">
                                              <td className="p-2.5 font-mono font-bold text-slate-900">
                                                {o.billingDetails?.invoiceNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono text-slate-600">
                                                {o.closedWonDetails?.customerPoNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 text-[11px] font-medium text-slate-700">
                                                <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                                  <User2 size={11} className="text-emerald-600 shrink-0" />
                                                  <span className="font-semibold text-slate-800">{getAssignedUserName(o.assignedToUserId)}</span>
                                                </div>
                                              </td>
                                              <td className="p-2.5 text-slate-600 text-[11px] font-mono">
                                                {actualDispatchDate ? formatDate(actualDispatchDate) : (
                                                  <span className="text-slate-400 italic text-[10px]">Pending Dispatch</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 font-mono">
                                                <span className={due.isOverdue ? "text-rose-600 font-bold" : "text-slate-800 font-semibold"}>
                                                  {due.dueDateFormatted}
                                                </span>
                                                <span className={`block text-[9px] font-bold mt-0.5 ${due.isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                                                  {due.statusLabel}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-right font-mono">₹{formatIndianNumber(tot)}</td>
                                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{formatIndianNumber(rec)}</td>
                                              <td className="p-2.5 text-right font-mono font-extrabold text-rose-600">₹{formatIndianNumber(pend)}</td>
                                              <td className="p-2.5 text-center">
                                                {o.billingDetails?.invoiceAttachments && o.billingDetails.invoiceAttachments.length > 0 ? (
                                                  <div className="flex flex-wrap justify-center gap-1">
                                                    {o.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                                      <button
                                                        key={attIdx}
                                                        type="button"
                                                        onClick={() => openOrDownloadDocument(att.url, att.name || `invoice_${attIdx + 1}.pdf`)}
                                                        className="inline-flex items-center gap-1 text-[9.5px] font-mono font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 cursor-pointer"
                                                        title={att.name}
                                                      >
                                                        <ExternalLink size={9} />
                                                        <span className="truncate max-w-[80px]">{att.name || `Invoice ${attIdx + 1}`}</span>
                                                      </button>
                                                    ))}
                                                  </div>
                                                ) : o.billingDetails?.invoiceFileUrl ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => openOrDownloadDocument(o.billingDetails?.invoiceFileUrl, o.billingDetails?.invoiceFileName || "invoice.pdf")}
                                                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 cursor-pointer"
                                                  >
                                                    <ExternalLink size={10} />
                                                    <span>View PDF</span>
                                                  </button>
                                                ) : (
                                                  <span className="text-[10px] text-slate-400 italic">No File</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => openPaymentModal(o)}
                                                  disabled={!teamCanEdit}
                                                  className={`inline-flex items-center justify-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all border shadow-2xs ${
                                                    !teamCanEdit
                                                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                      : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/80 cursor-pointer"
                                                  }`}
                                                  title={!teamCanEdit ? "Your team does not have edit permission." : undefined}
                                                >
                                                  {!teamCanEdit ? <Lock size={11} /> : <CreditCard size={11} className="text-emerald-600" />}
                                                  <span>Update Payment</span>
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}


      {/* SUB-TAB: BAD DEBTORS */}
      {activeSubTab === "bad_debtors" && (
        <div className="space-y-4">
          {/* Summary KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Bad Debtors</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">{filteredBadDebtors.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Flagged defaulted accounts</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl">
                <AlertTriangle size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Bad Debt Value</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">
                  ₹{formatIndianNumber(filteredBadDebtors.reduce((sum, b) => sum + (b.invoiceAmount || 0), 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Grand total invoice amount</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
                <FileSpreadsheet size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Payments Rec'd</p>
                <p className="text-xl font-black font-mono text-emerald-700 mt-1">
                  ₹{formatIndianNumber(filteredBadDebtors.reduce((sum, b) => sum + getBadDebtorTotalReceived(b), 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Recovered payments</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
                <IndianRupee size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Pending Balance</p>
                <p className="text-xl font-black font-mono text-rose-600 mt-1">
                  ₹{formatIndianNumber(filteredBadDebtors.reduce((sum, b) => sum + getBadDebtorPendingAmount(b), 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Outstanding balance to recover</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <Clock size={20} />
              </div>
            </div>
          </div>

          {/* Search & Actions Toolbar */}
          <div className="bg-white p-4 border border-slate-200/85 rounded-xl shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search company, sales person, PO #, invoice #, client contact, email, status..."
                value={badDebtorsSearchTerm}
                onChange={(e) => setBadDebtorsSearchTerm(e.target.value)}
                className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Filter Toggle: Pending vs Fully Received */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setBadDebtorsFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  badDebtorsFilter === "all"
                    ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All ({badDebtors.length})
              </button>
              <button
                type="button"
                onClick={() => setBadDebtorsFilter("pending")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  badDebtorsFilter === "pending"
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Pending ({badDebtors.filter((b) => getBadDebtorPendingAmount(b) > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setBadDebtorsFilter("fully_received")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  badDebtorsFilter === "fully_received"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Fully Received ({badDebtors.filter((b) => getBadDebtorPendingAmount(b) <= 0 && b.invoiceAmount > 0).length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBadDebtorsImportText("");
                  setBadDebtorsImportFileName("");
                  setShowBadDebtorsImportModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-mono bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer shadow-2xs"
              >
                <Upload size={14} />
                <span>Bulk Import Bad Debtors</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingBadDebtor(null);
                  setBadDebtorForm({
                    companyName: "",
                    clientName: "",
                    email: "",
                    phone: "",
                    customerPo: "",
                    invoiceNumber: "",
                    invoiceDate: new Date().toISOString().split("T")[0],
                    invoiceAmount: "",
                    dueDate: new Date().toISOString().split("T")[0],
                    overdueDays: "0",
                    comments: "",
                    status: "Bad Debt",
                    assignedToUserId: activeUserId,
                  });
                  setShowBadDebtorModal(true);
                }}
                disabled={!teamCanAdd}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-mono transition-all shadow-2xs cursor-pointer ${
                  teamCanAdd
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                }`}
              >
                <Plus size={14} />
                <span>Add Bad Debtor</span>
              </button>
            </div>
          </div>

          {/* Bad Debtors Table */}
          {filteredBadDebtors.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center shadow-2xs">
              <div className="inline-flex p-4 rounded-full bg-rose-50 text-rose-600 mb-3">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Bad Debtors Records</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {badDebtorsSearchTerm || badDebtorsFilter !== "all"
                  ? "No bad debtor records matched your filter or search query."
                  : "No bad debtors have been logged yet. Click 'Add Bad Debtor' or 'Bulk Import Bad Debtors' to record defaulted accounts."}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-mono font-bold text-[10px] uppercase border-b border-slate-200/85">
                      <th className="p-3.5">Company & Client Contact</th>
                      <th className="p-3.5">Sales Person</th>
                      <th className="p-3.5">Customer PO #</th>
                      <th className="p-3.5">Invoice # & Date</th>
                      <th className="p-3.5 text-right">Invoice / Order Amount</th>
                      <th className="p-3.5 text-right">Received / Pending</th>
                      <th className="p-3.5">Due Date</th>
                      <th className="p-3.5 text-center">Overdue Days</th>
                      <th className="p-3.5">Status & Remarks</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                    {filteredBadDebtors.map((bd) => {
                      const totalReceived = getBadDebtorTotalReceived(bd);
                      const pendingAmt = getBadDebtorPendingAmount(bd);
                      const displayStatus = bd.status || (pendingAmt <= 0 && bd.invoiceAmount > 0 ? "Paid" : totalReceived > 0 ? "Partial Paid" : "Bad Debt");

                      return (
                        <tr key={bd.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <div className="font-extrabold text-slate-900 text-xs">{bd.companyName}</div>
                            {bd.clientName && (
                              <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                                <User2 size={11} className="text-slate-400 shrink-0" />
                                <span>{bd.clientName}</span>
                              </div>
                            )}
                            {bd.email && (
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <Mail size={10} className="shrink-0" />
                                <span>{bd.email}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <User2 size={12} className="text-slate-400 shrink-0" />
                              <span>{getAssignedUserName(bd.assignedToUserId)}</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-slate-700 font-medium">
                            {bd.customerPo || <span className="text-slate-400 italic">N/A</span>}
                          </td>
                          <td className="p-3.5 font-mono">
                            <div className="font-bold text-slate-900">{bd.invoiceNumber}</div>
                            <div className="text-[10px] text-slate-500">{formatDate(bd.invoiceDate)}</div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm">
                            ₹{formatIndianNumber(bd.invoiceAmount || bd.orderAmount || 0)}
                          </td>
                          <td className="p-3.5 text-right font-mono">
                            <div className="text-xs font-bold text-emerald-700">
                              ₹{formatIndianNumber(totalReceived)} Rec'd
                            </div>
                            <div className={`text-[10px] font-bold ${pendingAmt > 0 ? "text-rose-600" : "text-slate-400"}`}>
                              ₹{formatIndianNumber(pendingAmt)} Pending
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-slate-700 font-medium">
                            {formatDate(bd.dueDate)}
                          </td>
                          <td className="p-3.5 text-center font-mono">
                            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-rose-200">
                              <Clock size={10} />
                              {bd.overdueDays} Days
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold font-mono uppercase mb-1 ${
                              displayStatus === "Written Off"
                                ? "bg-slate-100 text-slate-700 border border-slate-200"
                                : displayStatus === "In Recovery"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : displayStatus === "Paid"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : displayStatus === "Partial Paid"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                            }`}>
                              {displayStatus}
                            </span>
                            {bd.comments && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 italic">{bd.comments}</p>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Manage Payment Receipts Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setManagingBadDebtorPayment(bd);
                                  setBadDebtorPaymentForm({
                                    amount: "",
                                    paymentReceivedDate: new Date().toISOString().split("T")[0],
                                    utrId: "",
                                    comments: "",
                                  });
                                  setShowBadDebtorPaymentModal(true);
                                }}
                                title="Manage Payments Received"
                                className="px-2.5 py-1 rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold font-mono"
                              >
                                <Receipt size={13} className="text-emerald-600" />
                                <span>Payments ({(bd.receipts || []).length})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBadDebtor(bd);
                                  setBadDebtorForm({
                                    companyName: bd.companyName || "",
                                    clientName: bd.clientName || "",
                                    email: bd.email || "",
                                    phone: bd.phone || "",
                                    customerPo: bd.customerPo || "",
                                    invoiceNumber: bd.invoiceNumber || "",
                                    invoiceDate: bd.invoiceDate || new Date().toISOString().split("T")[0],
                                    invoiceAmount: String(bd.invoiceAmount || ""),
                                    dueDate: bd.dueDate || new Date().toISOString().split("T")[0],
                                    overdueDays: String(bd.overdueDays || "0"),
                                    comments: bd.comments || "",
                                    status: (bd.status as any) || "Bad Debt",
                                    assignedToUserId: bd.assignedToUserId || activeUserId,
                                  });
                                  setShowBadDebtorModal(true);
                                }}
                                disabled={!teamCanEdit}
                                className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                                title="Edit Record"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBadDebtor(bd.id, bd.companyName)}
                                disabled={!teamCanEdit}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {activeSubTab === "payment_reminder_consolidated" && (
        <div className="space-y-4">
          {/* Summary KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Pending Parties</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">{filteredConsolidatedParties.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Parties with outstanding balances</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
                <Building2 size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Total Pending Invoices</p>
                <p className="text-xl font-black font-mono text-slate-900 mt-1">
                  {filteredConsolidatedParties.reduce((sum, p) => sum + p.invoiceCount, 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Consolidated invoices due</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
                <FileSpreadsheet size={20} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">Consolidated Outstanding</p>
                <p className="text-xl font-black font-mono text-rose-600 mt-1">
                  ₹{formatIndianNumber(filteredConsolidatedParties.reduce((sum, p) => sum + p.totalPendingAmount, 0))}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Grand total balance due</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <IndianRupee size={20} />
              </div>
            </div>
          </div>

          {/* Search, Template Selector & Bulk Action Controls */}
          <div className="bg-white p-4 border border-slate-200/85 rounded-xl shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search party name, client contact, email, phone, PO number, or invoice number..."
                  value={consolidatedSearchTerm}
                  onChange={(e) => setConsolidatedSearchTerm(e.target.value)}
                  className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Template selector & Send button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  <Mail size={13} className="text-slate-400" />
                  <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Template:</span>
                  <select
                    value={selectedConsolidatedTemplateId}
                    onChange={(e) => setSelectedConsolidatedTemplateId(e.target.value)}
                    className="bg-transparent text-xs text-slate-800 font-medium outline-none cursor-pointer max-w-[200px] truncate"
                  >
                    {emailTemplates.length === 0 ? (
                      <option value="">Default Consolidated Reminder</option>
                    ) : (
                      emailTemplates.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name} {tmpl.assignedForm === "payment_reminder_consolidated" ? "(📊 Assigned)" : tmpl.isDefault ? "(Default)" : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={selectedConsolidatedCount === 0 || isSendingConsolidatedBulkEmail}
                  onClick={handleSendBulkConsolidatedReminders}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shadow-xs cursor-pointer ${
                    selectedConsolidatedCount > 0 && !isSendingConsolidatedBulkEmail
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  }`}
                >
                  {isSendingConsolidatedBulkEmail ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Sending Bulk Mail...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>
                        Send Bulk Consolidated Reminders {selectedConsolidatedCount > 0 ? `(${selectedConsolidatedCount})` : ""}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selection info bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] pt-2 border-t border-slate-100 text-slate-500 font-mono gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllConsolidatedParties}
                  className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-emerald-700 cursor-pointer"
                >
                  {allConsolidatedSelected ? (
                    <CheckSquare size={15} className="text-emerald-600" />
                  ) : (
                    <Square size={15} className="text-slate-400" />
                  )}
                  <span>{allConsolidatedSelected ? "Deselect All" : "Select All"}</span>
                </button>
                <span className="text-slate-300">|</span>
                <span>
                  <b>{selectedConsolidatedCount}</b> of <b>{filteredConsolidatedParties.length}</b> parties selected
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  Due Today or Overdue (≥ 1 day)
                </span>
              </div>
              <div>
                Selected Outstanding Total: <strong className="text-rose-600 font-extrabold">₹{formatIndianNumber(selectedConsolidatedParties.reduce((sum, p) => sum + p.totalPendingAmount, 0))}</strong>
              </div>
            </div>
          </div>

          {/* Table Container */}
          {filteredConsolidatedParties.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center shadow-2xs">
              <div className="inline-flex p-4 rounded-full bg-emerald-50 text-emerald-600 mb-3">
                <Layers size={32} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Pending Consolidated Reminders</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {consolidatedSearchTerm
                  ? "No parties matched your search keywords."
                  : "No debtor parties currently have invoices that are due today or overdue. Parties with upcoming invoices will appear here automatically when due."}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/85 text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                      <th className="py-3 px-3 text-center w-10">
                        <button
                          type="button"
                          onClick={toggleSelectAllConsolidatedParties}
                          className="text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer"
                          title={allConsolidatedSelected ? "Deselect All Parties" : "Select All Visible Parties"}
                        >
                          {allConsolidatedSelected ? (
                            <CheckSquare size={15} className="text-emerald-600 mx-auto" />
                          ) : (
                            <Square size={15} className="text-slate-400 mx-auto" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 w-8 text-center">#</th>
                      <th className="py-3 px-4">Party / Client Company</th>
                      <th className="py-3 px-4">Contact Info</th>
                      <th className="py-3 px-4">Sales Person</th>
                      <th className="py-3 px-3 text-center">Pending Invoices</th>
                      <th className="py-3 px-4 text-right">Total Invoice Value</th>
                      <th className="py-3 px-4 text-right">Payment Received</th>
                      <th className="py-3 px-4 text-right">Total Pending Outstanding</th>
                      <th className="py-3 px-3 text-center">Due Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredConsolidatedParties.map((party, idx) => {
                      const isExpanded = !!expandedPartyKeys[party.partyKey];
                      const isSelected = !!selectedConsolidatedPartyKeys[party.partyKey];
                      return (
                        <React.Fragment key={party.partyKey}>
                          <tr className={`transition-colors ${isSelected ? "bg-emerald-50/40" : "hover:bg-emerald-50/20"}`}>
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleSelectConsolidatedParty(party.partyKey)}
                                className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare size={16} className="text-emerald-600 mx-auto" />
                                ) : (
                                  <Square size={16} className="text-slate-300 mx-auto" />
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                                  <Building2 size={15} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{party.companyName}</p>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <User2 size={11} className="text-slate-400" />
                                    <span>{party.clientName}</span>
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-0.5 text-[11px] text-slate-600">
                                {party.email && (
                                  <div className="flex items-center gap-1">
                                    <Mail size={11} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-slate-700">{party.email}</span>
                                  </div>
                                )}
                                {party.phone && (
                                  <div className="flex items-center gap-1">
                                    <Phone size={11} className="text-slate-400 shrink-0" />
                                    <span className="font-mono text-slate-500">{party.phone}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                <User2 size={12} className="text-emerald-600 shrink-0" />
                                <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[140px]" title={getPartySalesPersons(party.orders)}>
                                  {getPartySalesPersons(party.orders)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                {party.invoiceCount} {party.invoiceCount === 1 ? "Invoice" : "Invoices"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                              ₹{formatIndianNumber(party.totalOrderValue)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                              ₹{formatIndianNumber(party.totalReceivedAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 text-sm">
                              ₹{formatIndianNumber(party.totalPendingAmount)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {party.isAnyOverdue ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle size={10} />
                                  Overdue ({party.maxDaysOverdue}d)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Clock size={10} />
                                  Due Soon
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openConsolidatedEmailModal(party)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
                                >
                                  <Send size={12} />
                                  <span>Send Reminder</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedPartyKeys((prev) => ({
                                      ...prev,
                                      [party.partyKey]: !prev[party.partyKey],
                                    }))
                                  }
                                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Toggle invoice breakdown"
                                >
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Row: Invoice Breakdown & Template Table Live Preview */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan={11} className="p-4">
                                <div className="space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet size={16} className="text-emerald-600" />
                                      <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide font-mono">
                                        Invoice-Wise Breakdown for {party.companyName}
                                      </span>
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">
                                      {party.invoiceCount} Pending Invoices • Consolidated Pending:{" "}
                                      <strong className="text-rose-600 font-extrabold">
                                        ₹{formatIndianNumber(party.totalPendingAmount)}
                                      </strong>
                                    </span>
                                  </div>

                                  {/* Invoices Table */}
                                  <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
                                    <table className="w-full text-left text-xs min-w-[900px]">
                                      <thead>
                                        <tr className="bg-emerald-50/60 text-slate-700 font-mono font-bold text-[10px] uppercase border-b border-emerald-100">
                                          <th className="p-2.5">Invoice #</th>
                                          <th className="p-2.5">PO #</th>
                                          <th className="p-2.5">Sales Person</th>
                                          <th className="p-2.5">Actual Dispatch Date</th>
                                          <th className="p-2.5">Due Date</th>
                                          <th className="p-2.5 text-right">Invoice Amount</th>
                                          <th className="p-2.5 text-right">Payment Received</th>
                                          <th className="p-2.5 text-right">Pending Amount</th>
                                          <th className="p-2.5 text-center">Invoice Link</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {party.orders.map((o) => {
                                          const pDet = getPaymentDetailsForOrder(o, paymentDetailsList);
                                          const tot = getOrderTotalInvoiceAmount(o);
                                          const rec = pDet ? pDet.amountReceived : 0;
                                          const pend = pDet ? pDet.pendingAmount : Math.max(0, tot - rec);
                                          const actualDispatchDate = getOrderActualDispatchDate(o);
                                          const due = calculateDueDate(actualDispatchDate, o.payment);

                                          return (
                                            <tr key={o.id} className="hover:bg-slate-50">
                                              <td className="p-2.5 font-mono font-bold text-slate-900">
                                                {o.billingDetails?.invoiceNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono text-slate-600">
                                                {o.closedWonDetails?.customerPoNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 text-[11px] font-medium text-slate-700">
                                                <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                                  <User2 size={11} className="text-emerald-600 shrink-0" />
                                                  <span className="font-semibold text-slate-800">{getAssignedUserName(o.assignedToUserId)}</span>
                                                </div>
                                              </td>
                                              <td className="p-2.5 text-slate-600 text-[11px] font-mono">
                                                {actualDispatchDate ? formatDate(actualDispatchDate) : (
                                                  <span className="text-slate-400 italic text-[10px]">Pending Dispatch</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 font-mono font-semibold">
                                                <span className={due.isOverdue ? "text-rose-600 font-bold" : "text-slate-800"}>
                                                  {due.dueDateFormatted}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-right font-mono">₹{formatIndianNumber(tot)}</td>
                                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{formatIndianNumber(rec)}</td>
                                              <td className="p-2.5 text-right font-mono font-extrabold text-rose-600">₹{formatIndianNumber(pend)}</td>
                                              <td className="p-2.5 text-center">
                                                {o.billingDetails?.invoiceFileUrl ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => openOrDownloadDocument(o.billingDetails?.invoiceFileUrl)}
                                                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 cursor-pointer"
                                                  >
                                                    <ExternalLink size={10} />
                                                    <span>View PDF</span>
                                                  </button>
                                                ) : (
                                                  <span className="text-[10px] text-slate-400 italic">No File</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Mail Body Variable {{invoiceTable}} Rendered Preview Callout */}
                                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/85 space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 font-mono">
                                      <div className="flex items-center gap-1.5">
                                        <Code size={13} className="text-emerald-600" />
                                        <span>Generated Mail Body Table Variable (<code className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">{"{{invoiceTable}}"}</code>)</span>
                                      </div>
                                      <span className="text-[10px] text-slate-500 font-normal">Auto-inserted into Consolidated Mail Templates</span>
                                    </div>
                                    <div
                                      className="bg-white p-2.5 rounded-lg border border-slate-200 overflow-x-auto text-xs"
                                      dangerouslySetInnerHTML={{
                                        __html: generateConsolidatedInvoiceTableHTML(party.orders, paymentDetailsList),
                                      }}
                                    />
                                  </div>

                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="button"
                                      onClick={() => openConsolidatedEmailModal(party)}
                                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
                                    >
                                      <Send size={13} />
                                      <span>Create & Send Consolidated Email Template to {party.companyName}</span>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONSOLIDATED EMAIL REMINDER MODAL */}
      {consolidatedEmailParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-thin animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Send Consolidated Payment Reminder
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Party: <strong className="text-slate-800">{consolidatedEmailParty.companyName}</strong> ({consolidatedEmailParty.clientName}) • Total Pending: <span className="text-rose-600 font-extrabold">₹{formatIndianNumber(consolidatedEmailParty.totalPendingAmount)}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsolidatedEmailParty(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Email Template Selector */}
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                Select Consolidated Email Template
              </label>
              <select
                value={consolidatedTemplateId}
                onChange={(e) => handleConsolidatedTemplateChange(e.target.value)}
                className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {emailTemplates.length === 0 ? (
                  <option value="">Default System Consolidated Reminder</option>
                ) : (
                  emailTemplates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name} {tmpl.assignedForm === "payment_reminder_consolidated" ? " (📊 Assigned)" : tmpl.isDefault ? " (Default)" : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Mode Switcher: Edit vs Live Preview */}
            <div className="flex border-b border-slate-200 gap-4 text-xs font-mono font-bold">
              <button
                type="button"
                onClick={() => setConsolidatedPreviewMode("edit")}
                className={`pb-2 border-b-2 transition-all cursor-pointer ${
                  consolidatedPreviewMode === "edit"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                ✏️ Edit Mail Form & Variables
              </button>
              <button
                type="button"
                onClick={() => setConsolidatedPreviewMode("preview")}
                className={`pb-2 border-b-2 transition-all cursor-pointer flex items-center gap-1 ${
                  consolidatedPreviewMode === "preview"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <Eye size={13} />
                <span>Live Email HTML Preview</span>
              </button>
            </div>

            {consolidatedPreviewMode === "edit" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                      To Email *
                    </label>
                    <input
                      type="text"
                      value={consolidatedTo}
                      onChange={(e) => setConsolidatedTo(e.target.value)}
                      placeholder="client@company.com"
                      className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                      CC Email
                    </label>
                    <input
                      type="text"
                      value={consolidatedCc}
                      onChange={(e) => setConsolidatedCc(e.target.value)}
                      placeholder="accounts@company.com"
                      className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                      BCC Email
                    </label>
                    <input
                      type="text"
                      value={consolidatedBcc}
                      onChange={(e) => setConsolidatedBcc(e.target.value)}
                      placeholder="audit@aol.com"
                      className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={consolidatedSubject}
                    onChange={(e) => setConsolidatedSubject(e.target.value)}
                    className="w-full p-2 text-xs font-semibold rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                      Mail Body Content (HTML / Text)
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">Include {"{{invoiceTable}}"} for table</span>
                  </div>
                  <textarea
                    rows={8}
                    value={consolidatedBody}
                    onChange={(e) => setConsolidatedBody(e.target.value)}
                    className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                {/* Template Variables Helper Tag Pills */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 text-[10px] text-slate-600 space-y-1">
                  <span className="font-bold text-slate-700 font-mono block">Available Variables in Template:</span>
                  <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{companyName}}"}</span>
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{clientName}}"}</span>
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{totalPendingAmount}}"}</span>
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{invoiceCount}}"}</span>
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{invoiceTable}}"}</span>
                    <span className="bg-white px-1.5 py-0.5 border border-slate-200 rounded font-bold text-emerald-700">{"{{todayDate}}"}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Live Preview Rendered Body */
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="border-b border-slate-100 pb-2">
                  <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">To: {consolidatedTo || "N/A"}</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">Subject: {consolidatedSubject}</p>
                </div>
                <div
                  className="prose max-w-none text-slate-800 leading-relaxed font-sans"
                  dangerouslySetInnerHTML={{ __html: formatEmailPreviewHtml(consolidatedBody) }}
                />
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConsolidatedEmailParty(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingConsolidatedEmail}
                onClick={handleSendConsolidatedEmail}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingConsolidatedEmail ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sending Mail...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send Consolidated Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PAYMENT REMINDER */}
      {activeSubTab === "payment_reminder" && (
        <div className="space-y-4">
          {/* Top Control Header Card */}
          <div className="bg-white p-4 border border-slate-200/85 rounded-2xl shadow-xs space-y-4">
            {sendSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center justify-between font-medium animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{sendSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendSuccessMsg(null)}
                  className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client, company, invoice #, PO #..."
                  value={reminderSearchTerm}
                  onChange={(e) => setReminderSearchTerm(e.target.value)}
                  className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Template selector & Send button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  <Mail size={13} className="text-slate-400" />
                  <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Template:</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="bg-transparent text-xs text-slate-800 font-medium outline-none cursor-pointer max-w-[180px] truncate"
                  >
                    {emailTemplates.length === 0 ? (
                      <option value="">Default Payment Reminder</option>
                    ) : (
                      emailTemplates.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name} {tmpl.isDefault ? "(Default)" : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={selectedCount === 0 || isSendingEmail}
                  onClick={handleSendPaymentReminders}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shadow-xs cursor-pointer ${
                    selectedCount > 0 && !isSendingEmail
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  }`}
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Sending Mail...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>
                        Send Payment Reminder Mail {selectedCount > 0 ? `(${selectedCount})` : ""}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selection info bar */}
            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 text-slate-500 font-mono">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-emerald-700 cursor-pointer"
                >
                  {allSelected ? (
                    <CheckSquare size={15} className="text-emerald-600" />
                  ) : (
                    <Square size={15} className="text-slate-400" />
                  )}
                  <span>{allSelected ? "Deselect All" : "Select All"}</span>
                </button>
                <span className="text-slate-300">|</span>
                <span>
                  <b>{selectedCount}</b> of <b>{reminderOrders.length}</b> orders selected
                </span>
              </div>
              <div>
                Filtered by: <strong className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Due Today or Overdue (≥ 1 day)</strong>
              </div>
            </div>
          </div>

          {/* Payment Reminder Table */}
          {reminderOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center">
              <BellRing className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Orders Due Today or Overdue</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {reminderSearchTerm
                  ? "No reminder orders matched your search criteria."
                  : "All client payments are either cleared or not yet due for reminder. Orders will automatically appear here once their due status reaches Due Today or Overdue."}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-mono font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="p-4 w-12 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                          title={allSelected ? "Deselect All" : "Select All"}
                        >
                          {allSelected ? (
                            <CheckSquare size={15} className="text-emerald-600" />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                      </th>
                      <th className="p-4">Client / Company</th>
                      <th className="p-4">Sales Person</th>
                      <th className="p-4">Invoice # & PO</th>
                      <th className="p-4 text-right">Order Amount</th>
                      <th className="p-4 text-right">Amount Received</th>
                      <th className="p-4 text-right">Pending Amount</th>
                      <th className="p-4">Actual Dispatch Date</th>
                      <th className="p-4">Payment Terms / Days</th>
                      <th className="p-4">Calculated Due Date</th>
                      <th className="p-4 text-center">Due Status</th>
                      <th className="p-4">Email Sent Status</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {reminderOrders.map((order) => {
                      const isSelected = !!selectedOrderIds[order.id];
                      const dispatchDateStr = getOrderActualDispatchDate(order);
                      const paymentTermsStr = order.payment;
                      const dueInfo = calculateDueDate(dispatchDateStr, paymentTermsStr);

                      const pDetails = getPaymentDetailsForOrder(order, paymentDetailsList);
                      const totalAmt = getOrderTotalInvoiceAmount(order);
                      const receivedAmt = pDetails ? pDetails.amountReceived : 0;
                      const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - receivedAmt);

                      return (
                        <tr
                          key={order.id}
                          className={`transition-colors hover:bg-slate-50/70 ${
                            isSelected ? "bg-emerald-50/20" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={() => toggleSelectOrder(order.id)}
                              className="p-1 cursor-pointer text-slate-400 hover:text-emerald-600"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-emerald-600" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          </td>

                          {/* Client / Company */}
                          <td className="p-4">
                          <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                                  <Building2 size={15} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{order.companyName}</p>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <User2 size={11} className="text-slate-400" />
                                    <span>{order.clientName}</span>
                                  </p>
                              </div>
                              </div>
                          </td>

                          {/* Sales Person */}
                          <td className="p-4">
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                              <User2 size={12} className="text-emerald-600 shrink-0" />
                              <span className="text-[11px] font-semibold text-slate-800 font-sans truncate max-w-[130px]" title={getAssignedUserName(order.assignedToUserId)}>
                                {getAssignedUserName(order.assignedToUserId)}
                              </span>
                            </div>
                          </td>

                          {/* Invoice & PO */}
                          <td className="p-4 font-mono">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-150">
                              <Check size={10} className="stroke-[3]" />
                              {order.billingDetails?.invoiceNumber}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-semibold mt-1">
                              PO: {order.closedWonDetails?.customerPoNumber || "N/A"}
                            </span>
                          </td>

                          {/* Order Amount */}
                          <td className="p-4 text-right font-mono font-extrabold text-slate-900">
                            ₹{formatIndianNumber(totalAmt)}
                          </td>

                          {/* Amount Received */}
                          <td className="p-4 text-right font-mono font-bold text-emerald-700">
                            ₹{formatIndianNumber(receivedAmt)}
                          </td>

                          {/* Pending Amount */}
                          <td className="p-4 text-right font-mono font-bold text-rose-600">
                            ₹{formatIndianNumber(pendingAmt)}
                          </td>

                          {/* Dispatch Date */}
                          <td className="p-4 font-mono text-[11px]">
                            {dispatchDateStr ? (
                              <div className="flex items-center gap-1 text-slate-700 font-semibold">
                                <Calendar size={12} className="text-slate-400 shrink-0" />
                                {formatDate(dispatchDateStr)}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">Pending Dispatch</span>
                            )}
                          </td>

                          {/* Payment Terms / Days */}
                          <td className="p-4 font-mono text-[11px]">
                            <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {paymentTermsStr || "30 Days"}
                            </span>
                            {dueInfo.paymentDaysCount > 0 && (
                              <span className="block text-[9px] text-slate-400 mt-0.5">
                                ({dueInfo.paymentDaysCount} days credit)
                              </span>
                            )}
                          </td>

                          {/* Calculated Due Date */}
                          <td className="p-4 font-mono">
                            <span
                              className={`font-black text-xs block ${
                                dueInfo.isOverdue
                                  ? "text-rose-600"
                                  : dispatchDateStr
                                  ? "text-slate-800"
                                  : "text-slate-400"
                              }`}
                            >
                              {dueInfo.dueDateFormatted}
                            </span>
                          </td>

                          {/* Due Status */}
                          <td className="p-4 text-center">
                            {dueInfo.isOverdue ? (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border border-rose-200">
                                <AlertTriangle size={11} />
                                {dueInfo.statusLabel}
                              </span>
                            ) : dispatchDateStr ? (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                                  dueInfo.daysRemaining === 0
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                <Clock size={11} />
                                {dueInfo.statusLabel}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-mono font-medium px-2.5 py-1 rounded-full border border-slate-200">
                                Pending Dispatch
                              </span>
                            )}
                          </td>

                          {/* Email Sent Status (Read-only for payment reminders) */}
                          <td className="p-4 min-w-[200px]">
                            <EmailSentStatusCell
                              statusSummary={getEffectivePaymentReminderStatus(order)}
                              tableType="payment_reminder"
                            />
                          </td>

                          {/* Action button for single row */}
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderIds({ [order.id]: true });
                                setTimeout(() => {
                                  handleSendPaymentReminders();
                                }, 50);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-900 font-mono uppercase bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-all border border-emerald-200/60 cursor-pointer"
                              title={`Send payment reminder to ${order.clientName}`}
                            >
                              <Send size={11} />
                              Remind
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: FULLY PAID */}
      {activeSubTab === "fully_paid" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 border border-slate-200/85 rounded-xl shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by client, company, PO number, invoice number, or UTR..."
                value={fullyPaidSearchTerm}
                onChange={(e) => setFullyPaidSearchTerm(e.target.value)}
                className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
              Showing <b>{fullyPaidOrders.length}</b> of <b>{fullyPaidBase.length}</b> fully paid records
            </div>
          </div>

          {/* Fully Paid Table */}
          {fullyPaidOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Fully Paid Records Found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Invoices with 100% payment received or marked as Fully Paid will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[1050px]">
                  <thead>
                    <tr className="bg-emerald-50/50 border-b border-emerald-100 font-mono font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                      <th className="p-4 w-10 text-center"></th>
                      <th className="p-4">Client / Company</th>
                      <th className="p-4">Sales Person</th>
                      <th className="p-4">Invoice # & PO</th>
                      <th className="p-4 text-right">Order Amount</th>
                      <th className="p-4 text-right">Payment Received</th>
                      <th className="p-4 text-center">Payment Status</th>
                      <th className="p-4 text-center">UTR / Ref ID</th>
                      <th className="p-4 text-center">Payment Date</th>
                      <th className="p-4">Invoice File</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {fullyPaidOrders.map((order) => {
                      const isExpanded = !!expandedOrderIds[order.id];
                      const bank = paymentBanks.find((b) => b.id === order.paymentBankId);
                      const paymentRec = getPaymentDetailsForOrder(order, paymentDetailsList);

                      const totalAmt = getOrderTotalInvoiceAmount(order);
                      const receivedAmt = paymentRec ? paymentRec.amountReceived : totalAmt;
                      const utr = paymentRec?.utrId || "N/A";
                      const pDate = paymentRec?.paymentReceivedDate ? formatDate(new Date(paymentRec.paymentReceivedDate)) : "N/A";
                      const actualDispatchDate = getOrderActualDispatchDate(order);

                      const dueInfo = calculateDueDate(
                        actualDispatchDate,
                        order.payment
                      );

                      return (
                        <React.Fragment key={order.id}>
                          <tr className="hover:bg-emerald-50/30 transition-colors">
                            {/* Expand/Collapse Toggle */}
                            <td className="p-4 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedOrderIds((prev) => ({
                                    ...prev,
                                    [order.id]: !prev[order.id],
                                  }))
                                }
                                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-all"
                                title={isExpanded ? "Collapse Details" : "Expand Details"}
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>

                            {/* Client / Company */}
                            <td className="p-4">
                              <div className="font-bold text-slate-900">{order.clientName}</div>
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold mt-0.5 border border-slate-200/60">
                                <Building2 size={10} className="text-slate-400" />
                                {order.companyName}
                              </span>
                            </td>

                            {/* Sales Person */}
                            <td className="p-4">
                              <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                <User2 size={12} className="text-emerald-600 shrink-0" />
                                <span className="text-[11px] font-semibold text-slate-800 font-sans truncate max-w-[130px]" title={getAssignedUserName(order.assignedToUserId)}>
                                  {getAssignedUserName(order.assignedToUserId)}
                                </span>
                              </div>
                            </td>

                            {/* Invoice # & PO */}
                            <td className="p-4 font-mono">
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-200">
                                <Check size={10} className="stroke-[3]" />
                                {order.billingDetails?.invoiceNumber}
                              </span>
                              <span className="block text-[10px] text-slate-500 font-semibold mt-0.5">
                                PO: {order.closedWonDetails?.customerPoNumber || "N/A"}
                              </span>
                            </td>

                            {/* Order Amount */}
                            <td className="p-4 text-right font-mono font-extrabold text-slate-900">
                              ₹{formatIndianNumber(totalAmt)}
                            </td>

                            {/* Payment Received */}
                            <td className="p-4 text-right font-mono font-extrabold text-emerald-700">
                              ₹{formatIndianNumber(receivedAmt)}
                            </td>

                            {/* Payment Status Badge */}
                            <td className="p-4 text-center">
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-extrabold px-2.5 py-1 rounded-full border border-emerald-300 shadow-2xs">
                                <CheckCircle2 size={12} className="text-emerald-600" />
                                100% Fully Paid
                              </span>
                            </td>

                            {/* UTR / Ref ID */}
                            <td className="p-4 text-center font-mono font-bold text-slate-700">
                              {utr}
                            </td>

                            {/* Payment Date */}
                            <td className="p-4 text-center font-mono text-slate-600">
                              {pDate}
                            </td>

                            {/* Invoice File */}
                            <td className="p-4">
                              {order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {order.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                    <a
                                      key={attIdx}
                                      href="#"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOrDownloadDocument(att.url, att.name || `invoice_${attIdx + 1}.pdf`);
                                      }}
                                      className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-0.5 px-2 rounded-lg text-[9.5px] font-mono transition-all border border-indigo-100"
                                      title={att.name}
                                    >
                                      <FileText size={10} />
                                      <span className="truncate max-w-[90px] inline-block align-bottom">
                                        {att.name || `Invoice ${attIdx + 1}`}
                                      </span>
                                      <ExternalLink size={9} />
                                    </a>
                                  ))}
                                </div>
                              ) : order.billingDetails?.invoiceFileUrl ? (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOrDownloadDocument(order.billingDetails.invoiceFileUrl, order.billingDetails.invoiceFileName || "invoice.pdf");
                                  }}
                                  className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2 rounded-lg text-[10px] font-mono transition-all border border-indigo-100"
                                >
                                  <FileText size={11} />
                                  <span className="truncate max-w-[100px] inline-block align-bottom">
                                    {order.billingDetails.invoiceFileName || "invoice.pdf"}
                                  </span>
                                  <ExternalLink size={10} />
                                </a>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">No file</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="p-4 text-center space-y-1">
                              <button
                                type="button"
                                onClick={() => openPaymentModal(order)}
                                disabled={!teamCanEdit}
                                className={`w-full inline-flex items-center justify-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all border shadow-2xs ${
                                  !teamCanEdit
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/80 cursor-pointer"
                                }`}
                                title={!teamCanEdit ? "Your team does not have edit permission." : undefined}
                              >
                                {!teamCanEdit ? <Lock size={12} className="text-slate-400" /> : <CreditCard size={12} className="text-emerald-600" />}
                                Update Payment
                              </button>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr className="bg-emerald-50/20">
                              <td colSpan={11} className="p-5 border-b border-emerald-100">
                                <div className="space-y-4 animate-fadeIn">
                                  {/* Mapped Payment Details Highlight Summary Card */}
                                  <div className="bg-gradient-to-r from-emerald-50 via-white to-emerald-50 p-4 border border-emerald-200 rounded-2xl shadow-2xs">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-2.5 mb-3">
                                      <div className="flex items-center gap-2">
                                        <Banknote className="text-emerald-700 h-4 w-4" />
                                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight font-mono">
                                          Fully Paid Payment Details Record
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openPaymentModal(order)}
                                        disabled={!teamCanEdit}
                                        className={`inline-flex items-center gap-1.5 font-bold text-[10px] font-mono px-3 py-1 rounded-lg transition-all shadow-xs ${
                                          !teamCanEdit
                                            ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                            : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                        }`}
                                        title={!teamCanEdit ? "Your team does not have edit permission." : undefined}
                                      >
                                        {!teamCanEdit ? <Lock size={11} /> : <Edit3 size={11} />}
                                        Edit Details
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-[11px] font-mono">
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Payment Status</span>
                                        <span className="font-extrabold text-emerald-700 block mt-0.5">
                                          Fully Paid
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Sales Person</span>
                                        <span className="font-bold text-slate-800 block mt-0.5 truncate" title={getAssignedUserName(order.assignedToUserId)}>
                                          {getAssignedUserName(order.assignedToUserId)}
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Total Received</span>
                                        <span className="font-extrabold text-emerald-700 block mt-0.5">
                                          ₹{formatIndianNumber(receivedAmt)}
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Pending Amount</span>
                                        <span className="font-extrabold text-slate-500 block mt-0.5">
                                          ₹0
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Payment Date</span>
                                        <span className="font-bold text-slate-800 block mt-0.5">
                                          {pDate}
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">UTR / Ref ID</span>
                                        <span className="font-bold text-slate-800 block mt-0.5 truncate">
                                          {utr}
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Last Updated</span>
                                        <span className="font-bold text-slate-800 block mt-0.5 truncate">
                                          {paymentRec?.updatedAt ? formatDate(new Date(paymentRec.updatedAt)) : "N/A"}
                                        </span>
                                      </div>
                                    </div>

                                    {paymentRec?.comments && (
                                      <div className="mt-3 bg-white p-2.5 rounded-xl border border-emerald-100 text-[11px]">
                                        <span className="text-[9px] text-slate-400 font-mono font-bold uppercase block">
                                          Payment Comments / Notes:
                                        </span>
                                        <p className="text-slate-700 mt-0.5 font-medium">
                                          {paymentRec.comments}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Secondary Grid: Bank details, Transporter info & Product Details */}
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Bank Info */}
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                                      <div className="flex items-center gap-2 text-slate-700 font-bold font-mono text-xs border-b border-slate-100 pb-2">
                                        <Building2 size={14} className="text-indigo-600" />
                                        <span>Payment Bank Details</span>
                                      </div>
                                      {bank ? (
                                        <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                                          <div><strong>Account Name:</strong> {bank.accountHolderName}</div>
                                          <div><strong>Bank:</strong> {bank.bankName}</div>
                                          <div><strong>Account #:</strong> {bank.accountNumber}</div>
                                          <div><strong>IFSC:</strong> {bank.ifscCode}</div>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-slate-400 italic font-mono bg-slate-50 p-2.5 rounded-lg">
                                          No payment bank selected for this order.
                                        </div>
                                      )}
                                    </div>

                                    {/* Dispatch / Transporter Info */}
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                                      <div className="flex items-center gap-2 text-slate-700 font-bold font-mono text-xs border-b border-slate-100 pb-2">
                                        <Truck size={14} className="text-emerald-600" />
                                        <span>Dispatch & Transporter Info</span>
                                      </div>
                                      <div className="text-xs space-y-1 font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                                        <div><strong>Actual Dispatch Date:</strong> {getOrderActualDispatchDate(order) ? formatDate(getOrderActualDispatchDate(order)!) : (order.closedWonDetails?.dispatchDate ? `${formatDate(order.closedWonDetails.dispatchDate)} (Expected)` : "N/A")}</div>
                                        <div><strong>Transporter:</strong> {order.closedWonDetails?.transporterName || "N/A"}</div>
                                        <div><strong>LR / Bilty #:</strong> {order.closedWonDetails?.lrNumber || "N/A"}</div>
                                        <div><strong>Payment Terms:</strong> {order.payment || "N/A"}</div>
                                      </div>
                                    </div>

                                    {/* Product Details Section */}
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                                      <div className="flex items-center gap-2 text-slate-700 font-bold font-mono text-xs border-b border-slate-100 pb-2">
                                        <ListOrdered size={14} className="text-emerald-600" />
                                        <span>Product Details & Itemization</span>
                                      </div>
                                      <div className="border border-slate-200/70 rounded-lg bg-white max-h-[220px] overflow-y-auto overflow-x-auto scrollbar-thin">
                                        <table className="w-full text-left text-[10px] min-w-[300px]">
                                          <thead>
                                            <tr className="bg-emerald-50/50 text-slate-600 border-b border-emerald-100 font-mono font-bold uppercase tracking-tight">
                                              <th className="p-2">Product</th>
                                              <th className="p-2 text-right">Qty</th>
                                              <th className="p-2 text-right">Rate</th>
                                              <th className="p-2 text-right">Amount</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 text-slate-600">
                                            {order.items?.map((item, idx) => (
                                              <tr key={idx} className="hover:bg-emerald-50/30">
                                                <td className="p-2 font-medium text-slate-800">{item.productName}</td>
                                                <td className="p-2 text-right font-mono font-semibold">{item.quantity}</td>
                                                <td className="p-2 text-right font-mono text-slate-500">₹{formatIndianNumber(item.rate || 0)}</td>
                                                <td className="p-2 text-right font-mono font-bold text-slate-700">₹{formatIndianNumber(item.amount || 0)}</td>
                                              </tr>
                                            ))}
                                            {(!order.items || order.items.length === 0) && (
                                              <tr>
                                                <td colSpan={4} className="p-3 text-center text-slate-400 italic">No items listed</td>
                                              </tr>
                                            )}
                                            <tr className="bg-emerald-50/40 font-bold border-t border-emerald-100">
                                              <td className="p-2 text-slate-700" colSpan={2}>Grand Total</td>
                                              <td className="p-2 text-right text-emerald-950 font-mono text-xs" colSpan={2}>
                                                ₹{formatIndianNumber(order.totalValue || 0)}
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UPDATE PAYMENT DETAILS MODAL */}
      {editingPaymentOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-1.5 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingPaymentOrder(null);
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[calc(100vh-1rem)] sm:max-h-[88vh] flex flex-col overflow-hidden animate-scaleUp my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (Sticky / Fixed at top) */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 shrink-0">
                  <CreditCard size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                    Update Payment Details
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    Invoice #{editingPaymentOrder.billingDetails?.invoiceNumber || "N/A"} • {editingPaymentOrder.clientName} {editingPaymentOrder.companyName ? `(${editingPaymentOrder.companyName})` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPaymentOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-all cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 sm:space-y-4.5 overscroll-contain">
              {/* Order financial & sales summary cards */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 sm:p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
                <div className="min-w-0">
                  <span className="text-slate-500 font-bold uppercase block text-[10px] tracking-wider truncate">Sales Person</span>
                  <span className="text-slate-800 font-bold text-xs flex items-center gap-1 mt-0.5 truncate">
                    <User2 size={12} className="text-emerald-600 shrink-0" />
                    <span className="truncate">{getAssignedUserName(editingPaymentOrder.assignedToUserId)}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase block text-[10px] tracking-wider truncate">Order Total</span>
                  <span className="text-slate-900 font-black text-xs sm:text-sm block mt-0.5">
                    ₹{formatIndianNumber(getOrderTotalInvoiceAmount(editingPaymentOrder) || editingPaymentOrder.totalValue || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 font-bold uppercase block text-[10px] tracking-wider truncate">Total Received</span>
                  <span className="text-emerald-700 font-extrabold text-xs sm:text-sm block mt-0.5">
                    ₹{formatIndianNumber(parseFloat(paymentForm.amountReceived) || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-amber-700 font-bold uppercase block text-[10px] tracking-wider truncate">Pending Balance</span>
                  <span className="text-amber-700 font-extrabold text-xs sm:text-sm block mt-0.5">
                    ₹{formatIndianNumber(parseFloat(paymentForm.pendingAmount) || 0)}
                  </span>
                </div>
              </div>

              {/* SECTION 1: Payment Receipt Records History */}
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 sm:p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-extrabold text-slate-800 uppercase font-mono tracking-wider flex items-center gap-1.5">
                    <History size={14} className="text-blue-600 shrink-0" />
                    <span>Payment Receipts History</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full shrink-0">
                    {orderReceipts.length} Record{orderReceipts.length === 1 ? "" : "s"}
                  </span>
                </div>

                {orderReceipts.length === 0 ? (
                  <div className="text-center py-3.5 px-2 bg-white border border-dashed border-slate-200 rounded-lg text-slate-500 text-xs">
                    No separate payment receipt records logged yet. Use the form below to add a new record.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white shadow-2xs">
                    {orderReceipts.map((rec) => (
                      <div key={rec.id} className="p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-mono font-bold text-slate-800">
                            <span className="flex items-center gap-1 text-slate-600">
                              <Calendar size={12} className="text-slate-400 shrink-0" />
                              {formatDate(rec.paymentReceivedDate)}
                            </span>
                            {rec.utrId && (
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono break-all">
                                UTR: {rec.utrId}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>By: {rec.createdBy || "System"}</span>
                            {rec.comments && <span className="italic text-slate-600">• {rec.comments}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <span className="font-mono font-extrabold text-emerald-700 text-xs sm:text-sm">
                            ₹{formatIndianNumber(rec.amount || 0)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeletePaymentReceipt(rec.id)}
                            title="Delete this payment record"
                            className="text-rose-400 hover:text-rose-600 p-1 sm:p-1.5 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: Add New Payment Received Details */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 sm:p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                  <span className="text-xs font-extrabold text-emerald-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                    <Receipt size={14} className="text-emerald-600 shrink-0" />
                    <span>Add New Payment Received Record</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold shrink-0">
                    + New Payment Entry
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {/* Received Date */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-700 mb-1">
                      Received Date *
                    </label>
                    <input
                      type="date"
                      value={paymentForm.paymentReceivedDate}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, paymentReceivedDate: e.target.value }))
                      }
                      className="w-full text-xs font-mono font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-2.5 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                    />
                  </div>

                  {/* UTR ID / Transaction Ref */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-700 mb-1">
                      UTR ID / Ref
                    </label>
                    <div className="relative">
                      <Hash size={13} className="absolute left-2.5 top-2.5 sm:top-3 text-slate-400" />
                      <input
                        type="text"
                        value={paymentForm.utrId}
                        onChange={(e) =>
                          setPaymentForm((prev) => ({ ...prev, utrId: e.target.value }))
                        }
                        className="w-full text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-xl pl-7 pr-2 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                        placeholder="UTR12345678"
                      />
                    </div>
                  </div>

                  {/* Amount Received in this Entry */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-emerald-800 mb-1">
                      Amount (₹) *
                    </label>
                    <div className="relative">
                      <IndianRupee size={13} className="absolute left-2.5 top-2.5 sm:top-3 text-emerald-600" />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={paymentForm.lastEnteredAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          const entryAmt = parseFloat(val) || 0;
                          const total = getOrderTotalInvoiceAmount(editingPaymentOrder) || editingPaymentOrder.totalValue || 0;
                          const existingSum = orderReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
                          const totalReceived = existingSum + entryAmt;
                          const calcPending = Math.max(0, total - totalReceived);

                          let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
                          if (totalReceived >= total && total > 0) autoStatus = "Fully paid";
                          else if (totalReceived > 0) autoStatus = "Partial paid";

                          setPaymentForm((prev) => ({
                            ...prev,
                            lastEnteredAmount: val,
                            amountReceived: totalReceived.toString(),
                            pendingAmount: calcPending.toString(),
                            paymentStatus: autoStatus,
                          }));
                        }}
                        className="w-full text-xs font-mono font-extrabold text-emerald-900 bg-white border border-emerald-300 rounded-xl pl-7 pr-2 py-2 sm:py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 italic">
                    {parseFloat(paymentForm.lastEnteredAmount) > 0 ? (
                      <span className="text-emerald-700 font-semibold">
                        Adding ₹{formatIndianNumber(parseFloat(paymentForm.lastEnteredAmount) || 0)} to total received
                      </span>
                    ) : (
                      "Enter amount above to log a new payment record"
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={isSavingPayment || !(parseFloat(paymentForm.lastEnteredAmount) > 0)}
                    onClick={handleAddPaymentReceipt}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
                  >
                    <Plus size={14} />
                    <span>+ Save Payment Record</span>
                  </button>
                </div>
              </div>

              {/* SECTION 3: Cumulative Payment Summary */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 sm:p-3.5 space-y-3">
                <span className="text-[11px] font-mono uppercase font-extrabold text-slate-600 block border-b border-slate-200/60 pb-1.5">
                  Overall Payment Summary
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
                  {/* How Much Payment Received (Total) */}
                  <div>
                    <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                      How Much Payment Received (Total ₹)
                    </label>
                    <div className="relative">
                      <IndianRupee size={14} className="absolute left-3 top-2.5 sm:top-3 text-slate-400" />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={paymentForm.amountReceived}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numVal = parseFloat(val) || 0;
                          const total = getOrderTotalInvoiceAmount(editingPaymentOrder) || editingPaymentOrder.totalValue || 0;
                          const calcPending = Math.max(0, total - numVal);
                          const calcEntry = Math.max(0, numVal - previousAmountReceived);

                          let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
                          if (numVal >= total && total > 0) autoStatus = "Fully paid";
                          else if (numVal > 0) autoStatus = "Partial paid";

                          setPaymentForm((prev) => ({
                            ...prev,
                            amountReceived: val,
                            lastEnteredAmount: calcEntry.toString(),
                            pendingAmount: calcPending.toString(),
                            paymentStatus: autoStatus,
                          }));
                        }}
                        className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Pending Amount */}
                  <div>
                    <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                      Pending Amount (₹)
                    </label>
                    <div className="relative">
                      <IndianRupee size={14} className="absolute left-3 top-2.5 sm:top-3 text-slate-400" />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={paymentForm.pendingAmount}
                        onChange={(e) =>
                          setPaymentForm((prev) => ({ ...prev, pendingAmount: e.target.value }))
                        }
                        className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Status & Comments */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={paymentForm.paymentStatus}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({
                          ...prev,
                          paymentStatus: e.target.value as "Unpaid" | "Partial paid" | "Fully paid",
                        }))
                      }
                      className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partial paid">Partial paid</option>
                      <option value="Fully paid">Fully paid</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                      Comments / Notes
                    </label>
                    <input
                      type="text"
                      value={paymentForm.comments}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, comments: e.target.value }))
                      }
                      className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 sm:py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 shadow-2xs"
                      placeholder="Payment notes / bank ref..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions (Sticky / Fixed at bottom) */}
            <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-3.5 border-t border-slate-100 bg-slate-50/90 sm:bg-white z-10 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPaymentOrder(null)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPayment}
                onClick={handleSavePaymentDetails}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 text-center"
              >
                {isSavingPayment ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Payment Details</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Edit Invoice in Debtors */}
      {confirmEditOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-600 shrink-0">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">
                  Edit Invoice Mapping?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-normal">
                  Do you really want to edit the invoice number and invoice file for <strong>{confirmEditOrder.clientName}</strong> ({confirmEditOrder.companyName})?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] space-y-1.5 font-mono text-slate-600">
              <div className="flex justify-between">
                <span>Customer PO:</span>
                <span className="font-bold text-slate-800">
                  {confirmEditOrder.closedWonDetails?.customerPoNumber || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Current Invoice #:</span>
                <span className="font-bold text-emerald-700">
                  {confirmEditOrder.billingDetails?.invoiceNumber || "N/A"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmEditOrder(null)}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 text-[11px] font-bold font-mono rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToBilling) {
                    onNavigateToBilling(confirmEditOrder.id);
                  }
                  setConfirmEditOrder(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Go to Indent Billing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK PAYMENT RECEIPTS IMPORT MODAL */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold flex items-center gap-2">
                    Bulk Import Payment Receipts
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 font-normal">
                      Google Sheets / CSV
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Import multiple payment receipts mapped automatically against Invoice Numbers. Pending balances recalculate instantly.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkImportModal(false);
                  setBulkInputText("");
                  setBulkFileName("");
                }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
              {/* Guidance & Sample Actions */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-950 font-mono uppercase flex items-center gap-1.5">
                    <Info size={14} className="text-emerald-700" />
                    Format Requirements & Auto-Mapping
                  </h4>
                  <p className="text-xs text-emerald-800 leading-relaxed max-w-2xl">
                    Your spreadsheet must include an <strong>Invoice Number</strong> (or Invoice # / Order ID) and an <strong>Amount Received</strong> column. Optional columns: <strong>Payment Date</strong>, <strong>UTR Number</strong>, <strong>Comments</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={handleDownloadSampleCSV}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100/60 text-emerald-800 border border-emerald-300 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    <Download size={14} />
                    <span>Download CSV Sample</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySampleTemplate}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100/60 text-emerald-800 border border-emerald-300 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    <Clipboard size={14} />
                    <span>Copy Header Template</span>
                  </button>
                </div>
              </div>

              {/* Upload or Paste Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* File Upload Drop Zone */}
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500/60 bg-slate-50/50 hover:bg-emerald-50/30 rounded-2xl p-4 transition-all flex flex-col items-center justify-center text-center group cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="p-3 bg-white text-emerald-600 rounded-full shadow-xs mb-2 group-hover:scale-110 transition-transform border border-slate-100">
                    <FileUp size={24} />
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    {bulkFileName ? `Uploaded: ${bulkFileName}` : "Click or Drag CSV / TSV file here"}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    Supports .csv, .tsv export from Google Sheets & Excel
                  </span>
                </div>

                {/* Direct Paste / Edit Info */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold font-mono uppercase text-slate-700 flex items-center justify-between">
                    <span>Or Paste / Edit Data Below</span>
                    <span className="text-[10px] text-slate-400 font-normal">Tab or comma separated</span>
                  </label>
                  <textarea
                    rows={4}
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    placeholder={`Invoice Number\tAmount Received\tPayment Date\tUTR Number\tComments\nINV-2026-001\t25000\t2026-08-25\tUTR987654321\tPartial payment received`}
                    className="w-full text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none shadow-2xs placeholder:text-slate-300"
                  />
                </div>
              </div>

              {/* Live Mapping KPI Summary */}
              {parsedBulkRows.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white rounded-xl p-3.5">
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-slate-300">
                        Import Verification
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-500 text-white font-mono text-xs px-2.5 py-0.5 rounded-full font-bold">
                          {parsedBulkRows.filter((r) => r.isValid).length} Valid Mapped
                        </span>
                        {parsedBulkRows.filter((r) => !r.isValid).length > 0 && (
                          <span className="bg-rose-500 text-white font-mono text-xs px-2.5 py-0.5 rounded-full font-bold">
                            {parsedBulkRows.filter((r) => !r.isValid).length} Errors / Unmatched
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-emerald-400 font-bold">
                      Total Payment Sum to Import: ₹
                      {formatIndianNumber(
                        parsedBulkRows
                          .filter((r) => r.isValid)
                          .reduce((sum, r) => sum + r.rawAmount, 0)
                      )}
                    </div>
                  </div>

                  {/* Parsed Rows Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 text-[10px] font-mono uppercase font-extrabold text-slate-600">
                        <tr>
                          <th className="py-2 px-3">Row #</th>
                          <th className="py-2 px-3">Invoice #</th>
                          <th className="py-2 px-3">Matched Client / Party</th>
                          <th className="py-2 px-3 text-right">Payment Amount</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">UTR / Ref</th>
                          <th className="py-2 px-3 text-right">Calculated New Pending</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {parsedBulkRows.map((r, i) => (
                          <tr
                            key={i}
                            className={r.isValid ? "hover:bg-slate-50/80" : "bg-rose-50/50 hover:bg-rose-50"}
                          >
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{r.rowIndex}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-800">
                              {r.rawInvoiceNo}
                            </td>
                            <td className="py-2 px-3">
                              {r.isValid ? (
                                <div>
                                  <div className="font-semibold text-slate-800">{r.matchedClientName}</div>
                                  {r.matchedCompanyName && (
                                    <div className="text-[10px] text-slate-500">{r.matchedCompanyName}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-600 font-medium text-[11px]">
                                  {r.validationError}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-extrabold text-emerald-700">
                              ₹{formatIndianNumber(r.rawAmount)}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{r.rawDate}</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                              {r.rawUtr || <span className="text-slate-300">N/A</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">
                              {r.isValid ? (
                                <span className={r.newPendingAmount === 0 ? "text-emerald-600" : "text-amber-700"}>
                                  ₹{formatIndianNumber(r.newPendingAmount || 0)}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {r.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={11} />
                                  Matched ({r.newStatus})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                                  <AlertCircle size={11} />
                                  Failed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowBulkImportModal(false);
                  setBulkInputText("");
                  setBulkFileName("");
                }}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isSavingBulkImport || parsedBulkRows.filter((r) => r.isValid).length === 0
                }
                onClick={handleExecuteBulkImport}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSavingBulkImport ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Importing & Updating Pendings...</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>
                      Import {parsedBulkRows.filter((r) => r.isValid).length} Valid Payment Receipt(s)
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAD DEBTORS ADD / EDIT MODAL */}
      {showBadDebtorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingBadDebtor ? "Edit Bad Debtor Record" : "Add Bad Debtor Details"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingBadDebtor ? "Update information for this defaulted account." : "Record a bad debtor with invoice details and overdue days."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBadDebtorModal(false);
                  setEditingBadDebtor(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-700">Company Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corporation Pvt Ltd"
                  value={badDebtorForm.companyName}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Client / Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={badDebtorForm.clientName}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, clientName: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Client Email (For Reminders)</label>
                <input
                  type="email"
                  placeholder="e.g. accounts@acme.com"
                  value={badDebtorForm.email}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Client Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +91 9876543210"
                  value={badDebtorForm.phone}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Customer PO #</label>
                <input
                  type="text"
                  placeholder="e.g. PO-2025-984"
                  value={badDebtorForm.customerPo}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, customerPo: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Invoice Number *</label>
                <input
                  type="text"
                  placeholder="e.g. INV-2025-088"
                  value={badDebtorForm.invoiceNumber}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Invoice Date *</label>
                <input
                  type="date"
                  value={badDebtorForm.invoiceDate}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, invoiceDate: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Invoice Amount (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 150000"
                  value={badDebtorForm.invoiceAmount}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, invoiceAmount: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Due Date *</label>
                <input
                  type="date"
                  value={badDebtorForm.dueDate}
                  onChange={(e) => {
                    const newDue = e.target.value;
                    const autoOverdue = computeOverdueDays(newDue);
                    setBadDebtorForm((prev) => ({ ...prev, dueDate: newDue, overdueDays: String(autoOverdue) }));
                  }}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Overdue Days</label>
                <input
                  type="number"
                  placeholder="e.g. 180"
                  value={badDebtorForm.overdueDays}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, overdueDays: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Sales Person *</label>
                <select
                  value={badDebtorForm.assignedToUserId || ""}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, assignedToUserId: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="">Select Sales Person</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role || "Sales"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Status</label>
                <select
                  value={badDebtorForm.status}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, status: e.target.value as any }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="Bad Debt">Bad Debt</option>
                  <option value="In Recovery">In Recovery</option>
                  <option value="Partial Paid">Partial Paid</option>
                  <option value="Written Off">Written Off</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-700">Comments / Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Add legal status, internal notes, default history..."
                  value={badDebtorForm.comments}
                  onChange={(e) => setBadDebtorForm((prev) => ({ ...prev, comments: e.target.value }))}
                  className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowBadDebtorModal(false);
                  setEditingBadDebtor(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingBadDebtor}
                onClick={handleSaveBadDebtor}
                className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSavingBadDebtor ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingBadDebtor ? "Update Record" : "Save Bad Debtor"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAD DEBTOR PAYMENTS MANAGEMENT MODAL */}
      {showBadDebtorPaymentModal && managingBadDebtorPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto scrollbar-thin">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Payment Receipts — {managingBadDebtorPayment.companyName}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bad Debt Invoice #{managingBadDebtorPayment.invoiceNumber} | Total Value:{" "}
                    <span className="font-bold text-slate-900 font-mono">
                      ₹{formatIndianNumber(managingBadDebtorPayment.invoiceAmount)}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBadDebtorPaymentModal(false);
                  setManagingBadDebtorPayment(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Payment Summary Box */}
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">
                  Invoice Amount
                </p>
                <p className="text-sm font-black font-mono text-slate-900 mt-0.5">
                  ₹{formatIndianNumber(managingBadDebtorPayment.invoiceAmount)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">
                  Total Received
                </p>
                <p className="text-sm font-black font-mono text-emerald-700 mt-0.5">
                  ₹{formatIndianNumber(getBadDebtorTotalReceived(managingBadDebtorPayment))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-slate-400">
                  Pending Balance
                </p>
                <p className="text-sm font-black font-mono text-rose-600 mt-0.5">
                  ₹{formatIndianNumber(getBadDebtorPendingAmount(managingBadDebtorPayment))}
                </p>
              </div>
            </div>

            {/* Add Payment Form Section */}
            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <Plus size={14} className="text-emerald-600" />
                <span>Log New Payment Receipt</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Payment Received Date *</label>
                  <input
                    type="date"
                    value={badDebtorPaymentForm.paymentReceivedDate}
                    onChange={(e) =>
                      setBadDebtorPaymentForm((prev) => ({ ...prev, paymentReceivedDate: e.target.value }))
                    }
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Amount Received (₹) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 50000"
                    value={badDebtorPaymentForm.amount}
                    onChange={(e) => setBadDebtorPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">UTR / Reference ID</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-982347102"
                    value={badDebtorPaymentForm.utrId}
                    onChange={(e) => setBadDebtorPaymentForm((prev) => ({ ...prev, utrId: e.target.value }))}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Remarks / Mode</label>
                  <input
                    type="text"
                    placeholder="e.g. NEFT Bank Transfer / Legal recovery instalment"
                    value={badDebtorPaymentForm.comments}
                    onChange={(e) => setBadDebtorPaymentForm((prev) => ({ ...prev, comments: e.target.value }))}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={isSavingBadDebtorPayment || !badDebtorPaymentForm.amount}
                  onClick={handleAddBadDebtorPaymentReceipt}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingBadDebtorPayment ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving Receipt...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Save Receipt</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* List of Previous Payment Receipts */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Payment Receipts History</span>
                <span className="text-[11px] font-mono font-normal text-slate-500">
                  {(managingBadDebtorPayment.receipts || []).length} receipt(s) logged
                </span>
              </h4>

              {(managingBadDebtorPayment.receipts || []).length === 0 ? (
                <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                  No payment receipts recorded yet for this bad debtor invoice.
                </div>
              ) : (
                <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200/80">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">UTR / Ref #</th>
                        <th className="p-2.5 text-right">Amount (₹)</th>
                        <th className="p-2.5">Remarks / Created By</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {(managingBadDebtorPayment.receipts || []).map((rec, idx) => {
                        const keyId = rec.id || `rec-${idx}`;
                        const isConfirming = confirmDeleteReceiptId === keyId;

                        return (
                          <tr key={keyId} className="hover:bg-slate-50/80">
                            <td className="p-2.5 font-bold text-slate-900">
                              {formatDate(rec.paymentReceivedDate)}
                            </td>
                            <td className="p-2.5 text-slate-600">
                              {rec.utrId || <span className="text-slate-400 italic">N/A</span>}
                            </td>
                            <td className="p-2.5 text-right font-black text-emerald-700">
                              ₹{formatIndianNumber(rec.amount || 0)}
                            </td>
                            <td className="p-2.5 text-slate-500 font-sans text-[11px]">
                              {rec.comments && <div className="text-slate-700 font-medium">{rec.comments}</div>}
                              <div className="text-[10px] text-slate-400">By: {rec.createdBy || "System"}</div>
                            </td>
                            <td className="p-2.5 text-center">
                              {isConfirming ? (
                                <div className="flex items-center justify-center gap-1.5 animate-fadeIn">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBadDebtorPaymentReceipt(rec.id, idx)}
                                    disabled={isSavingBadDebtorPayment}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer shadow-2xs"
                                    title="Confirm Delete"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteReceiptId(null)}
                                    disabled={isSavingBadDebtorPayment}
                                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                                    title="Cancel"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteReceiptId(keyId)}
                                  disabled={isSavingBadDebtorPayment}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                  title="Delete Receipt"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowBadDebtorPaymentModal(false);
                  setManagingBadDebtorPayment(null);
                }}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAD DEBTORS BULK IMPORT MODAL */}
      {showBadDebtorsImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bulk Import Bad Debtors</h3>
                  <p className="text-[11px] text-slate-500">
                    Paste raw data or upload CSV/TSV with bad debtor invoice details.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBadDebtorsImportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Controls & Helpers */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-700">Supported CSV / TSV Headers:</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBadDebtorsSampleCSV}
                    className="flex items-center gap-1 text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Sample CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = `Company Name\tClient Name\tEmail\tCustomer PO\tInvoice Number\tInvoice Date\tInvoice Amount\tDue Date\tOverdue Days\tComments\tStatus\nAcme Corp\tJohn Doe\tjohn@acme.com\tPO-98421\tINV-2025-088\t2025-01-10\t125000\t2025-02-10\t180\tOverdue account\tBad Debt`;
                      navigator.clipboard.writeText(sample);
                      alert("Sample template header copied to clipboard!");
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold font-mono text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    <Clipboard size={12} />
                    <span>Copy Template</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                Headers: <strong>Company Name</strong>, <strong>Customer PO</strong>, <strong>Invoice Number</strong>, <strong>Invoice Date</strong>, <strong>Invoice Amount</strong>, <strong>Due Date</strong>, <strong>Overdue Days</strong>, Client Name, Email, Phone, Comments, Status
              </p>
            </div>

            {/* Input / Upload Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Paste Data or Upload File</label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  id="bad-debtors-file-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBadDebtorsImportFileName(file.name);
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target?.result as string;
                      if (text) setBadDebtorsImportText(text);
                    };
                    reader.readAsText(file);
                  }}
                />
                <label
                  htmlFor="bad-debtors-file-upload"
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-emerald-700 cursor-pointer"
                >
                  <FileUp size={13} />
                  <span>Upload File {badDebtorsImportFileName ? `(${badDebtorsImportFileName})` : ""}</span>
                </label>
              </div>

              <textarea
                rows={6}
                placeholder={`Company Name,Customer PO,Invoice Number,Invoice Date,Invoice Amount,Due Date,Overdue Days,Client Name,Email\nAcme Ltd,PO-102,INV-901,2025-01-01,75000,2025-02-01,150,Jane,jane@acme.com`}
                value={badDebtorsImportText}
                onChange={(e) => setBadDebtorsImportText(e.target.value)}
                className="w-full text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Validation Preview */}
            {parsedBadDebtorImportRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-slate-700">Validation Preview ({parsedBadDebtorImportRows.length} rows detected)</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Valid: {parsedBadDebtorImportRows.filter((r) => r.isValid).length} | Invalid: {parsedBadDebtorImportRows.filter((r) => !r.isValid).length}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="p-2">Row</th>
                        <th className="p-2">Company</th>
                        <th className="p-2">PO #</th>
                        <th className="p-2">Invoice #</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-center">Overdue</th>
                        <th className="p-2">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedBadDebtorImportRows.map((r, idx) => (
                        <tr key={idx} className={r.isValid ? "bg-white" : "bg-rose-50/70"}>
                          <td className="p-2 text-slate-400">#{r.rowIndex}</td>
                          <td className="p-2 font-bold text-slate-800">{r.companyName}</td>
                          <td className="p-2 text-slate-600">{r.customerPo || "N/A"}</td>
                          <td className="p-2 font-bold text-slate-900">{r.invoiceNumber}</td>
                          <td className="p-2 text-right font-bold text-rose-600">₹{formatIndianNumber(r.invoiceAmount || 0)}</td>
                          <td className="p-2 text-center font-bold text-amber-700">{r.overdueDays || 0}d</td>
                          <td className="p-2">
                            {r.isValid ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <Check size={12} /> Ready
                              </span>
                            ) : (
                              <span className="text-rose-600 font-bold flex items-center gap-1">
                                <AlertCircle size={12} /> {r.validationError}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBadDebtorsImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingBadDebtorsImport || parsedBadDebtorImportRows.filter((r) => r.isValid).length === 0}
                onClick={handleExecuteBadDebtorsBulkImport}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shadow-xs cursor-pointer ${
                  parsedBadDebtorImportRows.filter((r) => r.isValid).length > 0 && !isSavingBadDebtorsImport
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                }`}
              >
                {isSavingBadDebtorsImport ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Importing Bad Debtors...</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Import Valid Records ({parsedBadDebtorImportRows.filter((r) => r.isValid).length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
