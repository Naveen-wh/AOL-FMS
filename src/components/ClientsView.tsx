/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User, SalesLead, ProjectWorkflow, SalesTask, Client, Team, Role, Product } from "../types";
import {
  canEditTask,
  canDeleteTask,
  canViewTask,
  canViewLead,
  canViewClient,
  canEditClient,
  canDeleteClient,
  getReportingTreeUsers,
} from "../data";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { formatDate } from "../utils";
import {
  Plus,
  CheckSquare,
  Square,
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Check,
  Tag,
  Kanban,
  ListTodo,
  X,
  Search,
  Building2,
  Mail,
  Phone,
  MapPin,
  Landmark,
  FileText,
  DollarSign,
  TrendingUp,
  User as UserIcon,
  Briefcase,
  Layers,
  Sparkles,
  Edit2,
  FileSpreadsheet,
} from "lucide-react";

interface ClientsViewProps {
  activeUserId: string;
  users: User[];
  clients: Client[];
  teams: Team[];
  onAddClient: (clientData: Omit<Client, "id" | "createdAt">) => void;
  onEditClient: (clientId: string, clientData: Partial<Omit<Client, "id" | "createdAt" | "createdByUserId">>) => void;
  onDeleteClient: (clientId: string) => void;
  leads: SalesLead[];
  workflows: ProjectWorkflow[];
  products?: Product[];
  tasks: SalesTask[];
  onAddTask: (task: Omit<SalesTask, "id">) => void;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function ClientsView({
  activeUserId,
  users,
  clients,
  teams = [],
  onAddClient,
  onEditClient,
  onDeleteClient,
  leads = [],
  workflows = [],
  products = [],
  tasks = [],
  onAddTask,
  onToggleTaskComplete,
  onDeleteTask,
  levelWiseFilters,
}: ClientsViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];
  const isExecutive = activeUser.teamName === "Executive" || activeUser.role === Role.Admin;

  // Search & Selection state
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("All");

