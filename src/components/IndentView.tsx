/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  User, 
  OrderOffer, 
  OrderItem, 
  Role, 
  BillingDetails, 
  InvoiceAttachment,
  EmailTemplate, 
  EmailAutoSelectSettings, 
  Client, 
  FreightTerm, 
  DeliveryTerm,
  TransporterName, 
  WarehouseManagedBy, 
  DispatchLocation,
  EmailSentLog,
  EmailSentStatusSummary,
} from "../types";
import { canViewOrderOffer } from "../data";
import { 
  uploadInvoiceToDrive, 
  getSharedDriveSettings, 
  DriveSettings,
  openOrDownloadDocument
} from "../lib/googleDriveService";
import {
  getEmailAutoSelectSettings,
  saveEmailAutoSelectSettings,
  saveLog,
  saveEmailSentLog,
} from "../lib/firebaseService";
import { auth } from "../firebase";
import { replaceTemplateVars, resolveUserHierarchyInfo, formatEmailBodyForSending } from "../lib/templateUtils";
import { formatDate } from "../utils";
import { EmailSentStatusCell } from "./EmailSentStatusCell";
import { 
  Search, 
  Check, 
  Loader2, 
  Upload, 
  FileText, 
  AlertCircle, 
  Building2, 
  Calendar, 
  IndianRupee, 
  ExternalLink, 
  ArrowRight,
  Receipt,
  FileCheck,
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
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit3,
  Save,
  X
} from "lucide-react";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { PaymentBank } from "../types";

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

interface IndentViewProps {
  activeUserId: string;
  users: User[];
  orders: OrderOffer[];
  clients?: Client[];
  onEditOrder: (order: OrderOffer) => void;
  onAddOrder?: (order: Omit<OrderOffer, "id" | "createdAt" | "createdByUserId">) => void;
  paymentBanks?: PaymentBank[];
  freightTerms?: FreightTerm[];
  deliveryTerms?: DeliveryTerm[];
  transporters?: TransporterName[];
  warehouses?: WarehouseManagedBy[];
  dispatchLocations?: DispatchLocation[];
  visibleSubTabs?: { [key: string]: string[] };
  emailTemplates?: EmailTemplate[];
  emailSentLogs?: EmailSentLog[];
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function IndentView({
  activeUserId,
  users,
  orders = [],
  clients = [],
  onEditOrder,
  onAddOrder,
  paymentBanks = [],
  freightTerms = [],
  deliveryTerms = [],
  transporters = [],
  warehouses = [],
  dispatchLocations = [],
  visibleSubTabs,
  emailTemplates = [],
  emailSentLogs = [],
  teamPermissions,
  levelWiseFilters,
}: IndentViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || {
    id: activeUserId,
    name: "User",
    role: Role.User,
    teamName: "Sales",
  };

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["indent"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["indent"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["indent"]?.view !== false;

  // Sub-tabs config & state
  const allSubTabs = [
    { id: "logistics", label: "Logistic", icon: Truck },
    { id: "billing", label: "Billing", icon: FileCheck },
    { id: "invoice_attached", label: "Invoice Attached", icon: FileText }
  ];

  const visibleTabsForIndent = visibleSubTabs?.["indent"] || allSubTabs.map(t => t.id);
  const filteredSubTabs = useMemo(() => {
    return allSubTabs.filter(t => visibleTabsForIndent.includes(t.id));
  }, [JSON.stringify(visibleTabsForIndent)]);

  const [activeSubTab, setActiveSubTab] = useState<string>(filteredSubTabs[0]?.id || "logistics");

  // Keep activeSubTab in sync if permissions change
  useEffect(() => {
    if (filteredSubTabs.length > 0 && !filteredSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubTabs[0].id);
    }
  }, [filteredSubTabs, activeSubTab]);

  // Expanded order card state to view details
  const [expandedOrderIds, setExpandedOrderIds] = useState<{ [key: string]: boolean }>({});

  // Logistics inline edit form state (for Logistic sub-tab)
  const [editingLogisticsOrderId, setEditingLogisticsOrderId] = useState<string | null>(null);
  const [logisticsForm, setLogisticsForm] = useState<{
    [orderId: string]: {
      dispatchDate: string;
      dispatchLocation: string;
      warehouseManagedBy: string;
      transporterName: string;
      vehicleNo: string;
      freightTerm: string;
      deliveryTerm: string;
      cartageLabourCharges: string;
      freightChargedInBill: string;
      freightCostToAol: string;
    };
  }>({});
  const [savingLogisticsId, setSavingLogisticsId] = useState<string | null>(null);
  const [logisticsSuccessId, setLogisticsSuccessId] = useState<string | null>(null);

  // Product items inline edit state (for Billing sub-tab)
  const [editingProductOrderId, setEditingProductOrderId] = useState<string | null>(null);
  const [productItemsForm, setProductItemsForm] = useState<{ [orderId: string]: OrderItem[] }>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [productSuccessId, setProductSuccessId] = useState<string | null>(null);

  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [resendingInvoiceOrderId, setResendingInvoiceOrderId] = useState<string | null>(null);
  const [emailBanner, setEmailBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Import Modal state for Invoice Attached
  const [isImportOpen, setIsImportOpen] = useState(false);

  const invoiceAttachedImportFields: ImportFieldDefinition[] = [
    { key: "invoiceNumber", label: "Invoice Number", required: true, sampleValue: "INV-2026-8801", description: "Mapped invoice reference number" },
    { key: "clientName", label: "Client Full Name", required: true, sampleValue: "Anil Kumar", description: "Primary contact full name" },
    { key: "companyName", label: "Company Name", required: true, sampleValue: "Tata Steel Ltd", description: "Client company name" },
    { key: "email", label: "Client Email", sampleValue: "anil@tatasteel.com", description: "Primary client email" },
    { key: "phone", label: "Client Phone", sampleValue: "+91 9876543210", description: "Client phone number" },
    { key: "billingAddress", label: "Billing Address", sampleValue: "Plot 10, Industrial Area, Jamshedpur", description: "Client billing address" },
    { key: "invoiceFileName", label: "Invoice File Name", sampleValue: "INV-2026-8801.pdf", description: "Filename of attached invoice" },
    { key: "invoiceFileUrl", label: "Invoice File Link / URL", sampleValue: "https://drive.google.com/file/d/...", description: "Accessible link to invoice PDF" },
    { key: "customerPoNumber", label: "Customer PO Number", sampleValue: "PO-44210", description: "Associated Purchase Order number" },
    { key: "poAttachmentUrl", label: "Customer PO File Link / URL", sampleValue: "https://drive.google.com/file/d/po-sample/...", description: "Accessible link to customer PO PDF/document" },
    { key: "totalValue", label: "PO / Invoice Total (₹)", sampleValue: "120000", description: "Invoice or order total value" },
    { key: "productName", label: "Product Name", sampleValue: "Caustic Soda Flakes", description: "Product description" },
    { key: "quantity", label: "Quantity", sampleValue: "50", description: "Product quantity" },
    { key: "rate", label: "Rate (₹)", sampleValue: "2400", description: "Unit rate" },
  ];

  const handleImportAttachedInvoices = async (rows: Record<string, any>[]) => {
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const invNum = row.invoiceNumber?.trim();
      const clientName = row.clientName?.trim();
      const companyName = row.companyName?.trim();

      if (!invNum || !clientName || !companyName) {
        errors.push(`Row ${i + 1}: Skipped due to missing Invoice Number, Client Name, or Company Name.`);
        continue;
      }

      const fileUrl = row.invoiceFileUrl?.trim() || "";
      const fileName = row.invoiceFileName?.trim() || `${invNum}.pdf`;
      const poAttachmentUrl = (row.poAttachmentUrl || row.poUrl || row.customerPoFileUrl || row.customerPoUrl || row.poLink || row.customerPoLink)?.trim() || "";

      // Check if an existing order matches by invoiceNumber or by companyName (unmapped)
      const existingOrder = orders.find(o => 
        (o.billingDetails?.invoiceNumber?.toLowerCase() === invNum.toLowerCase()) ||
        (o.companyName.toLowerCase() === companyName.toLowerCase() && !o.billingDetails?.invoiceNumber)
      );

      const qty = parseFloat(row.quantity) || 1;
      const rateVal = parseFloat(row.rate) || 0;
      const totalVal = parseFloat(row.totalValue) || (qty * rateVal);

      if (existingOrder) {
        const updatedOrder: OrderOffer = {
          ...existingOrder,
          clientName: clientName || existingOrder.clientName,
          companyName: companyName || existingOrder.companyName,
          email: row.email?.trim() || existingOrder.email,
          phone: row.phone?.trim() || existingOrder.phone,
          billingAddress: row.billingAddress?.trim() || existingOrder.billingAddress,
          status: "Closed Won",
          totalValue: totalVal || existingOrder.totalValue,
          billingDetails: {
            invoiceNumber: invNum,
            invoiceFileName: fileName,
            invoiceFileUrl: fileUrl,
            mappedAt: new Date().toISOString(),
            mappedByUserId: activeUserId,
          },
          closedWonDetails: {
            ...existingOrder.closedWonDetails,
            customerPoNumber: row.customerPoNumber?.trim() || existingOrder.closedWonDetails?.customerPoNumber || "",
            poAttachmentUrl: poAttachmentUrl || existingOrder.closedWonDetails?.poAttachmentUrl || undefined,
          }
        };

        try {
          await onEditOrder(updatedOrder);
          successCount++;
        } catch (err: any) {
          errors.push(`Row ${i + 1} (${invNum}): ${err.message || err}`);
        }
      } else if (onAddOrder) {
        const itemsList = row.productName ? [{
          productId: `prod-import-${Date.now()}-${i}`,
          productName: row.productName.trim(),
          quantity: qty,
          rate: rateVal,
          amount: qty * rateVal
        }] : [{
          productId: "proj-1",
          productName: "Default Product",
          quantity: 1,
          rate: totalVal,
          amount: totalVal
        }];

        const newOrderData: Omit<OrderOffer, "id" | "createdAt" | "createdByUserId"> = {
          clientName,
          companyName,
          email: row.email?.trim() || "",
          phone: row.phone?.trim() || "+1 (555) 000-0000",
          billingAddress: row.billingAddress?.trim() || "",
          status: "Closed Won",
          totalValue: totalVal,
          items: itemsList,
          payment: "Advance Payment",
          delivery: "FOB",
          otherTerms: "",
          assignedToUserId: activeUserId,
          notes: "Imported via Invoice Attached Sheets / CSV Wizard",
          billingDetails: {
            invoiceNumber: invNum,
            invoiceFileName: fileName,
            invoiceFileUrl: fileUrl,
            mappedAt: new Date().toISOString(),
            mappedByUserId: activeUserId,
          },
          closedWonDetails: {
            customerPoNumber: row.customerPoNumber?.trim() || "",
            poAttachmentUrl: poAttachmentUrl || undefined,
            poDate: new Date().toISOString().split("T")[0],
            freightTerm: "To Pay",
            transporterName: "TBD",
            deliveryTerm: "Standard",
            destinationAddress: row.billingAddress?.trim() || "",
            dispatchDate: new Date().toISOString().split("T")[0],
            dispatchLocation: "Main Plant",
            warehouseManagedBy: "Self Managed",
          }
        };

        try {
          await onAddOrder(newOrderData);
          successCount++;
        } catch (err: any) {
          errors.push(`Row ${i + 1} (${invNum}): ${err.message || err}`);
        }
      } else {
        errors.push(`Row ${i + 1} (${invNum}): Cannot create new order - onAddOrder handler missing.`);
      }
    }

    return { successCount, errors };
  };

  // Drive integration state
  const [driveSettings, setDriveSettings] = useState<DriveSettings | null>(null);

  // Per-order forms state
  // We use the order.id as the key for storing inputs, selected files, error, success and loading states
  const [invoiceNumbers, setInvoiceNumbers] = useState<{ [key: string]: string }>({});
  const [invoiceDates, setInvoiceDates] = useState<{ [key: string]: string }>({});
  const [actualDispatchDates, setActualDispatchDates] = useState<{ [key: string]: string }>({});
  const [selectedFiles, setSelectedFiles] = useState<{ [key: string]: File[] }>({});
  const [existingAttachments, setExistingAttachments] = useState<{ [key: string]: InvoiceAttachment[] }>({});
  const [uploadProgressText, setUploadProgressText] = useState<{ [key: string]: string }>({});
  const [selectedTemplates, setSelectedTemplates] = useState<{ [key: string]: string }>({});
  const [sendEmails, setSendEmails] = useState<{ [key: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: boolean }>({});
  const [orderErrors, setOrderErrors] = useState<{ [key: string]: string | null }>({});
  const [orderSuccess, setOrderSuccess] = useState<{ [key: string]: boolean }>({});
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [confirmEditOrder, setConfirmEditOrder] = useState<OrderOffer | null>(null);

  // Drag and drop highlights
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  // Email auto select settings
  const [autoSelectSettings, setAutoSelectSettings] = useState<EmailAutoSelectSettings>({
    indentAutoSelect: true,
    ordersAutoSelect: false,
  });

  // Fetch Google Drive & Email Auto Select Settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getSharedDriveSettings();
        if (settings) {
          setDriveSettings(settings);
        }
      } catch (err) {
        console.error("Error loading drive settings:", err);
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

  // Filter only Closed Won orders that the active user can view (respecting level-wise filters)
  const closedWonOrders = orders.filter((o) => {
    if (o.status !== "Closed Won") return false;
    const isLevelFilterEnabled = !!levelWiseFilters?.["indent"];
    return canViewOrderOffer(activeUserId, o, users, isLevelFilterEnabled);
  });

  // Separate closedWonOrders into mapped and unmapped lists
  const unmappedOrders = closedWonOrders.filter((order) => !order.billingDetails?.invoiceNumber);
  const mappedOrders = closedWonOrders.filter((order) => !!order.billingDetails?.invoiceNumber);

  // Filter based on active sub-tab and search term
  const displayOrders = useMemo(() => {
    if (activeSubTab === "logistics") {
      return unmappedOrders;
    }
    if (activeSubTab === "billing") {
      return closedWonOrders.filter((order) => !order.billingDetails?.invoiceNumber || order.id === editingOrderId);
    }
    return mappedOrders;
  }, [activeSubTab, unmappedOrders, closedWonOrders, editingOrderId, mappedOrders]);

  const filteredOrders = displayOrders.filter((order) => {
    const matchCompany = order.companyName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchClient = order.clientName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchInvoice = order.billingDetails?.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPo = order.closedWonDetails?.customerPoNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCompany || matchClient || matchInvoice || matchPo;
  });

  // Logistics field helpers
  const startEditingLogistics = (order: OrderOffer) => {
    setLogisticsForm((prev) => ({
      ...prev,
      [order.id]: {
        dispatchDate: order.closedWonDetails?.dispatchDate || "",
        dispatchLocation: order.closedWonDetails?.dispatchLocation || "",
        warehouseManagedBy: order.closedWonDetails?.warehouseManagedBy || "",
        transporterName: order.closedWonDetails?.transporterName || "",
        vehicleNo: order.closedWonDetails?.vehicleNo || "",
        freightTerm: order.closedWonDetails?.freightTerm || "",
        deliveryTerm: order.closedWonDetails?.deliveryTerm || "",
        cartageLabourCharges: order.closedWonDetails?.cartageLabourCharges || "",
        freightChargedInBill: order.closedWonDetails?.freightChargedInBill || "",
        freightCostToAol: order.closedWonDetails?.freightCostToAol || "",
      },
    }));
    setEditingLogisticsOrderId(order.id);
  };

  const cancelEditingLogistics = (orderId: string) => {
    setEditingLogisticsOrderId(null);
    setLogisticsForm((prev) => {
      const copy = { ...prev };
      delete copy[orderId];
      return copy;
    });
  };

  const getLogisticsValue = (
    order: OrderOffer, 
    field: "dispatchDate" | "dispatchLocation" | "warehouseManagedBy" | "transporterName" | "vehicleNo" | "freightTerm" | "deliveryTerm" | "cartageLabourCharges" | "freightChargedInBill" | "freightCostToAol"
  ) => {
    if (logisticsForm[order.id]?.[field] !== undefined) {
      return logisticsForm[order.id][field];
    }
    return (order.closedWonDetails as any)?.[field] || "";
  };

  const updateLogisticsField = (
    order: OrderOffer, 
    field: "dispatchDate" | "dispatchLocation" | "warehouseManagedBy" | "transporterName" | "vehicleNo" | "freightTerm" | "deliveryTerm" | "cartageLabourCharges" | "freightChargedInBill" | "freightCostToAol", 
    value: string
  ) => {
    setLogisticsForm((prev) => ({
      ...prev,
      [order.id]: {
        dispatchDate: getLogisticsValue(order, "dispatchDate"),
        dispatchLocation: getLogisticsValue(order, "dispatchLocation"),
        warehouseManagedBy: getLogisticsValue(order, "warehouseManagedBy"),
        transporterName: getLogisticsValue(order, "transporterName"),
        vehicleNo: getLogisticsValue(order, "vehicleNo"),
        freightTerm: getLogisticsValue(order, "freightTerm"),
        deliveryTerm: getLogisticsValue(order, "deliveryTerm"),
        cartageLabourCharges: getLogisticsValue(order, "cartageLabourCharges"),
        freightChargedInBill: getLogisticsValue(order, "freightChargedInBill"),
        freightCostToAol: getLogisticsValue(order, "freightCostToAol"),
        ...prev[order.id],
        [field]: value,
      },
    }));
  };

  const handleSaveLogistics = async (order: OrderOffer) => {
    setSavingLogisticsId(order.id);
    try {
      const updatedOrder: OrderOffer = {
        ...order,
        closedWonDetails: {
          customerPoNumber: order.closedWonDetails?.customerPoNumber || "",
          poDate: order.closedWonDetails?.poDate || "",
          destinationAddress: order.closedWonDetails?.destinationAddress || "",
          poAttachmentUrl: order.closedWonDetails?.poAttachmentUrl || "",
          dispatchDate: getLogisticsValue(order, "dispatchDate"),
          dispatchLocation: getLogisticsValue(order, "dispatchLocation"),
          warehouseManagedBy: getLogisticsValue(order, "warehouseManagedBy"),
          transporterName: getLogisticsValue(order, "transporterName"),
          vehicleNo: getLogisticsValue(order, "vehicleNo"),
          freightTerm: getLogisticsValue(order, "freightTerm"),
          deliveryTerm: getLogisticsValue(order, "deliveryTerm"),
          cartageLabourCharges: getLogisticsValue(order, "cartageLabourCharges"),
          freightChargedInBill: getLogisticsValue(order, "freightChargedInBill"),
          freightCostToAol: getLogisticsValue(order, "freightCostToAol"),
        },
      };
      await onEditOrder(updatedOrder);
      setEditingLogisticsOrderId(null);
      setLogisticsSuccessId(order.id);
      setTimeout(() => {
        setLogisticsSuccessId(null);
      }, 3500);
    } catch (err: any) {
      alert(err.message || "Failed to save logistics details.");
    } finally {
      setSavingLogisticsId(null);
    }
  };

  // Format transporter name with ID combination
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

  // Product items edit helpers (for Billing sub-tab)
  const startEditingProducts = (order: OrderOffer) => {
    const currentItems = (order.items && order.items.length > 0)
      ? order.items.map(it => ({ ...it }))
      : [{ productId: `item-${Date.now()}`, productName: "", quantity: 1, rate: 0, amount: 0 }];
    setProductItemsForm((prev) => ({ ...prev, [order.id]: currentItems }));
    setEditingProductOrderId(order.id);
  };

  const cancelEditingProducts = (orderId: string) => {
    setEditingProductOrderId(null);
    setProductItemsForm((prev) => {
      const copy = { ...prev };
      delete copy[orderId];
      return copy;
    });
  };

  const updateProductItemField = (orderId: string, index: number, field: "quantity" | "rate", value: any) => {
    setProductItemsForm((prev) => {
      const current = [...(prev[orderId] || [])];
      if (!current[index]) return prev;
      const updated = { ...current[index], [field]: value };
      const q = field === "quantity" ? parseFloat(value) || 0 : (parseFloat(String(current[index].quantity)) || 0);
      const r = field === "rate" ? parseFloat(value) || 0 : (parseFloat(String(current[index].rate)) || 0);
      updated.amount = q * r;
      current[index] = updated;
      return { ...prev, [orderId]: current };
    });
  };

  const handleSaveProductDetails = async (order: OrderOffer) => {
    const items = productItemsForm[order.id] || order.items || [];
    const computedTotal = items.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.rate) || 0)), 0);
    const finalItems: OrderItem[] = items.map(it => ({
      ...it,
      quantity: Number(it.quantity) || 0,
      rate: Number(it.rate) || 0,
      amount: (Number(it.quantity) || 0) * (Number(it.rate) || 0)
    }));

