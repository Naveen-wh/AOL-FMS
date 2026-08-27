import React, { useState } from "react";
import { User, Role, AccessLevel, TransporterName } from "../types";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { formatDate } from "../utils";
import { Truck, Plus, Trash2, Edit2, Save, X, Check, Search, Shield, CheckCircle2, AlertTriangle, Info, Mail, Phone, UserCheck, MapPin, FileSpreadsheet } from "lucide-react";

interface TransporterManagementViewProps {
  activeUserId?: string;
  users?: User[];
  transporters?: TransporterName[];
  onAddTransporter?: (data: Omit<TransporterName, "id" | "createdAt">) => Promise<void> | void;
  onSaveTransporter?: (transporter: TransporterName) => Promise<void> | void;
  onDeleteTransporter?: (id: string) => Promise<void> | void;
}

export default function TransporterManagementView({
  activeUserId,
  users = [],
  transporters = [],
  onAddTransporter,
  onSaveTransporter,
  onDeleteTransporter,
}: TransporterManagementViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId);
  const isAdmin = activeUser?.role === Role.Admin;
  const isSeniorManager = activeUser?.role === Role.SeniorManager;
  const isManager = activeUser?.role === Role.Manager;

  const canManageTransporters = isAdmin || isSeniorManager || (isManager && activeUser?.accessLevel === AccessLevel.Manager);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);

  const transporterImportFields: ImportFieldDefinition[] = [
    { key: "transporterId", label: "Transporter ID", sampleValue: "TR-001" },
    { key: "name", label: "Transporter / Courier Name", required: true, sampleValue: "BlueDart Express" },
    { key: "contactPerson", label: "Contact Person Name", sampleValue: "Suresh Kumar" },
    { key: "emailId", label: "Email Address", sampleValue: "dispatch@bluedart.com" },
    { key: "phone", label: "Phone Number", sampleValue: "+91 9876543210" },
    { key: "address", label: "Address / Hub Location", sampleValue: "Bhiwandi Hub, Maharashtra" },
  ];

  const handleImportTransporters = async (rows: Record<string, any>[]) => {
    let count = 0;
    if (!onAddTransporter) return { successCount: 0 };
    for (const row of rows) {
      if (row.name && row.name.trim()) {
        await onAddTransporter({
          transporterId: row.transporterId?.trim() || undefined,
          name: row.name.trim(),
          contactPerson: row.contactPerson?.trim() || undefined,
          emailId: row.emailId?.trim() || undefined,
          phone: row.phone?.trim() || undefined,
          address: row.address?.trim() || undefined,
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Create Transporter form state
  const [newTransporterId, setNewTransporterId] = useState("");
  const [newName, setNewName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [emailId, setEmailId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit Transporter Modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTransporterId, setEditTransporterId] = useState("");
  const [editName, setEditName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editEmailId, setEditEmailId] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetCreateForm = () => {
    setNewTransporterId("");
    setNewName("");
    setContactPerson("");
    setEmailId("");
    setPhone("");
    setAddress("");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateMsg({ type: "error", text: "Transporter name is required." });
      return;
    }

    setIsCreating(true);
    setCreateMsg(null);

    try {
      if (transporters.some((t) => t.name.toLowerCase() === trimmedName.toLowerCase())) {
        setCreateMsg({ type: "error", text: `Transporter "${trimmedName}" already exists!` });
        setIsCreating(false);
        return;
      }

      const payload: Omit<TransporterName, "id" | "createdAt"> = {
        transporterId: newTransporterId.trim() || undefined,
        name: trimmedName,
        contactPerson: contactPerson.trim() || undefined,
        emailId: emailId.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };

      if (onAddTransporter) {
        await onAddTransporter(payload);
        setCreateMsg({
          type: "success",
          text: `Transporter "${trimmedName}" registered successfully!`,
        });
        resetCreateForm();
      }
    } catch (err) {
      console.error("Error adding transporter:", err);
      setCreateMsg({ type: "error", text: "Failed to register transporter." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartEdit = (item: TransporterName) => {
    setEditingId(item.id);
    setEditTransporterId(item.transporterId || "");
    setEditName(item.name || "");
    setEditContactPerson(item.contactPerson || "");
    setEditEmailId(item.emailId || "");
    setEditPhone(item.phone || "");
    setEditAddress(item.address || "");
    setEditMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;

    setIsSavingEdit(true);
    setEditMsg(null);

    try {
      const existing = transporters.find((t) => t.id === editingId);
      if (!existing) return;

      const updatedObj: TransporterName = {
        ...existing,
        transporterId: editTransporterId.trim() || undefined,
        name: editName.trim(),
        contactPerson: editContactPerson.trim() || undefined,
        emailId: editEmailId.trim() || undefined,
        phone: editPhone.trim() || undefined,
        address: editAddress.trim() || undefined,
      };

      if (onSaveTransporter) {
        await onSaveTransporter(updatedObj);
      } else if (onAddTransporter) {
        await onAddTransporter(updatedObj);
      }

      setEditMsg({ type: "success", text: "Transporter details updated successfully!" });
      setTimeout(() => {
        setEditingId(null);
        setEditMsg(null);
      }, 1200);
    } catch (err) {
      console.error("Error updating transporter:", err);
      setEditMsg({ type: "error", text: "Failed to update transporter." });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredTransporters = transporters.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.transporterId && t.transporterId.toLowerCase().includes(q)) ||
      (t.contactPerson && t.contactPerson.toLowerCase().includes(q)) ||
      (t.emailId && t.emailId.toLowerCase().includes(q)) ||
      (t.phone && t.phone.toLowerCase().includes(q)) ||
      (t.address && t.address.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="text-blue-400 shrink-0" size={20} />
            <h2 className="text-sm font-extrabold tracking-wide uppercase font-mono">
              Transporter Name Directory
            </h2>
          </div>
          <p className="text-xs text-blue-100/80 mt-1 max-w-2xl leading-relaxed">
            Manage logistics transporters & courier partners including contact person, email, phone, and address details.
            Adding or editing transporter options updates choice dropdowns across sales & fulfillment modules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Import Transporters (Sheets / CSV)</span>
            </button>
          )}

          <div className="bg-slate-800/80 text-blue-300 border border-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5">
            <Shield size={14} className="text-blue-400" />
            <span>
              {isAdmin
                ? "Admin Clearance"
                : isSeniorManager
                ? "Senior Manager Clearance"
                : isManager
                ? "Department Manager Clearance"
                : "Read-Only View"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form Panel: Add New Transporter */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="bg-blue-100 text-blue-800 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Add New Transporter</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  Register a logistics partner & contact info
                </p>
              </div>
            </div>

            {createMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                  createMsg.type === "success"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : "bg-rose-50 border-rose-300 text-rose-900"
                }`}
              >
                {createMsg.type === "success" ? (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                )}
                <span>{createMsg.text}</span>
              </div>
            )}

            {canManageTransporters ? (
              <form onSubmit={handleCreateSubmit} className="space-y-3">
                {/* Transporter ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Transporter ID
                  </label>
                  <input
                    type="text"
                    value={newTransporterId}
                    onChange={(e) => setNewTransporterId(e.target.value)}
                    placeholder="e.g. TR-001, BD-EXP-01"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                {/* Transporter / Courier Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Transporter / Courier Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. BlueDart Express, VRL Logistics, Spoton"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                {/* Contact Person Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Contact Person Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="e.g. Suresh Kumar"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                    <UserCheck size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Email ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Email ID
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={emailId}
                      onChange={(e) => setEmailId(e.target.value)}
                      placeholder="e.g. dispatch@transporter.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                    <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                    <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Address
                  </label>
                  <div className="relative">
                    <textarea
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Plot 42, Transport Nagar, Bhiwandi, Maharashtra"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  {isCreating ? "Registering Transporter..." : "Register Transporter"}
                </button>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center text-xs text-slate-500">
                You need Manager or Admin clearance to register new transporters.
              </div>
            )}
          </div>

          <div className="bg-blue-50/50 border border-blue-200/60 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-bold text-blue-900">
              <Info size={14} className="text-blue-600 shrink-0" />
              <span>Transporters Integration</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              Registered transporters automatically populate transporter selection dropdowns when creating orders, closing leads as won, and generating shipping indents.
            </p>
          </div>
        </div>

        {/* Table / List View */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-blue-600" />
              <h3 className="text-xs font-bold text-slate-900">
                Registered Transporters ({transporters.length})
              </h3>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, contact, phone, email..."
                className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Transporter Name</th>
                  <th className="py-2.5 px-3 font-bold">Contact Person & Address</th>
                  <th className="py-2.5 px-3 font-bold">Email & Phone</th>
                  <th className="py-2.5 px-3 font-bold">Created Date</th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransporters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      <Truck size={28} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-bold text-slate-600">No Transporters Found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {searchTerm ? "No transporter matches your search." : "No transporters registered in database."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredTransporters.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & ID */}
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <Truck size={15} className="text-blue-600 shrink-0" />
                          <div>
                            <span className="block font-extrabold text-slate-900">{item.name}</span>
                            <span className="text-[9px] font-mono text-slate-500 block">
                              ID: <span className="text-blue-700 font-semibold">{item.transporterId || item.id}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact Person & Address */}
                      <td className="py-2.5 px-3 text-slate-700">
                        <div className="space-y-0.5">
                          {item.contactPerson ? (
                            <div className="flex items-center gap-1 font-semibold text-[11px] text-slate-800">
                              <UserCheck size={12} className="text-emerald-600 shrink-0" />
                              <span>{item.contactPerson}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px] block">No contact person</span>
                          )}
                          {item.address ? (
                            <div className="flex items-start gap-1 text-[10.5px] text-slate-500">
                              <MapPin size={11} className="text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{item.address}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* Email & Phone */}
                      <td className="py-2.5 px-3 text-slate-700">
                        <div className="space-y-0.5 text-[11px]">
                          {item.emailId ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <Mail size={12} className="text-slate-400 shrink-0" />
                              <span className="font-mono text-[10.5px]">{item.emailId}</span>
                            </div>
                          ) : null}
                          {item.phone ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <Phone size={12} className="text-slate-400 shrink-0" />
                              <span className="font-mono text-[10.5px]">{item.phone}</span>
                            </div>
                          ) : null}
                          {!item.emailId && !item.phone && (
                            <span className="text-slate-400 italic text-[11px]">No contact details</span>
                          )}
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.createdAt ? formatDate(item.createdAt) : "N/A"}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        {canManageTransporters && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Edit Transporter Details"
                            >
                              <Edit2 size={14} />
                            </button>
                            {deletingId === item.id ? (
                              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono">
                                <span className="font-semibold text-rose-700">Delete?</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (onDeleteTransporter) {
                                      await onDeleteTransporter(item.id);
                                    }
                                    setDeletingId(null);
                                  }}
                                  className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                  title="Confirm delete transporter"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="text-slate-500 hover:bg-slate-200 p-0.5 rounded cursor-pointer transition-all"
                                  title="Cancel delete"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(item.id)}
                                className="p-1 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Delete Transporter"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-blue-400" />
                <h3 className="text-xs font-extrabold font-mono uppercase tracking-wider">
                  Edit Transporter Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {editMsg && (
              <div
                className={`m-3.5 p-2.5 rounded text-xs font-medium flex items-center gap-2 border ${
                  editMsg.type === "success"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : "bg-rose-50 border-rose-300 text-rose-900"
                }`}
              >
                {editMsg.type === "success" ? (
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                )}
                <span>{editMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="p-4 space-y-3 overflow-y-auto">
              {/* Transporter ID */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Transporter ID
                </label>
                <input
                  type="text"
                  value={editTransporterId}
                  onChange={(e) => setEditTransporterId(e.target.value)}
                  placeholder="e.g. TR-001, BD-EXP-01"
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Transporter / Courier Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={editContactPerson}
                  onChange={(e) => setEditContactPerson(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Email ID
                  </label>
                  <input
                    type="email"
                    value={editEmailId}
                    onChange={(e) => setEditEmailId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Save size={14} />
                  {isSavingEdit ? "Saving..." : "Save Transporter"}
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
        title="Import Transporter Directory"
        entityName="Transporter Directory"
        fields={transporterImportFields}
        onImport={handleImportTransporters}
      />
    </div>
  );
}
