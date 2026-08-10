/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { User, OrderOffer, OrderItem, Product, Client, Team, AccessLevel, Role, PaymentBank, FreightTerm, TransporterName, WarehouseManagedBy, DispatchLocation, EmailTemplate, EmailAutoSelectSettings, PaymentTerm, PaymentCreditPeriod } from "../types";
import { canEditOrderOffer, canDeleteOrderOffer, canViewOrderOffer, getReportingTreeUsers } from "../data";
import { uploadPOToDrive, hasDriveConnection, ensureGoogleDriveAccess, getSharedDriveSettings, updateSharedParentFolder, DriveSettings, openOrDownloadDocument } from "../lib/googleDriveService";
import {
  getEmailAutoSelectSettings,
  saveEmailAutoSelectSettings,
} from "../lib/firebaseService";
import { replaceTemplateVars, resolveUserHierarchyInfo } from "../lib/templateUtils";
import { Plus, Search, Edit2, Trash2, ShieldAlert, Lock, Unlock, Filter, IndianRupee, Calendar, X, Check, HelpCircle, Building2, ShoppingCart, Percent, ShoppingBag, Upload, FileText, Loader2, Mail, FileSpreadsheet, Eye, Phone } from "lucide-react";
import InlineDeleteConfirm from "./InlineDeleteConfirm";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { formatDate } from "../utils";

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
  transporters?: TransporterName[];
  warehouses?: WarehouseManagedBy[];
  dispatchLocations?: DispatchLocation[];
  paymentTerms?: PaymentTerm[];
  paymentCreditPeriods?: PaymentCreditPeriod[];
  emailTemplates?: EmailTemplate[];
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
  transporters = [],
  warehouses = [],
  dispatchLocations = [],
  paymentTerms = [],
  paymentCreditPeriods = [],
  emailTemplates = [],
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

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["orders"]?.view !== false;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderOffer | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<OrderOffer | null>(null);

  // Import fields config for Orders & Offers (Without invoice attached)
  const orderImportFields: ImportFieldDefinition[] = [
    { key: "clientName", label: "Client Full Name", required: true, sampleValue: "Rahul Sharma", description: "Primary contact full name" },
    { key: "companyName", label: "Company Name", required: true, sampleValue: "Hindustan Unilever", description: "Client company name" },
    { key: "email", label: "Client Email", sampleValue: "rahul@hul.com", description: "Primary client email address" },
    { key: "phone", label: "Client Phone", sampleValue: "+91 9876543210", description: "Contact phone number" },
    { key: "billingAddress", label: "Client Billing Address", sampleValue: "42 Industrial Estate, Sector 5, Kolkata", description: "Billing address for invoices" },
    { key: "status", label: "Pipeline Status", sampleValue: "New", description: "New, Contacted, Proposal, Negotiation, Closed Won, Closed Lost" },
    { key: "productName", label: "Product Name", sampleValue: "Hydrogen Peroxide", description: "Item description or product name" },
    { key: "quantity", label: "Quantity", sampleValue: "100", description: "Quantity of items" },
    { key: "rate", label: "Rate (₹)", sampleValue: "250", description: "Unit rate / price per item" },
    { key: "totalValue", label: "Total Order Value (₹)", sampleValue: "25000", description: "Total order or offer amount" },
    { key: "notes", label: "Notes / Details", sampleValue: "Urgent dispatch", description: "Internal notes or instructions" },
    { key: "payment", label: "Payment Terms", sampleValue: "Advance Payment", description: "Payment terms" },
    { key: "delivery", label: "Delivery Terms", sampleValue: "FOB Plant", description: "Delivery terms" },
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

      const qty = parseFloat(row.quantity) || 1;
      const rateVal = parseFloat(row.rate) || 0;
      const totalVal = parseFloat(row.totalValue) || (qty * rateVal);

      const itemsList = row.productName ? [{
        productId: products[0]?.id || `prod-import-${Date.now()}-${i}`,
        productName: row.productName.trim(),
        quantity: qty,
        rate: rateVal,
        amount: qty * rateVal
      }] : [{
        productId: products[0]?.id || "proj-1",
        productName: products[0]?.name || "Default Product",
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
        status: (row.status?.trim() as OrderOffer["status"]) || "New",
        totalValue: totalVal,
        items: itemsList,
        assignedToUserId: activeUserId,
        notes: row.notes?.trim() || "Imported via Sheets / CSV Wizard",
        payment: row.payment?.trim() || "",
        delivery: row.delivery?.trim() || "",
        otherTerms: row.otherTerms?.trim() || "",
      };

      try {
        await onAddOrder(newOrderData);
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
    { productId: products[0]?.id || "proj-1", productName: products[0]?.name || "Default Product", quantity: "" as any, rate: "" as any, hsnCode: products[0]?.hsnCode || "", packing: "", taxes: "18% Extra" }
  ]);

  // Form states - Edit Order
  const [editClientName, setEditClientName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSendEmail, setEditSendEmail] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBillingAddress, setEditBillingAddress] = useState("");
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
  const [isUploading, setIsUploading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasDriveAccess, setHasDriveAccess] = useState(hasDriveConnection());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newPoFileName, setNewPoFileName] = useState("");
  const [editPoFileName, setEditPoFileName] = useState("");

  // Shared Google Drive Folder Config States (Developer Managed)
  const [driveSettings, setDriveSettings] = useState<DriveSettings | null>(null);
  const [configFolderName, setConfigFolderName] = useState("");
  const [isConfiguringDrive, setIsConfiguringDrive] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);

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
        setConfigFolderName(settings.folderName);
        setHasDriveAccess(hasDriveConnection(settings));
      } else {
        setConfigFolderName("SMS_PO");
        setHasDriveAccess(hasDriveConnection(null));
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

  // Pre-filtering orders based on view permission + search query (excluding status)
  const baseFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Permission check
      const isLevelFilterEnabled = !!levelWiseFilters?.["orders"];
      if (!canViewOrderOffer(activeUserId, order, users, isLevelFilterEnabled)) return false;

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
  }, [orders, activeUserId, users, levelWiseFilters, searchTerm]);

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

  // Calculate sum metrics based on visible orders
  const totalValue = visibleOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const closedWonOrders = visibleOrders.filter((o) => o.status === "Closed Won");
  const closedWonValue = closedWonOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const totalProductLines = visibleOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0);

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
      taxes: "18% Extra"
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
      (item as any).taxes = "18% Extra";
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

  const calculateTotalValue = (itemsList: Omit<OrderItem, "amount">[]) => {
    return itemsList.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.rate) || 0)), 0);
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
      { productId: products[0]?.id || "proj-1", productName: products[0]?.name || "Default Product", quantity: "" as any, rate: "" as any, hsnCode: products[0]?.hsnCode || "", packing: "", taxes: "18% Extra" }
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
    setUploadError(null);
  };

  const handlePOFileUpload = async (file: File, isEdit: boolean) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError("Only PDF files are allowed to be uploaded.");
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      const clientNameArg = isEdit 
        ? (editCompanyName || editClientName || "General Clients")
        : (newCompanyName || newClientName || "General Clients");
      const poNumArg = isEdit ? editPoNumber : newPoNumber;

      const result = await uploadPOToDrive(file, clientNameArg, poNumArg);
      if (isEdit) {
        setEditPoAttachmentUrl(result.webViewLink);
        setEditPoFileName(file.name);
      } else {
        setNewPoAttachmentUrl(result.webViewLink);
        setNewPoFileName(file.name);
      }
      if (result.isLocalFallback) {
        setUploadError(`Notice: ${result.fallbackReason || 'Attached locally.'} To sync directly to Google Drive, enable the Google Drive API in Google Cloud Console.`);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to upload file to Google Drive.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConnectDrive = async () => {
    setIsConnecting(true);
    setUploadError(null);
    try {
      await ensureGoogleDriveAccess(true);
      const settings = await getSharedDriveSettings();
      if (settings) {
        setDriveSettings(settings);
        setConfigFolderName(settings.folderName);
      }
      setHasDriveAccess(true);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to authorize Google Drive. Please make sure pop-ups are allowed for this site.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUpdateDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configFolderName || configFolderName.trim() === "") {
      setConfigError("Folder name cannot be empty.");
      return;
    }
    
    setIsConfiguringDrive(true);
    setConfigError(null);
    setConfigSuccess(false);

    try {
      const token = await ensureGoogleDriveAccess(true);
      const updated = await updateSharedParentFolder(token, configFolderName.trim());
      setDriveSettings(updated);
      setConfigSuccess(true);
      setHasDriveAccess(true);
      
      setTimeout(() => {
        setConfigSuccess(false);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setConfigError(err.message || "Failed to update Google Drive folder. Make sure pop-ups are allowed and you are logged in.");
    } finally {
      setIsConfiguringDrive(false);
    }
  };

  // Submit handers
  const handleCreateOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newCompanyName) return;

    const finalItems: OrderItem[] = newItems.map((item) => ({
      ...item,
      amount: item.quantity * item.rate
    }));

    const computedTotal = finalItems.reduce((acc, it) => acc + it.amount, 0);

    onAddOrder({
      clientName: newClientName,
      companyName: newCompanyName,
      email: newEmail,
      phone: newPhone || "+1 (555) 000-0000",
      billingAddress: newBillingAddress,
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
        dispatchDate: newDispatchDate,
        dispatchLocation: newDispatchLocation,
        warehouseManagedBy: newWarehouseManagedBy,
        poAttachmentUrl: newPoAttachmentUrl,
      } : undefined,
    });

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
      let body = applyTemplate(template?.body || `Order Details:\nClient: {{clientName}}\nCompany: {{companyName}}\nStatus: {{status}}\nTotal: {{totalValue}}\nItems:\n{{itemsList}}`);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : newEmail);
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          subject: subject,
          text: body,
          senderUserId: activeUser?.id,
        })
      }).catch(console.error);
    }

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

    setIsEditOpen(true);
  };

  const handleEditOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const finalItems: OrderItem[] = editItems.map((item) => ({
      ...item,
      amount: item.quantity * item.rate
    }));

    const computedTotal = finalItems.reduce((acc, it) => acc + it.amount, 0);

    onEditOrder({
      ...editingOrder,
      clientName: editClientName,
      companyName: editCompanyName,
      email: editEmail,
      phone: editPhone,
      billingAddress: editBillingAddress,
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
        dispatchDate: editDispatchDate,
        dispatchLocation: editDispatchLocation,
        warehouseManagedBy: editWarehouseManagedBy,
        poAttachmentUrl: editPoAttachmentUrl,
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
      let body = applyTemplate(template?.body || `Order Details Updated:\nClient: {{clientName}}\nCompany: {{companyName}}\nStatus: {{status}}\nTotal: {{totalValue}}\nItems:\n{{itemsList}}`);

      const dynamicTo = cleanEmailList(template?.to ? applyTemplate(template.to) : editEmail);
      const dynamicCc = template?.cc ? cleanEmailList(applyTemplate(template.cc)) : undefined;
      const dynamicBcc = template?.bcc ? cleanEmailList(applyTemplate(template.bcc)) : undefined;

      fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: dynamicTo,
          cc: dynamicCc,
          bcc: dynamicBcc,
          subject: subject,
          text: body,
          senderUserId: activeUser?.id,
        })
      }).catch(console.error);
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
          {teamCanAdd ? (
            <>
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all duration-150 transform hover:-translate-y-0.5 cursor-pointer"
                id="btn-import-orders"
              >
                <FileSpreadsheet size={15} />
                <span>Import Orders (Sheets / CSV)</span>
              </button>

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
            </>
          ) : (
            <>
              <button
                disabled
                title="Your team does not have permission to import orders."
                className="bg-slate-100 text-slate-400 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-not-allowed"
              >
                <Lock size={15} />
                <span>Import Orders</span>
              </button>

              <button
                disabled
                title="Your team does not have permission to create orders."
                className="bg-slate-100 text-slate-400 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-not-allowed"
              >
                <Lock size={15} />
                Create Order / Offer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Developer-Only Google Drive Shared Directory Configuration */}
      {activeUser.role === Role.Admin && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-tight flex items-center gap-2">
                <FileText className="text-indigo-650 h-4 w-4 animate-pulse" />
                Google Drive Shared Directory Settings (Developer)
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
                Configure the central folder name for PO documents. Uploaded purchase orders are stored in this central folder, grouped into dedicated subfolders for each customer company in an organized manner.
              </p>
              {driveSettings?.folderId ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold break-all">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span>Current Active Shared Folder:</span>
                  <span className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded text-[10px] font-bold">{driveSettings.folderName}</span>
                  <span className="text-slate-400 font-normal">| ID:</span>
                  <span className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded text-[10px] break-all max-w-full select-all">{driveSettings.folderId}</span>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold break-all">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                  <span>Default active:</span>
                  <code className="font-mono bg-amber-100/60 px-1 py-0.5 rounded text-[10px] font-bold">SMS_PO</code>
                  <span>(Auto-created and saved on first upload)</span>
                </div>
              )}
            </div>
            
            <form onSubmit={handleUpdateDriveFolder} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 sm:max-w-md w-full md:w-auto">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={configFolderName}
                  onChange={(e) => setConfigFolderName(e.target.value)}
                  placeholder="e.g. SMS_PO_Central"
                  disabled={isConfiguringDrive}
                  className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isConfiguringDrive}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-xs"
              >
                {isConfiguringDrive ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Configuring...</span>
                  </>
                ) : (
                  <span>Set Shared Folder</span>
                )}
              </button>
            </form>
          </div>
          {configError && (
            <p className="text-[10px] text-rose-500 font-semibold mt-2.5 flex items-center gap-1">
              <span>⚠️</span> {configError}
            </p>
          )}
          {configSuccess && (
            <p className="text-[10px] text-emerald-600 font-bold mt-2.5 flex items-center gap-1">
              <Check size={12} /> Google Drive folder successfully updated in Firestore! All team members will now store files inside this designated folder.
            </p>
          )}
        </div>
      )}

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
            <span className="text-lg font-bold text-slate-900 mt-1 block font-mono">
              ₹{totalValue.toLocaleString()}
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
            <span className="text-[9.5px] text-emerald-600 font-bold mt-0.5 block">
              ₹{closedWonValue.toLocaleString()} won
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
                <th className="py-2.5 px-3">Total Deal Value</th>
                <th className="py-2.5 px-3">Assign Ownership</th>
                <th className="py-2.5 px-4 text-right">Auth Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400 font-mono">
                    No matching orders or offers found in the registry.
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => {
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
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">
                            {order.clientName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <Building2 size={11} className="text-slate-400" />
                            {order.companyName}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {order.email} | {order.phone}
                          </span>
                        </div>
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
                          {order.closedWonDetails?.poAttachmentUrl && (
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
                          )}
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
                            {order.billingDetails.invoiceFileUrl && (
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
                              </a>
                            )}
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

                      {/* Financial grand total */}
                      <td className="py-3 px-3">
                        <span className="text-slate-950 font-mono font-bold text-xs">
                          ₹{order.totalValue.toLocaleString()}
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
          </table>
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
                        } else {
                          setNewClientName("");
                          setNewEmail("");
                          setNewPhone("");
                          setNewBillingAddress("");
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
                        if (match?.address) {
                          setNewBillingAddress(match.address);
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

              {/* Client Billing Address */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Client Billing Address</span>
                  <span className="text-[10px] text-indigo-600 font-semibold normal-case">(Used for billing & invoice creation)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter or adjust client billing address..."
                  value={newBillingAddress}
                  onChange={(e) => setNewBillingAddress(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              {/* Status & Assigned To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as OrderOffer["status"])}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
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
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Assign Lead To</label>
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                  >
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase font-mono">Payment Bank</label>
                    <button
                      type="button"
                      onClick={() => setIsAddBankModalOpen(true)}
                      className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={11} /> Add New Bank
                    </button>
                  </div>
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
                    Order Line Items
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Product</label>
                            <select
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Qty (Kg)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Qty in Kg"
                              value={item.quantity === "" || item.quantity === null || item.quantity === undefined ? "" : item.quantity}
                              onChange={(e) => handleProductRowChange(index, "quantity", e.target.value, false)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-3">
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Rate (₹)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Rate"
                              value={item.rate === "" || item.rate === null || item.rate === undefined ? "" : item.rate}
                              onChange={(e) => handleProductRowChange(index, "rate", e.target.value, false)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-2 flex items-center justify-between gap-1 mt-3">
                            <span className="text-[11px] font-bold text-slate-700 font-mono">
                              ₹{((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toLocaleString()}
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Taxes (Fixed)</label>
                            <div className="w-full text-[11px] border border-slate-100 bg-slate-50/50 p-1.5 rounded text-slate-500 font-medium">
                              {(item as any).taxes || "18% Extra"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total amount panel */}
                <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200 mt-2 font-mono">
                  <span className="text-xs font-bold text-slate-600">GRAND TOTAL ORDER VALUE:</span>
                  <span className="text-sm font-black text-slate-900">₹{calculateTotalValue(newItems).toLocaleString()}</span>
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
                          <option key={transporter.id} value={transporter.name}>{transporter.name}</option>
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
                      <input
                        type="text"
                        value={newDeliveryTerm}
                        onChange={(e) => setNewDeliveryTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Warehouse Managed By</label>
                      <select
                        value={newWarehouseManagedBy}
                        onChange={(e) => setNewWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select Warehouse...</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.name}>{wh.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Destination Delivery Address</label>
                    <textarea
                      rows={2}
                      value={newDestinationAddress}
                      onChange={(e) => setNewDestinationAddress(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Date</label>
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
                    {newPoAttachmentUrl ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attached PO Document</label>
                        <div className="flex items-center justify-between bg-emerald-50/50 border border-emerald-150 p-3 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700 animate-pulse">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-semibold text-slate-850">
                                {newPoFileName || "Attached Purchase Order"}
                              </p>
                              <a 
                                href="#" 
                                onClick={(e) => {
                                  e.preventDefault();
                                  openOrDownloadDocument(newPoAttachmentUrl, newPoFileName || "po_document.pdf");
                                }}
                                className="text-[10px] text-indigo-600 hover:text-indigo-850 font-bold underline block mt-0.5"
                              >
                                View PO Document ↗
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPoAttachmentUrl("");
                              setNewPoFileName("");
                            }}
                            className="p-1 hover:bg-slate-150 rounded-lg text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remove attachment"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attach PO Document</label>
                        {!hasDriveAccess ? (
                          <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-5 text-center transition-all">
                            <FileText className="mx-auto h-6 w-6 text-indigo-500 mb-2 opacity-80" />
                            <p className="text-xs font-semibold text-slate-750">
                              {activeUser.role === Role.Admin ? "Connect Google Drive to Upload POs" : "Google Drive Upload Not Set Up"}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 max-w-sm mx-auto">
                              {activeUser.role === Role.Admin 
                                ? "Automatically uploads PDF, image or word documents directly to your secure Google Drive in a folder called SMS_PO."
                                : "The central Google Drive folder is not linked or authorized. Please ask your Sales System Administrator to link Google Drive to enable direct PO document uploads."
                              }
                            </p>
                            {activeUser.role === Role.Admin ? (
                              <button
                                type="button"
                                disabled={isConnecting}
                                onClick={handleConnectDrive}
                                className="mt-3 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all duration-150 shadow-sm cursor-pointer"
                              >
                                {isConnecting ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Authorizing...</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-3.5 w-3.5" />
                                    <span>Connect Google Drive</span>
                                  </>
                                )}
                              </button>
                            ) : null}
                            {uploadError && (
                              <p className="text-[10px] text-rose-500 font-semibold mt-2">⚠️ {uploadError}</p>
                            )}
                          </div>
                        ) : (
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
                                  handlePOFileUpload(files[0], false);
                                }
                              }}
                            >
                              <input
                                type="file"
                                id="new-po-file-upload"
                                className="hidden"
                                accept=".pdf"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const files = e.target.files;
                                  if (files && files.length > 0) {
                                    handlePOFileUpload(files[0], false);
                                  }
                                }}
                              />
                              {isUploading ? (
                                <div className="flex flex-col items-center justify-center py-2">
                                  <Loader2 className="h-6 w-6 text-indigo-650 animate-spin mb-1" />
                                  <p className="text-xs font-semibold text-slate-750">Uploading to Google Drive...</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">Creating 'SMS_PO' folder and storing file</p>
                                </div>
                              ) : (
                                <label htmlFor="new-po-file-upload" className="cursor-pointer block py-1">
                                  <Upload className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                                  <p className="text-xs font-semibold text-slate-700">
                                    Click to attach PDF PO file or drag & drop here (PDF only)
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    Securely saves to your Google Drive in 'SMS_PO' folder
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

              {/* Client Billing Address */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Client Billing Address</span>
                  <span className="text-[10px] text-amber-600 font-semibold normal-case">(Used for billing & invoice creation)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter or adjust client billing address..."
                  value={editBillingAddress}
                  onChange={(e) => setEditBillingAddress(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                />
              </div>

              {/* Status & Assigned To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as OrderOffer["status"])}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
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
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Reassigned Owner</label>
                  <select
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-semibold"
                  >
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase font-mono">Payment Bank</label>
                    <button
                      type="button"
                      onClick={() => setIsAddBankModalOpen(true)}
                      className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={11} /> Add New Bank
                    </button>
                  </div>
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
                    Order Line Items
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Product</label>
                            <select
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Qty (Kg)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Qty in Kg"
                              value={item.quantity === "" || item.quantity === null || item.quantity === undefined ? "" : item.quantity}
                              onChange={(e) => handleProductRowChange(index, "quantity", e.target.value, true)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-3">
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Rate (₹)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Rate"
                              value={item.rate === "" || item.rate === null || item.rate === undefined ? "" : item.rate}
                              onChange={(e) => handleProductRowChange(index, "rate", e.target.value, true)}
                              className="w-full text-xs border border-slate-200 p-1 rounded-md focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="col-span-2 flex items-center justify-between gap-1 mt-3">
                            <span className="text-[11px] font-bold text-slate-700 font-mono">
                              ₹{((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toLocaleString()}
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
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Taxes (Fixed)</label>
                            <div className="w-full text-[11px] border border-slate-100 bg-slate-50/50 p-1.5 rounded text-slate-500 font-medium">
                              {(item as any).taxes || "18% Extra"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total amount panel */}
                <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200 mt-2 font-mono">
                  <span className="text-xs font-bold text-slate-600">GRAND TOTAL ORDER VALUE:</span>
                  <span className="text-sm font-black text-slate-900">₹{calculateTotalValue(editItems).toLocaleString()}</span>
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
                          <option key={transporter.id} value={transporter.name}>{transporter.name}</option>
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
                      <input
                        type="text"
                        value={editDeliveryTerm}
                        onChange={(e) => setEditDeliveryTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Warehouse Managed By</label>
                      <select
                        value={editWarehouseManagedBy}
                        onChange={(e) => setEditWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Select Warehouse...</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.name}>{wh.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Destination Delivery Address</label>
                    <textarea
                      rows={2}
                      value={editDestinationAddress}
                      onChange={(e) => setEditDestinationAddress(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Date</label>
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
                    {editPoAttachmentUrl ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attached PO Document</label>
                        <div className="flex items-center justify-between bg-emerald-50/50 border border-emerald-150 p-3 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700 animate-pulse">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-semibold text-slate-850">
                                {editPoFileName || "Attached Purchase Order"}
                              </p>
                              <a 
                                href="#" 
                                onClick={(e) => {
                                  e.preventDefault();
                                  openOrDownloadDocument(editPoAttachmentUrl, editPoFileName || "po_document.pdf");
                                }}
                                className="text-[10px] text-amber-600 hover:text-amber-850 font-bold underline block mt-0.5"
                              >
                                View PO Document ↗
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditPoAttachmentUrl("");
                              setEditPoFileName("");
                            }}
                            className="p-1 hover:bg-slate-150 rounded-lg text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remove attachment"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attach PO Document</label>
                        {!hasDriveAccess ? (
                          <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-5 text-center transition-all">
                            <FileText className="mx-auto h-6 w-6 text-indigo-500 mb-2 opacity-80" />
                            <p className="text-xs font-semibold text-slate-750">
                              {activeUser.role === Role.Admin ? "Connect Google Drive to Upload POs" : "Google Drive Upload Not Set Up"}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 max-w-sm mx-auto">
                              {activeUser.role === Role.Admin 
                                ? "Automatically uploads PDF, image or word documents directly to your secure Google Drive in a folder called SMS_PO."
                                : "The central Google Drive folder is not linked or authorized. Please ask your Sales System Administrator to link Google Drive to enable direct PO document uploads."
                              }
                            </p>
                            {activeUser.role === Role.Admin ? (
                              <button
                                type="button"
                                disabled={isConnecting}
                                onClick={handleConnectDrive}
                                className="mt-3 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all duration-150 shadow-sm cursor-pointer"
                              >
                                {isConnecting ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Authorizing...</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-3.5 w-3.5" />
                                    <span>Connect Google Drive</span>
                                  </>
                                )}
                              </button>
                            ) : null}
                            {uploadError && (
                              <p className="text-[10px] text-rose-500 font-semibold mt-2">⚠️ {uploadError}</p>
                            )}
                          </div>
                        ) : (
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
                                  handlePOFileUpload(files[0], true);
                                }
                              }}
                            >
                              <input
                                type="file"
                                id="edit-po-file-upload"
                                className="hidden"
                                accept=".pdf"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const files = e.target.files;
                                  if (files && files.length > 0) {
                                    handlePOFileUpload(files[0], true);
                                  }
                                }}
                              />
                              {isUploading ? (
                                <div className="flex flex-col items-center justify-center py-2">
                                  <Loader2 className="h-6 w-6 text-amber-600 animate-spin mb-1" />
                                  <p className="text-xs font-semibold text-slate-750">Uploading to Google Drive...</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">Creating 'SMS_PO' folder and storing file</p>
                                </div>
                              ) : (
                                <label htmlFor="edit-po-file-upload" className="cursor-pointer block py-1">
                                  <Upload className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                                  <p className="text-xs font-semibold text-slate-700">
                                    Click to attach PDF PO file or drag & drop here (PDF only)
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    Securely saves to your Google Drive in 'SMS_PO' folder
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
                    <span className="text-[9px] font-mono text-slate-400 uppercase block">Billing Address</span>
                    <span className="text-[10.5px] text-slate-600 font-medium block leading-normal line-clamp-2" title={selectedOrderDetails.billingAddress}>
                      {selectedOrderDetails.billingAddress || "N/A"}
                    </span>
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

                    <div className="flex items-center">
                      {selectedOrderDetails.billingDetails.invoiceFileUrl ? (
                        <button
                          type="button"
                          onClick={() => openOrDownloadDocument(selectedOrderDetails.billingDetails!.invoiceFileUrl!, selectedOrderDetails.billingDetails!.invoiceFileName || `Invoice_${selectedOrderDetails.billingDetails!.invoiceNumber}.pdf`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          <FileText size={14} />
                          <span>Download Invoice PDF ↗</span>
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
                          {selectedOrderDetails.closedWonDetails.transporterName || "N/A"}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Vehicle No: {selectedOrderDetails.closedWonDetails.vehicleNo || "N/A"}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">PO Attachment File</span>
                        {selectedOrderDetails.closedWonDetails.poAttachmentUrl ? (
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

      {/* Data Import Modal for Orders / Offers */}
      <DataImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Sales Orders / Offers (Without Invoice Attached)"
        entityName="Orders / Offers"
        fields={orderImportFields}
        onImport={handleImportOrders}
      />
    </div>
  );
}