    setSavingProductId(order.id);
    try {
      const updatedOrder: OrderOffer = {
        ...order,
        items: finalItems,
        totalValue: computedTotal,
      };
      await onEditOrder(updatedOrder);
      setProductSuccessId(order.id);
      setEditingProductOrderId(null);
      setTimeout(() => {
        setProductSuccessId(null);
      }, 3500);
    } catch (err: any) {
      alert(err.message || "Failed to update product details.");
    } finally {
      setSavingProductId(null);
    }
  };

  // Handle file drop
  const handleDragOver = (e: React.DragEvent, orderId: string) => {
    e.preventDefault();
    setDragOverOrderId(orderId);
  };

  const handleDragLeave = () => {
    setDragOverOrderId(null);
  };

  const handleFilesAdd = (files: FileList | File[], orderId: string, order: OrderOffer) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    const currentExisting = existingAttachments[orderId] !== undefined
      ? existingAttachments[orderId]
      : (order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0
          ? order.billingDetails.invoiceAttachments
          : (order.billingDetails?.invoiceFileUrl
              ? [{ name: order.billingDetails.invoiceFileName || `Invoice_${order.billingDetails.invoiceNumber || "Doc"}.pdf`, url: order.billingDetails.invoiceFileUrl }]
              : []));

    const currentNew = selectedFiles[orderId] || [];
    const currentTotal = currentExisting.length + currentNew.length;
    const remainingSlots = 10 - currentTotal;

    if (remainingSlots <= 0) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: "Maximum limit of 10 invoice files reached. Remove an existing file to attach a new one." }));
      return;
    }

    if (fileList.length > remainingSlots) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: `You can only add ${remainingSlots} more file(s). Maximum 10 invoice files total allowed.` }));
      return;
    }

    const nonPdf = fileList.some((f) => !f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf");
    if (nonPdf) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: "Only PDF files are allowed to be uploaded." }));
      return;
    }

    setSelectedFiles((prev) => ({
      ...prev,
      [orderId]: [...(prev[orderId] || []), ...fileList].slice(0, 10 - currentExisting.length),
    }));
    if (existingAttachments[orderId] === undefined) {
      setExistingAttachments((prev) => ({
        ...prev,
        [orderId]: currentExisting,
      }));
    }
    setOrderErrors((prev) => ({ ...prev, [orderId]: null }));
  };

  const handleDrop = (e: React.DragEvent, orderId: string, order: OrderOffer) => {
    e.preventDefault();
    setDragOverOrderId(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdd(e.dataTransfer.files, orderId, order);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, orderId: string, order: OrderOffer) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdd(e.target.files, orderId, order);
      e.target.value = "";
    }
  };

  const removeSelectedNewFile = (orderId: string, index: number) => {
    setSelectedFiles((prev) => ({
      ...prev,
      [orderId]: (prev[orderId] || []).filter((_, i) => i !== index),
    }));
  };

  const removeExistingAttachment = (orderId: string, index: number, order: OrderOffer) => {
    const currentExisting = existingAttachments[orderId] !== undefined
      ? existingAttachments[orderId]
      : (order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0
          ? order.billingDetails.invoiceAttachments
          : (order.billingDetails?.invoiceFileUrl
              ? [{ name: order.billingDetails.invoiceFileName || `Invoice_${order.billingDetails.invoiceNumber || "Doc"}.pdf`, url: order.billingDetails.invoiceFileUrl }]
              : []));

    setExistingAttachments((prev) => ({
      ...prev,
      [orderId]: currentExisting.filter((_, i) => i !== index),
    }));
  };

  // Submit mapping
  const handleMapInvoice = async (order: OrderOffer) => {
    const orderId = order.id;
    const invNum = invoiceNumbers[orderId]?.trim() || order.billingDetails?.invoiceNumber || "";
    const actDispatchDate = actualDispatchDates[orderId]?.trim() || order.billingDetails?.actualDispatchDate || "";
    const invDate = invoiceDates[orderId]?.trim() || order.billingDetails?.invoiceDate || actDispatchDate || new Date().toISOString().split("T")[0];
    const newFiles = selectedFiles[orderId] || [];
    const currentExisting = existingAttachments[orderId] !== undefined
      ? existingAttachments[orderId]
      : (order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0
          ? order.billingDetails.invoiceAttachments
          : (order.billingDetails?.invoiceFileUrl
              ? [{ name: order.billingDetails.invoiceFileName || `Invoice_${order.billingDetails.invoiceNumber || "Doc"}.pdf`, url: order.billingDetails.invoiceFileUrl }]
              : []));
    const sendEmail = sendEmails[orderId];
    const templateId = selectedTemplates[orderId];

    if (!invNum) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: "Invoice number is required." }));
      return;
    }
    if (sendEmail && !templateId) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: "Please select an email template." }));
      return;
    }

    setOrderErrors((prev) => ({ ...prev, [orderId]: null }));
    setUploadProgress((prev) => ({ ...prev, [orderId]: true }));
    setOrderSuccess((prev) => ({ ...prev, [orderId]: false }));

    try {
      const newlyUploadedAttachments: InvoiceAttachment[] = [];

      // Upload each new file to Google Drive
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        setUploadProgressText((prev) => ({
          ...prev,
          [orderId]: newFiles.length > 1
            ? `Uploading ${i + 1} of ${newFiles.length} (${file.name}) to Google Drive...`
            : `Uploading ${file.name} to Google Drive...`
        }));

        const uploadResult = await uploadInvoiceToDrive(file, order.companyName, invNum, invDate);
        newlyUploadedAttachments.push({
          id: uploadResult.id,
          name: uploadResult.name || file.name,
          url: uploadResult.webViewLink,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }

      const allAttachments: InvoiceAttachment[] = [...currentExisting, ...newlyUploadedAttachments].slice(0, 10);
      const primaryUrl = allAttachments[0]?.url || "";
      const primaryName = allAttachments[0]?.name || "";
      const allUrls = allAttachments.map(a => a.url);

      // Update the order object in Firestore
      const updatedBilling: BillingDetails = {
        invoiceNumber: invNum,
        invoiceDate: invDate,
        invoiceFileUrl: primaryUrl,
        invoiceFileName: primaryName,
        invoiceFileUrls: allUrls,
        invoiceAttachments: allAttachments,
        mappedAt: new Date().toISOString(),
        actualDispatchDate: actDispatchDate,
        ebillNo: order.billingDetails?.ebillNo,
        vehicleNo: order.billingDetails?.vehicleNo,
        transportName: order.billingDetails?.transportName,
        lrNo: order.billingDetails?.lrNo,
        dispatchDate: order.billingDetails?.dispatchDate,
      };

      const updatedOrder: OrderOffer = {
        ...order,
        billingDetails: updatedBilling,
      };

      await onEditOrder(updatedOrder);

      // Trigger Email
      if (sendEmail) {
        const hierarchy = resolveUserHierarchyInfo(activeUserId, order.assignedToUserId, users);
        const template = emailTemplates.find(t => t.id === templateId) || 
          (templateId === "" ? emailTemplates.find(t => t.isDefault && (t.assignedForm === "invoice_issuance" || t.assignedForm === "any" || !t.assignedForm)) : undefined);
        if (template) {
          const itemsListString = (order.items || []).map((item, index) =>
            `Product ${index + 1}: ${item.productName}: Qty ${item.quantity} @ ${item.rate} = ${item.amount}`
          ).join('\n');

          const multiLinkString = allAttachments.length > 1
            ? allAttachments.map((a, i) => `${a.name || `Invoice ${i + 1}`}: ${a.url}`).join("\n")
            : primaryUrl;

          const applyTemplate = (text: string) => {
            return replaceTemplateVars(text, {
              recordId: order.id,
              clientName: order.clientName,
              companyName: order.companyName,
              email: order.email || "",
              phone: order.phone || "",
              billingAddress: order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "",
              status: order.status,
              totalValue: order.totalValue,
              itemsList: itemsListString,
              invoiceNumber: invNum,
              invoiceFileLink: multiLinkString,
              payment: order.payment || "",
              paymentTermsOffer: order.paymentTermsOffer || "",
              paymentCreditPeriod: order.paymentCreditPeriod || "",
              delivery: order.delivery || "",
              otherTerms: order.otherTerms || "",
              notes: order.notes || "",
              customerPoNumber: order.closedWonDetails?.customerPoNumber || "",
              poDate: order.closedWonDetails?.poDate || "",
              freightTerm: order.closedWonDetails?.freightTerm || "",
              freightChargedInBill: order.closedWonDetails?.freightChargedInBill || "",
              freightCostToAol: order.closedWonDetails?.freightCostToAol || "",
              cartageLabourCharges: order.closedWonDetails?.cartageLabourCharges || "",
              transporterName: order.closedWonDetails?.transporterName || "",
              deliveryTerm: order.closedWonDetails?.deliveryTerm || "",
              destinationAddress: order.closedWonDetails?.destinationAddress || "",
              dispatchDate: order.closedWonDetails?.dispatchDate || "",
              dispatchLocation: order.closedWonDetails?.dispatchLocation || "",
              warehouseManagedBy: order.closedWonDetails?.warehouseManagedBy || "",
              ...hierarchy,
            });
          };

          const subject = applyTemplate(template.subject);
          const rawBody = applyTemplate(template.body);
          const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(rawBody);

          const dynamicTo = cleanEmailList(template.to ? applyTemplate(template.to) : (order.email || ""));
          const dynamicCc = template.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
          const dynamicBcc = template.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

          const idToken = await auth.currentUser?.getIdToken();
          let resData: any = {};
          let isOk = false;
          let deliveryStatus: "Sent" | "Failed" = "Sent";
          let emailErrorMsg: string | undefined = undefined;

          try {
            const res = await fetch("/api/send-order-email", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken || ""}`
              },
              body: JSON.stringify({
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
                category: "invoice_issuance",
                orderId: order.id,
                companyName: order.companyName,
                clientName: order.clientName,
              }),
            });
            resData = await res.json().catch(() => ({}));
            isOk = res.ok;
            deliveryStatus = resData.deliveryStatus || (res.ok ? "Sent" : "Failed");
            if (!res.ok) {
              emailErrorMsg = resData.message || "Failed to send invoice notification email.";
            }
          } catch (e: any) {
            isOk = false;
            deliveryStatus = "Failed";
            emailErrorMsg = e.message || "Network error while sending email";
          }

          const newInvoiceEmailSummary: EmailSentStatusSummary = {
            to: dynamicTo,
            cc: dynamicCc,
            bcc: dynamicBcc,
            status: deliveryStatus,
            timestamp: new Date().toISOString(),
            subject,
            error: emailErrorMsg,
            sentByUserName: activeUser?.name,
          };

          await onEditOrder({
            ...updatedOrder,
            invoiceEmailStatus: newInvoiceEmailSummary,
          });

          await saveEmailSentLog({
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            orderId: order.id,
            companyName: order.companyName,
            clientName: order.clientName,
            to: dynamicTo,
            cc: dynamicCc,
            bcc: dynamicBcc,
            subject,
            category: "invoice_issuance",
            status: deliveryStatus,
            timestamp: new Date().toISOString(),
            senderUserId: activeUser?.id,
            senderUserName: activeUser?.name,
            error: emailErrorMsg,
          });

          await saveLog({
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: activeUser.id,
            userName: activeUser.name,
            actionType: "Send Email",
            targetType: "Order",
            targetId: order.id,
            targetName: order.companyName,
            details: `Email ${deliveryStatus.toLowerCase()} to ${dynamicTo}${dynamicCc ? ` (CC: ${dynamicCc})` : ""}${dynamicBcc ? ` (BCC: ${dynamicBcc})` : ""} (Template: ${template.name}) containing mapped invoice #${invNum} details for "${order.companyName}"`
          });
        }
      }

      setOrderSuccess((prev) => ({ ...prev, [orderId]: true }));
      setSelectedFiles((prev) => ({ ...prev, [orderId]: [] }));
      setExistingAttachments((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
      setUploadProgressText((prev) => ({ ...prev, [orderId]: "" }));
      setEditingOrderId(null);

      // Clean success banner after 3 seconds
      setTimeout(() => {
        setOrderSuccess((prev) => ({ ...prev, [orderId]: false }));
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setOrderErrors((prev) => ({ 
        ...prev, 
        [orderId]: err.message || "An error occurred while uploading or saving details." 
      }));
    } finally {
      setUploadProgress((prev) => ({ ...prev, [orderId]: false }));
      setUploadProgressText((prev) => ({ ...prev, [orderId]: "" }));
    }
  };

  const getEffectiveInvoiceStatus = (order: OrderOffer): EmailSentStatusSummary | undefined => {
    if (order.invoiceEmailStatus && order.invoiceEmailStatus.timestamp) {
      return order.invoiceEmailStatus;
    }
    const matchingLog = emailSentLogs?.find(
      (l) => (l.orderId === order.id || l.to === order.email) && (l.category === "invoice_issuance" || l.category === "resend_invoice")
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

  const handleResendInvoiceEmail = async (order: OrderOffer) => {
    setResendingInvoiceOrderId(order.id);
    try {
      const invNum = order.billingDetails?.invoiceNumber || "";
      const fileUrl = order.billingDetails?.invoiceFileUrl || "";
      const hierarchy = resolveUserHierarchyInfo(activeUserId, order.assignedToUserId, users);
      const template = emailTemplates?.find(
        (t) => t.isDefault && (t.assignedForm === "invoice_issuance" || (t.assignedForm as string) === "invoice_attached" || t.assignedForm === "any" || !t.assignedForm)
      ) || emailTemplates?.find((t) => t.isDefault);

      const itemsListString = (order.items || []).map((item, index) =>
        `Product ${index + 1}: ${item.productName}: Qty ${item.quantity} @ ${item.rate} = ${item.amount}`
      ).join("\n");

      const applyTemplate = (text: string) => {
        return replaceTemplateVars(text, {
          recordId: order.id,
          clientName: order.clientName || "",
          companyName: order.companyName || "",
          email: order.email || "",
          phone: order.phone || "",
          billingAddress: order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "",
          status: order.status,
          totalValue: order.totalValue,
          itemsList: itemsListString,
          invoiceNumber: invNum,
          invoiceFileLink: fileUrl,
          payment: order.payment || "",
          paymentTermsOffer: order.paymentTermsOffer || "",
          paymentCreditPeriod: order.paymentCreditPeriod || "",
          delivery: order.delivery || "",
          otherTerms: order.otherTerms || "",
          notes: order.notes || "",
          customerPoNumber: order.closedWonDetails?.customerPoNumber || "",
          poDate: order.closedWonDetails?.poDate || "",
          freightTerm: order.closedWonDetails?.freightTerm || "",
          freightChargedInBill: order.closedWonDetails?.freightChargedInBill || "",
          freightCostToAol: order.closedWonDetails?.freightCostToAol || "",
          cartageLabourCharges: order.closedWonDetails?.cartageLabourCharges || "",
          transporterName: order.closedWonDetails?.transporterName || "",
          deliveryTerm: order.closedWonDetails?.deliveryTerm || "",
          destinationAddress: order.closedWonDetails?.destinationAddress || "",
          dispatchDate: order.closedWonDetails?.dispatchDate || "",
          dispatchLocation: order.closedWonDetails?.dispatchLocation || "",
          warehouseManagedBy: order.closedWonDetails?.warehouseManagedBy || "",
          ...hierarchy,
        });
      };

      const subject = applyTemplate(template?.subject || `Invoice Notification: ${invNum} for ${order.companyName || order.clientName}`);
      const rawBody = applyTemplate(template?.body || `Hello ${order.clientName},\n\nPlease find attached the invoice details for your order.\n\nInvoice Number: ${invNum}\nInvoice Link: ${fileUrl}\nTotal Value: ₹${order.totalValue?.toLocaleString()}\n\nThank you.`);
      const { html: formattedHtml, text: formattedText } = formatEmailBodyForSending(rawBody);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : (order.email || ""));
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/send-order-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken || ""}`,
        },
        body: JSON.stringify({
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
          category: "resend_invoice",
          orderId: order.id,
          companyName: order.companyName,
          clientName: order.clientName,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      const deliveryStatus = resData.deliveryStatus || (res.ok ? "Sent" : "Failed");
      const newSummary: EmailSentStatusSummary = {
        to: dynamicTo,
        cc: dynamicCc,
        bcc: dynamicBcc,
        status: deliveryStatus,
        timestamp: new Date().toISOString(),
        subject,
        error: res.ok ? undefined : resData.message || "Failed to resend invoice email",
        sentByUserName: activeUser?.name,
      };

      onEditOrder({
        ...order,
        invoiceEmailStatus: newSummary,
      });

      const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await saveEmailSentLog({
        id: logId,
        orderId: order.id,
        companyName: order.companyName,
        clientName: order.clientName,
        to: dynamicTo,
        cc: dynamicCc,
        bcc: dynamicBcc,
        subject,
        category: "resend_invoice",
        status: deliveryStatus,
        timestamp: new Date().toISOString(),
        senderUserId: activeUser?.id,
        senderUserName: activeUser?.name,
        error: res.ok ? undefined : resData.message,
      });

      if (res.ok) {
        setEmailBanner({ type: "success", message: `Invoice email successfully sent to ${dynamicTo}` });
      } else {
        setEmailBanner({ type: "error", message: `Failed to send email: ${resData.message || "Unknown error"}` });
      }
    } catch (err: any) {
      console.error("Resend error:", err);
      setEmailBanner({ type: "error", message: `Failed to resend invoice email: ${err.message || err}` });
    } finally {
      setResendingInvoiceOrderId(null);
    }
  };

  if (!teamCanView) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
        <AlertCircle size={48} className="mx-auto text-rose-500 mb-4" />
        <h3 className="text-base font-bold text-slate-800">Workspace Access Restricted</h3>
        <p className="text-sm text-slate-500 mt-2">
          Your team (<strong>{activeUser.teamName || "No Team Assigned"}</strong>) does not have permission to view the <strong>Indent & Billing</strong> workspace. Please contact a Platform Administrator to request permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="indent-view-container">
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
            {emailBanner.type === "success" ? <Check size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
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

      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 border border-slate-200/85 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Receipt className="text-emerald-600 h-5 w-5" />
            Indent & Billing Management
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Map invoices and files to finalized customer purchase orders. All invoice files are securely cataloged in Google Drive central folder, sorted automatically into customer subdirectories.
          </p>
        </div>
      </div>

      {activeUser.role === Role.Admin && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-emerald-600" />
            <div>
              <span className="font-bold text-slate-800 block">Auto-Select Default Template during Invoice Mapping</span>
              <span className="text-slate-500 text-[10px]">When checked, "Send Email" will auto-select the template marked as default in Email Templates tab.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const newSettings = {
                ...autoSelectSettings,
                indentAutoSelect: !autoSelectSettings.indentAutoSelect,
              };
              setAutoSelectSettings(newSettings);
              await saveEmailAutoSelectSettings(newSettings);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all border shadow-xs ${
              autoSelectSettings.indentAutoSelect
                ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
            }`}
          >
            {autoSelectSettings.indentAutoSelect ? "ON (Auto-Select)" : "OFF (Manual Select)"}
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
              onClick={() => {
                setActiveSubTab(tab.id);
                if (tab.id !== "billing") {
                  setEditingOrderId(null);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold font-mono uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer -mb-0.5 ${
                isActive
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={13} className={isActive ? "text-emerald-600" : "text-slate-400"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {filteredSubTabs.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-center font-medium text-xs font-mono mt-3">
          ⚠️ ACCESS RESTRICTED: No Indent or Billing features are enabled for your team workspace.
        </div>
      ) : (
        <>
          {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-4 border border-slate-200/85 rounded-xl">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, company, PO number, or invoice number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
          />
        </div>

        {activeSubTab === "invoice_attached" && (
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap self-stretch sm:self-auto"
            id="btn-import-attached-invoices"
          >
            <FileSpreadsheet size={15} />
            <span>Import Attached Invoices (Sheets / CSV)</span>
          </button>
        )}

        <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
          Showing <b>{filteredOrders.length}</b> of <b>{
            activeSubTab === "logistics"
              ? unmappedOrders.length
              : activeSubTab === "billing"
                ? unmappedOrders.length
                : mappedOrders.length
          }</b> {
            activeSubTab === "logistics"
              ? "pending dispatch / unmapped"
              : activeSubTab === "billing"
                ? "pending billing"
                : "mapped"
          } orders
        </div>
      </div>

      {/* Logistics Sub-Tab Content */}
      {activeSubTab === "logistics" && (
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center">
              <Truck className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Pending Logistics Orders Found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Only unmapped orders (whose invoice has not yet been attached) are displayed for logistics details editing.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-[90%] mx-auto space-y-6">
              {filteredOrders.map((order, index) => {
                const isExpanded = !!expandedOrderIds[order.id];

                return (
                  <div 
                    key={order.id}
                    className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-5">
                      {/* Order Company & Client Info */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0">
                              <Building2 size={22} />
                            </div>
                            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-slate-900 text-white text-xs sm:text-sm font-mono font-black rounded-lg shrink-0 shadow-2xs">
                                #{index + 1}
                              </span>
                              <span>{order.companyName || "Unspecified Company"}</span>
                            </h2>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-2 pl-10">
                            <span className="text-xs font-normal text-slate-600 flex items-center gap-1.5">
                              <User2 size={13} className="text-slate-400 shrink-0" />
                              <span className="text-slate-400 font-normal">Client:</span>
                              <span className="text-slate-700 font-normal text-xs">{order.clientName}</span>
                            </span>
                            {order.phone && (
                              <span className="text-xs font-normal text-slate-500 flex items-center gap-1 border-l border-slate-200 pl-3">
                                <Phone size={12} className="text-slate-400" /> {order.phone}
                              </span>
                            )}
                            {order.email && (
                              <span className="text-xs font-normal text-slate-500 flex items-center gap-1 border-l border-slate-200 pl-3">
                                <Mail size={12} className="text-slate-400" /> {order.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0 flex flex-col sm:items-end gap-1.5 bg-slate-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                          <span className="text-base sm:text-lg lg:text-xl font-black text-slate-950 block font-mono">
                            ₹{order.totalValue?.toLocaleString()}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 block flex items-center sm:justify-end gap-1 font-semibold">
                            <Calendar size={12} />
                            {order.createdAt ? formatDate(order.createdAt) : ""}
                          </span>
                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                <button
                                  key={attIdx}
                                  type="button"
                                  onClick={() => openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`)}
                                  className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-0.5 px-2 rounded-lg text-[9.5px] font-mono transition-all border border-indigo-200 shadow-2xs cursor-pointer"
                                  title={`View Attached PO: ${att.name}`}
                                >
                                  <FileText size={11} className="text-indigo-600 shrink-0" />
                                  <span>{order.closedWonDetails!.poAttachments!.length === 1 ? "View Attached PO ↗" : `PO ${attIdx + 1} ↗`}</span>
                                </button>
                              ))}
                            </div>
                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                            <button
                              type="button"
                              onClick={() => openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`)}
                              className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2.5 rounded-lg text-[10px] font-mono transition-all border border-indigo-200 shadow-2xs cursor-pointer mt-1"
                              title="View Attached Customer PO Document"
                            >
                              <FileText size={12} className="text-indigo-600 shrink-0" />
                              <span>View Attached PO ↗</span>
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Items & PO overview */}
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-[10px] space-y-1.5 font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Customer PO:</span>
                          <span className="text-slate-700 font-bold">
                            {order.closedWonDetails?.customerPoNumber || "N/A"} 
                            {order.closedWonDetails?.poDate ? ` (${formatDate(order.closedWonDetails.poDate)})` : ""}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Items Included:</span>
                          <span className="text-slate-700 font-bold bg-slate-200 px-1.5 py-0.5 rounded text-[9px]">
                            {order.items?.length || 0} unique items
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-2 border-t border-slate-200/60 pt-1.5 mt-1">
                          <span className="text-slate-400 font-bold uppercase tracking-tight shrink-0">Billing Address:</span>
                          <span className="text-slate-700 font-semibold text-[9.5px] text-right line-clamp-2">
                            {order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5 mt-1.5">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Attached PO File:</span>
                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-end">
                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                <button
                                  key={attIdx}
                                  type="button"
                                  onClick={() => openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`)}
                                  className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                  title={`Open ${att.name}`}
                                >
                                  <FileText size={11} className="text-indigo-600" /> {order.closedWonDetails!.poAttachments!.length === 1 ? "View Customer PO ↗" : (att.name ? (att.name.length > 15 ? `${att.name.substring(0, 12)}...` : att.name) : `PO ${attIdx + 1} ↗`)}
                                </button>
                              ))}
                            </div>
                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                            <button 
                              type="button"
                              onClick={() => openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`)}
                              className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                              title="Open Customer PO File"
                            >
                              <FileText size={11} className="text-indigo-600" /> View Customer PO ↗
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[9px]">No file attached</span>
                          )}
                        </div>
                      </div>

                      {/* Expanding Toggle for Logistics Details */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedOrderIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                          className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50/45 hover:bg-indigo-50 border border-indigo-100/65 rounded-xl text-[10px] font-bold text-indigo-700 transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider">
                            <ListOrdered size={12} className="text-indigo-600" />
                            {isExpanded ? "Hide Details for Logistics" : "Show Details for Logistics"}
                          </span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 space-y-4 text-[11px] animate-fadeIn">
                            {/* Box 1: Customer PO & Terms (Read-Only) */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">1</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Customer PO & Terms</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
                                <div className="space-y-1.5 font-mono">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Customer PO:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.customerPoNumber || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">PO Date:</span>
                                    <span className="text-slate-700 font-bold">
                                      {order.closedWonDetails?.poDate ? formatDate(order.closedWonDetails.poDate) : "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Total Items:</span>
                                    <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[9.5px]">
                                      {order.items?.length || 0} unique items
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 font-mono border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-6">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Salesperson Name:</span>
                                    <span className="text-slate-700 font-bold">
                                      {users.find(u => u.id === order.assignedToUserId)?.name || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Payment Terms:</span>
                                    <span className="text-slate-700 font-bold">{order.payment || "N/A"}</span>
                                  </div>
                                  {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                                    <div className="flex flex-col gap-1 pt-1 border-t border-slate-100/50">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">PO Document(s):</span>
                                      <div className="flex flex-wrap gap-1">
                                        {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                          <a 
                                            key={attIdx}
                                            href="#"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails!.customerPoNumber || "document"}_${attIdx + 1}.pdf`);
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 font-black underline flex items-center gap-1 text-[9.5px]"
                                          >
                                            <FileText size={10} /> {att.name || `PO ${attIdx + 1}`} ↗
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  ) : order.closedWonDetails?.poAttachmentUrl ? (
                                    <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">PO Document:</span>
                                      <a 
                                        href="#"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl, `PO_${order.closedWonDetails!.customerPoNumber || "document"}.pdf`);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800 font-black underline flex items-center gap-1 text-[9.5px]"
                                      >
                                        <FileText size={10} /> View Customer PO ↗
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {/* Box 2: Logistics & Delivery Details (Option to EDIT) */}
                            <div className={`rounded-xl p-4 relative space-y-3 shadow-sm border transition-all ${
                              editingLogisticsOrderId === order.id 
                                ? "bg-indigo-50/25 border-2 border-indigo-300" 
                                : "bg-white border-slate-200"
                            }`}>
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">2</span>
                                  <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Logistics & Delivery Details</span>
                                  {editingLogisticsOrderId === order.id && (
                                    <span className="bg-indigo-100 text-indigo-800 font-mono font-bold text-[8.5px] px-1.5 py-0.5 rounded uppercase">Editing</span>
                                  )}
                                </div>
                                {teamCanEdit && (
                                  <div>
                                    {editingLogisticsOrderId === order.id ? (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => cancelEditingLogistics(order.id)}
                                          className="text-[9.5px] font-bold text-slate-600 hover:text-slate-800 font-mono uppercase px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={savingLogisticsId === order.id}
                                          onClick={() => handleSaveLogistics(order)}
                                          className="text-[9.5px] font-bold text-white font-mono uppercase px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 shadow-xs cursor-pointer disabled:bg-slate-300"
                                        >
                                          {savingLogisticsId === order.id ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                          Save Logistics
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => startEditingLogistics(order)}
                                        className="text-[9.5px] font-bold text-indigo-700 hover:text-indigo-900 font-mono uppercase flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all cursor-pointer border border-indigo-200"
                                      >
                                        <Edit3 size={11} />
                                        Edit Logistics Details
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {editingLogisticsOrderId === order.id ? (
                                /* Editable Logistics & Delivery Details Form */
                                <div className="space-y-3 animate-fadeIn">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10.5px] font-mono">
                                    <div className="space-y-2">
                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Expected Dispatch Date
                                        </label>
                                        <input
                                          type="date"
                                          value={getLogisticsValue(order, "dispatchDate")}
                                          onChange={(e) => updateLogisticsField(order, "dispatchDate", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-bold font-mono"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Dispatch From
                                        </label>
                                        <select
                                          value={getLogisticsValue(order, "dispatchLocation")}
                                          onChange={(e) => updateLogisticsField(order, "dispatchLocation", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        >
                                          <option value="">Select Location...</option>
                                          {dispatchLocations.map((loc) => (
                                            <option key={loc.id} value={loc.name}>{loc.name}</option>
                                          ))}
                                          {getLogisticsValue(order, "dispatchLocation") && !dispatchLocations.some(l => l.name === getLogisticsValue(order, "dispatchLocation")) && (
                                            <option value={getLogisticsValue(order, "dispatchLocation")}>{getLogisticsValue(order, "dispatchLocation")}</option>
                                          )}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Warehouse Managed By
                                        </label>
                                        <select
                                          value={getLogisticsValue(order, "warehouseManagedBy")}
                                          onChange={(e) => updateLogisticsField(order, "warehouseManagedBy", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
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
                                          {getLogisticsValue(order, "warehouseManagedBy") && !warehouses.some(w => w.name === getLogisticsValue(order, "warehouseManagedBy")) && (
                                            <option value={getLogisticsValue(order, "warehouseManagedBy")}>{getLogisticsValue(order, "warehouseManagedBy")}</option>
                                          )}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Delivery / Booking Term
                                        </label>
                                        <select
                                          value={getLogisticsValue(order, "deliveryTerm")}
                                          onChange={(e) => updateLogisticsField(order, "deliveryTerm", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        >
                                          <option value="">-- Select Delivery Term --</option>
                                          {Array.from(new Set([
                                            "Door Delivery",
                                            "Transporter Godown Delivery at Destination",
                                            "Party Vehicle (self Pickup)",
                                            ...deliveryTerms.map(dt => dt.name),
                                            ...(getLogisticsValue(order, "deliveryTerm") ? [getLogisticsValue(order, "deliveryTerm")] : [])
                                          ])).map((term) => (
                                            <option key={term} value={term}>
                                              {term}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Cartage / Labour Charges
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. 500 / Paid by AOL"
                                          value={getLogisticsValue(order, "cartageLabourCharges")}
                                          onChange={(e) => updateLogisticsField(order, "cartageLabourCharges", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        />
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Transporter Name
                                        </label>
                                        <select
                                          value={getLogisticsValue(order, "transporterName")}
                                          onChange={(e) => updateLogisticsField(order, "transporterName", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        >
                                          <option value="">Select Transporter...</option>
                                          {transporters.map((transporter) => (
                                            <option key={transporter.id} value={transporter.name}>
                                              {transporter.name}{transporter.transporterId ? ` (${transporter.transporterId})` : (transporter.id ? ` (${transporter.id})` : "")}
                                            </option>
                                          ))}
                                          {getLogisticsValue(order, "transporterName") && !transporters.some(t => t.name === getLogisticsValue(order, "transporterName")) && (
                                            <option value={getLogisticsValue(order, "transporterName")}>{getLogisticsValue(order, "transporterName")}</option>
                                          )}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Vehicle NO.
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. MH-12-AB-1234"
                                          value={getLogisticsValue(order, "vehicleNo")}
                                          onChange={(e) => updateLogisticsField(order, "vehicleNo", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Freight Terms
                                        </label>
                                        <select
                                          value={getLogisticsValue(order, "freightTerm")}
                                          onChange={(e) => updateLogisticsField(order, "freightTerm", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        >
                                          <option value="">Select Freight Term...</option>
                                          {freightTerms.map((term) => (
                                            <option key={term.id} value={term.name}>{term.name}</option>
                                          ))}
                                          {getLogisticsValue(order, "freightTerm") && !freightTerms.some(t => t.name === getLogisticsValue(order, "freightTerm")) && (
                                            <option value={getLogisticsValue(order, "freightTerm")}>{getLogisticsValue(order, "freightTerm")}</option>
                                          )}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Freight Charged In Bill
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. Extra / Included"
                                          value={getLogisticsValue(order, "freightChargedInBill")}
                                          onChange={(e) => updateLogisticsField(order, "freightChargedInBill", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-slate-500 font-bold uppercase tracking-tight text-[9px] block mb-1">
                                          Freight Cost To AOL
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. 1200"
                                          value={getLogisticsValue(order, "freightCostToAol")}
                                          onChange={(e) => updateLogisticsField(order, "freightCostToAol", e.target.value)}
                                          disabled={!teamCanEdit || savingLogisticsId === order.id}
                                          className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Read-Only Logistics Display */
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
                                  <div className="space-y-1.5 font-mono">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Expected Dispatch Date:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.dispatchDate ? formatDate(order.closedWonDetails.dispatchDate) : "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Dispatch From:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.dispatchLocation || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Warehouse Managed By:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.warehouseManagedBy || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Delivery / Booking Term:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.deliveryTerm || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Cartage / Labour Charges:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.cartageLabourCharges || "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="space-y-1.5 font-mono border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-6">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Transporter Name:</span>
                                      <span className="text-slate-700 font-bold">
                                        {getTransporterDisplayName(order.closedWonDetails?.transporterName)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Vehicle NO.:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.vehicleNo || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Freight Terms:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.freightTerm || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Freight Charged in Bill:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.freightChargedInBill || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">Freight Cost to AOL:</span>
                                      <span className="text-slate-700 font-bold">
                                        {order.closedWonDetails?.freightCostToAol || "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {logisticsSuccessId === order.id && (
                                <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 font-bold font-mono flex items-center gap-1.5 animate-fadeIn">
                                  <Check size={12} /> Logistics & delivery details updated and saved successfully!
                                </div>
                              )}
                            </div>

                            {/* Box 3: Address & Contact Details (Read-Only) */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">3</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Address & Contact Details</span>
                              </div>

                              {/* Single line for Email & Contact */}
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-lg font-mono text-[10px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Email:</span>
                                  <span className="text-slate-700 font-semibold truncate" title={order.email || "N/A"}>{order.email || "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Contact:</span>
                                  <span className="text-slate-700 font-bold">{order.phone || "N/A"}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10.5px]">
                                <div className="space-y-1 font-mono">
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase tracking-tight mb-0.5">
                                    Billing Address: <span className="text-indigo-600 font-bold tracking-normal">({order.billingGstin || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.gst) || (clients?.find(c => c.companyName === order.companyName)?.gst) || "N/A"})</span>
                                  </span>
                                  <p className="text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-2 rounded text-[10px] min-h-[44px]">
                                    {order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "No billing address provided"}
                                  </p>
                                </div>
                                <div className="space-y-1 font-mono">
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase tracking-tight mb-0.5">
                                    Destination Address: <span className="text-indigo-600 font-bold tracking-normal">({order.closedWonDetails?.gstin || order.billingGstin || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.gst) || (clients?.find(c => c.companyName === order.companyName)?.gst) || "N/A"})</span>
                                  </span>
                                  <p className="text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-2 rounded text-[10px] min-h-[44px]">
                                    {order.closedWonDetails?.destinationAddress || "N/A"}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Box 4: Product Details (Read-Only) */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">4</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Product Details</span>
                              </div>
                              <div className="border border-slate-200 rounded-lg overflow-x-auto scrollbar-thin bg-white">
                                <table className="w-full text-left text-[10px] min-w-[360px] sm:min-w-full font-mono">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono font-bold uppercase tracking-tight">
                                      <th className="p-2">Product</th>
                                      <th className="p-2 text-right">Qty</th>
                                      <th className="p-2 text-right">Rate</th>
                                      <th className="p-2 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-600">
                                    {order.items?.map((item, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/50">
                                        <td className="p-2 font-semibold text-slate-800">{item.productName}</td>
                                        <td className="p-2 text-right font-bold">{item.quantity}</td>
                                        <td className="p-2 text-right text-slate-500">₹{item.rate?.toLocaleString()}</td>
                                        <td className="p-2 text-right font-black text-slate-700">₹{item.amount?.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-slate-50/50 font-black border-t border-slate-200">
                                      <td className="p-2 text-slate-700" colSpan={2}>Grand Total</td>
                                      <td className="p-2 text-right text-slate-900 text-xs font-mono" colSpan={2}>
                                        ₹{order.totalValue?.toLocaleString()}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Box 5: Special Instructions / Remarks (Read-Only) */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">5</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Special Instructions / Remarks</span>
                              </div>
                              <p className="text-[10.5px] text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-3 rounded-lg whitespace-pre-wrap">
                                {order.notes || "No special instructions/remarks provided."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Billing Sub-Tab Content */}
      {activeSubTab === "billing" && (
        <div className="space-y-4">

          {/* Orders Listing Grid */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center">
              <Receipt className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Closed Won Orders Found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Only orders marked as "Closed Won" status can have invoice numbers and files mapped.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-[90%] mx-auto space-y-6">
              {filteredOrders.map((order, index) => {
                const isEditing = editingOrderId === order.id;
                const mappedInv = order.billingDetails?.invoiceNumber;
                const mappedInvDate = order.billingDetails?.invoiceDate;
                const fileAttached = order.billingDetails?.invoiceFileUrl || (order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0);
                const mappedActualDispatchDate = order.billingDetails?.actualDispatchDate;
                const hasDetails = mappedInv || fileAttached;
                const isDragging = dragOverOrderId === order.id;
                const localInvVal = invoiceNumbers[order.id] !== undefined ? invoiceNumbers[order.id] : (mappedInv || "");
                const localInvoiceDateVal = invoiceDates[order.id] !== undefined ? invoiceDates[order.id] : (mappedInvDate || "");
                const localActualDispatchDateVal = actualDispatchDates[order.id] !== undefined ? actualDispatchDates[order.id] : (mappedActualDispatchDate || "");
                const isExpanded = !!expandedOrderIds[order.id];

                const currentExistingAttachments = existingAttachments[order.id] !== undefined
                  ? existingAttachments[order.id]
                  : (order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0
                      ? order.billingDetails.invoiceAttachments
                      : (order.billingDetails?.invoiceFileUrl
                          ? [{ name: order.billingDetails.invoiceFileName || `Invoice_${order.billingDetails.invoiceNumber || "Doc"}.pdf`, url: order.billingDetails.invoiceFileUrl }]
                          : []));
                const currentNewFiles = selectedFiles[order.id] || [];
                const totalFilesCount = currentExistingAttachments.length + currentNewFiles.length;

                // Lookup mapped bank details
                const bank = paymentBanks.find((b) => b.id === order.paymentBankId);

                return (
                  <div 
                    key={order.id}
                    className={`bg-white border rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                      isDragging ? "border-emerald-500 bg-emerald-50/10 scale-[1.01]" : "border-slate-200"
                    }`}
                    onDragOver={(e) => handleDragOver(e, order.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, order.id, order)}
                  >
                    <div className="space-y-5">
                      {/* Order Company & Client Info */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
                              <Building2 size={22} />
                            </div>
                            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-slate-900 text-white text-xs sm:text-sm font-mono font-black rounded-lg shrink-0 shadow-2xs">
                                #{index + 1}
                              </span>
                              <span>{order.companyName || "Unspecified Company"}</span>
                            </h2>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-2 pl-10">
                            <span className="text-xs font-normal text-slate-600 flex items-center gap-1.5">
                              <User2 size={13} className="text-slate-400 shrink-0" />
                              <span className="text-slate-400 font-normal">Client:</span>
                              <span className="text-slate-700 font-normal text-xs">{order.clientName}</span>
                            </span>
                            {order.phone && (
                              <span className="text-xs font-normal text-slate-500 flex items-center gap-1 border-l border-slate-200 pl-3">
                                <Phone size={12} className="text-slate-400" /> {order.phone}
                              </span>
                            )}
                            {order.email && (
                              <span className="text-xs font-normal text-slate-500 flex items-center gap-1 border-l border-slate-200 pl-3">
                                <Mail size={12} className="text-slate-400" /> {order.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0 flex flex-col sm:items-end gap-1.5 bg-slate-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                          <span className="text-base sm:text-lg lg:text-xl font-black text-slate-950 block font-mono">
                            ₹{order.totalValue?.toLocaleString()}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 block flex items-center sm:justify-end gap-1 font-semibold">
                            <Calendar size={12} />
                            {order.createdAt ? formatDate(order.createdAt) : ""}
                          </span>
                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                <button
                                  key={attIdx}
                                  type="button"
                                  onClick={() => openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`)}
                                  className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-0.5 px-2 rounded-lg text-[9.5px] font-mono transition-all border border-indigo-200 shadow-2xs cursor-pointer"
                                  title={`View Attached PO: ${att.name}`}
                                >
                                  <FileText size={11} className="text-indigo-600 shrink-0" />
                                  <span>{att.name ? (att.name.length > 18 ? `${att.name.substring(0, 15)}...` : att.name) : `PO ${attIdx + 1}`} ↗</span>
                                </button>
                              ))}
                            </div>
                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                            <button
                              type="button"
                              onClick={() => openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`)}
                              className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2.5 rounded-lg text-[10px] font-mono transition-all border border-indigo-200 shadow-2xs cursor-pointer mt-1"
                              title="View Attached Customer PO Document"
                            >
                              <FileText size={12} className="text-indigo-600 shrink-0" />
                              <span>View Attached PO ↗</span>
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Items & PO overview */}
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-[10px] space-y-1.5 font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Customer PO:</span>
                          <span className="text-slate-700 font-bold">
                            {order.closedWonDetails?.customerPoNumber || "N/A"}
                          </span>
                        </div>
                        {order.closedWonDetails?.poDate && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 font-bold uppercase tracking-tight">PO Date:</span>
                            <span className="text-slate-700 font-bold">
                              {formatDate(order.closedWonDetails.poDate)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Total BOM Items:</span>
                          <span className="text-slate-700 font-bold bg-slate-200 px-1.5 py-0.5 rounded text-[9px]">
                            {order.items?.length || 0} unique items
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-2 border-t border-slate-200/60 pt-1.5 mt-1">
                          <span className="text-slate-400 font-bold uppercase tracking-tight shrink-0">Billing Address:</span>
                          <span className="text-slate-700 font-semibold text-[9.5px] text-right line-clamp-2">
                            {order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5 mt-1.5">
                          <span className="text-slate-400 font-bold uppercase tracking-tight">Attached PO File:</span>
                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-end">
                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                <button
                                  key={attIdx}
                                  type="button"
                                  onClick={() => openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`)}
                                  className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                  title={`Open ${att.name}`}
                                >
                                  <FileText size={11} className="text-indigo-600" /> {order.closedWonDetails!.poAttachments!.length === 1 ? "View Customer PO ↗" : (att.name ? (att.name.length > 15 ? `${att.name.substring(0, 12)}...` : att.name) : `PO ${attIdx + 1} ↗`)}
                                </button>
                              ))}
                            </div>
                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                            <button 
                              type="button"
                              onClick={() => openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`)}
                              className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                              title="Open Customer PO File"
                            >
                              <FileText size={11} className="text-indigo-600" /> View Customer PO ↗
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[9px]">No file attached</span>
                          )}
                        </div>
                      </div>

                      {/* Expanding Toggle for Billing Office details */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedOrderIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                          className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50/45 hover:bg-indigo-50 border border-indigo-100/65 rounded-xl text-[10px] font-bold text-indigo-700 transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider">
                            <ListOrdered size={12} className="text-indigo-600" />
                            {isExpanded ? "Hide Details for Billing" : "Show Details for Billing"}
                          </span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 space-y-4 text-[11px] animate-fadeIn">
                            
                            {/* Box 1: Customer PO & Terms */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">1</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Customer PO & Terms</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
                                <div className="space-y-1.5 font-mono">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Customer PO:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.customerPoNumber || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">PO Date:</span>
                                    <span className="text-slate-700 font-bold">
                                      {order.closedWonDetails?.poDate ? formatDate(order.closedWonDetails.poDate) : "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Total Items:</span>
                                    <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[9.5px]">
                                      {order.items?.length || 0} unique items
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 font-mono border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-6">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Salesperson Name:</span>
                                    <span className="text-slate-700 font-bold">
                                      {users.find(u => u.id === order.assignedToUserId)?.name || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Payment Terms:</span>
                                    <span className="text-slate-700 font-bold">{order.payment || "N/A"}</span>
                                  </div>
                                  {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                                    <div className="flex flex-col gap-1 pt-1 border-t border-slate-100/50">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">PO Document(s):</span>
                                      <div className="flex flex-wrap gap-1">
                                        {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                          <a 
                                            key={attIdx}
                                            href="#"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails!.customerPoNumber || "document"}_${attIdx + 1}.pdf`);
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 font-black underline flex items-center gap-1 text-[9.5px]"
                                          >
                                            <FileText size={10} /> {att.name || `PO ${attIdx + 1}`} ↗
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  ) : order.closedWonDetails?.poAttachmentUrl ? (
                                    <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
                                      <span className="text-slate-400 font-bold uppercase tracking-tight">PO Document:</span>
                                      <a 
                                        href="#"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          openOrDownloadDocument(order.closedWonDetails.poAttachmentUrl, `PO_${order.closedWonDetails.customerPoNumber || "document"}.pdf`);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800 font-black underline flex items-center gap-1 text-[9.5px]"
                                      >
                                        <FileText size={10} /> View Customer PO ↗
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              {bank && (
                                <div className="mt-2.5 p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100/60 text-[9.5px] font-mono grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-indigo-900 font-black uppercase block text-[8px] tracking-wider mb-0.5">Deposit Bank Account</span>
                                    <span className="text-slate-800 font-extrabold">{bank.bankName} ({bank.branch})</span>
                                  </div>
                                  <div className="sm:text-right">
                                    <span className="text-slate-400 font-black uppercase block text-[8px] tracking-wider mb-0.5">A/C & IFSC</span>
                                    <span className="text-slate-800 font-bold">No. {bank.accountNumber} | IFSC: {bank.ifscCode}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Box 2: Logistics Details */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">2</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Logistics Details</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
                                <div className="space-y-1.5 font-mono">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Expected Dispatch Date:</span>
                                    <span className="text-slate-700 font-bold">
                                      {order.closedWonDetails?.dispatchDate ? formatDate(order.closedWonDetails.dispatchDate) : "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Dispatch From:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.dispatchLocation || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Warehouse Managed:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.warehouseManagedBy || "N/A"}</span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 font-mono border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-6">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Transporter Name:</span>
                                    <span className="text-slate-700 font-bold">{getTransporterDisplayName(order.closedWonDetails?.transporterName)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Vehicle NO.:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.vehicleNo || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Freight Terms:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightTerm || "N/A"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Box 3: Address & Contact Details */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">3</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Address & Contact Details</span>
                              </div>

                              {/* Single line for Email & Contact */}
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-lg font-mono text-[10px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Email:</span>
                                  <span className="text-slate-700 font-semibold truncate" title={order.email || "N/A"}>{order.email || "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Contact:</span>
                                  <span className="text-slate-700 font-bold">{order.phone || "N/A"}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10.5px]">
                                <div className="space-y-1 font-mono">
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase tracking-tight mb-0.5">
                                    Billing Address: <span className="text-indigo-600 font-bold tracking-normal">({order.billingGstin || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.gst) || (clients?.find(c => c.companyName === order.companyName)?.gst) || "N/A"})</span>
                                  </span>
                                  <p className="text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-2 rounded text-[10px] min-h-[44px]">
                                    {order.billingAddress || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.address) || (clients?.find(c => c.companyName === order.companyName)?.address) || "No billing address provided"}
                                  </p>
                                </div>
                                <div className="space-y-1 font-mono">
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase tracking-tight mb-0.5">
                                    Destination Address: <span className="text-indigo-600 font-bold tracking-normal">({order.closedWonDetails?.gstin || order.billingGstin || (clients?.find(c => c.companyName === order.companyName && c.fullName === order.clientName)?.gst) || (clients?.find(c => c.companyName === order.companyName)?.gst) || "N/A"})</span>
                                  </span>
                                  <p className="text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-2 rounded text-[10px] min-h-[44px]">
                                    {order.closedWonDetails?.destinationAddress || "N/A"}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Box 4: Product Details (Option to EDIT) */}
                            <div className={`rounded-xl p-4 relative space-y-3 shadow-sm border transition-all ${
                              editingProductOrderId === order.id 
                                ? "bg-emerald-50/20 border-2 border-emerald-300" 
                                : "bg-white border-slate-200"
                            }`}>
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">4</span>
                                  <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Product Details</span>
                                  {editingProductOrderId === order.id && (
                                    <span className="bg-emerald-100 text-emerald-800 font-mono font-bold text-[8.5px] px-1.5 py-0.5 rounded uppercase">Editing</span>
                                  )}
                                </div>
                                {teamCanEdit && (
                                  <div>
                                    {editingProductOrderId === order.id ? (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => cancelEditingProducts(order.id)}
                                          className="text-[9.5px] font-bold text-slate-600 hover:text-slate-800 font-mono uppercase px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={savingProductId === order.id}
                                          onClick={() => handleSaveProductDetails(order)}
                                          className="text-[9.5px] font-bold text-white font-mono uppercase px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                          {savingProductId === order.id ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                          Save Products
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => startEditingProducts(order)}
                                        className="text-[9.5px] font-bold text-indigo-700 hover:text-indigo-900 font-mono uppercase flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all cursor-pointer border border-indigo-200"
                                      >
                                        <Edit3 size={11} />
                                        Edit Product Details
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {editingProductOrderId === order.id ? (
                                /* Editable Products Table (Quantity & Rate Only) */
                                <div className="space-y-3 animate-fadeIn">
                                  <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                                    <table className="w-full text-left text-[10px] min-w-[380px] font-mono">
                                      <thead>
                                        <tr className="bg-slate-100/70 text-slate-600 border-b border-slate-200 font-mono font-bold uppercase tracking-tight">
                                          <th className="p-2">Product Name</th>
                                          <th className="p-2 text-right w-28">Qty (Edit)</th>
                                          <th className="p-2 text-right w-32">Rate (₹) (Edit)</th>
                                          <th className="p-2 text-right w-28">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {(productItemsForm[order.id] || []).map((item, idx) => (
                                          <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-2 font-bold text-slate-800">
                                              <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                <span className="truncate max-w-[200px]">{item.productName || "Unnamed Item"}</span>
                                              </div>
                                            </td>
                                            <td className="p-2 text-right">
                                              <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={item.quantity}
                                                onChange={(e) => updateProductItemField(order.id, idx, "quantity", e.target.value)}
                                                className="w-full text-right text-xs text-slate-900 bg-slate-50/80 border border-slate-300 rounded px-2 py-1 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-bold"
                                              />
                                            </td>
                                            <td className="p-2 text-right">
                                              <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={item.rate}
                                                onChange={(e) => updateProductItemField(order.id, idx, "rate", e.target.value)}
                                                className="w-full text-right text-xs text-slate-900 bg-slate-50/80 border border-slate-300 rounded px-2 py-1 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                                              />
                                            </td>
                                            <td className="p-2 text-right font-black text-slate-900 text-xs">
                                              ₹{((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toLocaleString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div className="flex items-center justify-between font-mono pt-1 text-[10px]">
                                    <span className="text-slate-500 italic">
                                      * Only Quantity & Rate can be modified during billing.
                                    </span>
                                    <div className="text-[12px] font-black text-slate-900 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                                      Computed Total: ₹{(productItemsForm[order.id] || []).reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.rate) || 0)), 0).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Read-Only Products Table */
                                <div>
                                  <div className="border border-slate-200 rounded-lg overflow-x-auto scrollbar-thin bg-white">
                                    <table className="w-full text-left text-[10px] min-w-[360px] sm:min-w-full font-mono">
                                      <thead>
                                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono font-bold uppercase tracking-tight">
                                          <th className="p-2">Product</th>
                                          <th className="p-2 text-right">Qty</th>
                                          <th className="p-2 text-right">Rate</th>
                                          <th className="p-2 text-right">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-600">
                                        {order.items?.map((item, idx) => (
                                          <tr key={idx} className="hover:bg-slate-50/50">
                                            <td className="p-2 font-semibold text-slate-800">{item.productName}</td>
                                            <td className="p-2 text-right font-bold">{item.quantity}</td>
                                            <td className="p-2 text-right text-slate-500">₹{item.rate?.toLocaleString()}</td>
                                            <td className="p-2 text-right font-black text-slate-700">₹{item.amount?.toLocaleString()}</td>
                                          </tr>
                                        ))}
                                        <tr className="bg-slate-50/50 font-black border-t border-slate-200">
                                          <td className="p-2 text-slate-700" colSpan={2}>Grand Total</td>
                                          <td className="p-2 text-right text-slate-900 text-xs font-mono" colSpan={2}>
                                            ₹{order.totalValue?.toLocaleString()}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                  {productSuccessId === order.id && (
                                    <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 font-bold font-mono flex items-center gap-1.5 mt-2 animate-fadeIn">
                                      <Check size={12} /> Product details updated and order total recalculation saved!
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Box 5: Delivery Terms */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">5</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Delivery Terms</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
                                <div className="space-y-1.5 font-mono">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Delivery Terms:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.deliveryTerm || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Cartage / Labour:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.cartageLabourCharges || "N/A"}</span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 font-mono border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-6">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Charged in Bill:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightChargedInBill || "N/A"}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase tracking-tight">Cost to AOL:</span>
                                    <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightCostToAol || "N/A"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Box 6: Special Instructions / Remarks */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 relative space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold font-mono shrink-0">6</span>
                                <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider">Special Instructions / Remarks</span>
                              </div>
                              <p className="text-[10.5px] text-slate-700 font-semibold leading-relaxed bg-slate-50 border border-slate-150 p-3 rounded-lg whitespace-pre-wrap">
                                {order.notes || "No special instructions/remarks provided."}
                              </p>
                            </div>

                          </div>
                        )}
                      </div>

                      {/* Current Status Badge or Information */}
                      {hasDetails && !isEditing ? (
                        <div className="bg-emerald-50/50 border border-emerald-150 rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="bg-emerald-100 text-emerald-800 p-1 rounded-lg">
                                  <Check size={12} className="stroke-[3]" />
                                </span>
                                <div>
                                  <p className="text-[9px] text-emerald-600 font-mono font-bold uppercase tracking-wider">Mapped Invoice</p>
                                  <p className="text-xs font-extrabold text-slate-800 font-mono">{mappedInv}</p>
                                </div>
                              </div>

                              {mappedInvDate && (
                                <div className="flex items-center gap-2">
                                  <span className="bg-indigo-100 text-indigo-800 p-1 rounded-lg">
                                    <Calendar size={12} className="stroke-[3]" />
                                  </span>
                                  <div>
                                    <p className="text-[9px] text-indigo-700 font-mono font-bold uppercase tracking-wider">Invoice Date</p>
                                    <p className="text-xs font-extrabold text-slate-800 font-mono">{formatDate(mappedInvDate)}</p>
                                  </div>
                                </div>
                              )}

                              {mappedActualDispatchDate && (
                                <div className="flex items-center gap-2">
                                  <span className="bg-teal-100 text-teal-850 p-1 rounded-lg">
                                    <Calendar size={12} className="stroke-[3]" />
                                  </span>
                                  <div>
                                    <p className="text-[9px] text-teal-700 font-mono font-bold uppercase tracking-wider">Actual Dispatch Date</p>
                                    <p className="text-xs font-extrabold text-slate-800 font-mono">{formatDate(mappedActualDispatchDate)}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <button
                              onClick={() => {
                                setEditingOrderId(order.id);
                                if (invoiceNumbers[order.id] === undefined) {
                                  setInvoiceNumbers(prev => ({ ...prev, [order.id]: mappedInv || "" }));
                                }
                                if (actualDispatchDates[order.id] === undefined) {
                                  setActualDispatchDates(prev => ({ ...prev, [order.id]: mappedActualDispatchDate || "" }));
                                }
                                if (invoiceDates[order.id] === undefined) {
                                  setInvoiceDates(prev => ({ ...prev, [order.id]: mappedInvDate || "" }));
                                }
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 font-mono uppercase cursor-pointer underline decoration-dotted"
                            >
                              Update
                            </button>
                          </div>

                          {fileAttached ? (
                            <div className="border-t border-emerald-100/55 pt-2 mt-1 space-y-1.5">
                              {order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono">
                                      Attached Invoice Files ({order.billingDetails.invoiceAttachments.length})
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {order.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                      <a
                                        key={attIdx}
                                        href="#"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          openOrDownloadDocument(att.url, att.name || `Invoice_${order.billingDetails?.invoiceNumber || "document"}_${attIdx + 1}.pdf`);
                                        }}
                                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-emerald-200 text-emerald-700 font-bold py-1 px-2.5 rounded-lg text-[9px] font-mono transition-all shrink-0 shadow-2xs"
                                        title={`View Invoice: ${att.name}`}
                                      >
                                        <FileText size={11} className="text-emerald-600 shrink-0" />
                                        <span className="truncate max-w-[180px]">{att.name || `Invoice ${attIdx + 1}`}</span>
                                        <span className="text-emerald-500 text-[8px]">↗</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1.5 max-w-xs">
                                    <FileText size={11} className="text-emerald-600 shrink-0" />
                                    <span className="truncate">{order.billingDetails?.invoiceFileName || "invoice_document.pdf"}</span>
                                  </span>
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openOrDownloadDocument(order.billingDetails?.invoiceFileUrl, order.billingDetails?.invoiceFileName || "invoice_document.pdf");
                                    }}
                                    className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 border border-emerald-200 text-emerald-700 font-bold py-1 px-2.5 rounded-lg text-[9px] font-mono transition-all shrink-0"
                                  >
                                    View Invoice ↗
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 italic">No document file uploaded</p>
                          )}
                        </div>
                      ) : (
                        // Form Block
                        <div className="space-y-3 pt-1 border-t border-slate-100 pt-3.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block uppercase font-mono tracking-tight">
                                Invoice Number *
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. INV-2026-001"
                                value={localInvVal}
                                onChange={(e) => setInvoiceNumbers(prev => ({ ...prev, [order.id]: e.target.value }))}
                                disabled={uploadProgress[order.id]}
                                className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono font-semibold"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block uppercase font-mono tracking-tight">
                                Invoice Date
                              </label>
                              <input
                                type="date"
                                value={localInvoiceDateVal}
                                onChange={(e) => setInvoiceDates(prev => ({ ...prev, [order.id]: e.target.value }))}
                                disabled={uploadProgress[order.id]}
                                className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono font-semibold"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block uppercase font-mono tracking-tight">
                              Actual Dispatch Date
                            </label>
                            <input
                              type="date"
                              value={localActualDispatchDateVal}
                              onChange={(e) => setActualDispatchDates(prev => ({ ...prev, [order.id]: e.target.value }))}
                              disabled={uploadProgress[order.id]}
                              className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono font-semibold"
                            />
                          </div>

                          {/* Upload Field - Multi File Support up to 10 files */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 block uppercase font-mono tracking-tight">
                                Invoice File(s) (Google Drive)
                              </label>
                              <span className="text-[9px] font-mono text-slate-400 font-semibold">
                                {totalFilesCount}/10 files attached
                              </span>
                            </div>

                            {/* List of existing attachments */}
                            {currentExistingAttachments.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[8.5px] font-mono text-slate-400 font-bold uppercase block">
                                  Saved Files:
                                </span>
                                <div className="space-y-1">
                                  {currentExistingAttachments.map((att, attIdx) => (
                                    <div 
                                      key={`existing-${attIdx}`}
                                      className="flex items-center justify-between border border-slate-200 bg-slate-50 p-2 rounded-xl text-[10px]"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FileText className="text-emerald-600 h-3.5 w-3.5 shrink-0" />
                                        <span className="font-medium text-slate-700 truncate">
                                          {att.name || `Invoice_${order.billingDetails?.invoiceNumber || "Doc"}_${attIdx + 1}.pdf`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openOrDownloadDocument(att.url, att.name || `Invoice_${order.billingDetails?.invoiceNumber || "Doc"}_${attIdx + 1}.pdf`)}
                                          className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 underline font-mono cursor-pointer"
                                        >
                                          View ↗
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeExistingAttachment(order.id, attIdx, order)}
                                          disabled={uploadProgress[order.id]}
                                          className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1 cursor-pointer"
                                          title="Remove attachment"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* List of newly selected files */}
                            {currentNewFiles.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[8.5px] font-mono text-emerald-600 font-bold uppercase block">
                                  New Files To Upload ({currentNewFiles.length}):
                                </span>
                                <div className="space-y-1">
                                  {currentNewFiles.map((file, fileIdx) => (
                                    <div 
                                      key={`new-${fileIdx}`}
                                      className="flex items-center justify-between border border-emerald-200 bg-emerald-50/20 p-2 rounded-xl text-[10px]"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FileText className="text-emerald-600 h-3.5 w-3.5 shrink-0" />
                                        <span className="font-medium text-slate-800 truncate">
                                          {file.name}
                                        </span>
                                        <span className="text-[8px] text-slate-400 font-mono shrink-0">
                                          ({(file.size / 1024).toFixed(1)} KB)
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeSelectedNewFile(order.id, fileIdx)}
                                        disabled={uploadProgress[order.id]}
                                        className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1 cursor-pointer shrink-0"
                                        title="Remove file"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Upload Drop Zone if less than 10 files */}
                            {totalFilesCount < 10 && (
                              <div
                                onDragOver={(e) => handleDragOver(e, order.id)}
                                className={`border border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all ${
                                  isDragging ? "border-emerald-500 bg-emerald-50/10" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                                }`}
                                onClick={() => document.getElementById(`file-upload-${order.id}`)?.click()}
                              >
                                <input
                                  type="file"
                                  id={`file-upload-${order.id}`}
                                  className="hidden"
                                  accept=".pdf"
                                  multiple
                                  onChange={(e) => handleFileChange(e, order.id, order)}
                                  disabled={uploadProgress[order.id]}
                                />
                                <Upload className="mx-auto h-4 w-4 text-slate-400 mb-1" />
                                <p className="text-[10px] font-bold text-slate-600">
                                  Drag & Drop or Click to Attach PDF Invoices
                                </p>
                                <p className="text-[8.5px] text-slate-400 mt-0.5">
                                  PDF files only · Upload up to 10 invoice files ({10 - totalFilesCount} slots available)
                                </p>
                              </div>
                            )}
                          </div>

                            {/* Action triggers */}
                            <div className="space-y-3 pt-2 border-t border-slate-100 mt-2">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        checked={sendEmails[order.id] || false}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setSendEmails(prev => ({ ...prev, [order.id]: checked }));
                                            if (checked && autoSelectSettings.indentAutoSelect && !selectedTemplates[order.id]) {
                                                const defaultTemplate = emailTemplates.find(t => t.isDefault && (t.assignedForm === "invoice_issuance" || t.assignedForm === "any" || !t.assignedForm));
                                                if (defaultTemplate) {
                                                    setSelectedTemplates(prev => ({ ...prev, [order.id]: defaultTemplate.id }));
                                                }
                                            }
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label className="text-[10px] font-bold text-slate-700 uppercase font-mono">Send Email Invoice?</label>
                                </div>
                                {sendEmails[order.id] && (
                                    <select
                                        value={selectedTemplates[order.id] || ""}
                                        onChange={(e) => setSelectedTemplates(prev => ({ ...prev, [order.id]: e.target.value }))}
                                        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                                    >
                                        <option value="">
                                            {emailTemplates.some(tmpl => tmpl.isDefault && (tmpl.assignedForm === "invoice_issuance" || tmpl.assignedForm === "any" || !tmpl.assignedForm)) ? "Default Template" : "Select Template"}
                                        </option>
                                        {emailTemplates.filter(tmpl => tmpl.assignedForm === "invoice_issuance" || tmpl.assignedForm === "any" || !tmpl.assignedForm).map(tmpl => (
                                            <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingOrderId(null);
                                    setInvoiceNumbers(prev => {
                                      const copy = { ...prev };
                                      delete copy[order.id];
                                      return copy;
                                    });
                                    setActualDispatchDates(prev => {
                                      const copy = { ...prev };
                                      delete copy[order.id];
                                      return copy;
                                    });
                                    setSelectedFiles(prev => ({ ...prev, [order.id]: [] }));
                                    setExistingAttachments(prev => {
                                      const copy = { ...prev };
                                      delete copy[order.id];
                                      return copy;
                                    });
                                  }}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-1.5 px-3 rounded-lg text-[10px] transition-all cursor-pointer font-mono"
                                >
                                  Cancel
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleMapInvoice(order)}
                                disabled={uploadProgress[order.id] || !teamCanEdit}
                                className={`font-bold py-1.5 px-4 rounded-lg text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-xs font-mono font-extrabold ${
                                  !teamCanEdit
                                    ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                }`}
                                title={!teamCanEdit ? "Your team does not have edit permission." : undefined}
                              >
                                {uploadProgress[order.id] ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{uploadProgressText[order.id] || "Saving..."}</span>
                                  </>
                                ) : (
                                  <>
                                    <FileCheck className="h-3 w-3" />
                                    <span>{isEditing ? "Save Invoice Update" : "Map Invoice"}</span>
                                  </>
                                )}
                              </button>
                            </div>
                        </div>
                      )}
                    </div>

                    {/* Form Notifications */}
                    <div className="mt-2 text-center">
                      {orderErrors[order.id] && (
                        <p className="text-[9px] text-rose-500 font-semibold flex items-center justify-center gap-1">
                          <AlertCircle size={10} /> {orderErrors[order.id]}
                        </p>
                      )}
                      {orderSuccess[order.id] && (
                        <p className="text-[9px] text-emerald-600 font-bold flex items-center justify-center gap-1 animate-pulse">
                          <Check size={10} /> Mapped successfully to Google Drive & Firestore!
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Invoice Attached Sub-Tab Content */}
      {activeSubTab === "invoice_attached" && (
        <div className="space-y-4 animate-fadeIn" id="invoice-attached-subtab">
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/85 rounded-2xl p-12 text-center" id="no-mapped-invoices">
              <Receipt className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No Mapped Invoices Found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                No orders match your search criteria or no invoices have been mapped yet.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/85 rounded-2xl shadow-sm overflow-hidden" id="mapped-invoices-table-container">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse" id="mapped-invoices-table">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-4 text-center w-12"></th>
                      <th className="p-4">Company / Client</th>
                      <th className="p-4">Customer PO</th>
                      <th className="p-4 text-right">PO Amount</th>
                      <th className="p-4">Invoice Number</th>
                      <th className="p-4">Invoice Document</th>
                      <th className="p-4">Email Sent Status</th>
                      <th className="p-4 text-center">Date Mapped</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {filteredOrders.map((order) => {
                      const isExpanded = !!expandedOrderIds[order.id];
                      const bank = paymentBanks.find((b) => b.id === order.paymentBankId);

                      return (
                        <React.Fragment key={order.id}>
                          <tr className={`hover:bg-slate-50/55 transition-colors ${isExpanded ? "bg-indigo-50/15" : ""}`} id={`mapped-row-${order.id}`}>
                            <td className="p-4 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedOrderIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                                title={isExpanded ? "Hide Details" : "Show Details"}
                                id={`expand-row-btn-${order.id}`}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-black text-slate-900 leading-tight">{order.companyName || "N/A"}</div>
                              <div className="text-[10.5px] text-slate-500 font-semibold mt-0.5">{order.clientName}</div>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-700">
                              <div>{order.closedWonDetails?.customerPoNumber || "N/A"}</div>
                              {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                    <button
                                      key={attIdx}
                                      type="button"
                                      onClick={() => {
                                        openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`);
                                      }}
                                      className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-0.5 px-1.5 rounded-lg text-[9px] font-mono transition-all border border-indigo-200 shadow-2xs cursor-pointer"
                                      title={att.name || `PO Document ${attIdx + 1}`}
                                    >
                                      <FileText size={10} className="text-indigo-600" />
                                      <span>{order.closedWonDetails!.poAttachments!.length === 1 ? "View PO ↗" : `PO ${attIdx + 1} ↗`}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : order.closedWonDetails?.poAttachmentUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`);
                                  }}
                                  className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2 rounded-lg text-[9.5px] font-mono transition-all border border-indigo-200 shadow-2xs mt-1 cursor-pointer"
                                  id={`view-po-${order.id}`}
                                  title="View / Download Customer PO Document"
                                >
                                  <FileText size={11} className="text-indigo-600" />
                                  <span>View PO ↗</span>
                                </button>
                              ) : (
                                <span className="text-[9px] text-slate-400 font-normal italic block mt-0.5">No PO file</span>
                              )}
                            </td>
                            <td className="p-4 text-right font-mono font-extrabold text-slate-800">
                              ₹{order.totalValue?.toLocaleString()}
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] px-2.5 py-1 rounded-lg border border-emerald-150">
                                <Check size={11} className="stroke-[3]" />
                                {order.billingDetails?.invoiceNumber}
                              </span>
                            </td>
                            <td className="p-4">
                              {order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  {order.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                    <a
                                      key={attIdx}
                                      href="#"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOrDownloadDocument(att.url, att.name || `Invoice_${order.billingDetails?.invoiceNumber || "doc"}_${attIdx + 1}.pdf`);
                                      }}
                                      className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2 rounded-lg text-[9.5px] font-mono transition-all border border-indigo-200 shadow-2xs"
                                      title={att.name || `Invoice Doc ${attIdx + 1}`}
                                    >
                                      <FileText size={10} className="text-indigo-600 shrink-0" />
                                      <span className="truncate max-w-[110px]">
                                        {order.billingDetails!.invoiceAttachments!.length === 1 ? (att.name || "Invoice.pdf") : (att.name || `Inv ${attIdx + 1}`)}
                                      </span>
                                      <ExternalLink size={9} className="text-indigo-500 shrink-0" />
                                    </a>
                                  ))}
                                </div>
                              ) : order.billingDetails?.invoiceFileUrl ? (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOrDownloadDocument(order.billingDetails!.invoiceFileUrl!, order.billingDetails!.invoiceFileName || "invoice.pdf");
                                  }}
                                  className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1 px-2.5 rounded-lg text-[10px] font-mono transition-all border border-indigo-100"
                                  id={`view-invoice-${order.id}`}
                                >
                                  <FileText size={11} />
                                  <span className="truncate max-w-[120px] inline-block align-bottom">
                                    {order.billingDetails.invoiceFileName || "invoice.pdf"}
                                  </span>
                                  <ExternalLink size={10} />
                                </a>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">No file attached</span>
                              )}
                            </td>
                            <td className="p-4 min-w-[200px]">
                              <EmailSentStatusCell
                                statusSummary={getEffectiveInvoiceStatus(order)}
                                onResend={() => handleResendInvoiceEmail(order)}
                                isResending={resendingInvoiceOrderId === order.id}
                                canResend={true}
                                tableType="invoice"
                              />
                            </td>
                            <td className="p-4 text-center font-mono text-[10px] text-slate-400">
                              {order.billingDetails?.mappedAt
                                ? formatDate(order.billingDetails.mappedAt)
                                : "N/A"}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  // Open confirmation modal
                                  setConfirmEditOrder(order);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 font-mono uppercase bg-indigo-50 hover:bg-indigo-100/70 px-2.5 py-1.5 rounded-lg transition-all border border-indigo-100/40 cursor-pointer"
                                id={`update-invoice-btn-${order.id}`}
                              >
                                Update
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/50" id={`details-row-${order.id}`}>
                              <td colSpan={8} className="p-5 border-b border-slate-200">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-[11px] animate-fadeIn">
                                  {/* Column 1: Client & Bank Info */}
                                  <div className="space-y-4">
                                    {/* Contact Details */}
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2.5 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <User2 size={10} className="text-slate-400" />
                                        Client Contact Details
                                      </p>
                                      <div className="space-y-2">
                                        <div>
                                          <span className="text-[8px] font-mono text-slate-400 uppercase font-bold block">Email</span>
                                          <span className="text-slate-700 font-medium break-all flex items-center gap-1">
                                            <Mail size={10} className="text-slate-400 shrink-0" />
                                            {order.email || "N/A"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[8px] font-mono text-slate-400 uppercase font-bold block">Phone</span>
                                          <span className="text-slate-700 font-semibold flex items-center gap-1">
                                            <Phone size={10} className="text-slate-400 shrink-0" />
                                            {order.phone || "N/A"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Delivery & Destination Address */}
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <MapPin size={10} className="text-slate-400" />
                                        Delivery & Destination
                                      </p>
                                      <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px]">
                                          <span className="text-slate-400 font-bold uppercase font-mono text-[8px]">Delivery Term:</span>
                                          <span className="text-slate-700 font-semibold">{order.closedWonDetails?.deliveryTerm || "N/A"}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 font-bold block uppercase font-mono text-[8px] mb-0.5">Destination Address:</span>
                                          <span className="text-slate-700 block bg-slate-50 p-2 rounded border border-slate-100 leading-normal text-[9.5px]">
                                            {order.closedWonDetails?.destinationAddress || "N/A"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Bank Details */}
                                    <div className="bg-indigo-50/40 p-4 border border-indigo-100 rounded-xl space-y-2 shadow-xs">
                                      <p className="text-[9px] font-mono text-indigo-500 uppercase font-bold border-b border-indigo-150 pb-1 flex items-center gap-1">
                                        <CreditCard size={10} className="text-indigo-400" />
                                        Mapped Deposit Bank
                                      </p>
                                      {bank ? (
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                          <div>
                                            <span className="text-slate-400 block text-[8px] font-mono uppercase">Bank Name</span>
                                            <span className="text-indigo-950 font-extrabold">{bank.bankName}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[8px] font-mono uppercase">Branch</span>
                                            <span className="text-slate-700 font-medium">{bank.branch}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[8px] font-mono uppercase">Account No</span>
                                            <span className="text-indigo-950 font-bold font-mono">{bank.accountNumber}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[8px] font-mono uppercase">IFSC Code</span>
                                            <span className="text-indigo-950 font-bold font-mono">{bank.ifscCode}</span>
                                          </div>
                                          <div className="col-span-2">
                                            <span className="text-slate-400 block text-[8px] font-mono uppercase">Beneficiary Name</span>
                                            <span className="text-slate-700 font-medium">{bank.accountHolderName}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 italic text-[10px] block">No bank account mapped.</span>
                                      )}
                                      <div className="text-[10px] pt-1 border-t border-indigo-100/50">
                                        <span className="text-slate-400 block text-[8px] font-mono uppercase">Payment Terms:</span>
                                        <span className="text-slate-700 font-medium">{order.payment || "N/A"}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Column 2: PO & Logistics */}
                                  <div className="space-y-4">
                                    {/* Customer PO Details */}
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <FileText size={10} className="text-slate-400" />
                                        Customer PO Specifications
                                      </p>
                                      <div className="space-y-1.5 font-mono text-[10px]">
                                        <div className="flex justify-between items-center">
                                          <span className="text-slate-400 font-bold uppercase tracking-tight">Customer PO:</span>
                                          <span className="text-slate-700 font-bold">{order.closedWonDetails?.customerPoNumber || "N/A"}</span>
                                        </div>
                                        {order.closedWonDetails?.poDate && (
                                          <div className="flex justify-between items-center">
                                            <span className="text-slate-400 font-bold uppercase tracking-tight">PO Date:</span>
                                            <span className="text-slate-700 font-bold">
                                              {formatDate(order.closedWonDetails.poDate)}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                          <span className="text-slate-400 font-bold uppercase tracking-tight">Total BOM Items:</span>
                                          <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">
                                            {order.items?.length || 0} unique items
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-100 pt-1.5 mt-1">
                                          <span className="text-slate-400 font-bold uppercase tracking-tight">Attached PO File:</span>
                                          {order.closedWonDetails?.poAttachments && order.closedWonDetails.poAttachments.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 justify-end">
                                              {order.closedWonDetails.poAttachments.map((att, attIdx) => (
                                                <button
                                                  key={attIdx}
                                                  type="button"
                                                  onClick={() => {
                                                    openOrDownloadDocument(att.url, att.name || `PO_${order.closedWonDetails?.customerPoNumber || "document"}_${attIdx + 1}.pdf`);
                                                  }}
                                                  className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                                  title={`Open ${att.name}`}
                                                >
                                                  <FileText size={10} className="text-indigo-600" />
                                                  {order.closedWonDetails!.poAttachments!.length === 1 ? "View Customer PO ↗" : (att.name ? (att.name.length > 15 ? `${att.name.substring(0, 12)}...` : att.name) : `PO ${attIdx + 1} ↗`)}
                                                </button>
                                              ))}
                                            </div>
                                          ) : order.closedWonDetails?.poAttachmentUrl ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                openOrDownloadDocument(order.closedWonDetails!.poAttachmentUrl!, `PO_${order.closedWonDetails?.customerPoNumber || "document"}.pdf`);
                                              }}
                                              className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                              title="Open / Download Customer PO Document"
                                            >
                                              <FileText size={11} className="text-indigo-600" /> View Customer PO ↗
                                            </button>
                                          ) : (
                                            <span className="text-slate-400 italic text-[9.5px]">No file attached</span>
                                          )}
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-100 pt-1.5 mt-1">
                                          <span className="text-slate-400 font-bold uppercase tracking-tight">Attached Invoice(s):</span>
                                          {order.billingDetails?.invoiceAttachments && order.billingDetails.invoiceAttachments.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 justify-end">
                                              {order.billingDetails.invoiceAttachments.map((att, attIdx) => (
                                                <button
                                                  key={attIdx}
                                                  type="button"
                                                  onClick={() => {
                                                    openOrDownloadDocument(att.url, att.name || `Invoice_${order.billingDetails?.invoiceNumber || "doc"}_${attIdx + 1}.pdf`);
                                                  }}
                                                  className="text-emerald-700 hover:text-emerald-900 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                                  title={`Open ${att.name}`}
                                                >
                                                  <FileText size={10} className="text-emerald-600" />
                                                  {order.billingDetails!.invoiceAttachments!.length === 1 ? "View Invoice PDF ↗" : (att.name ? (att.name.length > 15 ? `${att.name.substring(0, 12)}...` : att.name) : `Invoice ${attIdx + 1} ↗`)}
                                                </button>
                                              ))}
                                            </div>
                                          ) : order.billingDetails?.invoiceFileUrl ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                openOrDownloadDocument(order.billingDetails!.invoiceFileUrl!, order.billingDetails!.invoiceFileName || `Invoice_${order.billingDetails!.invoiceNumber}.pdf`);
                                              }}
                                              className="text-emerald-700 hover:text-emerald-900 font-bold underline flex items-center gap-1 text-[9.5px] cursor-pointer"
                                              title="Open Invoice PDF"
                                            >
                                              <FileText size={11} className="text-emerald-600" /> View Invoice PDF ↗
                                            </button>
                                          ) : (
                                            <span className="text-slate-400 italic text-[9.5px]">No invoice attached</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Logistics & Dispatch Specifications */}
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2.5 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <Truck size={10} className="text-slate-400" />
                                        Logistics & Dispatch Details
                                      </p>
                                      <div className="grid grid-cols-2 gap-2.5 text-[10px]">
                                        <div>
                                          <span className="text-slate-400 font-bold block text-[8px] uppercase font-mono">Expected Dispatch Date</span>
                                          <span className="text-slate-700 font-medium">
                                            {order.closedWonDetails?.dispatchDate ? formatDate(order.closedWonDetails.dispatchDate) : "N/A"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 font-bold block text-[8px] uppercase font-mono">Dispatch From</span>
                                          <span className="text-slate-700 font-medium">
                                            {order.closedWonDetails?.dispatchLocation || "N/A"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 font-bold block text-[8px] uppercase font-mono">Transporter Name</span>
                                          <span className="text-slate-700 font-medium">
                                            {getTransporterDisplayName(order.closedWonDetails?.transporterName)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 font-bold block text-[8px] uppercase font-mono">Warehouse Mgr</span>
                                          <span className="text-slate-700 font-medium">
                                            {order.closedWonDetails?.warehouseManagedBy || "N/A"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Freight Specifications */}
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <IndianRupee size={10} className="text-slate-400" />
                                        Freight Terms & Surcharges
                                      </p>
                                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                        <div className="flex justify-between pr-2 border-r border-slate-100">
                                          <span className="text-slate-400">Freight Term:</span>
                                          <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightTerm || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between pl-1">
                                          <span className="text-slate-400">Charged in Bill:</span>
                                          <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightChargedInBill || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between pr-2 border-r border-slate-100">
                                          <span className="text-slate-400">Cost to AOL:</span>
                                          <span className="text-slate-700 font-bold">{order.closedWonDetails?.freightCostToAol || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between pl-1">
                                          <span className="text-slate-400">Cartage/Labour:</span>
                                          <span className="text-slate-700 font-bold">{order.closedWonDetails?.cartageLabourCharges || "N/A"}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Column 3: Invoice Itemization (BOM) */}
                                  <div className="space-y-4">
                                    <div className="bg-white p-4 border border-slate-200/75 rounded-xl space-y-2 shadow-xs">
                                      <p className="text-[9px] font-mono text-slate-400 uppercase font-bold border-b border-slate-100 pb-1 flex items-center gap-1">
                                        <ListOrdered size={10} className="text-slate-400" />
                                        Invoice Itemization (BOM)
                                      </p>
                                      <div className="border border-slate-200/70 rounded-lg bg-white max-h-[250px] overflow-y-auto overflow-x-auto scrollbar-thin">
                                        <table className="w-full text-left text-[10px] min-w-[360px] sm:min-w-full">
                                          <thead>
                                            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200/70 font-mono font-bold uppercase tracking-tight">
                                              <th className="p-2">Product</th>
                                              <th className="p-2 text-right">Qty</th>
                                              <th className="p-2 text-right">Rate</th>
                                              <th className="p-2 text-right">Amount</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 text-slate-600">
                                            {order.items?.map((item, idx) => (
                                              <tr key={idx} className="hover:bg-slate-50/55">
                                                <td className="p-2 font-medium text-slate-800">{item.productName}</td>
                                                <td className="p-2 text-right font-mono font-semibold">{item.quantity}</td>
                                                <td className="p-2 text-right font-mono text-slate-500">₹{item.rate?.toLocaleString()}</td>
                                                <td className="p-2 text-right font-mono font-bold text-slate-700">₹{item.amount?.toLocaleString()}</td>
                                              </tr>
                                            ))}
                                            <tr className="bg-slate-50/40 font-bold border-t border-slate-200/70">
                                              <td className="p-2 text-slate-700" colSpan={2}>Grand Total</td>
                                              <td className="p-2 text-right text-slate-900 font-mono text-xs" colSpan={2}>
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

      </>
      )}

      {/* Confirmation Modal for Edit Invoice */}
      {confirmEditOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn" id="confirm-edit-invoice-modal">
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
                <span className="font-bold text-slate-800">{confirmEditOrder.closedWonDetails?.customerPoNumber || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Invoice #:</span>
                <span className="font-bold text-emerald-700">{confirmEditOrder.billingDetails?.invoiceNumber || "N/A"}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmEditOrder(null)}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 text-[11px] font-bold font-mono rounded-xl transition-all cursor-pointer"
                id="cancel-edit-invoice-btn"
              >
                No, Keep It
              </button>
              <button
                type="button"
                onClick={() => {
                  const order = confirmEditOrder;
                  setEditingOrderId(order.id);
                  setInvoiceNumbers((prev) => ({
                    ...prev,
                    [order.id]: order.billingDetails?.invoiceNumber || "",
                  }));
                  setActualDispatchDates((prev) => ({
                    ...prev,
                    [order.id]: order.billingDetails?.actualDispatchDate || "",
                  }));
                  setActiveSubTab("billing");
                  setConfirmEditOrder(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold font-mono rounded-xl transition-all shadow-xs cursor-pointer"
                id="confirm-edit-invoice-btn"
              >
                Yes, Edit Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Import Modal for Invoice Attached Indent Orders */}
      <DataImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Mapped Invoices & Orders (Invoice Attached)"
        entityName="Invoice Attached Orders"
        fields={invoiceAttachedImportFields}
        onImport={handleImportAttachedInvoices}
      />
    </div>
  );
}
