/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { User, OrderOffer, Role, PaymentBank, EmailTemplate, PaymentDetails } from "../types";
import { saveLog, savePaymentDetails } from "../lib/firebaseService";
import { openOrDownloadDocument } from "../lib/googleDriveService";
import { replaceTemplateVars, resolveUserHierarchyInfo } from "../lib/templateUtils";
import { formatDate } from "../utils";
import { canViewOrderOffer } from "../data";
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
  Code
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
 * Generates formatted HTML table for consolidated invoice details
 */
export function generateConsolidatedInvoiceTableHTML(orders: OrderOffer[], paymentDetailsList: PaymentDetails[]) {
  const rows = orders.map((o) => {
    const pDet = paymentDetailsList.find((p) => p.orderId === o.id);
    const totalAmt = o.totalValue || 0;
    const receivedAmt = pDet ? pDet.amountReceived : 0;
    const pendingAmt = pDet ? pDet.pendingAmount : Math.max(0, totalAmt - receivedAmt);
    const dueInfo = calculateDueDate(o.closedWonDetails?.dispatchDate, o.payment);
    const invNum = o.billingDetails?.invoiceNumber || "N/A";
    const poNum = o.closedWonDetails?.customerPoNumber || "N/A";
    const dispDate = o.closedWonDetails?.dispatchDate ? formatDate(o.closedWonDetails.dispatchDate) : "N/A";
    const dueDateColor = dueInfo.isOverdue ? "#dc2626" : "#1e293b";

    return `<tr style="background-color:#ffffff;">` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; font-weight:bold; color:#0f172a; text-align:left;">${invNum}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; color:#334155; text-align:left;">${poNum}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-size:11px; color:#475569; text-align:left;">${dispDate}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; font-family:monospace; font-weight:bold; color:${dueDateColor}; text-align:left;">${dueInfo.dueDateFormatted}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; color:#0f172a;">₹${totalAmt.toLocaleString()}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; color:#166534; font-weight:bold;">₹${receivedAmt.toLocaleString()}</td>` +
      `<td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:right; font-family:monospace; font-weight:800; color:#dc2626;">₹${pendingAmt.toLocaleString()}</td>` +
    `</tr>`;
  }).join("");

  const grandTotalValue = orders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
  const grandTotalReceived = orders.reduce((sum, o) => {
    const p = paymentDetailsList.find((pd) => pd.orderId === o.id);
    return sum + (p ? p.amountReceived : 0);
  }, 0);
  const grandTotalPending = orders.reduce((sum, o) => {
    const p = paymentDetailsList.find((pd) => pd.orderId === o.id);
    const tot = o.totalValue || 0;
    const rec = p ? p.amountReceived : 0;
    return sum + (p ? p.pendingAmount : Math.max(0, tot - rec));
  }, 0);

  const tableHtml = `<div style="margin:16px 0; overflow-x:auto;">` +
    `<table border="0" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:12px; border:1px solid #047857; background-color:#ffffff; text-align:left;">` +
      `<thead>` +
        `<tr style="background-color:#065f46; color:#ffffff; font-weight:bold; font-family:monospace; font-size:11px; text-transform:uppercase;">` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">INVOICE #</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">CUSTOMER PO #</th>` +
          `<th style="padding:10px 12px; border:1px solid #047857; text-align:left; color:#ffffff; background-color:#065f46;">DISPATCH DATE</th>` +
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
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#0f172a; font-family:monospace; font-weight:bold;">₹${grandTotalValue.toLocaleString()}</td>` +
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#166534; font-family:monospace; font-weight:bold;">₹${grandTotalReceived.toLocaleString()}</td>` +
          `<td style="padding:10px 12px; border:1px solid #a7f3d0; text-align:right; color:#dc2626; font-family:monospace; font-size:13px; font-weight:800;">₹${grandTotalPending.toLocaleString()}</td>` +
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
  onEditOrder: (order: OrderOffer) => void;
  paymentBanks?: PaymentBank[];
  visibleSubTabs?: { [key: string]: string[] };
  emailTemplates?: EmailTemplate[];
  paymentDetailsList?: PaymentDetails[];
  onNavigateToBilling?: (orderId: string) => void;
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function PaymentListView({
  activeUserId,
  users,
  orders = [],
  onEditOrder,
  paymentBanks = [],
  visibleSubTabs,
  emailTemplates = [],
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

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["payment_list"]?.view !== false;

  // Debtors & Fully Paid tab states
  const [expandedOrderIds, setExpandedOrderIds] = useState<{ [key: string]: boolean }>({});
  const [expandedDebtorPartyKeys, setExpandedDebtorPartyKeys] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [fullyPaidSearchTerm, setFullyPaidSearchTerm] = useState("");
  const [confirmEditOrder, setConfirmEditOrder] = useState<OrderOffer | null>(null);

  // Payment Details Modal state
  const [editingPaymentOrder, setEditingPaymentOrder] = useState<OrderOffer | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    amountReceived: string;
    pendingAmount: string;
    paymentStatus: "Unpaid" | "Partial paid" | "Fully paid";
    paymentReceivedDate: string;
    utrId: string;
    comments: string;
  }>({
    amountReceived: "0",
    pendingAmount: "0",
    paymentStatus: "Unpaid",
    paymentReceivedDate: new Date().toISOString().split("T")[0],
    utrId: "",
    comments: "",
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentSaveSuccess, setPaymentSaveSuccess] = useState<string | null>(null);

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
    const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
    return isOrderFullyPaid(order, pDetails);
  };

  const debtorsBase = useMemo(() => mappedOrders.filter((o) => !checkFullyPaid(o)), [mappedOrders, paymentDetailsList]);
  const reminderBase = useMemo(() => mappedOrders.filter((o) => !checkFullyPaid(o)), [mappedOrders, paymentDetailsList]);
  const fullyPaidBase = useMemo(() => mappedOrders.filter((o) => checkFullyPaid(o)), [mappedOrders, paymentDetailsList]);

  // Party-wise Consolidated Calculation
  const consolidatedParties = useMemo(() => {
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

    reminderBase.forEach((order) => {
      const company = (order.companyName || "").trim();
      const client = (order.clientName || "").trim();
      const key = (company || client || "Unspecified Party").toLowerCase();

      const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
      const totalAmt = order.totalValue || 0;
      const receivedAmt = pDetails ? pDetails.amountReceived : 0;
      const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - receivedAmt);
      const dueInfo = calculateDueDate(order.closedWonDetails?.dispatchDate, order.payment);

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
  }, [reminderBase, paymentDetailsList]);

  // Sub-tabs config & state
  const allSubTabs = [
    { id: "debtors", label: "Debtors", icon: FileText, count: consolidatedParties.length },
    { id: "payment_reminder", label: "Payment Reminder", icon: BellRing, count: reminderBase.length },
    { id: "payment_reminder_consolidated", label: "Payment Reminder Consolidated", icon: Layers, count: consolidatedParties.length },
    { id: "fully_paid", label: "Fully Paid", icon: CheckCircle2, count: fullyPaidBase.length },
  ];

  const visibleTabsForPayment = visibleSubTabs?.["payment_list"] || allSubTabs.map((t) => t.id);
  const filteredSubTabs = useMemo(() => {
    return allSubTabs.filter((t) => visibleTabsForPayment.includes(t.id));
  }, [JSON.stringify(visibleTabsForPayment), reminderBase.length, consolidatedParties.length, fullyPaidBase.length]);

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
  const openConsolidatedEmailModal = (party: typeof consolidatedParties[0]) => {
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

    let defaultSub = `Consolidated Payment Reminder Notice - ${party.companyName} (Outstanding: ₹${party.totalPendingAmount.toLocaleString()})`;
    let defaultBody = `Dear ${party.clientName || party.companyName},\n\nWe hope this email finds you well.\n\nThis is a consolidated payment reminder regarding pending invoices for ${party.companyName}.\n\nBelow is the invoice-wise details of your pending balance:\n\n${invTableHtml}\n\nConsolidated Total Pending Amount: ₹${party.totalPendingAmount.toLocaleString()}\n\nKindly review and process the pending payment at your earliest convenience. If payment has already been remitted, please share the UTR / transaction receipt details.\n\nThank you for your cooperation!`;

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

      await fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toClean,
          cc: ccClean,
          bcc: bccClean,
          subject: consolidatedSubject,
          text: consolidatedBody,
          senderUserId: activeUser?.id,
        }),
      });

      for (let i = 0; i < consolidatedEmailParty.orders.length; i++) {
        const order = consolidatedEmailParty.orders[i];
        await saveLog({
          id: `log-consolidated-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Send Email",
          targetType: "Order",
          targetId: order.id,
          targetName: order.companyName,
          details: `Sent Consolidated Payment Reminder email to ${consolidatedEmailParty.companyName} (${toClean}) covering ${consolidatedEmailParty.invoiceCount} invoices for total pending ₹${consolidatedEmailParty.totalPendingAmount.toLocaleString()}`,
        });
      }

      setSendSuccessMsg(
        `Successfully sent consolidated payment reminder email to ${consolidatedEmailParty.companyName} (${toClean})!`
      );
      setConsolidatedEmailParty(null);
    } catch (err) {
      console.error("Error sending consolidated payment reminder:", err);
      alert("Failed to send consolidated payment reminder email. Please try again.");
    } finally {
      setIsSendingConsolidatedEmail(false);
    }
  };

  // Filter for Debtors (Excludes Fully Paid)
  const debtorsOrders = debtorsBase.filter((order) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
      pDetails?.utrId?.toLowerCase().includes(term) ||
      pDetails?.paymentStatus?.toLowerCase().includes(term)
    );
  });

  // Filter for Debtors Consolidated Party-wise
  const filteredConsolidatedDebtors = useMemo(() => {
    if (!searchTerm.trim()) return consolidatedParties;
    const term = searchTerm.toLowerCase();
    return consolidatedParties.filter((p) => {
      const matchParty =
        p.companyName.toLowerCase().includes(term) ||
        p.clientName.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.phone.toLowerCase().includes(term);

      const matchInvoice = p.orders.some(
        (o) => {
          const pDetails = paymentDetailsList.find((pay) => pay.orderId === o.id);
          return (
            o.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
            o.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
            pDetails?.utrId?.toLowerCase().includes(term) ||
            pDetails?.paymentStatus?.toLowerCase().includes(term)
          );
        }
      );

      return matchParty || matchInvoice;
    });
  }, [consolidatedParties, searchTerm, paymentDetailsList]);

  // Filter for Payment Reminder (Excludes Fully Paid)
  const reminderOrders = reminderBase.filter((order) => {
    if (!reminderSearchTerm.trim()) return true;
    const term = reminderSearchTerm.toLowerCase();
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term)
    );
  });

  // Filter for Fully Paid (Only Fully Paid)
  const fullyPaidOrders = fullyPaidBase.filter((order) => {
    if (!fullyPaidSearchTerm.trim()) return true;
    const term = fullyPaidSearchTerm.toLowerCase();
    const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
    return (
      order.clientName?.toLowerCase().includes(term) ||
      order.companyName?.toLowerCase().includes(term) ||
      order.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
      order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term) ||
      pDetails?.utrId?.toLowerCase().includes(term) ||
      pDetails?.paymentStatus?.toLowerCase().includes(term)
    );
  });

  // Filter for Consolidated Payment Reminders
  const filteredConsolidatedParties = useMemo(() => {
    if (!consolidatedSearchTerm.trim()) return consolidatedParties;
    const term = consolidatedSearchTerm.toLowerCase();
    return consolidatedParties.filter((p) => {
      const matchParty =
        p.companyName.toLowerCase().includes(term) ||
        p.clientName.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.phone.toLowerCase().includes(term);

      const matchInvoice = p.orders.some(
        (o) =>
          o.billingDetails?.invoiceNumber?.toLowerCase().includes(term) ||
          o.closedWonDetails?.customerPoNumber?.toLowerCase().includes(term)
      );

      return matchParty || matchInvoice;
    });
  }, [consolidatedParties, consolidatedSearchTerm]);

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
          : `Consolidated Payment Reminder Notice - ${party.companyName} (Outstanding: ₹${party.totalPendingAmount.toLocaleString()})`;

        let body = template?.body
          ? replaceVars(template.body)
          : `Dear ${party.clientName || party.companyName},\n\nWe hope this email finds you well.\n\nThis is a consolidated payment reminder regarding pending invoices for ${party.companyName}.\n\nBelow is the invoice-wise details of your pending balance:\n\n${invTableHtml}\n\nConsolidated Total Pending Amount: ₹${party.totalPendingAmount.toLocaleString()}\n\nKindly review and process the pending payment at your earliest convenience. If payment has already been remitted, please share the UTR / transaction receipt details.\n\nThank you for your cooperation!`;

        const cleanEmailList = (str: string) => str.split(/[,;]/).map((s) => s.trim()).filter(Boolean).join(", ");
        const toClean = template?.to ? cleanEmailList(replaceVars(template.to)) : party.email;
        const ccClean = template?.cc ? cleanEmailList(replaceVars(template.cc)) : undefined;
        const bccClean = template?.bcc ? cleanEmailList(replaceVars(template.bcc)) : undefined;

        if (!toClean) {
          console.warn(`Skipping party ${party.companyName} - no recipient email address available.`);
          continue;
        }

        await fetch("/api/send-order-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toClean,
            cc: ccClean,
            bcc: bccClean,
            subject: subject,
            text: body,
            senderUserId: activeUser?.id,
          }),
        });

        for (let j = 0; j < party.orders.length; j++) {
          const order = party.orders[j];
          await saveLog({
            id: `log-bulk-consolidated-${Date.now()}-${i}-${j}`,
            timestamp: new Date().toISOString(),
            userId: activeUser.id,
            userName: activeUser.name,
            actionType: "Send Email",
            targetType: "Order",
            targetId: order.id,
            targetName: order.companyName,
            details: `Sent Bulk Consolidated Payment Reminder email using template "${tmplName}" to ${party.companyName} (${toClean}) covering ${party.invoiceCount} invoices for total pending ₹${party.totalPendingAmount.toLocaleString()}`,
          });
        }

        sentCount++;
        totalPendingSent += party.totalPendingAmount;
      }

      setSendSuccessMsg(
        `Successfully sent ${sentCount} consolidated payment reminder email${
          sentCount === 1 ? "" : "s"
        } (Total Pending: ₹${totalPendingSent.toLocaleString()}) using template "${tmplName}"!`
      );
      setSelectedConsolidatedPartyKeys({});
    } catch (err) {
      console.error("Error sending bulk consolidated payment reminders:", err);
      alert("Failed to send bulk consolidated payment reminders. Please try again.");
    } finally {
      setIsSendingConsolidatedBulkEmail(false);
    }
  };

  // Open Payment Details Update Modal
  const openPaymentModal = (order: OrderOffer) => {
    const existingP = paymentDetailsList.find((p) => p.orderId === order.id);
    const orderTotal = order.totalValue || 0;
    const initialReceived = existingP ? existingP.amountReceived : 0;
    const initialPending = existingP ? existingP.pendingAmount : Math.max(0, orderTotal - initialReceived);
    
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
      pendingAmount: initialPending.toString(),
      paymentStatus: initialStatus,
      paymentReceivedDate: existingP?.paymentReceivedDate || new Date().toISOString().split("T")[0],
      utrId: existingP?.utrId || "",
      comments: existingP?.comments || "",
    });
    setEditingPaymentOrder(order);
  };

  // Save Payment Details to Firestore "payment_details" collection
  const handleSavePaymentDetails = async () => {
    if (!editingPaymentOrder) return;
    setIsSavingPayment(true);
    setPaymentSaveSuccess(null);

    try {
      const amtRec = parseFloat(paymentForm.amountReceived) || 0;
      const pendAmt = parseFloat(paymentForm.pendingAmount) || 0;

      const record: PaymentDetails = {
        id: editingPaymentOrder.id,
        orderId: editingPaymentOrder.id,
        amountReceived: amtRec,
        pendingAmount: pendAmt,
        paymentStatus: paymentForm.paymentStatus,
        paymentReceivedDate: paymentForm.paymentReceivedDate,
        utrId: paymentForm.utrId.trim(),
        comments: paymentForm.comments.trim(),
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
        actionType: "Update Payment",
        targetType: "Order",
        targetId: editingPaymentOrder.id,
        targetName: editingPaymentOrder.companyName,
        details: `Updated Payment Details for Invoice #${editingPaymentOrder.billingDetails?.invoiceNumber}: Status=${paymentForm.paymentStatus}, Received=₹${amtRec.toLocaleString()}, Pending=₹${pendAmt.toLocaleString()}, UTR=${paymentForm.utrId || "N/A"}`,
      });

      setPaymentSaveSuccess(`Payment details for ${editingPaymentOrder.clientName} updated successfully!`);
      setEditingPaymentOrder(null);

      setTimeout(() => {
        setPaymentSaveSuccess(null);
      }, 4000);
    } catch (err) {
      console.error("Error saving payment details:", err);
      alert("Failed to save payment details to database. Please check connection.");
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
        const dueInfo = calculateDueDate(
          order.closedWonDetails?.dispatchDate,
          order.payment
        );

        const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
        const totalAmt = order.totalValue || 0;
        const amtReceived = pDetails ? pDetails.amountReceived : 0;
        const pendingAmt = pDetails ? pDetails.pendingAmount : Math.max(0, totalAmt - amtReceived);
        let pStatus = pDetails?.paymentStatus || "Unpaid";
        if (!pDetails) {
          if (amtReceived >= totalAmt && totalAmt > 0) pStatus = "Fully paid";
          else if (amtReceived > 0) pStatus = "Partial paid";
          else pStatus = "Unpaid";
        }

        let subject = template?.subject || `Payment Reminder: Invoice #${order.billingDetails?.invoiceNumber}`;
        let body = template?.body || `Dear ${order.clientName},\n\nThis is a friendly reminder that invoice #${order.billingDetails?.invoiceNumber} for total amount ₹${totalAmt.toLocaleString()} (Received: ₹${amtReceived.toLocaleString()}, Pending: ₹${pendingAmt.toLocaleString()}) is due on ${dueInfo.dueDateFormatted}.\n\nThank you for your business!`;

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
            dispatchDate: order.closedWonDetails?.dispatchDate ? formatDate(order.closedWonDetails.dispatchDate) : "",
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

        await fetch("/api/send-order-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: dynamicTo,
            cc: dynamicCc,
            bcc: dynamicBcc,
            subject: subject,
            text: body,
            senderUserId: activeUser?.id,
          }),
        });

        await saveLog({
          id: `log-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Send Email",
          targetType: "Order",
          targetId: order.id,
          targetName: order.companyName,
          details: `Sent Payment Reminder using template "${tmplName}" to ${order.clientName} (${order.email || "N/A"}) for Invoice #${order.billingDetails?.invoiceNumber} (Due: ${dueInfo.dueDateFormatted})`,
        });
      }

      setSendSuccessMsg(
        `Successfully sent ${selectedList.length} payment reminder email${
          selectedList.length === 1 ? "" : "s"
        } using template "${tmplName}"!`
      );
      setSelectedOrderIds({});
    } catch (err) {
      console.error("Error sending payment reminders:", err);
      alert("Failed to send payment reminders. Please try again.");
    } finally {
      setIsSendingEmail(false);
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
                  ₹{filteredConsolidatedDebtors.reduce((sum, p) => sum + p.totalPendingAmount, 0).toLocaleString()}
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
            <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
              Showing <b>{filteredConsolidatedDebtors.length}</b> debtor parties with pending invoices
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
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                {party.invoiceCount} {party.invoiceCount === 1 ? "Invoice" : "Invoices"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                              ₹{party.totalOrderValue.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                              ₹{party.totalReceivedAmount.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 text-sm">
                              ₹{party.totalPendingAmount.toLocaleString()}
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
                              <td colSpan={10} className="p-4">
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
                                        ₹{party.totalPendingAmount.toLocaleString()}
                                      </strong>
                                    </span>
                                  </div>

                                  {/* Invoices Table */}
                                  <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
                                    <table className="w-full text-left text-xs min-w-[850px]">
                                      <thead>
                                        <tr className="bg-emerald-50/60 text-slate-700 font-mono font-bold text-[10px] uppercase border-b border-emerald-100">
                                          <th className="p-2.5">Invoice #</th>
                                          <th className="p-2.5">PO #</th>
                                          <th className="p-2.5">Dispatch Date</th>
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
                                          const pDet = paymentDetailsList.find((p) => p.orderId === o.id);
                                          const tot = o.totalValue || 0;
                                          const rec = pDet ? pDet.amountReceived : 0;
                                          const pend = pDet ? pDet.pendingAmount : Math.max(0, tot - rec);
                                          const due = calculateDueDate(o.closedWonDetails?.dispatchDate, o.payment);

                                          return (
                                            <tr key={o.id} className="hover:bg-slate-50">
                                              <td className="p-2.5 font-mono font-bold text-slate-900">
                                                {o.billingDetails?.invoiceNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono text-slate-600">
                                                {o.closedWonDetails?.customerPoNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 text-slate-500 text-[11px]">
                                                {o.closedWonDetails?.dispatchDate ? formatDate(o.closedWonDetails.dispatchDate) : "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono">
                                                <span className={due.isOverdue ? "text-rose-600 font-bold" : "text-slate-800 font-semibold"}>
                                                  {due.dueDateFormatted}
                                                </span>
                                                <span className={`block text-[9px] font-bold mt-0.5 ${due.isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                                                  {due.statusLabel}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-right font-mono">₹{tot.toLocaleString()}</td>
                                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{rec.toLocaleString()}</td>
                                              <td className="p-2.5 text-right font-mono font-extrabold text-rose-600">₹{pend.toLocaleString()}</td>
                                              <td className="p-2.5 text-center">
                                                {o.billingDetails?.invoiceFileUrl ? (
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


      {/* SUB-TAB 3: PAYMENT REMINDER CONSOLIDATED */}
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
                  ₹{filteredConsolidatedParties.reduce((sum, p) => sum + p.totalPendingAmount, 0).toLocaleString()}
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
              </div>
              <div>
                Selected Outstanding Total: <strong className="text-rose-600 font-extrabold">₹{selectedConsolidatedParties.reduce((sum, p) => sum + p.totalPendingAmount, 0).toLocaleString()}</strong>
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
                  : "All client payments are 100% cleared or no mapped invoices with outstanding balances were found."}
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
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                {party.invoiceCount} {party.invoiceCount === 1 ? "Invoice" : "Invoices"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                              ₹{party.totalOrderValue.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                              ₹{party.totalReceivedAmount.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 text-sm">
                              ₹{party.totalPendingAmount.toLocaleString()}
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
                              <td colSpan={10} className="p-4">
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
                                        ₹{party.totalPendingAmount.toLocaleString()}
                                      </strong>
                                    </span>
                                  </div>

                                  {/* Invoices Table */}
                                  <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="bg-emerald-50/60 text-slate-700 font-mono font-bold text-[10px] uppercase border-b border-emerald-100">
                                          <th className="p-2.5">Invoice #</th>
                                          <th className="p-2.5">PO #</th>
                                          <th className="p-2.5">Dispatch Date</th>
                                          <th className="p-2.5">Due Date</th>
                                          <th className="p-2.5 text-right">Invoice Amount</th>
                                          <th className="p-2.5 text-right">Payment Received</th>
                                          <th className="p-2.5 text-right">Pending Amount</th>
                                          <th className="p-2.5 text-center">Invoice Link</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {party.orders.map((o) => {
                                          const pDet = paymentDetailsList.find((p) => p.orderId === o.id);
                                          const tot = o.totalValue || 0;
                                          const rec = pDet ? pDet.amountReceived : 0;
                                          const pend = pDet ? pDet.pendingAmount : Math.max(0, tot - rec);
                                          const due = calculateDueDate(o.closedWonDetails?.dispatchDate, o.payment);

                                          return (
                                            <tr key={o.id} className="hover:bg-slate-50">
                                              <td className="p-2.5 font-mono font-bold text-slate-900">
                                                {o.billingDetails?.invoiceNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono text-slate-600">
                                                {o.closedWonDetails?.customerPoNumber || "N/A"}
                                              </td>
                                              <td className="p-2.5 text-slate-500 text-[11px]">
                                                {o.closedWonDetails?.dispatchDate ? formatDate(o.closedWonDetails.dispatchDate) : "N/A"}
                                              </td>
                                              <td className="p-2.5 font-mono font-semibold">
                                                <span className={due.isOverdue ? "text-rose-600 font-bold" : "text-slate-800"}>
                                                  {due.dueDateFormatted}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-right font-mono">₹{tot.toLocaleString()}</td>
                                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{rec.toLocaleString()}</td>
                                              <td className="p-2.5 text-right font-mono font-extrabold text-rose-600">₹{pend.toLocaleString()}</td>
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
                    Party: <strong className="text-slate-800">{consolidatedEmailParty.companyName}</strong> ({consolidatedEmailParty.clientName}) • Total Pending: <span className="text-rose-600 font-extrabold">₹{consolidatedEmailParty.totalPendingAmount.toLocaleString()}</span>
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
                  <b>{selectedCount}</b> of <b>{reminderOrders.length}</b> parties selected
                </span>
              </div>
              <div>
                Calculated Due Date = <strong className="text-slate-700">Dispatch Date + Payment Days</strong>
              </div>
            </div>
          </div>

          {/* Payment Reminder Table */}
          {reminderOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center">
              <BellRing className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Mapped Orders Found for Reminders</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Once invoices are mapped to orders, they will appear here with calculated due dates and options to send payment reminder emails.
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
                      <th className="p-4">Invoice # & PO</th>
                      <th className="p-4 text-right">Order Amount</th>
                      <th className="p-4 text-right">Amount Received</th>
                      <th className="p-4 text-right">Pending Amount</th>
                      <th className="p-4">Dispatch Date</th>
                      <th className="p-4">Payment Terms / Days</th>
                      <th className="p-4">Calculated Due Date</th>
                      <th className="p-4 text-center">Due Status</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {reminderOrders.map((order) => {
                      const isSelected = !!selectedOrderIds[order.id];
                      const dispatchDateStr = order.closedWonDetails?.dispatchDate;
                      const paymentTermsStr = order.payment;
                      const dueInfo = calculateDueDate(dispatchDateStr, paymentTermsStr);

                      const pDetails = paymentDetailsList.find((p) => p.orderId === order.id);
                      const totalAmt = order.totalValue || 0;
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
                            <div className="font-bold text-slate-900">{order.clientName}</div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-0.5">
                              <Building2 size={10} className="text-slate-400" />
                              <span>{order.companyName}</span>
                            </div>
                            {order.email && (
                              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                                {order.email}
                              </div>
                            )}
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
                            ₹{totalAmt.toLocaleString()}
                          </td>

                          {/* Amount Received */}
                          <td className="p-4 text-right font-mono font-bold text-emerald-700">
                            ₹{receivedAmt.toLocaleString()}
                          </td>

                          {/* Pending Amount */}
                          <td className="p-4 text-right font-mono font-bold text-rose-600">
                            ₹{pendingAmt.toLocaleString()}
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
                      const paymentRec = paymentDetailsList.find((p) => p.orderId === order.id);

                      const totalAmt = order.totalValue || 0;
                      const receivedAmt = paymentRec ? paymentRec.amountReceived : totalAmt;
                      const utr = paymentRec?.utrId || "N/A";
                      const pDate = paymentRec?.paymentReceivedDate ? formatDate(new Date(paymentRec.paymentReceivedDate)) : "N/A";

                      const dueInfo = calculateDueDate(
                        order.closedWonDetails?.dispatchDate,
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
                              ₹{totalAmt.toLocaleString()}
                            </td>

                            {/* Payment Received */}
                            <td className="p-4 text-right font-mono font-extrabold text-emerald-700">
                              ₹{receivedAmt.toLocaleString()}
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
                              {order.billingDetails?.invoiceFileUrl ? (
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
                              <td colSpan={10} className="p-5 border-b border-emerald-100">
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

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px] font-mono">
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Payment Status</span>
                                        <span className="font-extrabold text-emerald-700 block mt-0.5">
                                          Fully Paid
                                        </span>
                                      </div>
                                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Total Received</span>
                                        <span className="font-extrabold text-emerald-700 block mt-0.5">
                                          ₹{receivedAmt.toLocaleString()}
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
                                        <div><strong>Dispatch Date:</strong> {order.closedWonDetails?.dispatchDate || "N/A"}</div>
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
                                                <td className="p-2 text-right font-mono text-slate-500">₹{item.rate?.toLocaleString()}</td>
                                                <td className="p-2 text-right font-mono font-bold text-slate-700">₹{item.amount?.toLocaleString()}</td>
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
                                                ₹{order.totalValue?.toLocaleString()}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Update Payment Details
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Invoice #{editingPaymentOrder.billingDetails?.invoiceNumber} • {editingPaymentOrder.clientName} ({editingPaymentOrder.companyName})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPaymentOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Order total info badge */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 font-bold uppercase">Order Total Amount:</span>
              <span className="text-slate-900 font-black text-sm">
                ${(editingPaymentOrder.totalValue || 0).toLocaleString()}
              </span>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Row 1: How much payment received & Pending Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                    How Much Payment Received (₹)
                  </label>
                  <div className="relative">
                    <IndianRupee size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={paymentForm.amountReceived}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numVal = parseFloat(val) || 0;
                        const total = editingPaymentOrder.totalValue || 0;
                        const calcPending = Math.max(0, total - numVal);
                        
                        let autoStatus: "Unpaid" | "Partial paid" | "Fully paid" = "Unpaid";
                        if (numVal >= total && total > 0) autoStatus = "Fully paid";
                        else if (numVal > 0) autoStatus = "Partial paid";

                        setPaymentForm((prev) => ({
                          ...prev,
                          amountReceived: val,
                          pendingAmount: calcPending.toString(),
                          paymentStatus: autoStatus,
                        }));
                      }}
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                    Pending Amount (₹)
                  </label>
                  <div className="relative">
                    <IndianRupee size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={paymentForm.pendingAmount}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, pendingAmount: e.target.value }))
                      }
                      className="w-full text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Payment Status & Payment Received Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial paid">Partial paid</option>
                    <option value="Fully paid">Fully paid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                    Payment Received Date
                  </label>
                  <input
                    type="date"
                    value={paymentForm.paymentReceivedDate}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, paymentReceivedDate: e.target.value }))
                    }
                    className="w-full text-xs font-mono font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Row 3: UTR ID */}
              <div>
                <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                  UTR ID / Transaction Ref
                </label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={paymentForm.utrId}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, utrId: e.target.value }))
                    }
                    className="w-full text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. UTR1234567890"
                  />
                </div>
              </div>

              {/* Row 4: Comments */}
              <div>
                <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 mb-1">
                  Comments / Payment Notes
                </label>
                <textarea
                  rows={2}
                  value={paymentForm.comments}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, comments: e.target.value }))
                  }
                  className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl p-3 outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                  placeholder="Enter any payment notes or bank receipt reference details..."
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPaymentOrder(null)}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPayment}
                onClick={handleSavePaymentDetails}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
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
    </div>
  );
}
