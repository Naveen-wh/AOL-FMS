/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User, SalesLead, ProjectWorkflow, ActionLog, AccessLevel, Role, Client, Team, Product, OrderItem } from "../types";
import { canEditLead, canDeleteLead, canViewLead, getReportingTreeUsers } from "../data";
import { Plus, Search, Edit2, Trash2, ShieldAlert, Lock, Unlock, Filter, IndianRupee, Calendar, X, Check, HelpCircle, Building2 } from "lucide-react";
import InlineDeleteConfirm from "./InlineDeleteConfirm";

interface ProductItemInput {
  productId: string;
  productName: string;
  quantity: string | number;
  rate: string | number;
}

interface LeadsViewProps {
  activeUserId: string;
  users: User[];
  leads: SalesLead[];
  workflows: ProjectWorkflow[];
  products?: Product[];
  clients?: Client[]; // Keep it optional to avoid any breaking changes, but default to empty array
  teams?: Team[];
  onAddLead: (lead: Omit<SalesLead, "id" | "createdAt">) => void;
  onEditLead: (lead: SalesLead) => void;
  onDeleteLead: (leadId: string) => void;
  onAddClient?: (clientData: Omit<Client, "id" | "createdAt">) => void;
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function LeadsView({
  activeUserId,
  users,
  leads,
  workflows,
  products = [],
  clients = [],
  teams = [],
  onAddLead,
  onEditLead,
  onDeleteLead,
  onAddClient,
  teamPermissions,
  levelWiseFilters,
}: LeadsViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];
  const isExecutive = activeUser.teamName === "Executive" || activeUser.role === Role.Admin;
  const clientCompanies = Array.from(new Set(clients.map((c) => c.companyName).filter(Boolean)));

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["leads"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["leads"]?.edit !== false;
  const teamCanView = activeUser.role === Role.Admin || teamPermissions?.["leads"]?.view !== false;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<SalesLead | null>(null);

  // Form states - Add
  const [newClientName, setNewClientName] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStatus, setNewStatus] = useState<SalesLead["status"]>("New");
  const [newQuantity, setNewQuantity] = useState(1);
  const [newRate, setNewRate] = useState(25000);
  const [newProjectId, setNewProjectId] = useState(products[0]?.id || "");
  const [newAssignedTo, setNewAssignedTo] = useState(activeUserId);
  const [newNotes, setNewNotes] = useState("");
  const [isCustomCompany, setIsCustomCompany] = useState(false);

  // Inner Add Client modal states
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

