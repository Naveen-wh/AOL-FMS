/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { User, OrderOffer, OrderItem, Product, Client, Team, AccessLevel, Role, PaymentBank, FreightTerm, DeliveryTerm, TransporterName, WarehouseManagedBy, DispatchLocation, EmailTemplate, EmailAutoSelectSettings, PaymentTerm, PaymentCreditPeriod, TaxRate, BillingDetails, ClosedWonDetails, PaymentReceiptRecord, PaymentDetails, EmailSentLog, EmailSentStatusSummary, EmailDeliveryStatus, PoAttachment } from "../types";
import { canEditOrderOffer, canDeleteOrderOffer, canViewOrderOffer, getReportingTreeUsers, INITIAL_TAX_RATES } from "../data";
import { uploadPOToDrive, getSharedDriveSettings, isUserTeamAllowedForDrive, DriveSettings, openOrDownloadDocument } from "../lib/googleDriveService";
import {
  getEmailAutoSelectSettings,
  saveEmailAutoSelectSettings,
  savePaymentDetails,
  saveEmailSentLog,
} from "../lib/firebaseService";
import { auth } from "../firebase";
import { replaceTemplateVars, resolveUserHierarchyInfo, formatEmailBodyForSending } from "../lib/templateUtils";
import { dispatchSystemEmail } from "../lib/emailService";
import { Plus, Search, Edit2, Trash2, ShieldAlert, Lock, Unlock, Filter, IndianRupee, Calendar, X, Check, HelpCircle, Building2, ShoppingCart, Percent, ShoppingBag, Upload, FileText, Loader2, Mail, FileSpreadsheet, Eye, Phone, User as UserIcon, RefreshCw, ChevronDown, Layers, TrendingUp, BarChart3, Clock, CheckCircle2, CalendarDays, ArrowUpDown } from "lucide-react";
import InlineDeleteConfirm from "./InlineDeleteConfirm";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { formatDate, formatCompactRupees, formatQuantityMT } from "../utils";
import { EmailSentStatusCell } from "./EmailSentStatusCell";

const resolveReportingEmails = (creatorUserId: string, assignedToUserId: string, users: User[]) => {
  const creatorUser = users.find(u => u.id === creatorUserId);
  const creatorEmail = creatorUser?.email || "";

  const assignedUser = users.find(u => u.id === assignedToUserId);
  const assignedToEmail = assignedUser?.email || "";

  let teamLeadEmail = "";
  let managerEmail = "";

  if (assignedUser) {
    let current = assignedUser;
    const visited = new Set<string>();
    while (current && current.reportsTo && !visited.has(current.id)) {
      visited.add(current.id);
      const supervisor = users.find(u => u.id === current.reportsTo);
      if (!supervisor) break;

      if (supervisor.role === Role.TeamLead) {
        if (!teamLeadEmail) teamLeadEmail = supervisor.email;
      } else if (supervisor.role === Role.Manager || supervisor.role === Role.SeniorManager || supervisor.role === Role.Admin) {
        if (!managerEmail) managerEmail = supervisor.email;
      }

      current = supervisor;
    }
  }

  return {
    creatorEmail,
    currentUserEmail: creatorEmail, // Backwards compatibility
    assignedToEmail,
    teamLeadEmail,
    managerEmail,
  };
};

const cleanEmailList = (emails?: string) => {
  if (!emails) return "";
  return emails
    .split(",")
    .map(email => email.trim())
    .filter(email => email.length > 0)
    .join(", ");
};

interface OrdersOffersViewProps {
  activeUserId: string;
  users: User[];
  orders: OrderOffer[];
  paymentBanks?: PaymentBank[];
  products?: Product[];
  clients?: Client[];
  teams?: Team[];
  freightTerms?: FreightTerm[];
  deliveryTerms?: DeliveryTerm[];
  transporters?: TransporterName[];
  warehouses?: WarehouseManagedBy[];
  dispatchLocations?: DispatchLocation[];
  paymentTerms?: PaymentTerm[];
  paymentCreditPeriods?: PaymentCreditPeriod[];
  taxRates?: TaxRate[];
  emailTemplates?: EmailTemplate[];
  emailSentLogs?: EmailSentLog[];
  onAddOrder: (order: Omit<OrderOffer, "id" | "createdAt" | "createdByUserId">) => void;
  onEditOrder: (order: OrderOffer) => void;
  onDeleteOrder: (orderId: string) => void;
  onAddPaymentBank: (bankData: Omit<PaymentBank, "id" | "createdAt">) => void;
  onAddClient?: (clientData: Omit<Client, "id" | "createdAt">) => void;
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function OrdersOffersView({
  activeUserId,
  users,
  orders = [],
  paymentBanks = [],
  products = [],
  clients = [],
  teams = [],
  freightTerms = [],
  deliveryTerms = [],
  transporters = [],
  warehouses = [],
  dispatchLocations = [],
  paymentTerms = [],
  paymentCreditPeriods = [],
  taxRates = [],
  emailTemplates = [],
  emailSentLogs = [],
  onAddOrder,
  onEditOrder,
  onDeleteOrder,
  onAddPaymentBank,
  onAddClient,
  teamPermissions,
  levelWiseFilters,
}: OrdersOffersViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || {
    id: activeUserId,
    name: "System User",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    teamName: "",
    targetQuota: 0,
    email: activeUserId,
  };

  const isExecutive = activeUser.role === Role.Admin || activeUser.teamName === "Executive";
  const clientCompanies = Array.from(new Set(clients.map((c) => c.companyName).filter(Boolean)));

  const availableTaxRates = useMemo(() => {
    if (taxRates && taxRates.length > 0) return taxRates;
    return INITIAL_TAX_RATES;
  }, [taxRates]);
  const defaultTaxValue = availableTaxRates.find(t => t.name === "18%" || t.name.includes("18"))?.name || availableTaxRates[0]?.name || "18%";

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.view !== false;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilterType, setDateFilterType] = useState<"createdAt" | "invoiceDate">("createdAt");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [activeDatePreset, setActiveDatePreset] = useState<string>("All Time");
  const [recordsLimit, setRecordsLimit] = useState<number>(100);

  const getOrderCreateDate = (order: OrderOffer): string => {
    if (order.createdAt) return order.createdAt.slice(0, 10);
    if ((order as any).orderDate) return String((order as any).orderDate).slice(0, 10);
    return "";
  };

  const getOrderInvoiceDate = (order: OrderOffer): string => {
    if (order.billingDetails?.invoiceDate) {
      return order.billingDetails.invoiceDate.trim().slice(0, 10);
    }
    return "";
  };