  // Add Client Modal states
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gst, setGst] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [address, setAddress] = useState("");
  const [clientTeamName, setClientTeamName] = useState("");

  // Edit Client Modal states
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGst, setEditGst] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editClientTeamName, setEditClientTeamName] = useState("");

  // Import Modal state
  const [isImportOpen, setIsImportOpen] = useState(false);

  const clientImportFields: ImportFieldDefinition[] = [
    { key: "fullName", label: "Contact Full Name", required: true, sampleValue: "Rajesh Sharma" },
    { key: "companyName", label: "Company Name", required: true, sampleValue: "Apex BioTech Pvt Ltd" },
    { key: "email", label: "Email Address", sampleValue: "rajesh@apexbio.com" },
    { key: "phone", label: "Phone Number", sampleValue: "+91 9876543210" },
    { key: "gst", label: "GSTIN Number", sampleValue: "27AAAAA0000A1Z5" },
    { key: "city", label: "City", sampleValue: "Mumbai" },
    { key: "pincode", label: "Pincode", sampleValue: "400001" },
    { key: "address", label: "Address", sampleValue: "Andheri East" },
    { key: "teamName", label: "Assigned Team", sampleValue: "Sales Executive" },
  ];

  const handleImportClients = async (rows: Record<string, any>[]) => {
    let count = 0;
    for (const row of rows) {
      if (row.fullName && row.companyName) {
        await onAddClient({
          fullName: row.fullName.trim(),
          companyName: row.companyName.trim(),
          email: row.email?.trim() || "",
          phone: row.phone?.trim() || "",
          gst: row.gst?.trim() || "",
          city: row.city?.trim() || "",
          pincode: row.pincode?.trim() || "",
          address: row.address?.trim() || "",
          teamName: isExecutive ? (row.teamName?.trim() || undefined) : (activeUser.teamName || undefined),
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Add Task Modal states
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("2026-06-30");
  const [newTaskPriority, setNewTaskPriority] = useState<SalesTask["priority"]>("Medium");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskLeadId, setNewTaskLeadId] = useState("");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState(activeUserId);

  // ----------------------------------------------------
  // CLIENT FILTERING & SELECTION
  // ----------------------------------------------------
  const authorizedClients = clients.filter((client) => {
    const isLevelFilterEnabled = !!levelWiseFilters?.["clients"];
    return canViewClient(activeUserId, client, users, isLevelFilterEnabled);
  });

  const filteredClients = authorizedClients.filter((client) => {
    const term = clientSearchTerm.toLowerCase();
    
    // Filter by Team Name
    if (selectedTeamFilter !== "All") {
      const clientTeam = client.teamName || "Unassigned";
      if (clientTeam !== selectedTeamFilter) {
        return false;
      }
    }

    return (
      client.fullName.toLowerCase().includes(term) ||
      client.companyName.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term) ||
      (client.city && client.city.toLowerCase().includes(term)) ||
      (client.gst && client.gst.toLowerCase().includes(term))
    );
  });

  // Automatically select the first client if selectedClientId is invalid or not in list
  const activeClient =
    filteredClients.find((c) => c.id === selectedClientId) ||
    filteredClients[0];

  // ----------------------------------------------------
  // LEADS & METRICS FILTERING
  // ----------------------------------------------------
  const clientLeads = activeClient
    ? leads.filter(
        (lead) =>
          (lead.companyName === activeClient.companyName ||
            lead.clientName.toLowerCase() === activeClient.fullName.toLowerCase()) &&
          canViewLead(activeUserId, lead, users)
      )
    : [];

  const visibleLeads = clientLeads.slice(0, 5);

  const clientTotalPipelineValue = clientLeads.reduce(
    (sum, lead) => sum + (lead.value || 0),
    0
  );

  // Helpers
  const getAssignee = (userId: string) => {
    return (
      users.find((u) => u.id === userId) || {
        name: "Unassigned",
        role: "N/A",
        teamName: "General",
      }
    );
  };

  const getProjectName = (projId: string) => {
    return (
      products.find((w) => w.id === projId)?.name || "External Pipeline"
    );
  };

  const reportingIds = getReportingTreeUsers(activeUserId, users);
  const assignableUsers = [
    activeUser,
    ...users.filter((u) => reportingIds.includes(u.id)),
  ];

  // Handlers
  const handleAddClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !companyName) return;

    onAddClient({
      fullName,
      companyName,
      email,
      phone,
      gst,
      city,
      pincode,
      address,
      teamName: isExecutive ? (clientTeamName || undefined) : (activeUser.teamName || undefined),
    });

    // Reset Form
    setFullName("");
    setCompanyName("");
    setEmail("");
    setPhone("");
    setGst("");
    setCity("");
    setPincode("");
    setAddress("");
    setClientTeamName("");
    setIsAddClientOpen(false);
  };

  const handleEditClientClick = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop row click selection
    setEditingClient(client);
    setEditFullName(client.fullName);
    setEditCompanyName(client.companyName);
    setEditEmail(client.email || "");
    setEditPhone(client.phone || "");
    setEditGst(client.gst || "");
    setEditCity(client.city || "");
    setEditPincode(client.pincode || "");
    setEditAddress(client.address || "");
    setEditClientTeamName(isExecutive ? (client.teamName || "") : (activeUser.teamName || ""));
    setIsEditClientOpen(true);
  };

  const handleEditClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editFullName || !editCompanyName) return;

    onEditClient(editingClient.id, {
      fullName: editFullName.trim(),
      companyName: editCompanyName.trim(),
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      gst: editGst.trim().toUpperCase() || undefined,
      city: editCity.trim() || undefined,
      pincode: editPincode.trim() || undefined,
      address: editAddress.trim() || undefined,
      teamName: isExecutive ? (editClientTeamName || undefined) : (activeUser.teamName || undefined),
    });

    setIsEditClientOpen(false);
    setEditingClient(null);
  };

  const handleOpenAddTaskForLead = (lead: SalesLead) => {
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskDueDate("2026-06-30");
    setNewTaskPriority("Medium");
    setNewTaskProjectId(lead.projectId || products[0]?.id || "proj-1");
    setNewTaskLeadId(lead.id);
    setNewTaskAssignedTo(activeUserId);
    setIsAddTaskOpen(true);
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    onAddTask({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      status: "To Do",
      projectId: newTaskProjectId || products[0]?.id || "proj-1",
      leadId: newTaskLeadId || undefined,
      assignedToUserId: newTaskAssignedTo,
      createdByUserId: activeUserId,
    });

    setIsAddTaskOpen(false);
  };

  const priorityColors = {
    High: "bg-rose-50 text-rose-700 border-rose-100",
    Medium: "bg-amber-50 text-amber-700 border-amber-100",
    Low: "bg-blue-50 text-blue-700 border-blue-100",
  };

  const leadStatusColors = {
    New: "bg-blue-50 text-blue-700 border-blue-200",
    Contacted: "bg-amber-50 text-amber-700 border-amber-200",
    Proposal: "bg-purple-50 text-purple-700 border-purple-200",
    Negotiation: "bg-orange-50 text-orange-700 border-orange-200",
    "Closed Won": "bg-emerald-50 text-emerald-700 border-emerald-250",
    "Closed Lost": "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className="space-y-4">
      {/* ----------------------------------------------------
          TOP HEADER CONTROLS
         ---------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
        <div>
          <h2 className="text-xs font-bold font-mono uppercase text-slate-900 flex items-center gap-1.5">
            <Building2 className="text-emerald-600" size={14} /> Client Base Directory
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Manage comprehensive client identities, billing parameters, GST keys, and operational sales pipeline details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeUser.role === Role.Admin && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Import (Sheets / CSV)</span>
            </button>
          )}

          <button
            onClick={() => {
              setClientTeamName(isExecutive ? "" : (activeUser.teamName || ""));
              setIsAddClientOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Client Detail</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------
          STATS SUMMARY CARDS BANNER
         ---------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[9px] font-bold font-mono text-slate-400 block uppercase">Total Registered</span>
          <span className="text-lg font-bold text-slate-800 leading-tight block mt-0.5">{clients.length}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[9px] font-bold font-mono text-slate-400 block uppercase">Active Organizations</span>
          <span className="text-lg font-bold text-slate-800 leading-tight block mt-0.5">
            {new Set(clients.map((c) => c.companyName.toLowerCase())).size}
          </span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[9px] font-bold font-mono text-slate-400 block uppercase">GST Managed</span>
          <span className="text-lg font-bold text-slate-800 leading-tight block mt-0.5">
            {clients.filter((c) => c.gst).length} Clients
          </span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[9px] font-bold font-mono text-slate-400 block uppercase">Territories & Cities</span>
          <span className="text-lg font-bold text-slate-800 leading-tight block mt-0.5">
            {new Set(clients.map((c) => c.city.toLowerCase()).filter(Boolean)).size || 0} Cities
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------
          UPPER GRID LAYOUT (SECTION 1 & SECTION 2)
         ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* ==========================================
            SECTION 1: Combined Workspace Pipelines
           ========================================== */}
        <div id="section-combined-workspace-pipelines" className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-3xs flex flex-col overflow-hidden">
          {/* Header Block */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div>
              <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                <Layers size={13} className="text-indigo-600" />
                Combined Workspace Pipelines
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                Clients matrix showing basic data, operational details, and administrative controls
              </p>
            </div>
            
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
              {/* Team Filter Dropdown */}
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
              >
                <option value="All">All Teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
                <option value="Unassigned">Unassigned</option>
              </select>

              {/* Search Input Filter */}
              <div className="relative w-full sm:w-44">
                <Search size={12} className="absolute left-2.5 top-2.5 text-slate-450" />
                <input
                  type="text"
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  placeholder="Filter pipeline clients..."
                  className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium placeholder-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Combined Table Content */}
          <div className="overflow-x-auto flex-1 min-h-[310px] max-h-[310px]">
            {filteredClients.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Briefcase size={28} className="text-slate-300 mb-2" />
                <span className="font-bold text-xs text-slate-600 block">No Pipeline Clients Found</span>
                <span className="text-[10.5px] text-slate-450 max-w-xs mx-auto block mt-0.5 leading-snug">
                  No registered clients match your query or your scope privileges prevent viewing.
                </span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/40 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-100 font-mono">
                    <th className="py-2.5 px-3 pl-4 font-bold">Client Contact</th>
                    <th className="py-2.5 px-2 font-bold">Company Name</th>
                    <th className="py-2.5 px-2 font-bold">GST Identity</th>
                    <th className="py-2.5 px-2 font-bold">City Profile</th>
                    <th className="py-2.5 px-2 font-bold">Team</th>
                    <th className="py-2.5 px-3 pr-4 text-center font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredClients.map((client) => {
                    const isSelected = activeClient?.id === client.id;
                    const matchesCount = leads.filter(
                      (l) =>
                        l.companyName === client.companyName ||
                        l.clientName.toLowerCase() === client.fullName.toLowerCase()
                    ).length;

                    const deletable = canDeleteClient(activeUserId, client, users);

                    return (
                      <tr
                        key={client.id}
                        onClick={() => setSelectedClientId(client.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-indigo-50/50 hover:bg-indigo-50"
                            : "hover:bg-slate-50/50"
                        }`}
                      >
                        {/* Client details */}
                        <td className="py-2.5 px-3 pl-4">
                          <div>
                            <span className="text-slate-900 font-extrabold block text-[11px] leading-tight">
                              {client.fullName}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                              {client.email || "No Email listed"}
                            </span>
                          </div>
                        </td>

                        {/* Company */}
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold border border-slate-200">
                              {client.companyName}
                            </span>
                            {matchesCount > 0 && (
                              <span className="bg-indigo-100 text-indigo-800 text-[8.5px] font-extrabold px-1 rounded-full">
                                {matchesCount} Deals
                              </span>
                            )}
                          </div>
                        </td>

                        {/* GST Number */}
                        <td className="py-2.5 px-2">
                          {client.gst ? (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-250 px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase tracking-wider">
                              {client.gst}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Not Added</span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="py-2.5 px-2">
                          <span className="text-[10.5px] text-slate-700 font-medium">
                            {client.city || <span className="text-slate-400 italic">N/A</span>}
                          </span>
                        </td>

                        {/* Team */}
                        <td className="py-2.5 px-2">
                          {client.teamName ? (
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono">
                              {client.teamName}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                          )}
                        </td>

                        {/* Actions (Delete and selection feedback) */}
                        <td className="py-2.5 px-3 pr-4 text-center">
                          <div className="flex items-center justify-center gap-2 font-mono">
                            {/* Edit Client */}
                            {canEditClient(activeUserId, client, users) ? (
                              <button
                                onClick={(e) => handleEditClientClick(client, e)}
                                title="Edit Client Profile"
                                className="text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 p-1 rounded border border-amber-200 transition-all cursor-pointer inline-flex items-center"
                              >
                                <Edit2 size={10} />
                              </button>
                            ) : (
                              <button
                                disabled
                                title="Edit forbidden."
                                className="text-slate-300 bg-slate-50 p-1 rounded border border-slate-100 cursor-not-allowed inline-flex items-center"
                              >
                                <Edit2 size={10} className="opacity-45" />
                              </button>
                            )}

                            {/* Delete Client */}
                            {deletable ? (
                              deletingClientId === client.id ? (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono"
                                >
                                  <span className="font-semibold text-rose-700">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteClient(client.id);
                                      if (selectedClientId === client.id) {
                                        setSelectedClientId(null);
                                      }
                                      setDeletingClientId(null);
                                    }}
                                    className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                    title="Confirm delete client profile"
                                  >
                                    <Check size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingClientId(null);
                                    }}
                                    className="text-slate-500 hover:bg-slate-200 p-0.5 rounded cursor-pointer transition-all"
                                    title="Cancel delete"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingClientId(client.id);
                                  }}
                                  title="Delete Client Profile (Authorized)"
                                  className="text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1 rounded border border-rose-200 transition-all cursor-pointer inline-flex items-center"
                                >
                                  <Trash2 size={10} />
                                </button>
                              )
                            ) : (
                              <button
                                disabled
                                title="Delete forbidden. Requires Manager role."
                                className="text-slate-300 bg-slate-50 p-1 rounded border border-slate-100 cursor-not-allowed inline-flex items-center"
                              >
                                <Trash2 size={10} className="opacity-45" />
                              </button>
                            )}
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${
                                isSelected ? "bg-indigo-600 animate-pulse" : "bg-slate-300"
                              }`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          <div className="bg-slate-50/50 px-3.5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-mono">Authorized Accounts Node Stream</span>
            <span>Total Clients in Scope: {authorizedClients.length}</span>
          </div>
        </div>

        {/* ==========================================
            SECTION 2: Pipeline Workflows
           ========================================== */}
        <div id="section-pipeline-workflows" className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-3xs flex flex-col overflow-hidden">
          {/* Header Block */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Building2 size={13} className="text-emerald-600" />
              Pipeline Workflows
            </h2>
            <p className="text-[10px] text-slate-500 font-medium">
              Complete, detailed profile information of selected account node
            </p>
          </div>

          {/* Profile Card View */}
          <div className="p-4 flex-1 flex flex-col justify-between space-y-4 overflow-y-auto max-h-[310px]">
            {!activeClient ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-6">
                <UserIcon size={32} className="text-slate-300 mb-2" />
                <span className="font-bold text-xs text-slate-500 block">Select a Client</span>
                <p className="text-[10px] text-slate-400 max-w-xs mt-1">
                  Click a client profile in the Workspace Pipelines section to analyze workflow scopes and metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Main Identity Row */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-700 font-extrabold text-sm shrink-0 uppercase">
                    {activeClient.fullName.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <span className="font-extrabold text-sm text-slate-900 block leading-tight">
                      {activeClient.fullName}
                    </span>
                    <span className="text-[10.5px] text-slate-500 font-medium block mt-0.5">
                      Company Focus: {activeClient.companyName}
                    </span>
                    <span className="text-[10.5px] text-slate-500 font-medium block mt-0.5">
                      Team: {activeClient.teamName ? (
                        <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border border-indigo-150 ml-1">
                          {activeClient.teamName}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic ml-1">Unassigned</span>
                      )}
                    </span>
                    {activeClient.gst && (
                      <span className="inline-block mt-1 text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 px-1 py-0.2 rounded-sm uppercase tracking-wider">
                        GST: {activeClient.gst}
                      </span>
                    )}
                  </div>
                </div>

                {/* Subtext info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-150 text-[10.5px]">
                  {/* Contact Block */}
                  <div className="space-y-1.5">
                    <span className="text-[8.5px] uppercase font-mono text-slate-400 font-extrabold block">
                      Contact Matrix
                    </span>
                    <a
                      href={`mailto:${activeClient.email}`}
                      className="flex items-center gap-1.5 text-indigo-600 hover:underline font-mono truncate"
                    >
                      <Mail size={11} className="text-slate-400 shrink-0" />
                      {activeClient.email || "No Email"}
                    </a>
                    <a
                      href={`tel:${activeClient.phone}`}
                      className="flex items-center gap-1.5 text-slate-700 font-mono truncate"
                    >
                      <Phone size={11} className="text-slate-400 shrink-0" />
                      {activeClient.phone || "No Phone"}
                    </a>
                  </div>

                  {/* Location Block */}
                  <div className="space-y-1.5">
                    <span className="text-[8.5px] uppercase font-mono text-slate-400 font-extrabold block">
                      Registered Base
                    </span>
                    <div className="flex items-start gap-1 text-slate-700">
                      <MapPin size={11} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="leading-tight">
                        {activeClient.address ? (
                          <>
                            {activeClient.address}
                            {activeClient.city && <span className="block font-bold">{activeClient.city} {activeClient.pincode && `(${activeClient.pincode})`}</span>}
                          </>
                        ) : (
                          <span className="italic text-slate-400">Address incomplete</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Financial Pipeline aggregation values */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-50 rounded text-emerald-700 border border-emerald-100">
                      <TrendingUp size={13} />
                    </div>
                    <div>
                      <span className="text-[8px] uppercase font-mono text-slate-400 font-extrabold block leading-none">
                        Active Deals Value
                      </span>
                      <span className="text-[13px] font-extrabold text-emerald-700 block mt-0.5 leading-none">
                        {clientTotalPipelineValue > 0
                          ? `₹${clientTotalPipelineValue.toLocaleString("en-IN")}`
                          : "₹0"}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[8.5px] uppercase font-mono text-slate-400 font-extrabold block">
                      Assigned Agent
                    </span>
                    <span className="text-[11.5px] font-bold text-slate-700 block mt-0.5">
                      {activeClient.assignedToUserId
                        ? getAssignee(activeClient.assignedToUserId).name
                        : "Account Creator"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-slate-50/50 px-3.5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-mono">Created: {activeClient?.createdAt ? formatDate(activeClient.createdAt) : "N/A"}</span>
            <span className="font-mono text-emerald-600 font-bold uppercase tracking-wider">Operational Ready</span>
          </div>
        </div>
      </div>

      {/* ==========================================
          SECTION 3: Authorized Task Pipeline (5 Visible)
         ========================================== */}
      <div id="section-authorized-task-pipeline" className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
        {/* Header Panel */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-50 text-indigo-700 p-1.5 rounded-md">
              <Kanban size={13} />
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider">
                Authorized Task Pipeline ({visibleLeads.length} Visible)
              </h2>
              <p className="text-[9.5px] text-indigo-600 font-mono leading-none mt-0.5 uppercase tracking-wider font-bold">
                Operational deals & leads associated with {activeClient?.fullName || "First Client"}
              </p>
            </div>
          </div>
          
          <span className="text-[9.5px] text-slate-400 font-bold font-mono uppercase tracking-wider">
            Scope Lock ACTIVE
          </span>
        </div>

        {/* Pipeline Content */}
        {!activeClient ? (
          <div className="py-12 text-center text-slate-400">
            <ListTodo size={36} className="mx-auto text-slate-300 mb-1.5" />
            <span className="font-bold text-xs text-slate-600 block">No Active Pipeline Context</span>
            <span className="text-[10.5px] text-slate-450 mt-0.5">
              Select or register a client first to view operational sales pipelines and workflows.
            </span>
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <ListTodo size={36} className="mx-auto text-slate-300 mb-1.5" />
            <span className="font-bold text-xs text-slate-600 block">No Associated Leads or Deals Found</span>
            <p className="text-[10.5px] text-slate-450 max-w-sm mx-auto mt-1 leading-normal">
              There are currently no sales leads linked to <strong>{activeClient.fullName} ({activeClient.companyName})</strong> or your role permissions prevent you from viewing them.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleLeads.map((lead) => {
              const leadTasks = tasks.filter(
                (task) =>
                  task.leadId === lead.id && canViewTask(activeUserId, task, users)
              );

              // Progress bar metrics based on status
              const stages = ["New", "Contacted", "Proposal", "Negotiation", "Closed Won"];
              const currentStageIndex = stages.indexOf(lead.status === "Closed Lost" ? "Negotiation" : lead.status);
              const progressPct = ((currentStageIndex + 1) / stages.length) * 100;

              return (
                <div
                  key={lead.id}
                  className="p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors"
                >
                  {/* Lead information & metrics */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-xs text-slate-900">
                        {lead.clientName}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono bg-slate-100 px-1 rounded border border-slate-200">
                        Project ID: {getProjectName(lead.projectId)}
                      </span>
                      
                      {/* Financial Deal Value badge */}
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-150 px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold">
                        Amount: {lead.value ? `₹${lead.value.toLocaleString("en-IN")}` : "₹0"}
                        {lead.quantity !== undefined && lead.rate !== undefined && (
                          <span className="text-[8.5px] text-emerald-600 font-normal ml-1">
                            ({lead.quantity} × ₹{lead.rate.toLocaleString("en-IN")})
                          </span>
                        )}
                      </span>

                      {/* Lead Status Badge */}
                      <span
                        className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${
                          leadStatusColors[lead.status] || "bg-slate-50 text-slate-600"
                        }`}
                      >
                        {lead.status}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-slate-500 mt-1 max-w-3xl leading-snug">
                      {lead.notes || "No notes registered on this sales pipeline profile."}
                    </p>

                    {/* Progress tracking representation bar */}
                    <div className="mt-3.5 max-w-md">
                      <div className="flex justify-between text-[8.5px] font-extrabold text-slate-400 uppercase font-mono tracking-tight leading-none mb-1">
                        <span>Lead Gen</span>
                        <span>Contact</span>
                        <span>Proposal</span>
                        <span>Negotiation</span>
                        <span>Won</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
                        <div
                          className={`h-full transition-all ${
                            lead.status === "Closed Won"
                              ? "bg-emerald-500"
                              : lead.status === "Closed Lost"
                              ? "bg-rose-500"
                              : "bg-indigo-600"
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tasks Pipeline for this lead */}
                  <div className="xl:w-96 shrink-0 bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] uppercase font-mono text-slate-400 font-extrabold flex items-center gap-1 leading-none">
                          <ListTodo size={10} />
                          Related Lead Tasks ({leadTasks.length})
                        </span>
                        
                        {/* Quick Add Task trigger */}
                        <button
                          onClick={() => handleOpenAddTaskForLead(lead)}
                          title="Assign New Task to this Lead"
                          className="text-[9px] font-mono font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5 leading-none transition-all cursor-pointer shadow-3xs"
                        >
                          <Plus size={9} />
                          Add Task
                        </button>
                      </div>

                      {/* Scrollable list of specific tasks */}
                      {leadTasks.length === 0 ? (
                        <div className="text-center py-4 text-slate-400 italic text-[10px]">
                          No tasks assigned to this lead. Click Add Task above.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                          {leadTasks.map((task) => {
                            const isEditable = canEditTask(activeUserId, task, users);
                            const isDeletable = canDeleteTask(activeUserId, task, users);
                            const assignee = getAssignee(task.assignedToUserId);

                            return (
                              <div
                                key={task.id}
                                className="bg-white p-1.5 rounded border border-slate-150 flex items-start justify-between gap-1.5 text-[10px] shadow-3xs"
                              >
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <button
                                    disabled={!isEditable}
                                    onClick={() => onToggleTaskComplete(task.id)}
                                    className={`shrink-0 mt-0.5 rounded cursor-pointer ${
                                      isEditable ? "hover:scale-105" : "cursor-not-allowed opacity-55"
                                    }`}
                                  >
                                    {task.status === "Completed" ? (
                                      <CheckSquare className="text-emerald-600" size={12} />
                                    ) : (
                                      <Square className="text-slate-400" size={12} />
                                    )}
                                  </button>
                                  
                                  <div className="min-w-0">
                                    <span
                                      className={`font-bold text-slate-800 leading-tight block truncate ${
                                        task.status === "Completed" && "line-through text-slate-400"
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                    <span className="text-[8.5px] font-mono text-slate-400 block leading-tight mt-0.5">
                                      Owner: {assignee.name.slice(0, 12)}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <span className={`text-[8px] font-bold px-1 rounded-sm border font-mono ${priorityColors[task.priority]}`}>
                                    {task.priority}
                                  </span>

                                  {isDeletable ? (
                                    deletingTaskId === task.id ? (
                                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] animate-fade-in font-mono">
                                        <span className="font-semibold text-rose-700">Delete?</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            onDeleteTask(task.id);
                                            setDeletingTaskId(null);
                                          }}
                                          className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                          title="Confirm delete task"
                                        >
                                          <Check size={9} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setDeletingTaskId(null)}
                                          className="text-slate-500 hover:bg-slate-200 p-0.5 rounded cursor-pointer transition-all"
                                          title="Cancel delete"
                                        >
                                          <X size={9} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setDeletingTaskId(task.id)}
                                        title="Delete Task"
                                        className="text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-0.5 rounded border border-rose-150 transition-all cursor-pointer"
                                      >
                                        <Trash2 size={9} />
                                      </button>
                                    )
                                  ) : (
                                    <button
                                      disabled
                                      title="Delete forbidden. Requires Manager role."
                                      className="text-slate-300 bg-slate-50 p-0.5 rounded border border-slate-100 cursor-not-allowed"
                                    >
                                      <Trash2 size={9} className="opacity-45" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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

      {/* ----------------------------------------------------
          ADD CLIENT MODAL
         ---------------------------------------------------- */}
      {isAddClientOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-emerald-950 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <Building2 size={18} /> Register Client Directory Entry
                </h3>
                <p className="text-xs text-emerald-200 mt-1">Populate organizational client details for instant Lead generation</p>
              </div>
              <button onClick={() => setIsAddClientOpen(false)} className="text-emerald-100 hover:text-white transition-all cursor-pointer">
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
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pied Piper"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                    value={gst}
                    onChange={(e) => setGst(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">City (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bangalore"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pincode (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 560001"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
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
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 cursor-text"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow cursor-pointer"
                >
                  Save to Directory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          EDIT CLIENT MODAL
         ---------------------------------------------------- */}
      {isEditClientOpen && editingClient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-amber-950 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <Edit2 size={18} /> Edit Client Directory Entry
                </h3>
                <p className="text-xs text-amber-200 mt-1">Modify organizational client profile and billing credentials</p>
              </div>
              <button onClick={() => { setIsEditClientOpen(false); setEditingClient(null); }} className="text-amber-100 hover:text-white transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditClientSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Client Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Richard Hendricks"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pied Piper"
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
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
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">GST Identification (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={editGst}
                    onChange={(e) => setEditGst(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">City (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bangalore"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Pincode (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 560001"
                    value={editPincode}
                    onChange={(e) => setEditPincode(e.target.value)}
                    className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Associated Team {isExecutive ? "(Optional)" : ""}</label>
                <select
                  value={isExecutive ? editClientTeamName : (activeUser.teamName || "")}
                  onChange={(e) => isExecutive && setEditClientTeamName(e.target.value)}
                  disabled={!isExecutive}
                  className={`w-full text-sm border border-slate-200 px-3 py-2 rounded-xl focus:ring-1 outline-none ${
                    isExecutive
                      ? "bg-slate-50 text-slate-800 cursor-pointer focus:ring-amber-500"
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
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 cursor-text"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsEditClientOpen(false); setEditingClient(null); }}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl shadow cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          ADD TASK MODAL (AUTO-FILLED CONTEXT FOR RELATED LEAD)
         ---------------------------------------------------- */}
      {isAddTaskOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={14} className="text-indigo-400" />
                  Add Sales Task to Pipeline
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Creating task as {activeUser.name} ({activeUser.role})
                </p>
              </div>
              <button
                onClick={() => setIsAddTaskOpen(false)}
                className="text-slate-400 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTaskSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule meeting with CEO"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Task Description
                </label>
                <textarea
                  placeholder="Insert checklist elements, objectives or schedules..."
                  rows={2}
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as SalesTask["priority"])}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-bold"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Product Name
                  </label>
                  <select
                    value={newTaskProjectId}
                    onChange={(e) => setNewTaskProjectId(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Related Sales Lead
                  </label>
                  <select
                    disabled
                    value={newTaskLeadId}
                    className="w-full text-xs border border-slate-200 bg-slate-100 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-bold"
                  >
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.clientName} ({l.companyName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Assign Task To</span>
                  <span className="text-[8px] text-slate-400 capitalize">
                    reports tree limits
                  </span>
                </label>
                <select
                  value={newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                >
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddTaskOpen(false)}
                  className="px-3.5 py-1.5 text-slate-500 hover:bg-slate-50 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-750 hover:bg-indigo-800 text-white text-xs font-extrabold rounded-lg shadow uppercase font-mono tracking-wider"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Import Modal */}
      <DataImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Client Base Directory"
        entityName="Client Directory"
        fields={clientImportFields}
        onImport={handleImportClients}
      />
    </div>
  );
}