  // Form states - Edit
  const [editClientName, setEditClientName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<SalesLead["status"]>("New");
  const [editQuantity, setEditQuantity] = useState(1);
  const [editRate, setEditRate] = useState(0);
  const [editProjectId, setEditProjectId] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Closed Won details - Add
  const [newPoNumber, setNewPoNumber] = useState("");
  const [newPoDate, setNewPoDate] = useState("");
  const [newFreightTerm, setNewFreightTerm] = useState("");
  const [newTransporterName, setNewTransporterName] = useState("");
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
  const [editTransporterName, setEditTransporterName] = useState("");
  const [editDeliveryTerm, setEditDeliveryTerm] = useState("");
  const [editDestinationAddress, setEditDestinationAddress] = useState("");
  const [editDispatchDate, setEditDispatchDate] = useState("");
  const [editDispatchLocation, setEditDispatchLocation] = useState("");
  const [editWarehouseManagedBy, setEditWarehouseManagedBy] = useState("");
  const [editPoAttachmentUrl, setEditPoAttachmentUrl] = useState("");

  // Helper to determine assignable team members
  // An active user can assign leads/tasks to themselves, or anyone in their hierarchical reporting tree
  const reportingIds = getReportingTreeUsers(activeUserId, users);
  const assignableUsers = [
    activeUser,
    ...users.filter((u) => reportingIds.includes(u.id)),
  ];

  // Filtering leads based on view permission + user filters
  const visibleLeads = leads.filter((lead) => {
    // 1. Permission check
    const isLevelFilterEnabled = !!levelWiseFilters?.["leads"];
    if (!canViewLead(activeUserId, lead, users, isLevelFilterEnabled)) return false;

    // 2. Search query check
    const matchesSearch =
      lead.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm);

    // 3. Status filter check
    const matchesStatus = statusFilter === "All" || lead.status === statusFilter;

    // 4. Project filter check
    const matchesProject = projectFilter === "All" || lead.projectId === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  const getCreatorName = (creatorId: string) => {
    return users.find((u) => u.id === creatorId)?.name || "Unknown User";
  };

  const getAssigneeName = (assigneeId: string) => {
    return users.find((u) => u.id === assigneeId)?.name || "Unassigned";
  };

  const currentProjectName = (projId: string) => {
    return products.find((p) => p.id === projId)?.name || "Independent Work";
  };

  // Product Line Items - Add & Edit
  const [newProductItems, setNewProductItems] = useState<ProductItemInput[]>([]);
  const [editProductItems, setEditProductItems] = useState<ProductItemInput[]>([]);

  // Product Row Handlers - Add
  const handleAddProductRow = () => {
    const defaultProd = products[0];
    setNewProductItems((prev) => [
      ...prev,
      {
        productId: defaultProd?.id || "",
        productName: defaultProd?.name || "",
        quantity: "", // Blank default
        rate: "",     // Blank default
      },
    ]);
  };

  const handleRemoveProductRow = (index: number) => {
    setNewProductItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductRowChange = (
    index: number,
    field: keyof ProductItemInput,
    val: string | number
  ) => {
    setNewProductItems((prev) => {
      const updated = [...prev];
      if (field === "productId") {
        const prodId = val as string;
        const matched = products.find((p) => p.id === prodId);
        updated[index] = {
          ...updated[index],
          productId: prodId,
          productName: matched ? matched.name : (prodId === "custom" ? "" : updated[index].productName),
        };
      } else {
        updated[index] = {
          ...updated[index],
          [field]: val,
        };
      }
      return updated;
    });
  };

  // Product Row Handlers - Edit
  const handleAddEditProductRow = () => {
    const defaultProd = products[0];
    setEditProductItems((prev) => [
      ...prev,
      {
        productId: defaultProd?.id || "",
        productName: defaultProd?.name || "",
        quantity: "",
        rate: "",
      },
    ]);
  };

  const handleRemoveEditProductRow = (index: number) => {
    setEditProductItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditProductRowChange = (
    index: number,
    field: keyof ProductItemInput,
    val: string | number
  ) => {
    setEditProductItems((prev) => {
      const updated = [...prev];
      if (field === "productId") {
        const prodId = val as string;
        const matched = products.find((p) => p.id === prodId);
        updated[index] = {
          ...updated[index],
          productId: prodId,
          productName: matched ? matched.name : (prodId === "custom" ? "" : updated[index].productName),
        };
      } else {
        updated[index] = {
          ...updated[index],
          [field]: val,
        };
      }
      return updated;
    });
  };

  const handleOpenAdd = () => {
    setNewClientName("");
    setNewCompanyName("");
    setNewEmail("");
    setNewPhone("");
    setNewStatus("New");
    setNewAssignedTo(activeUserId);
    setNewNotes("");
    setIsCustomCompany(false);

    // Initial product line item with BLANK quantity and rate
    const defaultProd = products[0];
    setNewProductItems([
      {
        productId: defaultProd?.id || "",
        productName: defaultProd?.name || "",
        quantity: "", // BLANK
        rate: "",     // BLANK
      },
    ]);

    // Reset Closed Won details
    setNewPoNumber("");
    setNewPoDate("");
    setNewFreightTerm("");
    setNewTransporterName("");
    setNewDeliveryTerm("");
    setNewDestinationAddress("");
    setNewDispatchDate("");
    setNewDispatchLocation("");
    setNewWarehouseManagedBy("");
    setNewPoAttachmentUrl("");

    setIsAddOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newCompanyName) return;

    const formattedItems: OrderItem[] = newProductItems.map((item) => {
      const q = Number(item.quantity) || 0;
      const r = Number(item.rate) || 0;
      const matchedName = products.find((p) => p.id === item.productId)?.name || item.productName || "Product";
      return {
        productId: item.productId,
        productName: matchedName,
        quantity: q,
        rate: r,
        amount: q * r,
      };
    });

    const totalAmount = formattedItems.reduce((sum, item) => sum + item.amount, 0);
    const totalQty = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    const primaryProjId = formattedItems[0]?.productId || products[0]?.id || "";

    onAddLead({
      clientName: newClientName,
      companyName: newCompanyName,
      email: newEmail || `${newClientName.toLowerCase().replace(" ", ".")}@${newCompanyName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
      phone: newPhone || "+1 (555) 000-0000",
      status: newStatus,
      value: totalAmount,
      quantity: totalQty,
      rate: formattedItems[0]?.rate || 0,
      amount: totalAmount,
      projectId: primaryProjId,
      items: formattedItems,
      assignedToUserId: newAssignedTo,
      createdByUserId: activeUserId,
      notes: newNotes,
      closedWonDetails: newStatus === "Closed Won" ? {
        customerPoNumber: newPoNumber,
        poDate: newPoDate,
        freightTerm: newFreightTerm,
        transporterName: newTransporterName,
        deliveryTerm: newDeliveryTerm,
        destinationAddress: newDestinationAddress,
        dispatchDate: newDispatchDate,
        dispatchLocation: newDispatchLocation,
        warehouseManagedBy: newWarehouseManagedBy,
        poAttachmentUrl: newPoAttachmentUrl,
      } : undefined,
    });

    setIsAddOpen(false);
  };

  const handleAddClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientFullName || !clientCompanyName || !onAddClient) return;

    onAddClient({
      fullName: clientFullName,
      companyName: clientCompanyName,
      email: clientEmail || `${clientFullName.toLowerCase().replace(" ", ".")}@${clientCompanyName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
      phone: clientPhone || "+1 (555) 000-0000",
      gst: clientGst,
      city: clientCity,
      pincode: clientPincode,
      address: clientAddress,
      teamName: isExecutive ? (clientTeamName || undefined) : (activeUser.teamName || undefined),
    });

    // Automatically select the newly registered company & client name in the lead form!
    setNewCompanyName(clientCompanyName);
    setNewClientName(clientFullName);
    if (clientEmail) setNewEmail(clientEmail);
    if (clientPhone) setNewPhone(clientPhone);

    // Reset states
    setClientFullName("");
    setClientCompanyName("");
    setClientEmail("");
    setClientPhone("");
    setClientGst("");
    setClientCity("");
    setClientPincode("");
    setClientAddress("");
    setClientTeamName("");
    setIsAddClientModalOpen(false);
  };

  const handleOpenEdit = (lead: SalesLead) => {
    if (!canEditLead(activeUserId, lead, users)) return;
    setEditingLead(lead);
    setEditClientName(lead.clientName);
    setEditCompanyName(lead.companyName);
    setEditEmail(lead.email);
    setEditPhone(lead.phone);
    setEditStatus(lead.status);
    setEditQuantity(lead.quantity || 1);
    setEditRate(lead.rate || lead.value || 0);
    setEditProjectId(lead.projectId);
    setEditAssignedTo(lead.assignedToUserId);
    setEditNotes(lead.notes);

    if (lead.items && lead.items.length > 0) {
      setEditProductItems(
        lead.items.map((item) => ({
          productId: item.productId || "",
          productName: item.productName || "",
          quantity: item.quantity !== undefined && item.quantity !== null ? item.quantity : "",
          rate: item.rate !== undefined && item.rate !== null ? item.rate : "",
        }))
      );
    } else {
      setEditProductItems([
        {
          productId: lead.projectId || products[0]?.id || "",
          productName: currentProjectName(lead.projectId),
          quantity: lead.quantity !== undefined && lead.quantity !== null ? lead.quantity : "",
          rate: lead.rate !== undefined && lead.rate !== null ? lead.rate : "",
        },
      ]);
    }

    // Populate Closed Won details if they exist
    setEditPoNumber(lead.closedWonDetails?.customerPoNumber || "");
    setEditPoDate(lead.closedWonDetails?.poDate || "");
    setEditFreightTerm(lead.closedWonDetails?.freightTerm || "");
    setEditTransporterName(lead.closedWonDetails?.transporterName || "");
    setEditDeliveryTerm(lead.closedWonDetails?.deliveryTerm || "");
    setEditDestinationAddress(lead.closedWonDetails?.destinationAddress || "");
    setEditDispatchDate(lead.closedWonDetails?.dispatchDate || "");
    setEditDispatchLocation(lead.closedWonDetails?.dispatchLocation || "");
    setEditWarehouseManagedBy(lead.closedWonDetails?.warehouseManagedBy || "");
    setEditPoAttachmentUrl(lead.closedWonDetails?.poAttachmentUrl || "");

    setIsEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;

    const formattedItems: OrderItem[] = editProductItems.map((item) => {
      const q = Number(item.quantity) || 0;
      const r = Number(item.rate) || 0;
      const matchedName = products.find((p) => p.id === item.productId)?.name || item.productName || "Product";
      return {
        productId: item.productId,
        productName: matchedName,
        quantity: q,
        rate: r,
        amount: q * r,
      };
    });

    const totalAmount = formattedItems.reduce((sum, item) => sum + item.amount, 0);
    const totalQty = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    const primaryProjId = formattedItems[0]?.productId || editProjectId || products[0]?.id || "";

    onEditLead({
      ...editingLead,
      clientName: editClientName,
      companyName: editCompanyName,
      email: editEmail,
      phone: editPhone,
      status: editStatus,
      value: totalAmount,
      quantity: totalQty,
      rate: formattedItems[0]?.rate || 0,
      amount: totalAmount,
      projectId: primaryProjId,
      items: formattedItems,
      assignedToUserId: editAssignedTo,
      notes: editNotes,
      closedWonDetails: editStatus === "Closed Won" ? {
        customerPoNumber: editPoNumber,
        poDate: editPoDate,
        freightTerm: editFreightTerm,
        transporterName: editTransporterName,
        deliveryTerm: editDeliveryTerm,
        destinationAddress: editDestinationAddress,
        dispatchDate: editDispatchDate,
        dispatchLocation: editDispatchLocation,
        warehouseManagedBy: editWarehouseManagedBy,
        poAttachmentUrl: editPoAttachmentUrl,
      } : undefined,
    });

    setIsEditOpen(false);
    setEditingLead(null);
  };

  if (!teamCanView) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
        <Lock size={48} className="mx-auto text-rose-500 mb-4" />
        <h3 className="text-base font-bold text-slate-800">Workspace Access Restricted</h3>
        <p className="text-sm text-slate-500 mt-2">
          Your team (<strong>{activeUser.teamName || "No Team Assigned"}</strong>) does not have permission to view the <strong>Deals & Leads</strong> workspace. Please contact a Platform Administrator to request permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Search and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200">
        <div className="flex-1 flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Search by client, company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-3 py-1 w-full text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 text-[11px]">
            <Filter size={11} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 py-1 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="All">All Stages</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Proposal">Proposal</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Closed Won">Closed Won</option>
              <option value="Closed Lost">Closed Lost</option>
            </select>
          </div>

          {/* Product Filter */}
          <div className="flex items-center gap-1 text-[11px]">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-slate-0 bg-slate-50 border border-slate-200 text-slate-700 py-1 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="All">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Add Lead button */}
        {teamCanAdd ? (
          <button
            id="btn-add-lead"
            onClick={handleOpenAdd}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Sales Lead</span>
          </button>
        ) : (
          <button
            disabled
            title="Your team does not have permission to add leads."
            className="bg-slate-100 text-slate-400 border border-slate-200 text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-all shrink-0 cursor-not-allowed"
          >
            <Lock size={12} />
            <span>Add Sales Lead</span>
          </button>
        )}
      </div>

      {/* Leads Grid/Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        {visibleLeads.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <ShieldAlert size={36} className="mx-auto text-slate-300 mb-2" />
            <h4 className="text-xs font-bold text-slate-700">No Permitted Leads Found</h4>
            <p className="text-[11px] max-w-sm mx-auto mt-0.5">
              Either matching parameters don't exist, or your hierarchical clearance limits viewing rights. Try switching user context.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-slate-800">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                  <th className="py-2 px-3 pl-4 font-bold">Client & Company</th>
                  <th className="py-2 px-2 font-bold">Product Name</th>
                  <th className="py-2 px-2 font-bold">Stage</th>
                  <th className="py-2 px-2 font-bold">Amount (Qty × Rate)</th>
                  <th className="py-2 px-2 font-bold">Access Ownership</th>
                  <th className="py-2 px-3 text-right font-bold pr-4">Auth Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleLeads.map((lead) => {
                  const editable = canEditLead(activeUserId, lead, users);
                  const deletable = canDeleteLead(activeUserId, lead, users);
                  
                  // Ownership indicators
                  const isSelfCreated = lead.createdByUserId === activeUserId;
                  const isSelfAssigned = lead.assignedToUserId === activeUserId;
                  let ownershipLabel = "";
                  let ownershipStyle = "";
                  
                  if (isSelfCreated && isSelfAssigned) {
                    ownershipLabel = "Direct Owner";
                    ownershipStyle = "bg-teal-50 text-teal-700 border-teal-100";
                  } else if (isSelfCreated) {
                    ownershipLabel = "Created by Self";
                    ownershipStyle = "bg-blue-50 text-blue-700 border-blue-100";
                  } else if (isSelfAssigned) {
                    ownershipLabel = "Assigned to Self";
                    ownershipStyle = "bg-amber-50 text-amber-700 border-amber-100";
                  } else {
                    ownershipLabel = `Team: ${getCreatorName(lead.createdByUserId)}`;
                    ownershipStyle = "bg-purple-50 text-purple-700 border-purple-100";
                  }

                  const stagePills: Record<string, string> = {
                    New: "bg-blue-50 text-blue-700 border-blue-100",
                    Contacted: "bg-purple-50 text-purple-700 border-purple-100",
                    Proposal: "bg-amber-50 text-amber-700 border-amber-100",
                    Negotiation: "bg-orange-50 text-orange-700 border-orange-100",
                    "Closed Won": "bg-emerald-50 text-emerald-700 border-emerald-100",
                    "Closed Lost": "bg-rose-50 text-rose-700 border-rose-100",
                  };

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-all font-medium text-slate-800">
                      {/* Name & Company */}
                      <td className="py-1.5 px-3 pl-4">
                        <div>
                          <span className="text-slate-900 font-bold block leading-none">{lead.clientName}</span>
                          <span className="text-slate-500 text-[10px] block mt-0.5 leading-none">{lead.companyName}</span>
                          <span className="text-[9.5px] font-mono text-slate-450 block mt-0.5 leading-none">{lead.email}</span>
                        </div>
                      </td>

                      {/* Product Name / Items */}
                      <td className="py-1.5 px-2">
                        {lead.items && lead.items.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold truncate max-w-[160px] inline-block"
                              title={lead.items.map((i) => i.productName).join(", ")}
                            >
                              {lead.items[0].productName || currentProjectName(lead.projectId)}
                            </span>
                            {lead.items.length > 1 && (
                              <span className="text-[9px] text-emerald-700 font-bold font-mono">
                                +{lead.items.length - 1} more product{lead.items.length > 2 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                            {currentProjectName(lead.projectId)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-1.5 px-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase font-mono ${stagePills[lead.status] || "bg-slate-50 text-slate-500 border-slate-100"}`}>
                          {lead.status}
                        </span>
                      </td>

                      {/* Value / Amount */}
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col">
                          <span className="text-slate-950 font-mono font-bold leading-none">
                            ₹{(lead.amount ?? lead.value).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 leading-none">
                            {lead.items && lead.items.length > 1
                              ? `${lead.items.length} product items`
                              : `${lead.quantity ?? 1} × ₹${(lead.rate ?? lead.value).toLocaleString()}`}
                          </span>
                        </div>
                      </td>

                      {/* Ownership details */}
                      <td className="py-1.5 px-2 text-[10px]">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-block text-[9px] font-bold px-1 rounded border leading-tight self-start ${ownershipStyle}`}>
                            {ownershipLabel}
                          </span>
                          <div className="text-[9px] text-slate-400 font-mono">
                            Assigned: <span className="font-semibold text-slate-600">{getAssigneeName(lead.assignedToUserId)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Edit & Delete Action indicators and controls */}
                      <td className="py-1.5 px-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit logic */}
                          {editable && teamCanEdit ? (
                            <button
                              id={`edit-lead-${lead.id}`}
                              onClick={() => handleOpenEdit(lead)}
                              title="Edit Lead (Authorized)"
                              className="text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 p-1 rounded border border-amber-200 transition-all cursor-pointer"
                            >
                              <Edit2 size={12} />
                            </button>
                          ) : (
                            <button
                              disabled
                              title={!teamCanEdit ? "Your team does not have edit permission." : `Unauthorized parameters! Creator (${getCreatorName(lead.createdByUserId)}) required.`}
                              className="text-slate-350 bg-slate-50 p-1 rounded border border-slate-100 cursor-not-allowed"
                            >
                              <Lock size={12} className="opacity-45" />
                            </button>
                          )}

                          {/* Delete logic with Inline Confirmation */}
                          <InlineDeleteConfirm
                            id={`delete-lead-${lead.id}`}
                            disabled={!deletable}
                            disabledTitle="Delete forbidden. Requires Manager role."
                            onConfirm={() => onDeleteLead(lead.id)}
                            title="Delete Lead (Authorized - Manager)"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Lead Modal Overlay */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-emerald-950 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <Plus size={18} /> Add Sales Lead
                </h3>
                <p className="text-xs text-emerald-200 mt-1">Creating a lead as {activeUser.name} ({activeUser.accessLevel} clearance)</p>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-emerald-100 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Company Name Selection */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                    <span>Company Name *</span>
                    <button
                      type="button"
                      onClick={() => {
                        setClientTeamName(isExecutive ? "" : (activeUser.teamName || ""));
                        setIsAddClientModalOpen(true);
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus size={11} /> Register New Company
                    </button>
                  </label>
                  {clientCompanies.length > 0 ? (
                    <select
                      required
                      value={newCompanyName}
                      onChange={(e) => {
                        const compName = e.target.value;
                        setNewCompanyName(compName);
                        
                        // Populate from the first client contact matching company
                        const matchedClients = clients.filter((c) => c.companyName === compName);
                        if (matchedClients.length > 0) {
                          setNewClientName(matchedClients[0].fullName);
                          setNewEmail(matchedClients[0].email);
                          setNewPhone(matchedClients[0].phone);
                        }
                      }}
                      className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                    >
                      <option value="">-- Select Company --</option>
                      {clientCompanies.map((comp) => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full flex flex-col gap-1.5 p-2 bg-amber-50 border border-amber-100 rounded-xl">
                      <span className="text-[11px] text-amber-800 font-medium">No registered companies in directory.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setClientTeamName(isExecutive ? "" : (activeUser.teamName || ""));
                          setIsAddClientModalOpen(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-3 rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors self-start cursor-pointer"
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
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              {/* Conditionally render dynamic contact details selection dropdown according to selected Company Name */}
              {newCompanyName && clients.filter((c) => c.companyName === newCompanyName).length > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl text-xs space-y-1 animate-fade-in">
                  <label className="text-[10px] font-extrabold text-emerald-800 block uppercase tracking-wider font-mono">
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
                      }
                    }}
                    className="w-full text-xs border border-emerald-200 bg-white px-2 py-1.5 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono"
                  >
                    <option value="">-- Populate matching registered client details option --</option>
                    {clients.filter((c) => c.companyName === newCompanyName).map((contact) => (
                      <option key={contact.id} value={`${contact.fullName}|${contact.email}|${contact.phone}`}>
                        Contact: {contact.fullName} ({contact.email || "No email"} • {contact.phone || "No phone"})
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
                    placeholder="Select company above"
                    value={newEmail}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    placeholder="Select company above"
                    value={newPhone}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as SalesLead["status"])}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                >
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closed Won">Closed Won</option>
                  <option value="Closed Lost">Closed Lost</option>
                </select>
              </div>

              {/* Multi-Product Line Items Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase font-mono">Product Line Items</h4>
                    <p className="text-[11px] text-slate-400">Add product details with quantity and rate</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProductRow}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus size={13} /> Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {newProductItems.map((item, idx) => {
                    const rowAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                    return (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Product Name</label>
                          <select
                            value={item.productId}
                            onChange={(e) => handleProductRowChange(idx, "productId", e.target.value)}
                            className="w-full text-xs border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Qty (Kg)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Qty in Kg"
                            value={item.quantity}
                            onChange={(e) => handleProductRowChange(idx, "quantity", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                            className="w-full text-xs border border-slate-200 bg-white px-2 py-1.5 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Rate (₹)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Rate"
                            value={item.rate}
                            onChange={(e) => handleProductRowChange(idx, "rate", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                            className="w-full text-xs border border-slate-200 bg-white px-2 py-1.5 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Amount</label>
                          <div className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1.5 rounded-lg h-[30px] flex items-center truncate">
                            ₹{rowAmount.toLocaleString()}
                          </div>
                        </div>

                        <div className="sm:col-span-1 flex items-center justify-center pt-2 sm:pt-4">
                          {newProductItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveProductRow(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remove product"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-mono font-bold text-slate-700">
                  <span>Total Quantity: {newProductItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)}</span>
                  <span className="text-emerald-700 text-sm">
                    Total Amount: ₹{newProductItems.reduce((sum, i) => sum + ((Number(i.quantity) || 0) * (Number(i.rate) || 0)), 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Assign Lead To</span>
                  <span className="text-[10px] text-slate-400 capitalize">reports tree limits</span>
                </label>
                <select
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                >
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Lead Project Notes</label>
                <textarea
                  placeholder="Insert notes, meeting briefs or client specifications..."
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
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
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">PO Date *</label>
                      <input
                        type="date"
                        required
                        value={newPoDate}
                        onChange={(e) => setNewPoDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Term</label>
                      <input
                        type="text"
                        value={newFreightTerm}
                        onChange={(e) => setNewFreightTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Transporter Name</label>
                      <input
                        type="text"
                        value={newTransporterName}
                        onChange={(e) => setNewTransporterName(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
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
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Warehouse Managed By</label>
                      <input
                        type="text"
                        value={newWarehouseManagedBy}
                        onChange={(e) => setNewWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Destination Delivery Address</label>
                    <textarea
                      rows={2}
                      value={newDestinationAddress}
                      onChange={(e) => setNewDestinationAddress(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Date</label>
                      <input
                        type="date"
                        value={newDispatchDate}
                        onChange={(e) => setNewDispatchDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Dispatch Location</label>
                      <input
                        type="text"
                        value={newDispatchLocation}
                        onChange={(e) => setNewDispatchLocation(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attach PO (URL)</label>
                    <input
                      type="text"
                      placeholder="Enter PO document link..."
                      value={newPoAttachmentUrl}
                      onChange={(e) => setNewPoAttachmentUrl(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 text-sm font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow"
                >
                  Confirm & Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Modal Overlay */}
      {isEditOpen && editingLead && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-amber-950 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <Edit2 size={18} /> Modify Sales Lead
                </h3>
                <p className="text-xs text-amber-200 mt-1">Editing as {activeUser.name} ({activeUser.accessLevel} scope)</p>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="text-amber-100 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={editClientName}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Company Name *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={editCompanyName}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Address *</label>
                  <input
                    type="email"
                    required
                    readOnly
                    value={editEmail}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={editPhone}
                    className="w-full text-sm border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pipeline Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as SalesLead["status"])}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                >
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closed Won">Closed Won</option>
                  <option value="Closed Lost">Closed Lost</option>
                </select>
              </div>

              {/* Multi-Product Line Items Section - Edit */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase font-mono">Product Line Items</h4>
                    <p className="text-[11px] text-slate-400">Modify product details, quantity, and rate</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditProductRow}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus size={13} /> Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {editProductItems.map((item, idx) => {
                    const rowAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                    return (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Product Name</label>
                          <select
                            value={item.productId}
                            onChange={(e) => handleEditProductRowChange(idx, "productId", e.target.value)}
                            className="w-full text-xs border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Qty (Kg)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Qty in Kg"
                            value={item.quantity}
                            onChange={(e) => handleEditProductRowChange(idx, "quantity", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                            className="w-full text-xs border border-slate-200 bg-white px-2 py-1.5 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Rate (₹)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Rate"
                            value={item.rate}
                            onChange={(e) => handleEditProductRowChange(idx, "rate", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                            className="w-full text-xs border border-slate-200 bg-white px-2 py-1.5 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase font-mono">Amount</label>
                          <div className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1.5 rounded-lg h-[30px] flex items-center truncate">
                            ₹{rowAmount.toLocaleString()}
                          </div>
                        </div>

                        <div className="sm:col-span-1 flex items-center justify-center pt-2 sm:pt-4">
                          {editProductItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEditProductRow(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remove product"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-mono font-bold text-slate-700">
                  <span>Total Quantity: {editProductItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)}</span>
                  <span className="text-amber-700 text-sm">
                    Total Amount: ₹{editProductItems.reduce((sum, i) => sum + ((Number(i.quantity) || 0) * (Number(i.rate) || 0)), 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Reassigned Owner</label>
                <select
                  value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                >
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Active Project Notes</label>
                <textarea
                  rows={2}
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
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Freight Term</label>
                      <input
                        type="text"
                        value={editFreightTerm}
                        onChange={(e) => setEditFreightTerm(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Transporter Name</label>
                      <input
                        type="text"
                        value={editTransporterName}
                        onChange={(e) => setEditTransporterName(e.target.value)}
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
                      <input
                        type="text"
                        value={editWarehouseManagedBy}
                        onChange={(e) => setEditWarehouseManagedBy(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
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
                      <input
                        type="text"
                        value={editDispatchLocation}
                        onChange={(e) => setEditDispatchLocation(e.target.value)}
                        className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-tight">Attach PO (URL)</label>
                    <input
                      type="text"
                      placeholder="Enter PO document link..."
                      value={editPoAttachmentUrl}
                      onChange={(e) => setEditPoAttachmentUrl(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 text-sm font-semibold rounded-xl"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          ADD CLIENT DIRECTORY MODAL
         ---------------------------------------------------- */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-emerald-950 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <Building2 size={18} /> Register Client Directory Entry
                </h3>
                <p className="text-xs text-emerald-200 mt-1">Populate organizational client details for instant Lead generation</p>
              </div>
              <button onClick={() => setIsAddClientModalOpen(false)} className="text-emerald-100 hover:text-white transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddClientSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Richard Hendricks"
                    value={clientFullName}
                    onChange={(e) => setClientFullName(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pied Piper"
                    value={clientCompanyName}
                    onChange={(e) => setClientCompanyName(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. richard@piedpiper.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">GST Identification (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={clientGst}
                    onChange={(e) => setClientGst(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">City (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={clientCity}
                    onChange={(e) => setClientCity(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pincode (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 400001"
                    value={clientPincode}
                    onChange={(e) => setClientPincode(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Associated Team {isExecutive ? "(Optional)" : ""}</label>
                <select
                  value={isExecutive ? clientTeamName : (activeUser.teamName || "")}
                  onChange={(e) => isExecutive && setClientTeamName(e.target.value)}
                  disabled={!isExecutive}
                  className={`w-full text-sm border border-slate-200 px-3 py-2 rounded-xl focus:ring-1 outline-none ${
                    isExecutive
                      ? "bg-slate-50 text-slate-800 cursor-pointer focus:ring-emerald-500"
                      : "bg-slate-100 text-slate-500 cursor-not-allowed select-none font-medium"
                  }`}
                >
                  {isExecutive ? (
                    <>
                      <option value="">Select Team (or leave Unassigned)</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value={activeUser.teamName || ""}>
                      {activeUser.teamName || "Unassigned"} (Auto-assigned)
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Full Billing Address</label>
                <textarea
                  placeholder="Insert client street, building and office numbers..."
                  rows={2}
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-150 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={16} /> Register Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