  const applyDatePreset = (preset: string) => {
    setActiveDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === "All Time") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "Today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "This Week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      const mondayStr = monday.toISOString().slice(0, 10);
      setStartDate(mondayStr);
      setEndDate(todayStr);
    } else if (preset === "This Month") {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const firstDay = `${year}-${month}-01`;
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === "Last Month") {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = prevMonthDate.getFullYear();
      const month = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
      const firstDay = `${year}-${month}-01`;
      const lastDayDate = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === "This FY") {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;
      setStartDate(`${fyStartYear}-04-01`);
      setEndDate(`${fyStartYear + 1}-03-31`);
    }
  };

  const clearDateFilter = () => {
    setActiveDatePreset("All Time");
    setStartDate("");
    setEndDate("");
  };

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderOffer | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<OrderOffer | null>(null);
  const [resendingOrderId, setResendingOrderId] = useState<string | null>(null);
  const [emailBanner, setEmailBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showEmailBanner = (type: "success" | "error", message: string) => {
    setEmailBanner({ type, message });
    setTimeout(() => setEmailBanner(null), 5000);
  };

  // Import fields config for Orders & Offers + Historical Invoices & Payment Details
  const orderImportFields: ImportFieldDefinition[] = [
    // Client & Basic Order Details
    { key: "clientName", label: "Client Full Name", required: true, sampleValue: "Rahul Sharma", description: "Primary contact full name" },
    { key: "companyName", label: "Company Name", required: true, sampleValue: "Hindustan Unilever", description: "Client company name" },
    { key: "email", label: "Client Email", sampleValue: "rahul@hul.com", description: "Primary client email address" },
    { key: "phone", label: "Client Phone", sampleValue: "+91 9876543210", description: "Contact phone number" },
    { key: "billingAddress", label: "Client Billing Address", sampleValue: "42 Industrial Estate, Sector 5, Kolkata", description: "Billing address for invoices" },
    { key: "billingGstin", label: "Client GSTIN", sampleValue: "19AAAAA0000A1Z5", description: "Client GSTIN Number" },
    { key: "assignedToUserName", label: "Order Assigned To (Sales Person Name)", sampleValue: "Anish Sharma", description: "Sales person or user name assigned to this order" },
    { key: "status", label: "Pipeline Status", sampleValue: "Closed Won", description: "New, Contacted, Proposal, Negotiation, Closed Won, Closed Lost" },
    { key: "orderDate", label: "Order / Offer Date", sampleValue: "2025-08-20", description: "Order creation date (YYYY-MM-DD)" },
    { key: "payment", label: "Payment Terms", sampleValue: "30 Days Credit", description: "Payment terms" },
    { key: "paymentCreditPeriod", label: "Payment Credit Period (Days)", sampleValue: "30 Days", description: "Credit period in number of days" },
    { key: "notes", label: "Notes / Details", sampleValue: "Urgent dispatch", description: "Internal notes or instructions" },

    // Product 1
    { key: "product1Name", label: "Product 1 Name", sampleValue: "Hydrogen Peroxide 50%", description: "First item description or product name (or use productName)" },
    { key: "product1Qty", label: "Product 1 Qty", sampleValue: "100", description: "Quantity of Product 1" },
    { key: "product1Rate", label: "Product 1 Rate (₹)", sampleValue: "250", description: "Unit rate for Product 1" },
    { key: "product1Amount", label: "Product 1 Amount (₹)", sampleValue: "25000", description: "Total amount for Product 1 (Auto-calculated if omitted)" },
    { key: "product1HsnCode", label: "Product 1 HSN Code", sampleValue: "28470000", description: "HSN / SAC Code for Product 1" },

    // Product 2
    { key: "product2Name", label: "Product 2 Name", sampleValue: "Sodium Hydroxide 48%", description: "Second item description (optional)" },
    { key: "product2Qty", label: "Product 2 Qty", sampleValue: "50", description: "Quantity of Product 2" },
    { key: "product2Rate", label: "Product 2 Rate (₹)", sampleValue: "400", description: "Unit rate for Product 2" },
    { key: "product2Amount", label: "Product 2 Amount (₹)", sampleValue: "20000", description: "Total amount for Product 2" },
    { key: "product2HsnCode", label: "Product 2 HSN Code", sampleValue: "28151100", description: "HSN / SAC Code for Product 2" },

    // Product 3
    { key: "product3Name", label: "Product 3 Name", sampleValue: "", description: "Third item description (optional)" },
    { key: "product3Qty", label: "Product 3 Qty", sampleValue: "", description: "Quantity of Product 3" },
    { key: "product3Rate", label: "Product 3 Rate (₹)", sampleValue: "", description: "Unit rate for Product 3" },
    { key: "product3Amount", label: "Product 3 Amount (₹)", sampleValue: "", description: "Total amount for Product 3" },
    { key: "product3HsnCode", label: "Product 3 HSN Code", sampleValue: "", description: "HSN / SAC Code for Product 3" },

    // Product 4
    { key: "product4Name", label: "Product 4 Name", sampleValue: "", description: "Fourth item description (optional)" },
    { key: "product4Qty", label: "Product 4 Qty", sampleValue: "", description: "Quantity of Product 4" },
    { key: "product4Rate", label: "Product 4 Rate (₹)", sampleValue: "", description: "Unit rate for Product 4" },
    { key: "product4Amount", label: "Product 4 Amount (₹)", sampleValue: "", description: "Total amount for Product 4" },
    { key: "product4HsnCode", label: "Product 4 HSN Code", sampleValue: "", description: "HSN / SAC Code for Product 4" },

    // Product 5
    { key: "product5Name", label: "Product 5 Name", sampleValue: "", description: "Fifth item description (optional)" },
    { key: "product5Qty", label: "Product 5 Qty", sampleValue: "", description: "Quantity of Product 5" },
    { key: "product5Rate", label: "Product 5 Rate (₹)", sampleValue: "", description: "Unit rate for Product 5" },
    { key: "product5Amount", label: "Product 5 Amount (₹)", sampleValue: "", description: "Total amount for Product 5" },
    { key: "product5HsnCode", label: "Product 5 HSN Code", sampleValue: "", description: "HSN / SAC Code for Product 5" },

    { key: "totalValue", label: "Total Order Value (₹)", sampleValue: "45000", description: "Total order value (Auto-calculated from products if omitted)" },

    // Invoicing & System Mapping Fields
    { key: "invoiceNumber", label: "Invoice Number", sampleValue: "INV-2025-001", description: "Maps historical invoice into billing & dispatch" },
    { key: "invoiceDate", label: "Invoice Date", sampleValue: "2025-08-20", description: "Date of invoice issuance (YYYY-MM-DD)" },
    { key: "actualDispatchDate", label: "Actual Dispatch Date", sampleValue: "2025-08-22", description: "Actual date of goods dispatch in billing sub-section (YYYY-MM-DD)" },
    { key: "invoiceFileUrl", label: "Invoice Link / URL", sampleValue: "https://drive.google.com/file/d/sample/view", description: "Direct URL link to uploaded invoice PDF/doc" },

    // Closed Won Details (Full Closed Won Section Fields)
    { key: "customerPoNumber", label: "Customer PO Number", sampleValue: "PO-99481", description: "Customer Purchase Order number" },
    { key: "poDate", label: "Customer PO Date", sampleValue: "2025-08-15", description: "Customer PO Date (YYYY-MM-DD)" },
    { key: "poAttachmentUrl", label: "Customer PO Document Link / URL", sampleValue: "https://drive.google.com/file/d/sample-po/view", description: "Direct URL link to uploaded customer PO PDF/document" },
    { key: "freightTerm", label: "Freight Term", sampleValue: "FOR Destination", description: "Freight term (e.g. FOR Destination, Ex-Works Factory)" },
    { key: "transporterName", label: "Transporter Name", sampleValue: "VRL Logistics", description: "Logistics or transport carrier company name" },
    { key: "vehicleNo", label: "Vehicle Number", sampleValue: "WB 02 AB 1234", description: "Vehicle / Transport vehicle number" },
    { key: "freightChargedInBill", label: "Freight Charged in Bill", sampleValue: "Fixed", description: "Freight to be charged in bill (e.g. Fixed / Actuals)" },
    { key: "freightCostToAol", label: "Freight Cost to AOL", sampleValue: "1500", description: "Freight cost incurred by company" },
    { key: "cartageLabourCharges", label: "Cartage / Labour Charges", sampleValue: "500", description: "Cartage or labour charges if any" },
    { key: "deliveryTerm", label: "Delivery / Booking Term", sampleValue: "Door Delivery", description: "Delivery or booking term (e.g. Door Delivery)" },
    { key: "warehouseManagedBy", label: "Warehouse Managed By", sampleValue: "Kolkata Central WH", description: "Warehouse or warehouse manager name" },
    { key: "destinationAddress", label: "Destination Address", sampleValue: "42 Industrial Estate, Sector 5, Kolkata", description: "Delivery destination address" },
    { key: "gstin", label: "GSTIN", sampleValue: "19AAAAA0000A1Z5", description: "GSTIN Number for Closed Won" },
    { key: "dispatchDate", label: "Expected Dispatch Date", sampleValue: "2025-08-22", description: "Expected date of dispatch (YYYY-MM-DD)" },
    { key: "dispatchLocation", label: "Dispatch Location", sampleValue: "Factory Silvassa", description: "Dispatch location / warehouse" },

    // Mail Sent Status
    { key: "mailSentStatus", label: "Mail Sent Status", sampleValue: "Sent", description: "Sent, Simulated, Failed, or Pending" },
    { key: "mailSentTimestamp", label: "Mail Sent Timestamp", sampleValue: "2025-08-20 10:30:00", description: "Date/time email was sent (YYYY-MM-DD HH:MM:SS)" },
  ];

  const handleImportOrders = async (rows: Record<string, any>[]) => {
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const clientName = row.clientName?.trim();
      const companyName = row.companyName?.trim();

      if (!clientName || !companyName) {
        errors.push(`Row ${i + 1}: Skipped due to missing Client Name or Company Name.`);
        continue;
      }

      const billingGstin = (row.billingGstin || row.gstin)?.trim() || "";

      // Extract up to 5 products per row (with fallback to single productName/quantity/rate/hsnCode)
      const itemsList: OrderItem[] = [];
      for (let pIdx = 1; pIdx <= 5; pIdx++) {
        const pName = (row[`product${pIdx}Name`] || (pIdx === 1 ? row.productName : ""))?.toString()?.trim();
        if (pName) {
          const qty = parseFloat(row[`product${pIdx}Qty`] || (pIdx === 1 ? row.quantity : "")) || 1;
          const rateVal = parseFloat(row[`product${pIdx}Rate`] || (pIdx === 1 ? row.rate : "")) || 0;
          const rawAmt = parseFloat(row[`product${pIdx}Amount`] || (pIdx === 1 ? row.amount : ""));
          const amtVal = !isNaN(rawAmt) ? rawAmt : (qty * rateVal);
          const hsn = (row[`product${pIdx}HsnCode`] || (pIdx === 1 ? row.hsnCode || row.product1HsnCode : ""))?.toString()?.trim() || "";

          itemsList.push({
            productId: products[0]?.id || `prod-import-${Date.now()}-${i}-${pIdx}`,
            productName: pName,
            quantity: qty,
            rate: rateVal,
            amount: amtVal,
            hsnCode: hsn,
          });
        }
      }

      // If no item extracted, fallback to single item using total value
      if (itemsList.length === 0) {
        const fallbackTotal = parseFloat(row.totalValue) || 0;
        itemsList.push({
          productId: products[0]?.id || "proj-1",
          productName: products[0]?.name || "Default Product",
          quantity: 1,
          rate: fallbackTotal,
          amount: fallbackTotal,
        });
      }

      // Invoicing / Billing details mapping
      const invoiceNumber = row.invoiceNumber?.trim() || "";
      const invoiceDate = row.invoiceDate?.trim() || "";
      const actualDispatchDate = row.actualDispatchDate?.trim() || "";
      const invoiceFileUrl = (row.invoiceFileUrl || row.invoiceLink || row.invoiceUrl)?.trim() || "";
      const vehicleNo = (row.vehicleNo || row.vehicleNumber)?.trim() || "";
      const transportName = (row.transporterName || row.transportName)?.trim() || "";
      const dispatchDate = row.dispatchDate?.trim() || "";

      let billingDetails: BillingDetails | undefined = undefined;
      if (invoiceNumber || invoiceDate || actualDispatchDate || invoiceFileUrl || vehicleNo || transportName || dispatchDate) {
        billingDetails = {
          invoiceNumber: invoiceNumber || `INV-HIST-${Date.now().toString().slice(-4)}-${i+1}`,
          invoiceDate: invoiceDate || new Date().toISOString().split("T")[0],
          actualDispatchDate: actualDispatchDate || dispatchDate,
          invoiceFileUrl,
          invoiceFileName: invoiceFileUrl ? "Uploaded Invoice" : "",
          vehicleNo,
          transportName,
          dispatchDate,
          mappedAt: new Date().toISOString(),
          mappedByUserId: activeUserId,
        };
      }

      // Customer PO / Closed Won details mapping
      const customerPoNumber = (row.customerPoNumber || row.poNumber)?.trim() || "";
      const poDate = row.poDate?.trim() || "";
      const poAttachmentUrl = (row.poAttachmentUrl || row.poUrl || row.customerPoFileUrl || row.customerPoUrl || row.poLink || row.customerPoLink || row.poDocumentUrl || row.poFileUrl)?.trim() || "";
      const freightTerm = (row.freightTerm || row.freightTerms)?.trim() || "";
      const freightChargedInBill = row.freightChargedInBill?.trim() || "";
      const freightCostToAol = row.freightCostToAol?.trim() || "";
      const cartageLabourCharges = row.cartageLabourCharges?.trim() || "";
      const transporterName = (row.transporterName || row.transportName)?.trim() || "";
      const deliveryTerm = (row.deliveryTerm || row.delivery || row.deliveryTerms)?.trim() || "";
      const warehouseManagedBy = row.warehouseManagedBy?.trim() || "";
      const destinationAddress = row.destinationAddress?.trim() || row.billingAddress?.trim() || "";
      const gstin = row.gstin?.trim() || row.billingGstin?.trim() || "";
      const dispatchLocation = row.dispatchLocation?.trim() || "";

      // Determine final status
      let finalStatus: OrderOffer["status"] = (row.status?.trim() as OrderOffer["status"]) || "New";
      if ((invoiceNumber || customerPoNumber || poAttachmentUrl) && (!row.status || row.status.trim() === "New")) {
        finalStatus = "Closed Won";
      }

      const calculatedTotalItems = itemsList.reduce((sum, item) => sum + (item.amount || 0), 0);
      let totalVal = parseFloat(row.totalValue) || (calculatedTotalItems > 0 ? calculatedTotalItems : 0);
      if (finalStatus === "Closed Won" && freightChargedInBill) {
        totalVal += parseFreightAmount(freightChargedInBill) * 1.18;
      }

      let closedWonDetails: ClosedWonDetails | undefined = undefined;
      if (
        customerPoNumber ||
        poDate ||
        poAttachmentUrl ||
        freightTerm ||
        transporterName ||
        vehicleNo ||
        deliveryTerm ||
        warehouseManagedBy ||
        destinationAddress ||
        dispatchDate ||
        dispatchLocation ||
        freightChargedInBill ||
        freightCostToAol ||
        cartageLabourCharges ||
        finalStatus === "Closed Won"
      ) {
        closedWonDetails = {
          customerPoNumber: customerPoNumber || "PO-IMPORTED",
          poDate: poDate || new Date().toISOString().split("T")[0],
          poAttachmentUrl: poAttachmentUrl || undefined,
          freightTerm: freightTerm || "",
          freightChargedInBill: freightChargedInBill || "No",
          freightCostToAol: freightCostToAol || "",
          cartageLabourCharges: cartageLabourCharges || "",
          transporterName: transporterName || "",
          vehicleNo: vehicleNo || "",
          deliveryTerm: deliveryTerm || "",
          destinationAddress: destinationAddress || row.billingAddress?.trim() || "",
          gstin: gstin || billingGstin,
          dispatchDate: dispatchDate || new Date().toISOString().split("T")[0],
          dispatchLocation: dispatchLocation || "",
          warehouseManagedBy: warehouseManagedBy || "",
        };
      }

      // Mail Sent Status mapping
      const rawMailStatus = (row.mailSentStatus || row.emailStatus)?.trim();
      const rawMailTimestamp = (row.mailSentTimestamp || row.emailTimestamp)?.trim();
      let emailStatusSummary: EmailSentStatusSummary | undefined = undefined;

      if (rawMailStatus) {
        let validStatus: EmailDeliveryStatus = "Sent";
        const sLower = rawMailStatus.toLowerCase();
        if (sLower.includes("simulat")) validStatus = "Simulated";
        else if (sLower.includes("fail") || sLower.includes("error")) validStatus = "Failed";
        else if (sLower.includes("pend")) validStatus = "Pending";
        else if (sLower.includes("sent")) validStatus = "Sent";

        emailStatusSummary = {
          to: row.email?.trim() || "",
          status: validStatus,
          timestamp: rawMailTimestamp || new Date().toISOString(),
          category: "create_order",
          subject: `Order Confirmation - ${companyName}`,
          sentByUserName: activeUser?.name || "System Import",
        };
      }

      // Assigned Sales Person resolution
      const assignedNameInput = (row.assignedToUserName || row.assignedToUser || row.assignedTo || row.salesPersonName || row.salesPerson || row.orderAssignedTo)?.toString()?.trim();
      let assignedUserId = activeUserId;
      if (assignedNameInput) {
        const matchedUser = users.find(u =>
          u.name.toLowerCase() === assignedNameInput.toLowerCase() ||
          u.email.toLowerCase() === assignedNameInput.toLowerCase() ||
          u.id === assignedNameInput
        );
        if (matchedUser) {
          assignedUserId = matchedUser.id;
        }
      }

      const orderId = `order-imp-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

      const newOrderData: OrderOffer = {
        id: orderId,
        createdAt: row.orderDate?.trim() || new Date().toISOString(),
        createdByUserId: activeUserId,
        clientName,
        companyName,
        email: row.email?.trim() || "",
        phone: row.phone?.trim() || "+1 (555) 000-0000",
        billingAddress: row.billingAddress?.trim() || "",
        billingGstin,
        status: finalStatus,
        totalValue: totalVal,
        items: itemsList,
        assignedToUserId: assignedUserId,
        notes: row.notes?.trim() || (invoiceNumber ? `Historical import with Invoice #${invoiceNumber}` : "Imported via Sheets / CSV Wizard"),
        payment: row.payment?.trim() || "",
        paymentCreditPeriod: row.paymentCreditPeriod?.trim() || "",
        delivery: deliveryTerm || row.delivery?.trim() || "",
        otherTerms: row.otherTerms?.trim() || "",
        billingDetails,
        closedWonDetails,
        emailStatus: emailStatusSummary,
      };

      try {
        await onAddOrder(newOrderData);

        // If Invoice Number exists, initialize initial unpaid PaymentDetails record in system
        const effectiveInvoiceNo = invoiceNumber || (billingDetails?.invoiceNumber ?? "");

        if (effectiveInvoiceNo) {
          await savePaymentDetails({
            id: orderId,
            orderId: orderId,
            invoiceNumber: effectiveInvoiceNo,
            amountReceived: 0,
            lastEnteredAmount: 0,
            pendingAmount: totalVal,
            paymentStatus: "Unpaid",
            paymentReceivedDate: "",
            utrId: "",
            comments: `Initial payment record created via bulk order import for Invoice ${effectiveInvoiceNo}`,
            receipts: [],
            updatedAt: new Date().toISOString(),
            updatedByUserId: activeUserId,
            updatedByUserName: activeUser?.name || "System",
          });
        }

        if (emailStatusSummary) {
          await saveEmailSentLog({
            id: `log-imp-${Date.now()}-${i}`,
            orderId,
            invoiceNumber: effectiveInvoiceNo || orderId,
            companyName,
            clientName,
            to: row.email?.trim() || "",
            subject: `Order Confirmation - ${companyName}`,
            category: "create_order",
            status: emailStatusSummary.status,
            timestamp: emailStatusSummary.timestamp,
            senderUserId: activeUserId,
            senderUserName: activeUser?.name || "System Bulk Import",
          });
        }

        successCount++;
      } catch (err: any) {
        errors.push(`Row ${i + 1} (${companyName}): ${err.message || err}`);
      }
    }

    return { successCount, errors };
  };

  // Form states - Add Order
  const [newClientName, setNewClientName] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newSendEmail, setNewSendEmail] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBillingAddress, setNewBillingAddress] = useState("");
  const [newBillingGstin, setNewBillingGstin] = useState("");
  const [newStatus, setNewStatus] = useState<OrderOffer["status"]>("New");
  const [newAssignedTo, setNewAssignedTo] = useState(activeUserId);
  const [newNotes, setNewNotes] = useState("");
  const [newPayment, setNewPayment] = useState("");
  const [newPaymentCreditPeriod, setNewPaymentCreditPeriod] = useState("");
  const [newPaymentTermsOffer, setNewPaymentTermsOffer] = useState("");
  const [newPaymentBankId, setNewPaymentBankId] = useState("");
  const [newDelivery, setNewDelivery] = useState("");
  const [newOtherTerms, setNewOtherTerms] = useState("");
  const [isCustomCompany, setIsCustomCompany] = useState(false);

  // Multi-product items state for ADD
  const [newItems, setNewItems] = useState<Omit<OrderItem, "amount">[]>([
    { productId: products[0]?.id || "proj-1", productName: products[0]?.name || "Default Product", quantity: "" as any, rate: "" as any, hsnCode: products[0]?.hsnCode || "", packing: "", taxes: "18%" }
  ]);

  // Form states - Edit Order
  const [editClientName, setEditClientName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSendEmail, setEditSendEmail] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBillingAddress, setEditBillingAddress] = useState("");
  const [editBillingGstin, setEditBillingGstin] = useState("");
  const [editStatus, setEditStatus] = useState<OrderOffer["status"]>("New");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPayment, setEditPayment] = useState("");
  const [editPaymentCreditPeriod, setEditPaymentCreditPeriod] = useState("");
  const [editPaymentTermsOffer, setEditPaymentTermsOffer] = useState("");
  const [editPaymentBankId, setEditPaymentBankId] = useState("");
  const [editDelivery, setEditDelivery] = useState("");
  const [editOtherTerms, setEditOtherTerms] = useState("");

  // Closed Won details - Add
  const [newPoNumber, setNewPoNumber] = useState("");
  const [newPoDate, setNewPoDate] = useState("");
  const [newFreightTerm, setNewFreightTerm] = useState("");
  const [newFreightChargedInBill, setNewFreightChargedInBill] = useState("");
  const [newFreightCostToAol, setNewFreightCostToAol] = useState("");
  const [newCartageLabourCharges, setNewCartageLabourCharges] = useState("");
  const [newTransporterName, setNewTransporterName] = useState("");
  const [newVehicleNo, setNewVehicleNo] = useState("");
  const [newDeliveryTerm, setNewDeliveryTerm] = useState("");
  const [newDestinationAddress, setNewDestinationAddress] = useState("");
  const [newDispatchDate, setNewDispatchDate] = useState("");
  const [newDispatchLocation, setNewDispatchLocation] = useState("");
  const [newWarehouseManagedBy, setNewWarehouseManagedBy] = useState("");
  const [newPoAttachmentUrl, setNewPoAttachmentUrl] = useState("");
  const [newPoAttachments, setNewPoAttachments] = useState<PoAttachment[]>([]);
  const [newGstin, setNewGstin] = useState("");
  const [newSameAsBilling, setNewSameAsBilling] = useState(false);

  // Closed Won details - Edit
  const [editPoNumber, setEditPoNumber] = useState("");
  const [editPoDate, setEditPoDate] = useState("");
  const [editFreightTerm, setEditFreightTerm] = useState("");
  const [editFreightChargedInBill, setEditFreightChargedInBill] = useState("");
  const [editFreightCostToAol, setEditFreightCostToAol] = useState("");
  const [editCartageLabourCharges, setEditCartageLabourCharges] = useState("");
  const [editTransporterName, setEditTransporterName] = useState("");
  const [editVehicleNo, setEditVehicleNo] = useState("");
  const [editDeliveryTerm, setEditDeliveryTerm] = useState("");
  const [editDestinationAddress, setEditDestinationAddress] = useState("");
  const [editDispatchDate, setEditDispatchDate] = useState("");
  const [editDispatchLocation, setEditDispatchLocation] = useState("");
  const [editWarehouseManagedBy, setEditWarehouseManagedBy] = useState("");
  const [editPoAttachmentUrl, setEditPoAttachmentUrl] = useState("");
  const [editPoAttachments, setEditPoAttachments] = useState<PoAttachment[]>([]);
  const [editGstin, setEditGstin] = useState("");
  const [editSameAsBilling, setEditSameAsBilling] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newPoFileName, setNewPoFileName] = useState("");
  const [editPoFileName, setEditPoFileName] = useState("");

  // Shared Google Drive Folder Settings
  const [driveSettings, setDriveSettings] = useState<DriveSettings | null>(null);

  // Email auto select settings
  const [autoSelectSettings, setAutoSelectSettings] = useState<EmailAutoSelectSettings>({
    indentAutoSelect: true,
    ordersAutoSelect: false,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await getSharedDriveSettings();
      if (settings) {
        setDriveSettings(settings);
      }

      try {
        const emailSet = await getEmailAutoSelectSettings();
        setAutoSelectSettings(emailSet);
      } catch (err) {
        console.error("Error loading email auto select settings:", err);
      }
    };
    fetchSettings();
  }, []);

  const getTransporterDisplayName = (name?: string) => {
    if (!name || name === "N/A" || name === "TBD") return name || "N/A";
    const found = transporters.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (found) {
      const idStr = found.transporterId || found.id;
      if (name.includes(`(${idStr})`)) return name;
      return `${found.name}${idStr ? ` (${idStr})` : ""}`;
    }
    return name;
  };

  // Multi-product items state for EDIT
  const [editItems, setEditItems] = useState<Omit<OrderItem, "amount">[]>([]);

  // Inner Add Client modal states (for quick registration)
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [clientFullName, setClientFullName] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientGst, setClientGst] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientPincode, setClientPincode] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientTeamName, setClientTeamName] = useState("");

  // Add Bank Modal state
  const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newAccountHolder, setNewAccountHolder] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [newIfscCode, setNewIfscCode] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newBankAddress, setNewBankAddress] = useState("");

  // Helper to determine assignable team members (only users of the Sales team)
  const assignableUsers = useMemo(() => {
    return users.filter((u) => u.teamName?.trim().toLowerCase() === "sales");
  }, [users]);

  // Auto-set assigned owner to a Sales team user if not already set or invalid
  useEffect(() => {
    const isSalesTeamSelected = assignableUsers.some((u) => u.id === newAssignedTo);
    if (!isSalesTeamSelected && assignableUsers.length > 0) {
      setNewAssignedTo(assignableUsers[0].id);
    }
  }, [assignableUsers, newAssignedTo]);

  // Auto-set edit assigned owner to a Sales team user if not already set or invalid
  useEffect(() => {
    if (isEditOpen && editAssignedTo) {
      const isSalesTeamSelected = assignableUsers.some((u) => u.id === editAssignedTo);
      if (!isSalesTeamSelected && assignableUsers.length > 0) {
        setEditAssignedTo(assignableUsers[0].id);
      }
    }
  }, [assignableUsers, editAssignedTo, isEditOpen]);

  // Pre-filtering orders based on view permission + date range + search query (excluding status)
  const baseFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Permission check
      const isLevelFilterEnabled = !!levelWiseFilters?.["orders"];
      if (!canViewOrderOffer(activeUserId, order, users, isLevelFilterEnabled)) return false;

      // 2. Date range check
      if (startDate || endDate) {
        if (dateFilterType === "invoiceDate") {
          const invDate = getOrderInvoiceDate(order);
          if (!invDate) return false;
          if (startDate && invDate < startDate) return false;
          if (endDate && invDate > endDate) return false;
        } else {
          // "createdAt" (Create date / Order date)
          const createDate = getOrderCreateDate(order);
          if (!createDate) return false;
          if (startDate && createDate < startDate) return false;
          if (endDate && createDate > endDate) return false;
        }
      }

      // 3. Search query check
      const matchesSearch =
        order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        (order.items || []).some((item) =>
          item.productName?.toLowerCase().includes(searchTerm.toLowerCase())
        );

      return matchesSearch;
    });
  }, [orders, activeUserId, users, levelWiseFilters, searchTerm, startDate, endDate, dateFilterType]);

  // Filtering based on status or bifurcated group
  const visibleOrders = useMemo(() => {
    return baseFilteredOrders.filter((order) => {
      if (statusFilter === "All") return true;
      if (statusFilter === "Offer") {
        return ["New", "Contacted", "Proposal", "Negotiation"].includes(order.status);
      }
      if (statusFilter === "Order") {
        return order.status === "Closed Won";
      }
      if (statusFilter === "Lost") {
        return order.status === "Closed Lost";
      }
      // Specific status fallback
      return order.status === statusFilter;
    });
  }, [baseFilteredOrders, statusFilter]);

  // Sorting: Most recent records first (by create date or invoice date)
  const sortedOrders = useMemo(() => {
    return [...visibleOrders].sort((a, b) => {
      if (dateFilterType === "invoiceDate") {
        const dateA = getOrderInvoiceDate(a) || getOrderCreateDate(a) || "";
        const dateB = getOrderInvoiceDate(b) || getOrderCreateDate(b) || "";
        if (dateB !== dateA) return dateB.localeCompare(dateA);
      } else {
        const dateA = getOrderCreateDate(a) || "";
        const dateB = getOrderCreateDate(b) || "";
        if (dateB !== dateA) return dateB.localeCompare(dateA);
      }
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [visibleOrders, dateFilterType]);

  // Displayed orders (Fast mode: recent 100 records by default with "See More" pagination)
  const displayedOrders = useMemo(() => {
    return sortedOrders.slice(0, recordsLimit);
  }, [sortedOrders, recordsLimit]);

  // Calculate comprehensive metrics based on all matching visible orders
  const totalValue = visibleOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const averageDealValue = visibleOrders.length > 0 ? totalValue / visibleOrders.length : 0;
  const closedWonOrders = visibleOrders.filter((o) => o.status === "Closed Won");
  const closedWonValue = closedWonOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const openOffers = visibleOrders.filter((o) => ["New", "Contacted", "Proposal", "Negotiation"].includes(o.status));
  const openOffersValue = openOffers.reduce((sum, o) => sum + o.totalValue, 0);
  const lostOrders = visibleOrders.filter((o) => o.status === "Closed Lost");
  const lostValue = lostOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const invoicedOrders = visibleOrders.filter((o) => !!o.billingDetails?.invoiceNumber);
  const totalInvoicedValue = invoicedOrders.reduce((sum, o) => sum + (o.billingDetails?.invoiceAmount ? Number(o.billingDetails.invoiceAmount) || 0 : o.totalValue), 0);
  const totalProductLines = visibleOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0);
  const totalQuantityUnits = visibleOrders.reduce((sum, o) => {
    const itemQty = (o.items || []).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0);
    return sum + itemQty;
  }, 0);

  // Tax & Amount Calculations (Inclusive of 18% GST by default)
  const parseTaxPercent = (taxStr?: string): number => {
    if (!taxStr) return 18;
    const match = taxStr.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 18;
  };

  const calculateItemBaseAmount = (item: { quantity: number | string; rate: number | string }) => {
    return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
  };

  const calculateItemGstAmount = (item: { quantity: number | string; rate: number | string; taxes?: string }) => {
    const base = calculateItemBaseAmount(item);
    const taxPct = parseTaxPercent((item as any).taxes || defaultTaxValue);
    return base * (taxPct / 100);
  };

  const calculateItemTotalWithGst = (item: { quantity: number | string; rate: number | string; taxes?: string }) => {
    const base = calculateItemBaseAmount(item);
    const gst = calculateItemGstAmount(item);
    return base + gst;
  };

  const parseFreightAmount = (freightVal?: string): number => {
    if (!freightVal) return 0;
    const cleaned = freightVal.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!cleaned) return 0;
    const num = parseFloat(cleaned[0]);
    return isNaN(num) ? 0 : num;
  };

  const calculateBaseTotal = (itemsList: Omit<OrderItem, "amount">[], status?: string, freightVal?: string) => {
    const itemsBase = itemsList.reduce((sum, item) => sum + calculateItemBaseAmount(item), 0);
    const freightBase = status === "Closed Won" ? parseFreightAmount(freightVal) : 0;
    return itemsBase + freightBase;
  };

  const calculateTotalGst = (itemsList: Omit<OrderItem, "amount">[], status?: string, freightVal?: string) => {
    const itemsGst = itemsList.reduce((sum, item) => sum + calculateItemGstAmount(item), 0);
    const freightGst = status === "Closed Won" ? parseFreightAmount(freightVal) * 0.18 : 0;
    return itemsGst + freightGst;
  };

  const calculateTotalValueWithGst = (itemsList: Omit<OrderItem, "amount">[], status?: string, freightVal?: string) => {
    const itemsTotal = itemsList.reduce((sum, item) => sum + calculateItemTotalWithGst(item), 0);
    const freightTotalWithGst = status === "Closed Won" ? parseFreightAmount(freightVal) * 1.18 : 0;
    return itemsTotal + freightTotalWithGst;
  };

  const calculateTotalValue = calculateTotalValueWithGst;

  // Add order item row handlers
  const handleAddProductRow = (isEdit: boolean) => {
    const defaultProduct = products[0] || { id: "proj-1", name: "Default Product", hsnCode: "" };
    const newItem = {
      productId: defaultProduct.id,
      productName: defaultProduct.name,
      quantity: isEdit ? 1 : ("" as any),
      rate: isEdit ? 25000 : ("" as any),
      hsnCode: defaultProduct.hsnCode || "",
      packing: "",
      taxes: defaultTaxValue
    };
    if (isEdit) {
      setEditItems([...editItems, newItem]);
    } else {
      setNewItems([...newItems, newItem]);
    }
  };

  const handleRemoveProductRow = (index: number, isEdit: boolean) => {
    if (isEdit) {
      if (editItems.length === 1) return; // keep at least 1
      setEditItems(editItems.filter((_, i) => i !== index));
    } else {
      if (newItems.length === 1) return; // keep at least 1
      setNewItems(newItems.filter((_, i) => i !== index));
    }
  };

  const handleProductRowChange = (index: number, field: string, value: any, isEdit: boolean) => {
    const targetItems = isEdit ? [...editItems] : [...newItems];
    const item = targetItems[index];

    if (field === "productId") {
      const p = products.find((prod) => prod.id === value);
      item.productId = value;
      item.productName = p ? p.name : "Unknown Product";
      (item as any).hsnCode = p?.hsnCode || "";
      (item as any).taxes = (item as any).taxes || defaultTaxValue;
    } else if (field === "quantity") {
      item.quantity = value === "" ? ("" as any) : Math.max(0, Number(value));
    } else if (field === "rate") {
      item.rate = value === "" ? ("" as any) : Math.max(0, Number(value));
    } else if (field === "hsnCode") {
      (item as any).hsnCode = value;
    } else if (field === "packing") {
      (item as any).packing = value;
    } else if (field === "taxes") {
      (item as any).taxes = value;
    }

    if (isEdit) {
      setEditItems(targetItems);
    } else {
      setNewItems(targetItems);
    }
  };

  // Reset form helper
  const resetAddForm = () => {
    setNewClientName("");
    setNewCompanyName("");
    setNewEmail("");
    setNewPhone("");
    setNewBillingAddress("");
    setNewSendEmail(false);
    setNewStatus("New");
    setNewItems([
      { productId: products[0]?.id || "proj-1", productName: products[0]?.name || "Default Product", quantity: "" as any, rate: "" as any, hsnCode: products[0]?.hsnCode || "", packing: "", taxes: defaultTaxValue }
    ]);
    setNewAssignedTo(activeUserId);
    setNewNotes("");
    setNewPayment("");
    setNewPaymentCreditPeriod("");
    setNewPaymentTermsOffer("");
    setNewPaymentBankId("");
    setNewDelivery("");
    setNewOtherTerms("");
    setIsCustomCompany(false);

    // Reset Closed Won details
    setNewPoNumber("");
    setNewPoDate("");
    setNewFreightTerm("");
    setNewFreightChargedInBill("");
    setNewFreightCostToAol("");
    setNewCartageLabourCharges("");
    setNewTransporterName("");
    setNewVehicleNo("");
    setNewDeliveryTerm("");
    setNewDestinationAddress("");
    setNewDispatchDate("");
    setNewDispatchLocation("");
    setNewWarehouseManagedBy("");
    setNewPoAttachmentUrl("");
    setNewPoFileName("");
    setNewPoAttachments([]);
    setNewGstin("");
    setNewBillingGstin("");
    setNewSameAsBilling(false);
    setUploadError(null);
    setUploadProgressText("");
  };

  const handlePOFilesUpload = async (files: FileList | File[], isEdit: boolean) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    const currentAttachments = isEdit ? editPoAttachments : newPoAttachments;
    const remainingSlots = 5 - currentAttachments.length;

    if (currentAttachments.length >= 5) {
      setUploadError("Maximum limit of 5 PO files reached. Remove an existing file to attach a new one.");
      return;
    }

    if (fileList.length > remainingSlots) {
      setUploadError(`You can only upload up to ${remainingSlots} more file(s). Maximum 5 PO files total allowed.`);
      return;
    }

    const nonPdf = fileList.some((f) => !f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf");
    if (nonPdf) {
      setUploadError("Only PDF files are allowed to be uploaded.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgressText(fileList.length === 1 ? `Uploading ${fileList[0].name} to Google Drive...` : `Uploading ${fileList.length} PO documents to Google Drive...`);

    try {
      const clientNameArg = isEdit 
        ? (editCompanyName || editClientName || "General Clients")
        : (newCompanyName || newClientName || "General Clients");
      const poNumArg = isEdit ? editPoNumber : newPoNumber;

      const uploadedList: PoAttachment[] = [];
      let hadFallback = false;
      let fallbackReason = "";

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (fileList.length > 1) {
          setUploadProgressText(`Uploading ${i + 1} of ${fileList.length}: ${file.name}...`);
        }
        const result = await uploadPOToDrive(file, clientNameArg, poNumArg);
        uploadedList.push({
          id: result.id,
          name: result.name || file.name,
          url: result.webViewLink,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
        if (result.isLocalFallback) {
          hadFallback = true;
          fallbackReason = result.fallbackReason || "Attached locally.";
        }
      }

      if (isEdit) {
        const updated = [...editPoAttachments, ...uploadedList].slice(0, 5);
        setEditPoAttachments(updated);
        setEditPoAttachmentUrl(updated[0]?.url || "");
        setEditPoFileName(updated[0]?.name || "");
      } else {
        const updated = [...newPoAttachments, ...uploadedList].slice(0, 5);
        setNewPoAttachments(updated);
        setNewPoAttachmentUrl(updated[0]?.url || "");
        setNewPoFileName(updated[0]?.name || "");
      }

      if (hadFallback) {
        setUploadError(`Notice: ${fallbackReason} You can also connect or refresh Google Drive in Admin Drive Settings.`);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to upload PO document to Google Drive.");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  const handleRemovePOAttachment = (index: number, isEdit: boolean) => {
    if (isEdit) {
      const updated = editPoAttachments.filter((_, i) => i !== index);
      setEditPoAttachments(updated);
      setEditPoAttachmentUrl(updated[0]?.url || "");
      setEditPoFileName(updated[0]?.name || "");
    } else {
      const updated = newPoAttachments.filter((_, i) => i !== index);
      setNewPoAttachments(updated);
      setNewPoAttachmentUrl(updated[0]?.url || "");
      setNewPoFileName(updated[0]?.name || "");
    }
  };

  // Submit handers
  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newCompanyName) {
      alert("Company Name and Client Full Name are required.");
      return;
    }

    if (!newStatus) {
      alert("Pipeline Status is required.");
      return;
    }

    if (!newAssignedTo) {
      alert("Assign Lead To is required.");
      return;
    }

    if (!newItems || newItems.length === 0) {
      alert("At least one product line item is required.");
      return;
    }

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      if (!item.productId) {
        alert(`Product details missing in line item #${i + 1}: Please select a product.`);
        return;
      }
      if (item.quantity === "" || item.quantity === null || item.quantity === undefined || Number(item.quantity) <= 0) {
        alert(`Product details incomplete in line item #${i + 1}: Quantity must be greater than 0.`);
        return;
      }
      if (item.rate === "" || item.rate === null || item.rate === undefined || Number(item.rate) <= 0) {
        alert(`Product details incomplete in line item #${i + 1}: Rate must be greater than 0.`);
        return;
      }
    }

    const finalItems: OrderItem[] = newItems.map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const taxStr = (item as any).taxes || defaultTaxValue;
      const totalAmountWithGst = calculateItemTotalWithGst({ quantity: qty, rate, taxes: taxStr });
      return {
        ...item,
        quantity: qty,
        rate: rate,
        taxes: taxStr,
        amount: totalAmountWithGst
      };
    });

    const computedTotal = finalItems.reduce((acc, it) => acc + it.amount, 0);

    let initialEmailSummary: EmailSentStatusSummary | undefined = undefined;

    if (newSendEmail && newEmail) {
      const hierarchy = resolveUserHierarchyInfo(activeUserId, newAssignedTo, users);
      const template = emailTemplates?.find(t => t.id === newTemplateId) || 
        (newTemplateId === "" ? emailTemplates?.find(t => t.isDefault && (t.assignedForm === "create_order" || t.assignedForm === "any" || !t.assignedForm)) : undefined);
      const itemsListString = finalItems.map((item, index) =>
        `Product ${index + 1}: ${item.productName}: Qty ${item.quantity} @ ${item.rate} = ${item.amount}`
      ).join('\n');

      const selectedBank = paymentBanks?.find(b => b.id === newPaymentBankId);
      const bankDetailsTableHtml = selectedBank ? `
<table style="width:100%; max-width:500px; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#1e293b; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:1px solid #e2e8f0;">
      <th colspan="2" style="padding:12px; text-align:left; font-weight:bold; color:#0f172a; font-size:14px; border-bottom:1px solid #e2e8f0;">Bank Details for Payment</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; width:35%; background-color:#f8fafc;">Bank Name</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.bankName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Account Holder</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.accountHolderName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">A/C No.</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.accountNumber || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">IFSC Code</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.ifscCode || ""}</td>
    </tr>
    ${selectedBank.branch ? `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Branch</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.branch}</td>
    </tr>` : ""}
  </tbody>
</table>
      `.trim() : "";

      const itemsTableHtml = `
<table style="width:100%; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#334155; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:2px solid #cbd5e1; color:#0f172a; font-weight:bold;">
      <th style="padding:10px; text-align:left; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Product</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">HSN Code</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Quantity (Kg)</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Packing</th>
      <th style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Price (Rs./Kg)</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Taxes</th>
      <th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>
    ${finalItems.map((item, idx) => `
    <tr style="border-bottom:1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding:10px; font-weight:500; border-right:1px solid #e2e8f0; color:#0f172a;">${item.productName || ""}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; font-family:monospace;">${item.hsnCode || "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; font-weight:bold;">${item.quantity ? `${item.quantity.toLocaleString()} Kg` : "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0;">${item.packing || "-"}</td>
      <td style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; font-family:monospace;">${item.rate ? `₹${item.rate.toLocaleString()}` : "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0;">${item.taxes || "-"}</td>
      <td style="padding:10px; text-align:right; font-weight:bold; font-family:monospace; color:#0f172a;">₹${item.amount.toLocaleString()}</td>
    </tr>
    `).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color:#f1f5f9; font-weight:bold; border-top:2px solid #cbd5e1; color:#0f172a;">
      <td colspan="6" style="padding:12px; text-align:right; border-right:1px solid #e2e8f0; text-transform:uppercase; font-size:11px; letter-spacing:0.5px;">Grand Total Value:</td>
      <td style="padding:12px; text-align:right; font-size:14px; font-family:monospace; color:#0f172a;">₹${computedTotal.toLocaleString()}</td>
    </tr>
  </tfoot>
</table>
      `.trim();

      const applyTemplate = (text: string) => {
        return replaceTemplateVars(text, {
          recordId: "",
          clientName: newClientName,
          companyName: newCompanyName,
          email: newEmail,
          phone: newPhone,
          billingAddress: newBillingAddress,
          status: newStatus,
          totalValue: computedTotal,
          itemsList: itemsListString,
          itemsTable: itemsTableHtml,
          bankDetailsTable: bankDetailsTableHtml,
          payment: newPayment,
          paymentTermsOffer: newPaymentTermsOffer,
          paymentCreditPeriod: newPaymentCreditPeriod,
          delivery: newDelivery,
          otherTerms: newOtherTerms,
          notes: newNotes,
          customerPoNumber: newPoNumber,
          poDate: newPoDate,
          freightTerm: newFreightTerm,
          freightChargedInBill: newFreightChargedInBill,
          freightCostToAol: newFreightCostToAol,
          cartageLabourCharges: newCartageLabourCharges,
          transporterName: newTransporterName,
          deliveryTerm: newDeliveryTerm,
          destinationAddress: newDestinationAddress,
          dispatchDate: newDispatchDate,
          dispatchLocation: newDispatchLocation,
          warehouseManagedBy: newWarehouseManagedBy,
          ...hierarchy,
        });
      };

      const subject = applyTemplate(template?.subject || "New Sales Order");
      let rawBody = applyTemplate(template?.body || `Order Details:\nClient: {{clientName}}\nCompany: {{companyName}}\nStatus: {{status}}\nTotal: {{totalValue}}\nItems:\n{{itemsList}}`);
      const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(rawBody);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : newEmail);
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      try {
        const emailResult = await dispatchSystemEmail({
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
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
          category: "create_order",
          companyName: newCompanyName,
          clientName: newClientName,
        });

        const deliveryStatus: EmailDeliveryStatus = (emailResult.ok && emailResult.deliveryStatus !== "Failed") ? "Sent" : "Failed";
        initialEmailSummary = {
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          status: deliveryStatus,
          timestamp: new Date().toISOString(),
          subject,
          error: emailResult.ok ? undefined : (emailResult.message || "Failed to send order email"),
          sentByUserName: activeUser?.name,
        };
      } catch (err: any) {
        console.error("Email sending failed for new order:", err);
        initialEmailSummary = {
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          status: "Failed",
          timestamp: new Date().toISOString(),
          subject,
          error: err.message || "Email sending exception",
          sentByUserName: activeUser?.name,
        };
      }
    }

    onAddOrder({
      clientName: newClientName,
      companyName: newCompanyName,
      email: newEmail,
      phone: newPhone || "+1 (555) 000-0000",
      billingAddress: newBillingAddress,
      billingGstin: newBillingGstin,
      status: newStatus,
      totalValue: computedTotal,
      items: finalItems,
      assignedToUserId: newAssignedTo,
      notes: newNotes,
      payment: newPayment,
      paymentCreditPeriod: newPaymentCreditPeriod,
      paymentBankId: newPaymentBankId,
      paymentTermsOffer: newPaymentTermsOffer,
      delivery: newDelivery,
      otherTerms: newOtherTerms,
      emailStatus: initialEmailSummary,
      closedWonDetails: newStatus === "Closed Won" ? {
        customerPoNumber: newPoNumber,
        poDate: newPoDate,
        freightTerm: newFreightTerm,
        freightChargedInBill: newFreightChargedInBill,
        freightCostToAol: newFreightCostToAol,
        cartageLabourCharges: newCartageLabourCharges,
        transporterName: newTransporterName,
        vehicleNo: newVehicleNo,
        deliveryTerm: newDeliveryTerm,
        destinationAddress: newDestinationAddress,
        gstin: newGstin,
        dispatchDate: newDispatchDate,
        dispatchLocation: newDispatchLocation,
        warehouseManagedBy: newWarehouseManagedBy,
        poAttachmentUrl: newPoAttachments[0]?.url || newPoAttachmentUrl || "",
        poAttachmentUrls: newPoAttachments.map(a => a.url),
        poAttachments: newPoAttachments,
      } : undefined,
    });

    setIsAddOpen(false);
    resetAddForm();
  };

  const handleEditOrderClick = (order: OrderOffer) => {
    setEditingOrder(order);
    setEditClientName(order.clientName);
    setEditCompanyName(order.companyName);
    setEditEmail(order.email);
    setEditSendEmail(false);
    setEditPhone(order.phone);
    const clientMatch = clients.find(c => c.companyName === order.companyName && c.fullName === order.clientName) || clients.find(c => c.companyName === order.companyName);
    setEditBillingAddress(order.billingAddress || clientMatch?.address || "");
    setEditBillingGstin(order.billingGstin || clientMatch?.gst || "");
    setEditStatus(order.status);
    setEditAssignedTo(order.assignedToUserId);
    setEditNotes(order.notes);
    setEditPayment(order.payment || "");
    setEditPaymentCreditPeriod(order.paymentCreditPeriod || "");
    setEditPaymentTermsOffer(order.paymentTermsOffer || "");
    setEditPaymentBankId(order.paymentBankId || "");
    setEditDelivery(order.delivery || "");
    setEditOtherTerms(order.otherTerms || "");
    setEditItems(order.items || []);

    // Populate Closed Won details if they exist
    setEditPoNumber(order.closedWonDetails?.customerPoNumber || "");
    setEditPoDate(order.closedWonDetails?.poDate || "");
    setEditFreightTerm(order.closedWonDetails?.freightTerm || "");
    setEditFreightChargedInBill(order.closedWonDetails?.freightChargedInBill || "");
    setEditFreightCostToAol(order.closedWonDetails?.freightCostToAol || "");
    setEditCartageLabourCharges(order.closedWonDetails?.cartageLabourCharges || "");
    setEditTransporterName(order.closedWonDetails?.transporterName || "");
    setEditVehicleNo(order.closedWonDetails?.vehicleNo || "");
    setEditDeliveryTerm(order.closedWonDetails?.deliveryTerm || "");
    setEditDestinationAddress(order.closedWonDetails?.destinationAddress || "");
    setEditDispatchDate(order.closedWonDetails?.dispatchDate || "");
    setEditDispatchLocation(order.closedWonDetails?.dispatchLocation || "");
    setEditWarehouseManagedBy(order.closedWonDetails?.warehouseManagedBy || "");
    setEditPoAttachmentUrl(order.closedWonDetails?.poAttachmentUrl || "");
    if (order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0) {
      setEditPoAttachments(order.closedWonDetails.poAttachments);
      setEditPoFileName(order.closedWonDetails.poAttachments[0]?.name || "");
    } else if (order.closedWonDetails?.poAttachmentUrls && order.closedWonDetails.poAttachmentUrls.length > 0) {
      const parsed = order.closedWonDetails.poAttachmentUrls.map((url, idx) => ({
        id: `po-att-${idx}`,
        name: `Customer PO - ${order.closedWonDetails?.customerPoNumber || "Doc"}_${idx + 1}.pdf`,
        url,
      }));
      setEditPoAttachments(parsed);
      setEditPoFileName(parsed[0]?.name || "");
    } else if (order.closedWonDetails?.poAttachmentUrl) {
      const single = [{
        id: `po-att-0`,
        name: `Customer PO - ${order.closedWonDetails.customerPoNumber || "Document"}.pdf`,
        url: order.closedWonDetails.poAttachmentUrl,
      }];
      setEditPoAttachments(single);
      setEditPoFileName(single[0].name);
    } else {
      setEditPoAttachments([]);
      setEditPoFileName("");
    }
    setEditGstin(order.closedWonDetails?.gstin || "");
    setEditSameAsBilling(false);

    setIsEditOpen(true);
  };

  const handleEditOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    if (!editStatus) {
      alert("Pipeline Status is required.");
      return;
    }

    if (!editAssignedTo) {
      alert("Assign Lead To is required.");
      return;
    }

    if (!editItems || editItems.length === 0) {
      alert("At least one product line item is required.");
      return;
    }

    for (let i = 0; i < editItems.length; i++) {
      const item = editItems[i];
      if (!item.productId) {
        alert(`Product details missing in line item #${i + 1}: Please select a product.`);
        return;
      }
      if (item.quantity === "" || item.quantity === null || item.quantity === undefined || Number(item.quantity) <= 0) {
        alert(`Product details incomplete in line item #${i + 1}: Quantity must be greater than 0.`);
        return;
      }
      if (item.rate === "" || item.rate === null || item.rate === undefined || Number(item.rate) <= 0) {
        alert(`Product details incomplete in line item #${i + 1}: Rate must be greater than 0.`);
        return;
      }
    }

    const finalItems: OrderItem[] = editItems.map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const taxStr = (item as any).taxes || defaultTaxValue;
      const totalAmountWithGst = calculateItemTotalWithGst({ quantity: qty, rate, taxes: taxStr });
      return {
        ...item,
        quantity: qty,
        rate: rate,
        taxes: taxStr,
        amount: totalAmountWithGst
      };
    });

    const computedTotal = finalItems.reduce((acc, it) => acc + it.amount, 0);

    onEditOrder({
      ...editingOrder,
      clientName: editClientName,
      companyName: editCompanyName,
      email: editEmail,
      phone: editPhone,
      billingAddress: editBillingAddress,
      billingGstin: editBillingGstin,
      status: editStatus,
      totalValue: computedTotal,
      items: finalItems,
      assignedToUserId: editAssignedTo,
      notes: editNotes,
      payment: editPayment,
      paymentCreditPeriod: editPaymentCreditPeriod,
      paymentBankId: editPaymentBankId,
      paymentTermsOffer: editPaymentTermsOffer,
      delivery: editDelivery,
      otherTerms: editOtherTerms,
      closedWonDetails: editStatus === "Closed Won" ? {
        customerPoNumber: editPoNumber,
        poDate: editPoDate,
        freightTerm: editFreightTerm,
        freightChargedInBill: editFreightChargedInBill,
        freightCostToAol: editFreightCostToAol,
        cartageLabourCharges: editCartageLabourCharges,
        transporterName: editTransporterName,
        vehicleNo: editVehicleNo,
        deliveryTerm: editDeliveryTerm,
        destinationAddress: editDestinationAddress,
        gstin: editGstin,
        dispatchDate: editDispatchDate,
        dispatchLocation: editDispatchLocation,
        warehouseManagedBy: editWarehouseManagedBy,
        poAttachmentUrl: editPoAttachments[0]?.url || editPoAttachmentUrl || "",
        poAttachmentUrls: editPoAttachments.map(a => a.url),
        poAttachments: editPoAttachments,
      } : undefined,
    });

    if (editSendEmail && editEmail) {
      const hierarchy = resolveUserHierarchyInfo(activeUserId, editAssignedTo, users);
      const template = emailTemplates?.find(t => t.id === editTemplateId) || 
        (editTemplateId === "" ? emailTemplates?.find(t => t.isDefault && (t.assignedForm === "edit_order" || t.assignedForm === "any" || !t.assignedForm)) : undefined);
      const itemsListString = finalItems.map((item, index) =>
        `Product ${index + 1}: ${item.productName}: Qty ${item.quantity} @ ${item.rate} = ${item.amount}`
      ).join('\n');

      const selectedBank = paymentBanks?.find(b => b.id === editPaymentBankId);
      const bankDetailsTableHtml = selectedBank ? `
<table style="width:100%; max-width:500px; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#1e293b; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:1px solid #e2e8f0;">
      <th colspan="2" style="padding:12px; text-align:left; font-weight:bold; color:#0f172a; font-size:14px; border-bottom:1px solid #e2e8f0;">Bank Details for Payment</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; width:35%; background-color:#f8fafc;">Bank Name</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.bankName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Account Holder</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.accountHolderName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">A/C No.</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.accountNumber || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">IFSC Code</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.ifscCode || ""}</td>
    </tr>
    ${selectedBank.branch ? `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Branch</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.branch}</td>
    </tr>` : ""}
  </tbody>
</table>
      `.trim() : "";

      const itemsTableHtml = `
<table style="width:100%; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#334155; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:2px solid #cbd5e1; color:#0f172a; font-weight:bold;">
      <th style="padding:10px; text-align:left; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Product</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">HSN Code</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Quantity (Kg)</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Packing</th>
      <th style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Price (Rs./Kg)</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Taxes</th>
      <th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>
    ${finalItems.map((item, idx) => `
    <tr style="border-bottom:1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding:10px; font-weight:500; border-right:1px solid #e2e8f0; color:#0f172a;">${item.productName || ""}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; font-family:monospace;">${item.hsnCode || "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; font-weight:bold;">${item.quantity ? `${item.quantity.toLocaleString()} Kg` : "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0;">${item.packing || "-"}</td>
      <td style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; font-family:monospace;">${item.rate ? `₹${item.rate.toLocaleString()}` : "-"}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0;">${item.taxes || "-"}</td>
      <td style="padding:10px; text-align:right; font-weight:bold; font-family:monospace; color:#0f172a;">₹${item.amount.toLocaleString()}</td>
    </tr>
    `).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color:#f1f5f9; font-weight:bold; border-top:2px solid #cbd5e1; color:#0f172a;">
      <td colspan="6" style="padding:12px; text-align:right; border-right:1px solid #e2e8f0; text-transform:uppercase; font-size:11px; letter-spacing:0.5px;">Grand Total Value:</td>
      <td style="padding:12px; text-align:right; font-size:14px; font-family:monospace; color:#0f172a;">₹${computedTotal.toLocaleString()}</td>
    </tr>
  </tfoot>
</table>
      `.trim();

      const applyTemplate = (text: string) => {
        return replaceTemplateVars(text, {
          recordId: editingOrder?.id || "",
          clientName: editClientName,
          companyName: editCompanyName,
          email: editEmail,
          phone: editPhone,
          billingAddress: editBillingAddress,
          status: editStatus,
          totalValue: computedTotal,
          itemsList: itemsListString,
          itemsTable: itemsTableHtml,
          bankDetailsTable: bankDetailsTableHtml,
          payment: editPayment,
          paymentTermsOffer: editPaymentTermsOffer,
          paymentCreditPeriod: editPaymentCreditPeriod,
          delivery: editDelivery,
          otherTerms: editOtherTerms,
          notes: editNotes,
          invoiceNumber: editingOrder?.billingDetails?.invoiceNumber || "",
          invoiceFileLink: editingOrder?.billingDetails?.invoiceFileUrl || "",
          customerPoNumber: editPoNumber,
          poDate: editPoDate,
          freightTerm: editFreightTerm,
          freightChargedInBill: editFreightChargedInBill,
          freightCostToAol: editFreightCostToAol,
          cartageLabourCharges: editCartageLabourCharges,
          transporterName: editTransporterName,
          deliveryTerm: editDeliveryTerm,
          destinationAddress: editDestinationAddress,
          dispatchDate: editDispatchDate,
          dispatchLocation: editDispatchLocation,
          warehouseManagedBy: editWarehouseManagedBy,
          ...hierarchy,
        });
      };

      const subject = applyTemplate(template?.subject || "Sales Order Updated");
      let rawBody = applyTemplate(template?.body || `Order Details Updated:\nClient: {{clientName}}\nCompany: {{companyName}}\nStatus: {{status}}\nTotal: {{totalValue}}\nItems:\n{{itemsList}}`);
      const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(rawBody);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : editEmail);
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      try {
        const emailResult = await dispatchSystemEmail({
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
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
          category: "edit_order",
          orderId: editingOrder.id,
          companyName: editCompanyName || editingOrder.companyName,
          clientName: editClientName || editingOrder.clientName
        });

        const deliveryStatus: EmailDeliveryStatus = (emailResult.ok && emailResult.deliveryStatus !== "Failed") ? "Sent" : "Failed";
        const newSummary: EmailSentStatusSummary = {
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          status: deliveryStatus,
          timestamp: new Date().toISOString(),
          subject,
          error: emailResult.ok ? undefined : (emailResult.message || "Failed to send order email"),
          sentByUserName: activeUser?.name,
        };

        await onEditOrder({
          ...editingOrder,
          clientName: editClientName,
          companyName: editCompanyName,
          email: editEmail,
          phone: editPhone,
          billingAddress: editBillingAddress,
          billingGstin: editBillingGstin,
          status: editStatus,
          totalValue: computedTotal,
          items: finalItems,
          emailStatus: newSummary
        });
      } catch (err: any) {
        console.error("Email sending failed for edit order:", err);
      }
    }

    setIsEditOpen(false);
    setEditingOrder(null);
  };

  const handleQuickRegisterClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientFullName || !clientCompanyName || !clientEmail) return;

    if (onAddClient) {
      onAddClient({
        fullName: clientFullName,
        companyName: clientCompanyName,
        email: clientEmail,
        phone: clientPhone || "+1 (555) 000-0000",
        gst: clientGst || "N/A",
        city: clientCity || "N/A",
        pincode: clientPincode || "N/A",
        address: clientAddress || "N/A",
        teamName: clientTeamName || undefined,
      });

      // Automatically select in current modal form context
      setNewCompanyName(clientCompanyName);
      setNewClientName(clientFullName);
      setNewEmail(clientEmail);
      setNewPhone(clientPhone);

      // Close modal
      setIsAddClientModalOpen(false);
      // Clean up fields
      setClientFullName("");
      setClientCompanyName("");
      setClientEmail("");
      setClientPhone("");
      setClientGst("");
      setClientCity("");
      setClientPincode("");
      setClientAddress("");
    }
  };

  const handleAddBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName || !newAccountNumber) return;

    onAddPaymentBank({
      bankName: newBankName,
      accountHolderName: newAccountHolder,
      accountNumber: newAccountNumber,
      ifscCode: newIfscCode,
      branch: newBranch,
      address: newBankAddress,
    });

    setIsAddBankModalOpen(false);
    setNewBankName("");
    setNewAccountHolder("");
    setNewAccountNumber("");
    setNewIfscCode("");
    setNewBranch("");
    setNewBankAddress("");
  };

  const getEffectiveOrderStatus = (order: OrderOffer): EmailSentStatusSummary | undefined => {
    if (order.emailStatus && order.emailStatus.timestamp) {
      return order.emailStatus;
    }
    const matchingLog = emailSentLogs?.find(
      (l) => l.orderId === order.id || (l.to === order.email && ["create_order", "edit_order", "resend_order"].includes(l.category))
    );
    if (matchingLog) {
      return {
        to: matchingLog.to,
        cc: matchingLog.cc,
        bcc: matchingLog.bcc,
        status: matchingLog.status,
        timestamp: matchingLog.timestamp,
        error: matchingLog.error,
        subject: matchingLog.subject,
        sentByUserName: matchingLog.senderUserName,
      };
    }
    return undefined;
  };

  const handleResendOrderEmail = async (order: OrderOffer) => {
    setResendingOrderId(order.id);
    try {
      const hierarchy = resolveUserHierarchyInfo(activeUserId, order.assignedToUserId, users);
      const template = emailTemplates?.find(
        (t) => t.isDefault && (t.assignedForm === (order.status === "Closed Won" ? "create_order" : "create_order") || t.assignedForm === "any" || !t.assignedForm)
      ) || emailTemplates?.find((t) => t.isDefault);

      const itemsListString = (order.items || []).map((item, index) =>
        `Product ${index + 1}: ${item.productName}: Qty ${item.quantity} @ ${item.rate} = ${item.amount}`
      ).join("\n");

      const selectedBank = paymentBanks?.find((b) => b.id === order.paymentBankId);
      const bankDetailsTableHtml = selectedBank ? `
<table style="width:100%; max-width:500px; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#1e293b; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:1px solid #e2e8f0;">
      <th colspan="2" style="padding:12px; text-align:left; font-weight:bold; color:#0f172a; font-size:14px; border-bottom:1px solid #e2e8f0;">Bank Details for Payment</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; width:35%; background-color:#f8fafc;">Bank Name</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.bankName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Account Holder</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.accountHolderName || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">A/C No.</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.accountNumber || ""}</td>
    </tr>
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">IFSC Code</td>
      <td style="padding:10px; color:#0f172a; font-family:monospace; font-weight:bold;">${selectedBank.ifscCode || ""}</td>
    </tr>
    ${selectedBank.branch ? `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px; font-weight:600; color:#475569; background-color:#f8fafc;">Branch</td>
      <td style="padding:10px; color:#0f172a;">${selectedBank.branch}</td>
    </tr>` : ""}
  </tbody>
</table>`.trim() : "";

      const itemsTableHtml = `
<table style="width:100%; border-collapse:collapse; margin:16px 0; font-family:Arial, sans-serif; font-size:13px; color:#334155; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
  <thead>
    <tr style="background-color:#f8fafc; border-bottom:2px solid #cbd5e1; color:#0f172a; font-weight:bold;">
      <th style="padding:10px; text-align:left; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Product</th>
      <th style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Quantity (Kg)</th>
      <th style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; border-bottom:1px solid #cbd5e1;">Price (Rs./Kg)</th>
      <th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>
    ${(order.items || []).map((item, idx) => `
    <tr style="border-bottom:1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding:10px; font-weight:500; border-right:1px solid #e2e8f0; color:#0f172a;">${item.productName || ""}</td>
      <td style="padding:10px; text-align:center; border-right:1px solid #e2e8f0; font-weight:bold;">${item.quantity ? `${item.quantity.toLocaleString()} Kg` : "-"}</td>
      <td style="padding:10px; text-align:right; border-right:1px solid #e2e8f0; font-family:monospace;">${item.rate ? `₹${item.rate.toLocaleString()}` : "-"}</td>
      <td style="padding:10px; text-align:right; font-weight:bold; font-family:monospace; color:#0f172a;">₹${(item.amount || 0).toLocaleString()}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color:#f1f5f9; font-weight:bold; border-top:2px solid #cbd5e1; color:#0f172a;">
      <td colspan="3" style="padding:12px; text-align:right; border-right:1px solid #e2e8f0; text-transform:uppercase; font-size:11px;">Grand Total Value:</td>
      <td style="padding:12px; text-align:right; font-size:14px; font-family:monospace; color:#0f172a;">₹${(order.totalValue || 0).toLocaleString()}</td>
    </tr>
  </tfoot>
</table>`.trim();

      const applyTemplate = (text: string) => {
        return replaceTemplateVars(text, {
          recordId: order.id,
          clientName: order.clientName,
          companyName: order.companyName,
          email: order.email,
          phone: order.phone,
          billingAddress: order.billingAddress,
          status: order.status,
          totalValue: order.totalValue,
          itemsList: itemsListString,
          itemsTable: itemsTableHtml,
          bankDetailsTable: bankDetailsTableHtml,
          payment: order.payment,
          paymentTermsOffer: order.paymentTermsOffer,
          paymentCreditPeriod: order.paymentCreditPeriod,
          delivery: order.delivery,
          otherTerms: order.otherTerms,
          customerPoNumber: order.closedWonDetails?.customerPoNumber,
          poDate: order.closedWonDetails?.poDate,
          cartageLabourCharges: order.closedWonDetails?.cartageLabourCharges,
          transporterName: order.closedWonDetails?.transporterName,
          deliveryTerm: order.closedWonDetails?.deliveryTerm,
          destinationAddress: order.closedWonDetails?.destinationAddress,
          dispatchDate: order.closedWonDetails?.dispatchDate,
          dispatchLocation: order.closedWonDetails?.dispatchLocation,
          warehouseManagedBy: order.closedWonDetails?.warehouseManagedBy,
          ...hierarchy,
        });
      };

      const subject = applyTemplate(template?.subject || `Sales Order / Offer: ${order.companyName || order.clientName}`);
      const rawBody = applyTemplate(template?.body || `Order Details:\nClient: {{clientName}}\nCompany: {{companyName}}\nStatus: {{status}}\nTotal: {{totalValue}}\nItems:\n{{itemsList}}`);
      const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(rawBody);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : order.email);
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      const emailResult = await dispatchSystemEmail({
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
        category: "resend_order",
        orderId: order.id,
        companyName: order.companyName,
        clientName: order.clientName,
      });

      const deliveryStatus = emailResult.deliveryStatus || (emailResult.ok ? "Sent" : "Failed");
      const newSummary: EmailSentStatusSummary = {
        to: dynamicTo,
        cc: dynamicCc,
        bcc: dynamicBcc,
        status: deliveryStatus,
        timestamp: new Date().toISOString(),
        subject,
        error: emailResult.ok ? undefined : (emailResult.message || "Sending failed"),
        sentByUserName: activeUser?.name,
      };

      onEditOrder({
        ...order,
        emailStatus: newSummary,
      });

      if (emailResult.ok && deliveryStatus !== "Failed") {
        showEmailBanner("success", `Email successfully sent to ${dynamicTo} via Google Apps Script`);
      } else {
        showEmailBanner("error", `Failed to send email: ${emailResult.message || "Unknown error"}`);
      }
    } catch (err: any) {
      console.error("Resend error:", err);
      showEmailBanner("error", `Failed to resend: ${err.message || err}`);
    } finally {
      setResendingOrderId(null);
    }
  };

  if (!teamCanView) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
        <Lock size={48} className="mx-auto text-rose-500 mb-4" />
        <h3 className="text-base font-bold text-slate-800">Workspace Access Restricted</h3>
        <p className="text-sm text-slate-500 mt-2">
          Your team (<strong>{activeUser.teamName || "No Team Assigned"}</strong>) does not have permission to view the <strong>Offer/ order</strong> workspace. Please contact a Platform Administrator to request permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full mx-auto px-1 py-2">
      {/* Email Notification Banner */}
      {emailBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold animate-fadeIn ${
            emailBanner.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {emailBanner.type === "success" ? <Check size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-rose-600" />}
            <span>{emailBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setEmailBanner(null)}
            className="p-1 hover:bg-black/5 rounded-md text-slate-500 hover:text-slate-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-mono uppercase tracking-tight flex items-center gap-2">
            <ShoppingBag className="text-indigo-600" size={22} />
            Orders & Offers Matrix
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Comprehensive multi-product order registry with role-based access control and itemized calculation panels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
          {activeUser.role === Role.Admin && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all duration-150 transform hover:-translate-y-0.5 cursor-pointer"
              id="btn-import-orders"
            >
              <FileSpreadsheet size={15} />
              <span>Bulk Import Invoices & Orders</span>
            </button>
          )}

          {teamCanAdd ? (
            <button
              id="btn-add-order"
              onClick={() => {
                resetAddForm();
                setIsAddOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all duration-150 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Plus size={15} />
              Create Order / Offer
            </button>
          ) : (
            <button
              disabled
              title="Your team does not have permission to create orders."
              className="bg-slate-100 text-slate-400 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-not-allowed"
            >
              <Lock size={15} />
              Create Order / Offer
            </button>
          )}
        </div>
      </div>

      {activeUser.role === Role.Admin && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 -mt-2">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-indigo-600" />
            <div>
              <h2 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-tight">
                Auto-Select Default Template during Order & Offer Creation
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
                When checked, toggling "Send Confirmation Email" during Order / Offer setup will automatically pre-select the default template from the Email Templates tab.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const newSettings = {
                ...autoSelectSettings,
                ordersAutoSelect: !autoSelectSettings.ordersAutoSelect,
              };
              setAutoSelectSettings(newSettings);
              await saveEmailAutoSelectSettings(newSettings);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all border shadow-xs ${
              autoSelectSettings.ordersAutoSelect
                ? "bg-indigo-650 text-white border-indigo-750 hover:bg-indigo-700"
                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
            }`}
          >
            {autoSelectSettings.ordersAutoSelect ? "ON (Auto-Select)" : "OFF (Manual Select)"}
          </button>
        </div>
      )}

      {/* Analytics widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block tracking-wider">Total Orders & Offers</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block font-mono">
              {visibleOrders.length}
            </span>
          </div>
          <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-600">
            <ShoppingCart size={18} />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block tracking-wider">Gross Value</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block font-mono" title={`₹${totalValue.toLocaleString('en-IN')}`}>
              {formatCompactRupees(totalValue)}
            </span>
          </div>
          <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
            <IndianRupee size={18} />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block tracking-wider">Closed Won Orders</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block font-mono">
              {closedWonOrders.length}
            </span>
            <span className="text-[9.5px] text-emerald-600 font-bold mt-0.5 block" title={`₹${closedWonValue.toLocaleString('en-IN')} won`}>
              {formatCompactRupees(closedWonValue)} won
            </span>
          </div>
          <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
            <Check size={18} />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block tracking-wider">Product Items Sold</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block font-mono">
              {totalProductLines}
            </span>
          </div>
          <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-600">
            <ShoppingBag size={18} />
          </div>
        </div>
      </div>

      {/* Filter and registry search area */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, company, email, or product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700 bg-slate-50 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold font-mono">
            <Filter size={13} />
            <span>PIPELINE GROUP:</span>
          </div>
          <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            {[
              { id: "All", label: "All Items", count: baseFilteredOrders.length, desc: "All stages" },
              { id: "Offer", label: "Offer", count: baseFilteredOrders.filter(o => ["New", "Contacted", "Proposal", "Negotiation"].includes(o.status)).length, desc: "New, Contacted, Proposal, Negotiation" },
              { id: "Order", label: "Order", count: baseFilteredOrders.filter(o => o.status === "Closed Won").length, desc: "Closed Won" },
              { id: "Lost", label: "Lost", count: baseFilteredOrders.filter(o => o.status === "Closed Lost").length, desc: "Closed Lost" }
            ].map((grp) => {
              const isActive = statusFilter === grp.id || 
                (grp.id === "Offer" && ["New", "Contacted", "Proposal", "Negotiation"].includes(statusFilter)) ||
                (grp.id === "Order" && statusFilter === "Closed Won") ||
                (grp.id === "Lost" && statusFilter === "Closed Lost");
              
              return (
                <button
                  key={grp.id}
                  onClick={() => setStatusFilter(grp.id)}
                  title={grp.desc}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider">{grp.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-600"
                  }`}>
                    {grp.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sub-status refine options for Offers */}
          {(statusFilter === "Offer" || ["New", "Contacted", "Proposal", "Negotiation"].includes(statusFilter)) && (
            <div className="flex flex-wrap items-center gap-1.5 bg-amber-50/50 p-1 rounded-xl border border-amber-200/50">
              <span className="text-[9px] font-extrabold text-amber-800 px-1.5 uppercase font-mono tracking-wider">Refine Stage:</span>
              {[
                { id: "Offer", label: "All Offers" },
                { id: "New", label: "New" },
                { id: "Contacted", label: "Contacted" },
                { id: "Proposal", label: "Proposal" },
                { id: "Negotiation", label: "Negotiation" }
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setStatusFilter(sub.id)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase transition-all duration-100 cursor-pointer ${
                    statusFilter === sub.id
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-amber-700 hover:bg-amber-100/50"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Date Field Type Selector + Custom Date Inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold font-mono">
            <Calendar size={14} className="text-indigo-600" />
            <span>FILTER DATE BY:</span>
          </div>

          {/* Date Type Toggle: Create Date vs Invoice Date */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setDateFilterType("createdAt");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                dateFilterType === "createdAt"
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Create Date
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterType("invoiceDate");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                dateFilterType === "invoiceDate"
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Invoice Date
            </button>
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActiveDatePreset("Custom");
                }}
                className="text-xs text-slate-700 font-mono bg-transparent outline-none cursor-pointer"
              />
            </div>
            <span className="text-slate-300 font-bold font-mono text-xs">to</span>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActiveDatePreset("Custom");
                }}
                className="text-xs text-slate-700 font-mono bg-transparent outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Presets & Reset */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 font-mono uppercase mr-1">Presets:</span>
          {["All Time", "Today", "This Week", "This Month", "Last Month", "This FY"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyDatePreset(preset)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
                activeDatePreset === preset
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60"
              }`}
            >
              {preset}
            </button>
          ))}

          {(startDate || endDate || activeDatePreset !== "All Time") && (
            <button
              type="button"
              onClick={clearDateFilter}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold font-mono text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1 transition-all ml-1 cursor-pointer"
              title="Clear date filter"
            >
              <X size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Order/Offer Registry */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                <th className="py-2.5 px-4">Client & Company</th>
                <th className="py-2.5 px-3">Itemized Product List</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Invoice Details</th>
                <th className="py-2.5 px-3">Email Sent Status</th>
                <th className="py-2.5 px-3">Total Deal Value</th>
                <th className="py-2.5 px-3">Assign Ownership</th>
                <th className="py-2.5 px-4 text-right">Auth Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400 font-mono">
                    No matching orders or offers found in the registry.
                  </td>
                </tr>
              ) : (
                displayedOrders.map((order) => {
                  const createdBy = users.find((u) => u.id === order.createdByUserId);
                  const assignedTo = users.find((u) => u.id === order.assignedToUserId);

                  // Security authorization evaluation
                  let isEditable = canEditOrderOffer(activeUserId, order, users);
                  let isDeletable = canDeleteOrderOffer(activeUserId, order, users);

                  if (!teamCanEdit) {
                    isEditable = false;
                    isDeletable = false;
                  }

                  const isInvoiceAttached = !!order.billingDetails?.invoiceNumber;

                  if (isInvoiceAttached && activeUser.role !== Role.Admin) {
                    isEditable = false;
                    isDeletable = false;
                  }

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Client / Company info */}
                      <td className="py-3 px-4 min-w-[200px]">
                        {(() => {
                          const parsedEmails = (order.email || "")
                            .split(/[,;]/)
                            .map((e) => e.trim())
                            .filter(Boolean);
                          const visibleEmails = parsedEmails.slice(0, 2);
                          const hiddenCount = parsedEmails.length - 2;

                          return (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <Building2 size={12} className="text-slate-400 shrink-0" />
                                {order.companyName || order.clientName}
                              </span>
                              <span className="text-[10px] text-slate-600 font-medium flex items-center gap-1 mt-0.5">
                                <UserIcon size={11} className="text-slate-400 shrink-0" />
                                {order.clientName}
                              </span>

                              {/* Email list - displayed on separate rows (max 2) */}
                              {visibleEmails.length > 0 && (
                                <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                                  {visibleEmails.map((em, idx) => (
                                    <div key={idx} className="text-slate-500 flex items-center gap-1 truncate" title={em}>
                                      <Mail size={10} className="text-slate-400 shrink-0" />
                                      <span className="truncate">{em}</span>
                                    </div>
                                  ))}
                                  {hiddenCount > 0 && (
                                    <div
                                      className="text-[9px] text-indigo-600 font-semibold pl-3.5 cursor-help"
                                      title={`Hidden emails: ${parsedEmails.slice(2).join(", ")}`}
                                    >
                                      +{hiddenCount} more email{hiddenCount > 1 ? "s" : ""}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Phone */}
                              {order.phone && (
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                                  <Phone size={10} className="text-slate-400 shrink-0" />
                                  {order.phone}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Items details nested list */}
                      <td className="py-3 px-3 max-w-[320px]">
                        <div className="space-y-1.5">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="flex flex-col bg-slate-50 border border-slate-100 rounded p-1.5">
                              <span className="text-[10px] font-bold text-slate-800 truncate leading-tight">
                                {item.productName}
                              </span>
                              <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-0.5">
                                <span>Qty: {item.quantity} × ₹{item.rate.toLocaleString()}</span>
                                <span className="font-bold text-slate-700">₹{item.amount.toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {/* Bifurcated category indicator */}
                          {["New", "Contacted", "Proposal", "Negotiation"].includes(order.status) && (
                            <span className="text-[8px] font-extrabold uppercase tracking-widest text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 leading-none">
                              Offer
                            </span>
                          )}
                          {order.status === "Closed Won" && (
                            <span className="text-[8px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50 leading-none">
                              Order
                            </span>
                          )}
                          {order.status === "Closed Lost" && (
                            <span className="text-[8px] font-extrabold uppercase tracking-widest text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/50 leading-none">
                              Lost
                            </span>
                          )}

                          <span className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider font-mono ${
                            order.status === "Closed Won"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : order.status === "Closed Lost"
                              ? "bg-rose-50 text-rose-700 border border-rose-100"
                              : order.status === "Negotiation"
                              ? "bg-amber-50 text-amber-700 border border-amber-100"
                              : order.status === "Proposal"
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            {order.status}
                          </span>
                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                <a
                                  key={attIdx}
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`);
                                  }}
                                  className="inline-flex items-center gap-1 text-[9px] text-emerald-600 hover:text-emerald-800 font-bold bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-150 transition-all shadow-2xs"
                                  title={`Open ${att.name || 'PO Document'}`}
                                >
                                  <FileText size={10} />
                                  <span>{order.closedWonDetails!.poAttachments!.length === 1 ? "PO Link ↗" : `PO ${attIdx + 1} ↗`}</span>
                                </a>
                              ))}
                            </div>
                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                openOrDownloadDocument(order.closedWonDetails.poAttachmentUrl, `PO_${order.closedWonDetails.customerPoNumber || "document"}.pdf`);
                              }}
                              className="inline-flex items-center gap-1 text-[9px] text-emerald-600 hover:text-emerald-800 font-bold bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-150 transition-all shadow-2xs mt-0.5"
                              title="Open PO Document"
                            >
                              <FileText size={10} />
                              <span>PO Link ↗</span>
                            </a>
                          ) : null}
                        </div>
                      </td>

                      {/* Invoice Details */}
                      <td className="py-3 px-3 min-w-[160px]">
                        {order.billingDetails?.invoiceNumber ? (
                          <div className="flex flex-col text-[10px] space-y-1">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">INV #:</span>
                              <span className="text-slate-800 font-bold bg-indigo-50 border border-indigo-150 px-1.5 py-0.5 rounded leading-none">
                                {order.billingDetails.invoiceNumber}
                              </span>
                            </div>
                            {order.billingDetails.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                {order.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                  <a
                                    key={attIdx}
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openOrDownloadDocument(att.url, att.name || `Invoice_${order.billingDetails?.invoiceNumber || "Doc"}_${attIdx + 1}.pdf`);
                                    }}
                                    className="inline-flex items-center gap-1 text-[9px] text-indigo-700 hover:text-indigo-900 font-mono font-bold bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-all shadow-2xs"
                                    title={`Open ${att.name || `Invoice ${attIdx + 1}`}`}
                                  >
                                    <FileText size={10} className="shrink-0 text-indigo-600" />
                                    <span className="truncate max-w-[110px]">
                                      {order.billingDetails!.invoiceAttachments!.length === 1 ? (att.name || "Invoice.pdf") : (att.name || `Inv ${attIdx + 1}`)}
                                    </span>
                                    <span className="text-[8px] text-indigo-500">↗</span>
                                  </a>
                                ))}
                              </div>
                            ) : order.billingDetails.invoiceFileUrl ? (
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openOrDownloadDocument(order.billingDetails!.invoiceFileUrl!, order.billingDetails!.invoiceFileName || `Invoice_${order.billingDetails!.invoiceNumber}.pdf`);
                                }}
                                className="inline-flex items-center gap-1 text-[9.5px] text-indigo-600 hover:text-indigo-800 font-mono font-semibold"
                              >
                                <FileText size={10} className="shrink-0 text-slate-400" />
                                <span className="truncate max-w-[120px]" title={order.billingDetails.invoiceFileName}>
                                  {order.billingDetails.invoiceFileName || "invoice.pdf"}
                                </span>
                                <span className="text-[8px] text-indigo-500">↗</span>
                              </a>
                            ) : null}
                            {order.billingDetails.mappedAt && (
                              <div className="text-[8px] text-slate-400 font-mono">
                                Mapped: {formatDate(order.billingDetails.mappedAt)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[9.5px] italic font-mono">Pending Invoice</span>
                        )}
                      </td>

                      {/* Email Delivery & Sent Status */}
                      <td className="py-3 px-3 min-w-[200px]">
                        <EmailSentStatusCell
                          statusSummary={getEffectiveOrderStatus(order)}
                          onResend={() => handleResendOrderEmail(order)}
                          isResending={resendingOrderId === order.id}
                          canResend={true}
                          tableType="order"
                        />
                      </td>

                      {/* Financial grand total */}
                      <td className="py-3 px-3">
                        <span className="text-slate-950 font-mono font-bold text-xs" title={`₹${order.totalValue.toLocaleString('en-IN')}`}>
                          {formatCompactRupees(order.totalValue)}
                        </span>
                      </td>

                      {/* Ownership details */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[10px]">
                          <span className="text-slate-500">
                            Creator: <strong className="text-slate-700 font-semibold">{createdBy?.name || order.createdByUserId}</strong>
                          </span>
                          <span className="text-slate-500 mt-0.5">
                            Owner: <strong className="text-slate-700 font-semibold">{assignedTo?.name || order.assignedToUserId}</strong>
                          </span>
                        </div>
                      </td>

                      {/* Actions and security matrix */}
                      <td className="py-3 px-4 text-right min-w-[170px]">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 mr-1.5">
                            {isEditable ? (
                              <Unlock size={11} className="text-emerald-600" title="Full write/edit access enabled" />
                            ) : (
                              <Lock
                                size={11}
                                className="text-slate-400"
                                title={
                                  !teamCanEdit
                                    ? "Locked: Your team does not have edit permission for this workspace"
                                    : isInvoiceAttached && activeUser.role !== Role.Admin
                                    ? "Locked: Invoice is already attached (Admin permissions required to edit)"
                                    : "Read-only system control enforced"
                                }
                              />
                            )}
                            <span className="text-[9px] font-bold text-slate-500 font-mono">
                              {isEditable ? "WRITE" : "READ"}
                            </span>
                          </div>

                          <button
                            onClick={() => setSelectedOrderDetails(order)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors cursor-pointer"
                            title="View order details"
                          >
                            <Eye size={12} />
                          </button>

                          <button
                            disabled={!isEditable}
                            onClick={() => handleEditOrderClick(order)}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isEditable
                                ? "border-slate-200 hover:bg-slate-100 text-slate-600"
                                : "border-slate-100 text-slate-300 cursor-not-allowed"
                            }`}
                            title={
                              !teamCanEdit
                                ? "Editing disabled: Your team does not have edit permission for this workspace"
                                : isInvoiceAttached && activeUser.role !== Role.Admin
                                ? "Editing disabled: Invoice is already attached (Admin permissions required)"
                                : "Edit order details"
                            }
                          >
                            <Edit2 size={12} />
                          </button>

                          <InlineDeleteConfirm
                            id={`delete-order-${order.id}`}
                            disabled={!isDeletable}
                            disabledTitle={
                              isInvoiceAttached && activeUser.role !== Role.Admin
                                ? "Deletion disabled: Invoice is already attached (Admin permissions required)"
                                : "Delete order (Admin clearance required)"
                            }
                            onConfirm={() => onDeleteOrder(order.id)}
                            title="Delete order"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-mono text-xs font-bold text-slate-900">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-slate-700 uppercase tracking-wider text-[10px]">
                  Table Summary ({displayedOrders.length} {displayedOrders.length === 1 ? "Record" : "Records"})
                </td>
                <td className="py-3 px-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-extrabold text-indigo-950 font-mono" title={`Exact Displayed Total: ₹${displayedOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString('en-IN')}`}>
                      {formatCompactRupees(displayedOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0))}
                    </span>
                    <span className="text-[9px] font-normal text-slate-500 font-sans">
                      Displayed Gross Value
                    </span>
                  </div>
                </td>
                <td colSpan={2} className="py-3 px-3 text-[10px] font-normal text-slate-500 font-sans text-right">
                  Filtered Gross Value Total: <strong className="text-slate-900 font-mono font-bold" title={`Exact Filtered Total: ₹${visibleOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString('en-IN')}`}>{formatCompactRupees(visibleOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0))}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination & Fast Load "See More" Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
            <Clock size={14} className="text-indigo-600 shrink-0" />
            <span>
              Showing <strong className="text-slate-900 font-bold">{displayedOrders.length}</strong> of <strong className="text-slate-900 font-bold">{sortedOrders.length}</strong> records
            </span>
            {sortedOrders.length > 100 && (
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <CheckCircle2 size={11} /> Fast Mode (100)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {displayedOrders.length < sortedOrders.length && (
              <>
                <button
                  type="button"
                  onClick={() => setRecordsLimit((prev) => Math.min(prev + 100, sortedOrders.length))}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-300 text-indigo-700 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <ChevronDown size={14} />
                  See More (+100)
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsLimit(sortedOrders.length)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Layers size={14} />
                  Show All ({sortedOrders.length})
                </button>
              </>
            )}

            {recordsLimit > 100 && (
              <button
                type="button"
                onClick={() => setRecordsLimit(100)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all cursor-pointer font-mono"
              >
                Collapse to Recent 100
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY SECTION BELOW TABLE */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight uppercase font-mono text-white flex items-center gap-2">
                Orders & Offers Summary
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Consolidated analysis across all {visibleOrders.length} records matching current date range & stage filters
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              Date: <strong className="text-indigo-300">{dateFilterType === "createdAt" ? "Create Date" : "Invoice Date"}</strong> {startDate || endDate ? `(${startDate || "Earliest"} → ${endDate || "Latest"})` : `(${activeDatePreset})`}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              Stage: <strong className="text-emerald-300">{statusFilter}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* Summary Metric 1 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-slate-400 tracking-wider block">Total Filtered Deals</span>
              <span className="text-xl font-bold font-mono text-white mt-1 block">
                {visibleOrders.length}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              Showing {displayedOrders.length} in table
            </span>
          </div>

          {/* Summary Metric 2 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-indigo-300 tracking-wider block">Gross Value (₹)</span>
              <span className="text-xl font-bold font-mono text-white mt-1 block" title={`₹${totalValue.toLocaleString('en-IN')}`}>
                {formatCompactRupees(totalValue)}
              </span>
            </div>
            <span className="text-[10px] text-indigo-300 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              Avg {formatCompactRupees(averageDealValue)} / deal
            </span>
          </div>

          {/* Summary Metric 3 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-emerald-400 tracking-wider block">Closed Won Revenue</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block" title={`₹${closedWonValue.toLocaleString('en-IN')}`}>
                {formatCompactRupees(closedWonValue)}
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/90 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              {closedWonOrders.length} orders ({((closedWonOrders.length / (visibleOrders.length || 1)) * 100).toFixed(1)}% won)
            </span>
          </div>

          {/* Summary Metric 4 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-amber-400 tracking-wider block">Active Pipeline (Offers)</span>
              <span className="text-xl font-bold font-mono text-amber-400 mt-1 block" title={`₹${openOffersValue.toLocaleString('en-IN')}`}>
                {formatCompactRupees(openOffersValue)}
              </span>
            </div>
            <span className="text-[10px] text-amber-400/90 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              {openOffers.length} in negotiation/proposal
            </span>
          </div>

          {/* Summary Metric 5 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-sky-400 tracking-wider block">Invoiced Orders</span>
              <span className="text-xl font-bold font-mono text-sky-400 mt-1 block" title={`₹${totalInvoicedValue.toLocaleString('en-IN')}`}>
                {formatCompactRupees(totalInvoicedValue)}
              </span>
            </div>
            <span className="text-[10px] text-sky-400/90 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              {invoicedOrders.length} invoices generated
            </span>
          </div>

          {/* Summary Metric 6 */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase font-mono text-purple-300 tracking-wider block">Total Quantity</span>
              <span className="text-xl font-bold font-mono text-white mt-1 block" title={`${totalQuantityUnits.toLocaleString('en-IN')} Kg`}>
                {formatQuantityMT(totalQuantityUnits)}
              </span>
            </div>
            <span className="text-[10px] text-purple-300 font-mono mt-2 pt-2 border-t border-slate-700/60 block">
              Across {totalProductLines} product lines
            </span>
          </div>
        </div>
      </div>

      {/* ADD ORDER MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] overflow-y-auto">
            <div className="bg-indigo-900 px-6 py-4 flex items-center justify-between border-b border-indigo-850">
              <div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <Plus size={16} /> Add Sales Order / Offer
                </h2>
                <p className="text-[10px] text-indigo-200 mt-1">
                  Creating order record as {activeUser.name} ({activeUser.accessLevel} clearance)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-indigo-200 hover:text-white transition-colors cursor-pointer p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Company Name Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase font-mono">Company Name *</label>
                    <button
                      type="button"
                      onClick={() => setIsAddClientModalOpen(true)}
                      className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={11} /> Register New Company
                    </button>
                  </div>

                  {clientCompanies.length > 0 ? (
                    <select
                      required
                      value={newCompanyName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCompanyName(val);
                        // Autofill with first contact of that company
                        const match = clients.find((c) => c.companyName === val);
                        if (match) {
                          setNewClientName(match.fullName);
                          setNewEmail(match.email);
                          setNewPhone(match.phone);
                          setNewBillingAddress(match.address || "");
                          setNewBillingGstin(match.gst || "");
                          if (newSameAsBilling) {
                            setNewDestinationAddress(match.address || "");
                            setNewGstin(match.gst || "");
                          }
                        } else {
                          setNewClientName("");
                          setNewEmail("");
                          setNewPhone("");
                          setNewBillingAddress("");
                          setNewBillingGstin("");
                          if (newSameAsBilling) {
                            setNewDestinationAddress("");
                            setNewGstin("");
                          }
                        }
                      }}
                      className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                    >
                      <option value="">-- Select Company --</option>
                      {clientCompanies.map((comp) => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full flex flex-col gap-1.5 p-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                      <span className="text-[11px] text-indigo-800 font-medium">No registered companies in directory.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setClientTeamName(isExecutive ? "" : (activeUser.teamName || ""));
                          setIsAddClientModalOpen(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors self-start cursor-pointer"
                      >
                        <Plus size={12} /> Register Company First
                      </button>
                    </div>
                  )}
                </div>

                {/* Client Name Input */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    placeholder="Select company above"
                    value={newClientName}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              {/* Conditionally render dynamic contact options selection dropdown according to selected Company Name */}
              {newCompanyName && clients.filter((c) => c.companyName === newCompanyName).length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-xs space-y-1 animate-fade-in">
                  <label className="text-[10px] font-extrabold text-indigo-800 block uppercase tracking-wider font-mono">
                    Select Contact Option for {newCompanyName}
                  </label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const [name, email, phone] = val.split("|");
                        setNewClientName(name);
                        setNewEmail(email);
                        setNewPhone(phone);
                        const match = clients.find(c => c.companyName === newCompanyName && c.fullName === name && c.email === email);
                        if (match) {
                          if (match.address) {
                            setNewBillingAddress(match.address);
                            if (newSameAsBilling) setNewDestinationAddress(match.address);
                          }
                          if (match.gst) {
                            setNewBillingGstin(match.gst);
                            if (newSameAsBilling) setNewGstin(match.gst);
                          }
                        }
                      }
                    }}
                    className="w-full bg-white border border-indigo-200 text-slate-700 rounded-lg p-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {clients.filter((c) => c.companyName === newCompanyName).map((c) => (
                      <option key={c.id} value={`${c.fullName}|${c.email}|${c.phone}`}>
                        {c.fullName} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Address *</label>
                  <input
                    type="email"
                    required
                    readOnly
                    placeholder="Auto-filled email"
                    value={newEmail}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none cursor-not-allowed select-none"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={newSendEmail}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setNewSendEmail(checked);
                        if (checked && autoSelectSettings.ordersAutoSelect && !newTemplateId) {
                          const defaultTemplate = emailTemplates?.find(t => t.isDefault && (t.assignedForm === "create_order" || t.assignedForm === "any" || !t.assignedForm));
                          if (defaultTemplate) {
                            setNewTemplateId(defaultTemplate.id);
                          }
                        }
                      }}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                    />
                    <span className="text-xs text-slate-600 font-medium">Send confirmation email</span>
                  </div>
                  {newSendEmail && (
                    <div className="mt-2">
                       <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Template</label>
                       <select
                         value={newTemplateId}
                         onChange={(e) => setNewTemplateId(e.target.value)}
                         className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                       >
                         <option value="">
                           {emailTemplates?.some(t => t.isDefault && (t.assignedForm === "create_order" || t.assignedForm === "any" || !t.assignedForm)) ? "Default Template" : "Select Template"}
                         </option>
                         {emailTemplates?.filter(t => t.assignedForm === "create_order" || t.assignedForm === "any" || !t.assignedForm).map(t => (
                           <option key={t.id} value={t.id}>{t.name}</option>
                         ))}
                       </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number</label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Auto-filled phone"
                    value={newPhone}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none cursor-not-allowed select-none"
                  />
                </div>
              </div>

              {/* Billing GSTIN */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Billing GSTIN (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  value={newBillingGstin}
                  onChange={(e) => {
                    setNewBillingGstin(e.target.value);
                    if (newSameAsBilling) {
                      setNewGstin(e.target.value);
                    }
                  }}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono"
                />
              </div>

              {/* Client Billing Address */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Client Billing Address *</span>
                  <span className="text-[10px] text-indigo-600 font-semibold normal-case">(Used for billing & invoice creation)</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Enter or adjust client billing address..."
                  value={newBillingAddress}
                  onChange={(e) => {
                    setNewBillingAddress(e.target.value);
                    if (newSameAsBilling) {
                      setNewDestinationAddress(e.target.value);
                    }
                  }}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              {/* Status & Assigned To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status *</label>
                  <select
                    required
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as OrderOffer["status"])}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                  >
                    <optgroup label="Offer">
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Proposal">Proposal</option>
                      <option value="Negotiation">Negotiation</option>
                    </optgroup>
                    <optgroup label="Order">
                      <option value="Closed Won">Closed Won</option>
                    </optgroup>
                    <optgroup label="Lost">
                      <option value="Closed Lost">Closed Lost</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Assign Lead To *</label>
                  <select
                    required
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                  >
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* NEW FIELDS: Payment, Bank, Delivery, Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                {newStatus !== "Closed Won" && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Payment Terms (offer)</label>
                    <input
                      type="text"
                      placeholder="e.g. Within 30 days from date of Invoice"
                      value={newPaymentTermsOffer}
                      onChange={(e) => setNewPaymentTermsOffer(e.target.value)}
                      className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Payment Bank</label>
                  <select
                    value={newPaymentBankId}
                    onChange={(e) => setNewPaymentBankId(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                  >
                    <option value="">-- Select Bank --</option>
                    {paymentBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>{bank.bankName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Delivery Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. Ex-Works, DAP"
                    value={newDelivery}
                    onChange={(e) => setNewDelivery(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Other Terms</label>
                  <input
                    type="text"
                    placeholder="Other relevant terms..."
                    value={newOtherTerms}
                    onChange={(e) => setNewOtherTerms(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              {/* MULTI-PRODUCT SELECTION TABLE */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wide flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-indigo-600" />
                    Order Line Items *
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleAddProductRow(false)}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10.5px] font-bold py-1 px-2.5 rounded-lg border border-indigo-100 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Add Line Item
                  </button>
                </div>

                <div className="overflow-x-auto scrollbar-thin pb-1.5 -mx-1 px-1">
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 min-w-[540px] md:min-w-0">
                    {newItems.map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 animate-fade-in space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Product *</label>
                            <select
                              required
                              value={item.productId}
                              onChange={(e) => handleProductRowChange(index, "productId", e.target.value, false)}
                              className="w-full text-xs border border-slate-200 bg-slate-50 p-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Qty (Kg) *</label>
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              placeholder="Qty in Kg"
                              value={item.quantity === "" || item.quantity === null || item.quantity === undefined ? "" : item.quantity}
                              onChange={(e) => handleProductRowChange(index, "quantity", e.target.value, false)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-3">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Rate (₹) *</label>
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              placeholder="Rate"
                              value={item.rate === "" || item.rate === null || item.rate === undefined ? "" : item.rate}
                              onChange={(e) => handleProductRowChange(index, "rate", e.target.value, false)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-2 flex flex-col justify-center items-end gap-0.5 pr-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Amount (Incl. GST)</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold text-indigo-900 font-mono">
                                ₹{calculateItemTotalWithGst(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                disabled={newItems.length === 1}
                                onClick={() => handleRemoveProductRow(index, false)}
                                className={`p-1 rounded transition-colors ${
                                  newItems.length === 1
                                    ? "text-slate-200 cursor-not-allowed"
                                    : "text-rose-500 hover:bg-rose-50 cursor-pointer"
                                }`}
                                title="Remove item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-100">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">HSN Code (Catalog)</label>
                            <div className="w-full text-[11px] border border-slate-100 bg-slate-50/50 p-1.5 rounded text-slate-500 font-mono font-bold">
                              {(item as any).hsnCode || "-"}
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Packing</label>
                            <input
                              type="text"
                              placeholder="e.g. 250 Kg Drum"
                              value={(item as any).packing || ""}
                              onChange={(e) => handleProductRowChange(index, "packing", e.target.value, false)}
                              className="w-full text-[11px] border border-slate-200 p-1 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Taxes (18% Default) *</label>
                            <select
                              required
                              value={(item as any).taxes || defaultTaxValue}
                              onChange={(e) => handleProductRowChange(index, "taxes", e.target.value, false)}
                              className="w-full text-[11px] border border-slate-200 bg-white p-1 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                            >
                              {(item as any).taxes && !availableTaxRates.some(t => t.name === (item as any).taxes) && (
                                <option value={(item as any).taxes}>{(item as any).taxes}</option>
                              )}
                              {availableTaxRates.map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total amount panel with GST breakdown */}
                <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 mt-2 font-mono space-y-1">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Base Subtotal (Excl. Tax):</span>
                    <span className="font-bold">₹{calculateBaseTotal(newItems, newStatus, newFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {newStatus === "Closed Won" && parseFreightAmount(newFreightChargedInBill) > 0 && (
                    <div className="flex justify-between items-center text-xs text-emerald-700 bg-emerald-50/70 px-2 py-1 rounded border border-emerald-200/60 font-sans">
                      <span>Freight Charged in Bill:</span>
                      <span className="font-bold font-mono">₹{parseFreightAmount(newFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+18% GST: ₹{(parseFreightAmount(newFreightChargedInBill) * 0.18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Total GST (18% / applicable tax):</span>
                    <span className="font-bold text-indigo-600">₹{calculateTotalGst(newItems, newStatus, newFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs sm:text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
                    <span className="uppercase tracking-tight">GRAND TOTAL ORDER VALUE (INCL. GST) *:</span>
                    <span className="text-indigo-900 font-black">₹{calculateTotalValueWithGst(newItems, newStatus, newFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Order Notes</label>
                <textarea
                  rows={2}
                  placeholder="Record discussions, timelines, bundle discounts or delivery requests..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                ></textarea>
              </div>

              {/* Closed Won Details Section - Add */}
              {newStatus === "Closed Won" && (
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-4 mt-2 animate-fade-in">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase font-mono border-b border-emerald-100 pb-2 flex items-center gap-2">
                    <Check size={14} /> Closed Won (Order Details)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Customer PO Number *</label>
                      <input
                        type="text"
                        required
                        value={newPoNumber}
                        onChange={(e) => setNewPoNumber(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">PO Date *</label>
                      <input
                        type="date"
                        required
                        value={newPoDate}
                        onChange={(e) => setNewPoDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Payment Terms *</label>
                      <select
                        required
                        value={newPayment}
                        onChange={(e) => setNewPayment(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none font-semibold text-slate-800"
                      >
                        <option value="">-- Select Payment Term --</option>
                        {paymentTerms.map((term) => (
                          <option key={term.id} value={term.name}>{term.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Payment Credit Period ( No. Of Days ) *</label>
                      <select
                        required
                        value={newPaymentCreditPeriod}
                        onChange={(e) => setNewPaymentCreditPeriod(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none font-semibold text-slate-800"
                      >
                        <option value="">-- Select Credit Period --</option>
                        {paymentCreditPeriods.map((period) => (
                          <option key={period.id} value={period.name}>{period.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Term</label>
                      <select
                        value={newFreightTerm}
                        onChange={(e) => setNewFreightTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Freight Term...</option>
                        {freightTerms.map((term) => (
                          <option key={term.id} value={term.name}>{term.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Transporter Name</label>
                      <select
                        value={newTransporterName}
                        onChange={(e) => setNewTransporterName(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Transporter...</option>
                        {transporters.map((transporter) => (
                          <option key={transporter.id} value={transporter.name}>
                            {transporter.name}{transporter.transporterId ? ` (${transporter.transporterId})` : (transporter.id ? ` (${transporter.id})` : "")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Vehicle No</label>
                      <input
                        type="text"
                        value={newVehicleNo}
                        onChange={(e) => setNewVehicleNo(e.target.value)}
                        placeholder="e.g. MH-12-PQ-4567"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight to be charged in bill</label>
                      <input
                        type="text"
                        value={newFreightChargedInBill}
                        onChange={(e) => setNewFreightChargedInBill(e.target.value)}
                        placeholder="e.g. Fixed / Actuals"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Cost to AOL</label>
                      <input
                        type="text"
                        value={newFreightCostToAol}
                        onChange={(e) => setNewFreightCostToAol(e.target.value)}
                        placeholder="e.g. 1500"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Cartage / Labour Charges if Any</label>
                      <input
                        type="text"
                        value={newCartageLabourCharges}
                        onChange={(e) => setNewCartageLabourCharges(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Delivery / Booking Term</label>
                      <select
                        value={newDeliveryTerm}
                        onChange={(e) => setNewDeliveryTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- Select Delivery Term --</option>
                        {Array.from(new Set([
                          "Door Delivery",
                          "Transporter Godown Delivery at Destination",
                          "Party Vehicle (self Pickup)",
                          ...deliveryTerms.map(dt => dt.name),
                          ...(newDeliveryTerm ? [newDeliveryTerm] : [])
                        ])).map((term) => (
                          <option key={term} value={term}>
                            {term}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Warehouse Managed By</label>
                      <select
                        value={newWarehouseManagedBy}
                        onChange={(e) => setNewWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Warehouse Manager...</option>
                        {warehouses.map((wh) => {
                          const mgrValue = wh.warehouseManager?.trim() || wh.name?.trim() || wh.warehouseName?.trim() || "";
                          const label = wh.warehouseManager?.trim()
                            ? `${wh.warehouseManager.trim()}${wh.warehouseName ? ` (${wh.warehouseName})` : ""}`
                            : (wh.name || wh.warehouseName || "");
                          return (
                            <option key={wh.id} value={mgrValue}>{label}</option>
                          );
                        })}
                        {newWarehouseManagedBy && !warehouses.some(w => (w.warehouseManager?.trim() || w.name?.trim() || w.warehouseName?.trim()) === newWarehouseManagedBy || w.name === newWarehouseManagedBy) && (
                          <option value={newWarehouseManagedBy}>{newWarehouseManagedBy}</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <input
                        type="checkbox"
                        id="new-same-address"
                        checked={newSameAsBilling}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewSameAsBilling(checked);
                          if (checked) {
                            setNewDestinationAddress(newBillingAddress);
                            setNewGstin(newBillingGstin);
                          }
                        }}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                      />
                      <label htmlFor="new-same-address" className="text-xs font-semibold text-slate-700 cursor-pointer">
                        Delivery Address same as billing address
                      </label>
                    </div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">
                      Destination Delivery Address {!newSameAsBilling ? "*" : ""}
                    </label>
                    <textarea
                      rows={2}
                      required={!newSameAsBilling}
                      value={newDestinationAddress}
                      onChange={(e) => setNewDestinationAddress(e.target.value)}
                      disabled={newSameAsBilling}
                      className={`w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none ${newSameAsBilling ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">GSTIN (Optional)</label>
                    <input
                      type="text"
                      value={newGstin}
                      onChange={(e) => setNewGstin(e.target.value)}
                      placeholder="e.g. 27AAAAA0000A1Z5"
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Expected Dispatch Date</label>
                      <input
                        type="date"
                        value={newDispatchDate}
                        onChange={(e) => setNewDispatchDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Location</label>
                      <select
                        value={newDispatchLocation}
                        onChange={(e) => setNewDispatchLocation(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Location...</option>
                        {dispatchLocations.map((loc) => (
                          <option key={loc.id} value={loc.name}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-tight">
                        Attach PO Document(s) <span className="text-slate-400 font-normal">({newPoAttachments.length}/5 files)</span>
                      </label>
                      {newPoAttachments.length > 0 && newPoAttachments.length < 5 && !isUploading && (
                        <label
                          htmlFor="new-po-file-upload-more"
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer hover:underline flex items-center gap-1"
                        >
                          <Plus size={11} /> Add more (up to {5 - newPoAttachments.length})
                        </label>
                      )}
                    </div>

                    {/* Attached files list */}
                    {newPoAttachments.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {newPoAttachments.map((att, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200 p-2.5 rounded-xl shadow-2xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700 shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="text-xs font-semibold text-slate-800 truncate" title={att.name}>
                                  {att.name || `Purchase Order Doc ${idx + 1}`}
                                </p>
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOrDownloadDocument(att.url, att.name || "po_document.pdf");
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline inline-block mt-0.5"
                                >
                                  View PO Document ↗
                                </a>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePOAttachment(idx, false)}
                              className="p-1 hover:bg-rose-100 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0 ml-2"
                              title="Remove this PO document"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dropzone for up to 5 files */}
                    {newPoAttachments.length < 5 && (
                      <div>
                        <div 
                          className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                            isUploading 
                              ? "border-indigo-400 bg-indigo-50/20" 
                              : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50"
                          }`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (isUploading) return;
                            const files = e.dataTransfer.files;
                            if (files && files.length > 0) {
                              handlePOFilesUpload(files, false);
                            }
                          }}
                        >
                          <input
                            type="file"
                            id="new-po-file-upload-more"
                            className="hidden"
                            accept=".pdf"
                            multiple
                            disabled={isUploading}
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                handlePOFilesUpload(files, false);
                              }
                              e.target.value = "";
                            }}
                          />
                          {isUploading ? (
                            <div className="flex flex-col items-center justify-center py-2">
                              <Loader2 className="h-6 w-6 text-indigo-650 animate-spin mb-1" />
                              <p className="text-xs font-semibold text-slate-750">{uploadProgressText || "Uploading Document..."}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Storing document directly in Google Drive</p>
                            </div>
                          ) : (
                            <label htmlFor="new-po-file-upload-more" className="cursor-pointer block py-1">
                              <Upload className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                              <p className="text-xs font-semibold text-slate-700">
                                {newPoAttachments.length === 0 
                                  ? "Click to attach PDF PO file(s) or drag & drop (up to 5 files at a time)"
                                  : `Click to attach up to ${5 - newPoAttachments.length} more PDF file(s)`}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Automatically organized and saved to Google Drive
                              </p>
                            </label>
                          )}
                        </div>
                        {uploadError && (
                          <p className="text-[10px] text-rose-500 font-semibold mt-1">⚠️ {uploadError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all duration-150 shadow-sm cursor-pointer"
                >
                  Create Order Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ORDER MODAL */}
      {isEditOpen && editingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] overflow-y-auto">
            <div className="bg-amber-750 px-6 py-4 flex items-center justify-between border-b border-amber-800 bg-amber-800 text-white">
              <div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <Edit2 size={16} /> Edit Sales Order / Offer
                </h2>
                <p className="text-[10px] text-amber-200 mt-1">
                  Editing Order Reference: #{editingOrder.id.substring(0, 8)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingOrder(null);
                }}
                className="text-amber-200 hover:text-white transition-colors cursor-pointer p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditOrderSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Client Company Name (Read-only on edit for registry integrity) */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Company Name</label>
                  <input
                    type="text"
                    readOnly
                    value={editCompanyName}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-semibold"
                  />
                </div>

                {/* Client Name (Read-only on edit) */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Client Full Name</label>
                  <input
                    type="text"
                    readOnly
                    value={editClientName}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Address</label>
                  <input
                    type="email"
                    readOnly
                    value={editEmail}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={editSendEmail}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditSendEmail(checked);
                        if (checked && autoSelectSettings.ordersAutoSelect && !editTemplateId) {
                          const defaultTemplate = emailTemplates?.find(t => t.isDefault && (t.assignedForm === "edit_order" || t.assignedForm === "any" || !t.assignedForm));
                          if (defaultTemplate) {
                            setEditTemplateId(defaultTemplate.id);
                          }
                        }
                      }}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300 rounded"
                    />
                    <span className="text-xs text-slate-600 font-medium">Send confirmation email</span>
                  </div>
                  {editSendEmail && (
                    <div className="mt-2">
                       <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Template</label>
                       <select
                         value={editTemplateId}
                         onChange={(e) => setEditTemplateId(e.target.value)}
                         className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                       >
                         <option value="">
                           {emailTemplates?.some(t => t.isDefault && (t.assignedForm === "edit_order" || t.assignedForm === "any" || !t.assignedForm)) ? "Default Template" : "Select Template"}
                         </option>
                         {emailTemplates?.filter(t => t.assignedForm === "edit_order" || t.assignedForm === "any" || !t.assignedForm).map(t => (
                           <option key={t.id} value={t.id}>{t.name}</option>
                         ))}
                       </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number</label>
                  <input
                    type="text"
                    readOnly
                    value={editPhone}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none"
                  />
                </div>
              </div>

              {/* Billing GSTIN */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Billing GSTIN (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  value={editBillingGstin}
                  onChange={(e) => {
                    setEditBillingGstin(e.target.value);
                    if (editSameAsBilling) {
                      setEditGstin(e.target.value);
                    }
                  }}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono"
                />
              </div>

              {/* Client Billing Address */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Client Billing Address *</span>
                  <span className="text-[10px] text-amber-600 font-semibold normal-case">(Used for billing & invoice creation)</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Enter or adjust client billing address..."
                  value={editBillingAddress}
                  onChange={(e) => {
                    setEditBillingAddress(e.target.value);
                    if (editSameAsBilling) {
                      setEditDestinationAddress(e.target.value);
                    }
                  }}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                />
              </div>

              {/* Status & Assigned To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status *</label>
                  <select
                    required
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as OrderOffer["status"])}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                  >
                    <optgroup label="Offer">
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Proposal">Proposal</option>
                      <option value="Negotiation">Negotiation</option>
                    </optgroup>
                    <optgroup label="Order">
                      <option value="Closed Won">Closed Won</option>
                    </optgroup>
                    <optgroup label="Lost">
                      <option value="Closed Lost">Closed Lost</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Assign Lead To *</label>
                  <select
                    required
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                  >
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* NEW FIELDS: Payment, Bank, Delivery, Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                {editStatus !== "Closed Won" && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Payment Terms (offer)</label>
                    <input
                      type="text"
                      placeholder="e.g. Within 30 days from date of Invoice"
                      value={editPaymentTermsOffer}
                      onChange={(e) => setEditPaymentTermsOffer(e.target.value)}
                      className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Payment Bank</label>
                  <select
                    value={editPaymentBankId}
                    onChange={(e) => setEditPaymentBankId(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  >
                    <option value="">-- Select Bank --</option>
                    {paymentBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>{bank.bankName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Delivery Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. Ex-Works, DAP"
                    value={editDelivery}
                    onChange={(e) => setEditDelivery(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Other Terms</label>
                  <input
                    type="text"
                    placeholder="Other relevant terms..."
                    value={editOtherTerms}
                    onChange={(e) => setEditOtherTerms(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              {/* MULTI-PRODUCT SELECTION TABLE */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wide flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-amber-800" />
                    Order Line Items *
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleAddProductRow(true)}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10.5px] font-bold py-1 px-2.5 rounded-lg border border-amber-100 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Add Line Item
                  </button>
                </div>

                <div className="overflow-x-auto scrollbar-thin pb-1.5 -mx-1 px-1">
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 min-w-[540px] md:min-w-0">
                    {editItems.map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 animate-fade-in space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Product *</label>
                            <select
                              required
                              value={item.productId}
                              onChange={(e) => handleProductRowChange(index, "productId", e.target.value, true)}
                              className="w-full text-xs border border-slate-200 bg-slate-50 p-1.5 rounded-md focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Qty (Kg) *</label>
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              placeholder="Qty in Kg"
                              value={item.quantity === "" || item.quantity === null || item.quantity === undefined ? "" : item.quantity}
                              onChange={(e) => handleProductRowChange(index, "quantity", e.target.value, true)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-3">
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Rate (₹) *</label>
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              placeholder="Rate"
                              value={item.rate === "" || item.rate === null || item.rate === undefined ? "" : item.rate}
                              onChange={(e) => handleProductRowChange(index, "rate", e.target.value, true)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-2 flex flex-col justify-center items-end gap-0.5 pr-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Amount (Incl. GST)</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold text-amber-950 font-mono">
                                ₹{calculateItemTotalWithGst(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                disabled={editItems.length === 1}
                                onClick={() => handleRemoveProductRow(index, true)}
                                className={`p-1 rounded transition-colors ${
                                  editItems.length === 1
                                    ? "text-slate-200 cursor-not-allowed"
                                    : "text-rose-500 hover:bg-rose-50 cursor-pointer"
                                }`}
                                title="Remove item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-100">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">HSN Code (Catalog)</label>
                            <div className="w-full text-[11px] border border-slate-100 bg-slate-50/50 p-1.5 rounded text-slate-500 font-mono font-bold">
                              {(item as any).hsnCode || "-"}
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Packing</label>
                            <input
                              type="text"
                              placeholder="e.g. 250 Kg Drum"
                              value={(item as any).packing || ""}
                              onChange={(e) => handleProductRowChange(index, "packing", e.target.value, true)}
                              className="w-full text-[11px] border border-slate-200 p-1 rounded focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Taxes (18% Default) *</label>
                            <select
                              required
                              value={(item as any).taxes || defaultTaxValue}
                              onChange={(e) => handleProductRowChange(index, "taxes", e.target.value, true)}
                              className="w-full text-[11px] border border-slate-200 bg-white p-1 rounded focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                            >
                              {(item as any).taxes && !availableTaxRates.some(t => t.name === (item as any).taxes) && (
                                <option value={(item as any).taxes}>{(item as any).taxes}</option>
                              )}
                              {availableTaxRates.map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total amount panel with GST breakdown */}
                <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 mt-2 font-mono space-y-1">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Base Subtotal (Excl. Tax):</span>
                    <span className="font-bold">₹{calculateBaseTotal(editItems, editStatus, editFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {editStatus === "Closed Won" && parseFreightAmount(editFreightChargedInBill) > 0 && (
                    <div className="flex justify-between items-center text-xs text-emerald-700 bg-emerald-50/70 px-2 py-1 rounded border border-emerald-200/60 font-sans">
                      <span>Freight Charged in Bill:</span>
                      <span className="font-bold font-mono">₹{parseFreightAmount(editFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+18% GST: ₹{(parseFreightAmount(editFreightChargedInBill) * 0.18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Total GST (18% / applicable tax):</span>
                    <span className="font-bold text-amber-700">₹{calculateTotalGst(editItems, editStatus, editFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs sm:text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
                    <span className="uppercase tracking-tight">GRAND TOTAL ORDER VALUE (INCL. GST) *:</span>
                    <span className="text-amber-950 font-black">₹{calculateTotalValueWithGst(editItems, editStatus, editFreightChargedInBill).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Order Notes</label>
                <textarea
                  rows={2}
                  placeholder="Record discussions, timelines, bundle discounts or delivery requests..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                ></textarea>
              </div>

              {/* Closed Won Details Section - Edit */}
              {editStatus === "Closed Won" && (
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 space-y-4 mt-2 animate-fade-in">
                  <h4 className="text-xs font-bold text-amber-800 uppercase font-mono border-b border-amber-100 pb-2 flex items-center gap-2">
                    <Check size={14} /> Closed Won (Order Details)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Customer PO Number *</label>
                      <input
                        type="text"
                        required
                        value={editPoNumber}
                        onChange={(e) => setEditPoNumber(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">PO Date *</label>
                      <input
                        type="date"
                        required
                        value={editPoDate}
                        onChange={(e) => setEditPoDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Payment Terms *</label>
                      <select
                        required
                        value={editPayment}
                        onChange={(e) => setEditPayment(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none font-semibold text-slate-800"
                      >
                        <option value="">-- Select Payment Term --</option>
                        {paymentTerms.map((term) => (
                          <option key={term.id} value={term.name}>{term.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Payment Credit Period ( No. Of Days ) *</label>
                      <select
                        required
                        value={editPaymentCreditPeriod}
                        onChange={(e) => setEditPaymentCreditPeriod(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none font-semibold text-slate-800"
                      >
                        <option value="">-- Select Credit Period --</option>
                        {paymentCreditPeriods.map((period) => (
                          <option key={period.id} value={period.name}>{period.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Term</label>
                      <select
                        value={editFreightTerm}
                        onChange={(e) => setEditFreightTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Select Freight Term...</option>
                        {freightTerms.map((term) => (
                          <option key={term.id} value={term.name}>{term.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Transporter Name</label>
                      <select
                        value={editTransporterName}
                        onChange={(e) => setEditTransporterName(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Select Transporter...</option>
                        {transporters.map((transporter) => (
                          <option key={transporter.id} value={transporter.name}>
                            {transporter.name}{transporter.transporterId ? ` (${transporter.transporterId})` : (transporter.id ? ` (${transporter.id})` : "")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Vehicle No</label>
                      <input
                        type="text"
                        value={editVehicleNo}
                        onChange={(e) => setEditVehicleNo(e.target.value)}
                        placeholder="e.g. MH-12-PQ-4567"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight to be charged in bill</label>
                      <input
                        type="text"
                        value={editFreightChargedInBill}
                        onChange={(e) => setEditFreightChargedInBill(e.target.value)}
                        placeholder="e.g. Fixed / Actuals"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Cost to AOL</label>
                      <input
                        type="text"
                        value={editFreightCostToAol}
                        onChange={(e) => setEditFreightCostToAol(e.target.value)}
                        placeholder="e.g. 1500"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Cartage / Labour Charges if Any</label>
                      <input
                        type="text"
                        value={editCartageLabourCharges}
                        onChange={(e) => setEditCartageLabourCharges(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Delivery / Booking Term</label>
                      <select
                        value={editDeliveryTerm}
                        onChange={(e) => setEditDeliveryTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">-- Select Delivery Term --</option>
                        {Array.from(new Set([
                          "Door Delivery",
                          "Transporter Godown Delivery at Destination",
                          "Party Vehicle (self Pickup)",
                          ...deliveryTerms.map(dt => dt.name),
                          ...(editDeliveryTerm ? [editDeliveryTerm] : [])
                        ])).map((term) => (
                          <option key={term} value={term}>
                            {term}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Warehouse Managed By</label>
                      <select
                        value={editWarehouseManagedBy}
                        onChange={(e) => setEditWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Select Warehouse Manager...</option>
                        {warehouses.map((wh) => {
                          const mgrValue = wh.warehouseManager?.trim() || wh.name?.trim() || wh.warehouseName?.trim() || "";
                          const label = wh.warehouseManager?.trim()
                            ? `${wh.warehouseManager.trim()}${wh.warehouseName ? ` (${wh.warehouseName})` : ""}`
                            : (wh.name || wh.warehouseName || "");
                          return (
                            <option key={wh.id} value={mgrValue}>{label}</option>
                          );
                        })}
                        {editWarehouseManagedBy && !warehouses.some(w => (w.warehouseManager?.trim() || w.name?.trim() || w.warehouseName?.trim()) === editWarehouseManagedBy || w.name === editWarehouseManagedBy) && (
                          <option value={editWarehouseManagedBy}>{editWarehouseManagedBy}</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <input
                        type="checkbox"
                        id="edit-same-address"
                        checked={editSameAsBilling}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEditSameAsBilling(checked);
                          if (checked) {
                            setEditDestinationAddress(editBillingAddress);
                            setEditGstin(editBillingGstin);
                          }
                        }}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300 rounded cursor-pointer"
                      />
                      <label htmlFor="edit-same-address" className="text-xs font-semibold text-slate-700 cursor-pointer">
                        Delivery Address same as billing address
                      </label>
                    </div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">
                      Destination Delivery Address {!editSameAsBilling ? "*" : ""}
                    </label>
                    <textarea
                      rows={2}
                      required={!editSameAsBilling}
                      value={editDestinationAddress}
                      onChange={(e) => setEditDestinationAddress(e.target.value)}
                      disabled={editSameAsBilling}
                      className={`w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none ${editSameAsBilling ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">GSTIN (Optional)</label>
                    <input
                      type="text"
                      value={editGstin}
                      onChange={(e) => setEditGstin(e.target.value)}
                      placeholder="e.g. 27AAAAA0000A1Z5"
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Expected Dispatch Date</label>
                      <input
                        type="date"
                        value={editDispatchDate}
                        onChange={(e) => setEditDispatchDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Location</label>
                      <select
                        value={editDispatchLocation}
                        onChange={(e) => setEditDispatchLocation(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Select Location...</option>
                        {dispatchLocations.map((loc) => (
                          <option key={loc.id} value={loc.name}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-tight">
                        Attach PO Document(s) <span className="text-slate-400 font-normal">({editPoAttachments.length}/5 files)</span>
                      </label>
                      {editPoAttachments.length > 0 && editPoAttachments.length < 5 && !isUploading && (
                        <label
                          htmlFor="edit-po-file-upload-more"
                          className="text-[10px] text-amber-600 hover:text-amber-800 font-bold cursor-pointer hover:underline flex items-center gap-1"
                        >
                          <Plus size={11} /> Add more (up to {5 - editPoAttachments.length})
                        </label>
                      )}
                    </div>

                    {/* Attached files list */}
                    {editPoAttachments.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {editPoAttachments.map((att, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200 p-2.5 rounded-xl shadow-2xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700 shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="text-xs font-semibold text-slate-800 truncate" title={att.name}>
                                  {att.name || `Purchase Order Doc ${idx + 1}`}
                                </p>
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOrDownloadDocument(att.url, att.name || "po_document.pdf");
                                  }}
                                  className="text-[10px] text-amber-600 hover:text-amber-800 font-bold underline inline-block mt-0.5"
                                >
                                  View PO Document ↗
                                </a>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePOAttachment(idx, true)}
                              className="p-1 hover:bg-rose-100 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0 ml-2"
                              title="Remove this PO document"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dropzone for up to 5 files */}
                    {editPoAttachments.length < 5 && (
                      <div>
                        <div 
                          className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                            isUploading 
                              ? "border-amber-400 bg-amber-50/20" 
                              : "border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-slate-50"
                          }`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (isUploading) return;
                            const files = e.dataTransfer.files;
                            if (files && files.length > 0) {
                              handlePOFilesUpload(files, true);
                            }
                          }}
                        >
                          <input
                            type="file"
                            id="edit-po-file-upload-more"
                            className="hidden"
                            accept=".pdf"
                            multiple
                            disabled={isUploading}
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                handlePOFilesUpload(files, true);
                              }
                              e.target.value = "";
                            }}
                          />
                          {isUploading ? (
                            <div className="flex flex-col items-center justify-center py-2">
                              <Loader2 className="h-6 w-6 text-amber-600 animate-spin mb-1" />
                              <p className="text-xs font-semibold text-slate-750">{uploadProgressText || "Uploading Document..."}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Storing document directly in Google Drive</p>
                            </div>
                          ) : (
                            <label htmlFor="edit-po-file-upload-more" className="cursor-pointer block py-1">
                              <Upload className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                              <p className="text-xs font-semibold text-slate-700">
                                {editPoAttachments.length === 0 
                                  ? "Click to attach PDF PO file(s) or drag & drop (up to 5 files at a time)"
                                  : `Click to attach up to ${5 - editPoAttachments.length} more PDF file(s)`}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Automatically organized and saved to Google Drive
                              </p>
                            </label>
                          )}
                        </div>
                        {uploadError && (
                          <p className="text-[10px] text-rose-500 font-semibold mt-1">⚠️ {uploadError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingOrder(null);
                  }}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all duration-150 shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CLIENT REGISTRATION MODAL */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-emerald-800 px-6 py-4 flex items-center justify-between border-b border-emerald-900 text-white">
              <div>
                <h3 className="text-xs font-extrabold uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Building2 size={15} /> Quick Register Company & Contact
                </h3>
                <p className="text-[10px] text-emerald-100 mt-1">
                  Enables dropdown population for Lead/Order modal instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddClientModalOpen(false)}
                className="text-emerald-100 hover:text-white transition-colors cursor-pointer p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickRegisterClient} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corp"
                    value={clientCompanyName}
                    onChange={(e) => setClientCompanyName(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={clientFullName}
                    onChange={(e) => setClientFullName(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. contact@acme.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +1 (555) 123-4567"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">GSTIN / TAX NO</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAACA1234A1Z1"
                    value={clientGst}
                    onChange={(e) => setClientGst(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">City</label>
                  <input
                    type="text"
                    placeholder="e.g. New York"
                    value={clientCity}
                    onChange={(e) => setClientCity(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Pincode</label>
                  <input
                    type="text"
                    placeholder="e.g. 10001"
                    value={clientPincode}
                    onChange={(e) => setClientPincode(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase font-mono">Client Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 123 Broadway Ave"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all duration-150 shadow-sm cursor-pointer"
                >
                  Register Client Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD BANK MODAL */}
      {isAddBankModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-indigo-900 px-6 py-4 flex items-center justify-between border-b border-indigo-850">
              <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                <Plus size={16} /> Add New Bank
              </h2>
              <button
                type="button"
                onClick={() => setIsAddBankModalOpen(false)}
                className="text-indigo-200 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddBankSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Bank Name *</label>
                <input type="text" required value={newBankName} onChange={(e) => setNewBankName(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Account Holder Name *</label>
                <input type="text" required value={newAccountHolder} onChange={(e) => setNewAccountHolder(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Account Number *</label>
                <input type="text" required value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">IFSC Code</label>
                <input type="text" value={newIfscCode} onChange={(e) => setNewIfscCode(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Branch</label>
                <input type="text" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Address</label>
                <textarea rows={2} value={newBankAddress} onChange={(e) => setNewBankAddress(e.target.value)} className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsAddBankModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl">Add Bank</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW ORDER DETAILS MODAL */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="view-order-details-modal">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-scale-up">
            {/* Header */}
            <div className="bg-indigo-900 px-6 py-4 flex items-center justify-between border-b border-indigo-850 shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <FileText size={16} /> Sales Order / Offer Details
                </h2>
                <p className="text-[10px] text-indigo-200 mt-1">
                  ID: {selectedOrderDetails.id} • Created {formatDate(selectedOrderDetails.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="text-indigo-200 hover:text-white transition-colors cursor-pointer p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Client & Pipeline Status Header Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-5">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Client contact</span>
                  <div className="font-bold text-slate-800 text-sm leading-snug">{selectedOrderDetails.clientName}</div>
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Building2 size={12} className="text-slate-400 shrink-0" />
                    {selectedOrderDetails.companyName}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Contact Info</span>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-mono">
                    <Mail size={12} className="text-slate-400 shrink-0" />
                    {selectedOrderDetails.email}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-mono">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    {selectedOrderDetails.phone}
                  </div>
                </div>

                <div className="space-y-1 md:text-right">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Pipeline status</span>
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                      selectedOrderDetails.status === "Closed Won"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : selectedOrderDetails.status === "Closed Lost"
                        ? "bg-rose-50 text-rose-700 border border-rose-100"
                        : selectedOrderDetails.status === "Negotiation"
                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                        : selectedOrderDetails.status === "Proposal"
                        ? "bg-blue-50 text-blue-700 border border-blue-100"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}>
                      {selectedOrderDetails.status}
                    </span>
                  </div>
                  {selectedOrderDetails.billingDetails?.invoiceNumber ? (
                    <div className="text-[9px] font-bold text-emerald-600 mt-1 uppercase tracking-wider font-mono">
                      ✓ Invoice attached
                    </div>
                  ) : (
                    <div className="text-[9px] font-bold text-amber-600 mt-1 uppercase tracking-wider font-mono">
                      ⚠ Pending Invoice mapping
                    </div>
                  )}
                </div>
              </div>

              {/* Terms & Financials Grid */}
              <div>
                <h3 className="text-[10px] font-extrabold text-slate-400 uppercase font-mono tracking-wider mb-3">Order Terms & Assignment</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-150 rounded-xl p-4">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Total Value</span>
                    <span className="text-sm font-extrabold text-slate-900 font-mono">
                      ₹{selectedOrderDetails.totalValue.toLocaleString()}
                    </span>
                  </div>

                  {selectedOrderDetails.status === "Closed Won" ? (
                    <>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Payment Terms</span>
                        <span className="text-[11px] font-bold text-slate-700">
                          {selectedOrderDetails.payment || "N/A"}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Credit Period</span>
                        <span className="text-[11px] font-bold text-slate-700 font-mono">
                          {selectedOrderDetails.paymentCreditPeriod || "N/A"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-0.5 col-span-2">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Payment Terms (Offer)</span>
                      <span className="text-[11px] font-bold text-emerald-700 block whitespace-normal">
                        {selectedOrderDetails.paymentTermsOffer || "N/A"}
                      </span>
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Delivery Terms</span>
                    <span className="text-[11px] font-bold text-slate-700">
                      {selectedOrderDetails.delivery || "N/A"}
                    </span>
                  </div>

                  <div className="space-y-0.5 pt-2 border-t border-slate-100 col-span-2 md:col-span-1">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Billing Address & GSTIN</span>
                    <span className="text-[10.5px] text-slate-600 font-medium block leading-normal line-clamp-2" title={selectedOrderDetails.billingAddress}>
                      {selectedOrderDetails.billingAddress || "N/A"}
                    </span>
                    {selectedOrderDetails.billingGstin && (
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        GSTIN: {selectedOrderDetails.billingGstin}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5 pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Other Terms</span>
                    <span className="text-[10.5px] text-slate-600 block truncate" title={selectedOrderDetails.otherTerms}>
                      {selectedOrderDetails.otherTerms || "N/A"}
                    </span>
                  </div>

                  <div className="space-y-0.5 pt-2 border-t border-slate-100 col-span-2 md:col-span-2">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Ownership & Creator</span>
                    <div className="text-[10.5px] text-slate-600 font-semibold space-y-0.5">
                      <div>Creator: {users.find(u => u.id === selectedOrderDetails.createdByUserId)?.name || selectedOrderDetails.createdByUserId}</div>
                      <div>Assigned Owner: {users.find(u => u.id === selectedOrderDetails.assignedToUserId)?.name || selectedOrderDetails.assignedToUserId}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing details Section */}
              {selectedOrderDetails.billingDetails && (
                <div>
                  <h3 className="text-[10px] font-extrabold text-indigo-900 uppercase font-mono tracking-wider mb-3 flex items-center gap-1.5">
                    <FileSpreadsheet size={13} /> Mapped Invoice details (fms)
                  </h3>
                  <div className="bg-indigo-50/45 border border-indigo-150 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-indigo-500 uppercase font-bold block">Invoice Number</span>
                      <span className="text-sm font-extrabold text-indigo-900 font-mono">
                        {selectedOrderDetails.billingDetails.invoiceNumber}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-indigo-500 uppercase font-bold block">Mapping Metadata</span>
                      <div className="text-[10.5px] text-slate-700 font-medium font-mono space-y-0.5">
                        <div>Date: {selectedOrderDetails.billingDetails.mappedAt ? formatDate(selectedOrderDetails.billingDetails.mappedAt) : "N/A"}</div>
                        <div>By: {users.find(u => u.id === selectedOrderDetails.billingDetails?.mappedByUserId)?.name || "System"}</div>
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] font-mono text-indigo-500 uppercase font-bold block mb-1">Invoice Attachment File(s)</span>
                      {selectedOrderDetails.billingDetails.invoiceAttachments && selectedOrderDetails.billingDetails.invoiceAttachments.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedOrderDetails.billingDetails.invoiceAttachments.map((att, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => openOrDownloadDocument(att.url, att.name || `Invoice_${selectedOrderDetails.billingDetails!.invoiceNumber}_${idx + 1}.pdf`)}
                              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                              title={att.name}
                            >
                              <FileText size={12} />
                              <span className="max-w-[170px] truncate">{att.name || `Invoice Doc ${idx + 1}`} ↗</span>
                            </button>
                          ))}
                        </div>
                      ) : selectedOrderDetails.billingDetails.invoiceFileUrl ? (
                        <button
                          type="button"
                          onClick={() => openOrDownloadDocument(selectedOrderDetails.billingDetails!.invoiceFileUrl!, selectedOrderDetails.billingDetails!.invoiceFileName || `Invoice_${selectedOrderDetails.billingDetails!.invoiceNumber}.pdf`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          <FileText size={14} />
                          <span>{selectedOrderDetails.billingDetails.invoiceFileName || "Download Invoice PDF"} ↗</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs italic">No attached PDF file</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Customer PO & Closed Won details */}
              {selectedOrderDetails.closedWonDetails && (
                <div>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase font-mono tracking-wider mb-3">Customer Purchase Order (PO) Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <div className="space-y-3">
                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">PO Number & Date</span>
                        <div className="text-[11px] font-bold text-slate-700 font-mono">
                          {selectedOrderDetails.closedWonDetails.customerPoNumber}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          PO Date: {formatDate(selectedOrderDetails.closedWonDetails.poDate)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Destination Address</span>
                        <span className="text-[10.5px] text-slate-600 font-medium block leading-normal line-clamp-2">
                          {selectedOrderDetails.closedWonDetails.destinationAddress || "N/A"}
                        </span>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">GSTIN</span>
                        <span className="text-[11px] font-bold text-slate-700 font-mono">
                          {selectedOrderDetails.closedWonDetails.gstin || "N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Freight Terms & Cost</span>
                        <div className="text-[11px] font-bold text-slate-700">
                          {selectedOrderDetails.closedWonDetails.freightTerm || "N/A"}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 space-y-0.5">
                          <div>Cost to AOL: {selectedOrderDetails.closedWonDetails.freightCostToAol || "N/A"}</div>
                          <div>Charged in Bill: {selectedOrderDetails.closedWonDetails.freightChargedInBill || "N/A"}</div>
                          <div>Cartage/Labour: {selectedOrderDetails.closedWonDetails.cartageLabourCharges || "N/A"}</div>
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Dispatch Information</span>
                        <div className="text-[10px] text-slate-600 font-mono space-y-0.5">
                          <div>Date: {formatDate(selectedOrderDetails.closedWonDetails.dispatchDate)}</div>
                          <div>From: {selectedOrderDetails.closedWonDetails.dispatchLocation || "N/A"}</div>
                          <div>Warehouse: {selectedOrderDetails.closedWonDetails.warehouseManagedBy || "N/A"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Logistics Partner</span>
                        <div className="text-[11px] font-bold text-slate-700">
                          {getTransporterDisplayName(selectedOrderDetails.closedWonDetails.transporterName)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Vehicle No: {selectedOrderDetails.closedWonDetails.vehicleNo || "N/A"}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">PO Attachment File(s)</span>
                        {selectedOrderDetails.closedWonDetails.poAttachments && selectedOrderDetails.closedWonDetails.poAttachments.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedOrderDetails.closedWonDetails.poAttachments.map((att, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => openOrDownloadDocument(att.url, att.name || `PO_${selectedOrderDetails.closedWonDetails!.customerPoNumber}_${idx + 1}.pdf`)}
                                className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-150 transition-all cursor-pointer shadow-2xs"
                                title={att.name}
                              >
                                <FileText size={12} />
                                <span className="max-w-[170px] truncate">{att.name || `PO Doc ${idx + 1}`} ↗</span>
                              </button>
                            ))}
                          </div>
                        ) : selectedOrderDetails.closedWonDetails.poAttachmentUrl ? (
                          <button
                            type="button"
                            onClick={() => openOrDownloadDocument(selectedOrderDetails.closedWonDetails!.poAttachmentUrl!, `PO_${selectedOrderDetails.closedWonDetails!.customerPoNumber}.pdf`)}
                            className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-150 transition-all cursor-pointer"
                          >
                            <FileText size={12} />
                            <span>View PO PDF ↗</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">No attached PO PDF</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Itemized Product List Table */}
              <div>
                <h3 className="text-[10px] font-extrabold text-slate-400 uppercase font-mono tracking-wider mb-3">Itemized Bill of Materials (BOM)</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                        <th className="py-2 px-3">Product Name</th>
                        <th className="py-2 px-3 text-right">Quantity</th>
                        <th className="py-2 px-3 text-right">Unit Rate (₹)</th>
                        <th className="py-2 px-3 text-right">Line Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-medium text-slate-700">
                      {selectedOrderDetails.items?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40">
                          <td className="py-2 px-3 font-semibold text-slate-800">{item.productName}</td>
                          <td className="py-2 px-3 text-right font-mono">{item.quantity.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{item.rate.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">₹{item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      {selectedOrderDetails.status === "Closed Won" && parseFreightAmount(selectedOrderDetails.closedWonDetails?.freightChargedInBill) > 0 && (
                        <tr className="bg-emerald-50/40 font-medium text-emerald-950 border-t border-slate-200">
                          <td className="py-2 px-3 font-semibold" colSpan={3}>
                            Freight Charged in Bill (+18% GST = ₹{(parseFreightAmount(selectedOrderDetails.closedWonDetails?.freightChargedInBill) * 0.18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-900">
                            ₹{(parseFreightAmount(selectedOrderDetails.closedWonDetails?.freightChargedInBill) * 1.18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-slate-50/50 font-bold border-t border-slate-200">
                        <td className="py-2.5 px-3 text-slate-700" colSpan={2}>Grand Total</td>
                        <td className="py-2.5 px-3 text-right text-slate-900 font-mono text-xs" colSpan={2}>
                          ₹{selectedOrderDetails.totalValue.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Internal Notes */}
              {selectedOrderDetails.notes && (
                <div>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase font-mono tracking-wider mb-2">Internal Notes & Remarks</h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {selectedOrderDetails.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end border-t border-slate-200 shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="px-4 py-2 text-xs font-bold font-mono uppercase bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Import Modal for Orders / Offers / Historical Invoices */}
      <DataImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Bulk Import Sales Orders, Offers & Historical Invoices"
        entityName="Orders, Offers & Invoices"
        fields={orderImportFields}
        onImport={handleImportOrders}
      />
    </div>
  );
}
