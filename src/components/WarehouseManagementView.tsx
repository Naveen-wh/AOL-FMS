import React, { useState } from "react";
import { User, Role, AccessLevel, WarehouseManagedBy, DispatchLocation } from "../types";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { Warehouse, Plus, Trash2, Edit2, Save, X, Check, Search, Shield, CheckCircle2, AlertTriangle, Info, MapPin, UserCheck, Mail, Phone, FileSpreadsheet } from "lucide-react";

interface WarehouseManagementViewProps {
  activeUserId?: string;
  users?: User[];
  warehouses?: WarehouseManagedBy[];
  dispatchLocations?: DispatchLocation[];
  onAddWarehouse?: (data: Omit<WarehouseManagedBy, "id" | "createdAt">) => Promise<void> | void;
  onSaveWarehouse?: (warehouse: WarehouseManagedBy) => Promise<void> | void;
  onDeleteWarehouse?: (id: string) => Promise<void> | void;
}

export default function WarehouseManagementView({
  activeUserId,
  users = [],
  warehouses = [],
  dispatchLocations = [],
  onAddWarehouse,
  onSaveWarehouse,
  onDeleteWarehouse,
}: WarehouseManagementViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId);
  const isAdmin = activeUser?.role === Role.Admin;
  const isSeniorManager = activeUser?.role === Role.SeniorManager;
  const isManager = activeUser?.role === Role.Manager;

  const canManageWarehouses = isAdmin || isSeniorManager || (isManager && activeUser?.accessLevel === AccessLevel.Manager);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);

  const warehouseImportFields: ImportFieldDefinition[] = [
    { key: "warehouseName", label: "Warehouse / Fulfillment Name", required: true, sampleValue: "Central Bhiwandi Warehouse" },
    { key: "dispatchLocation", label: "Dispatch Location / City", sampleValue: "Mumbai Central" },
    { key: "warehouseManager", label: "Warehouse Manager", sampleValue: "Vikram Singh" },
    { key: "emailId", label: "Contact Email", sampleValue: "warehouse@aromaorganic.in" },
    { key: "mobileNo", label: "Mobile / Phone No", sampleValue: "+91 9811223344" },
    { key: "name", label: "Managed By Title", sampleValue: "Central Warehouse Team" },
  ];

  const handleImportWarehouses = async (rows: Record<string, any>[]) => {
    let count = 0;
    if (!onAddWarehouse) return { successCount: 0 };
    for (const row of rows) {
      const wName = row.warehouseName || row.name;
      if (wName && wName.trim()) {
        await onAddWarehouse({
          warehouseName: wName.trim(),
          name: row.name?.trim() || wName.trim(),
          dispatchLocation: row.dispatchLocation?.trim() || undefined,
          warehouseManager: row.warehouseManager?.trim() || undefined,
          emailId: row.emailId?.trim() || undefined,
          mobileNo: row.mobileNo?.trim() || undefined,
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Create Warehouse form states
  const [warehouseName, setWarehouseName] = useState("");
  const [dispatchLocation, setDispatchLocation] = useState("");
  const [warehouseManager, setWarehouseManager] = useState("");
  const [emailId, setEmailId] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [managedByTitle, setManagedByTitle] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit Warehouse Modal states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWarehouseName, setEditWarehouseName] = useState("");
  const [editDispatchLocation, setEditDispatchLocation] = useState("");
  const [editWarehouseManager, setEditWarehouseManager] = useState("");
  const [editEmailId, setEditEmailId] = useState("");
  const [editMobileNo, setEditMobileNo] = useState("");
  const [editManagedByTitle, setEditManagedByTitle] = useState("");

  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetCreateForm = () => {
    setWarehouseName("");
    setDispatchLocation("");
    setWarehouseManager("");
    setEmailId("");
    setMobileNo("");
    setManagedByTitle("");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalWarehouseName = warehouseName.trim();
    if (!finalWarehouseName) {
      setCreateMsg({ type: "error", text: "Warehouse Name is required." });
      return;
    }

    setIsCreating(true);
    setCreateMsg(null);

    try {
      const finalName = managedByTitle.trim() || finalWarehouseName;

      if (warehouses.some((w) => (w.warehouseName || w.name).toLowerCase() === finalWarehouseName.toLowerCase())) {
        setCreateMsg({ type: "error", text: `Warehouse "${finalWarehouseName}" already exists!` });
        setIsCreating(false);
        return;
      }

      const payload: Omit<WarehouseManagedBy, "id" | "createdAt"> = {
        name: finalName,
        warehouseName: finalWarehouseName,
        dispatchLocation: dispatchLocation.trim() || undefined,
        warehouseManager: warehouseManager.trim() || undefined,
        emailId: emailId.trim() || undefined,
        mobileNo: mobileNo.trim() || undefined,
      };

      if (onAddWarehouse) {
        await onAddWarehouse(payload);
        setCreateMsg({
          type: "success",
          text: `Warehouse "${finalWarehouseName}" registered successfully!`,
        });
        resetCreateForm();
      }
    } catch (err) {
      console.error("Error adding warehouse:", err);
      setCreateMsg({ type: "error", text: "Failed to register warehouse." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartEdit = (item: WarehouseManagedBy) => {
    setEditingId(item.id);
    setEditWarehouseName(item.warehouseName || item.name || "");
    setEditDispatchLocation(item.dispatchLocation || "");
    setEditWarehouseManager(item.warehouseManager || "");
    setEditEmailId(item.emailId || "");
    setEditMobileNo(item.mobileNo || "");
    setEditManagedByTitle(item.name || "");
    setEditMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editWarehouseName.trim()) return;

    setIsSavingEdit(true);
    setEditMsg(null);

    try {
      const existing = warehouses.find((w) => w.id === editingId);
      if (!existing) return;

      const finalWarehouseName = editWarehouseName.trim();
      const finalName = editManagedByTitle.trim() || finalWarehouseName;

      const updatedObj: WarehouseManagedBy = {
        ...existing,
        name: finalName,
        warehouseName: finalWarehouseName,
        dispatchLocation: editDispatchLocation.trim() || undefined,
        warehouseManager: editWarehouseManager.trim() || undefined,
        emailId: editEmailId.trim() || undefined,
        mobileNo: editMobileNo.trim() || undefined,
      };

      if (onSaveWarehouse) {
        await onSaveWarehouse(updatedObj);
      } else if (onAddWarehouse) {
        await onAddWarehouse(updatedObj);
      }

      setEditMsg({ type: "success", text: "Warehouse details updated successfully!" });
      setTimeout(() => {
        setEditingId(null);
        setEditMsg(null);
      }, 1200);
    } catch (err) {
      console.error("Error updating warehouse:", err);
      setEditMsg({ type: "error", text: "Failed to update warehouse." });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredWarehouses = warehouses.filter((w) => {
    const q = searchTerm.toLowerCase();
    return (
      (w.name && w.name.toLowerCase().includes(q)) ||
      (w.warehouseName && w.warehouseName.toLowerCase().includes(q)) ||
      (w.dispatchLocation && w.dispatchLocation.toLowerCase().includes(q)) ||
      (w.warehouseManager && w.warehouseManager.toLowerCase().includes(q)) ||
      (w.emailId && w.emailId.toLowerCase().includes(q)) ||
      (w.mobileNo && w.mobileNo.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-900 via-orange-900 to-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Warehouse className="text-amber-400 shrink-0" size={20} />
            <h2 className="text-sm font-extrabold tracking-wide uppercase font-mono">
              Warehouse & Fulfillment Center Registry
            </h2>
          </div>
          <p className="text-xs text-amber-100/80 mt-1 max-w-2xl leading-relaxed">
            Manage fulfillment warehouses, dispatch locations, warehouse managers, and contact details.
            Updating options here aligns dispatch and inventory tracking choices across sales deals and indents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageWarehouses && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Import Warehouses (Sheets / CSV)</span>
            </button>
          )}

          <div className="bg-slate-800/80 text-amber-300 border border-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5">
            <Shield size={14} className="text-amber-400" />
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
        {/* Form Panel: Add New Warehouse Details */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="bg-amber-100 text-amber-800 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Add New Warehouse Details</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  Register warehouse location & manager contact
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

            {canManageWarehouses ? (
              <form onSubmit={handleCreateSubmit} className="space-y-3">
                {/* Warehouse Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Warehouse Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={warehouseName}
                    onChange={(e) => setWarehouseName(e.target.value)}
                    placeholder="e.g. Central Logistics Depot, West Zone Warehouse"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>

                {/* Dispatch Location */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Dispatch Location
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="dispatch-location-suggestions"
                      value={dispatchLocation}
                      onChange={(e) => setDispatchLocation(e.target.value)}
                      placeholder="e.g. Bhiwandi, Mumbai, Delhi Hub"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                    <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    {dispatchLocations.length > 0 && (
                      <datalist id="dispatch-location-suggestions">
                        {dispatchLocations.map((loc) => (
                          <option key={loc.id} value={loc.name} />
                        ))}
                      </datalist>
                    )}
                  </div>
                </div>

                {/* Warehouse Manager */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Warehouse Manager
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={warehouseManager}
                      onChange={(e) => setWarehouseManager(e.target.value)}
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                    <UserCheck size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Email iD */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Email ID
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={emailId}
                      onChange={(e) => setEmailId(e.target.value)}
                      placeholder="e.g. warehouse.manager@company.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                    <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Mobile No */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Mobile No
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={mobileNo}
                      onChange={(e) => setMobileNo(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                    <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Managed By Title (Optional entity label) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">
                    Warehouse / Managed By Title (Optional Tag)
                  </label>
                  <input
                    type="text"
                    value={managedByTitle}
                    onChange={(e) => setManagedByTitle(e.target.value)}
                    placeholder="Defaults to Warehouse Name if left blank"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  {isCreating ? "Registering Warehouse..." : "Register Warehouse"}
                </button>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center text-xs text-slate-500">
                You need Manager or Admin clearance to register new warehouse details.
              </div>
            )}
          </div>

          <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <Info size={14} className="text-amber-600 shrink-0" />
              <span>Warehouse Integration</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              Warehouses registered here control options for dispatch routing, closed-won deal fulfillment details, and delivery indent assignments.
            </p>
          </div>
        </div>

        {/* Table / List View */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Warehouse size={16} className="text-amber-600" />
              <h3 className="text-xs font-bold text-slate-900">
                Registered Warehouses ({warehouses.length})
              </h3>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search warehouse, manager, location..."
                className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Warehouse Name</th>
                  <th className="py-2.5 px-3 font-bold">Dispatch Location</th>
                  <th className="py-2.5 px-3 font-bold">Warehouse Manager</th>
                  <th className="py-2.5 px-3 font-bold">Contact Details</th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      <Warehouse size={28} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-bold text-slate-600">No Warehouses Found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {searchTerm ? "No warehouse matches your search." : "No warehouses registered in database."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredWarehouses.map((item) => {
                    const displayName = item.warehouseName || item.name;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Warehouse size={15} className="text-amber-600 shrink-0" />
                            <div>
                              <span className="block font-extrabold text-slate-900">{displayName}</span>
                              {item.name && item.name !== displayName && (
                                <span className="text-[10px] text-slate-400 font-normal block">
                                  Managed By: {item.name}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-slate-400 block">
                                ID: {item.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Dispatch Location */}
                        <td className="py-2.5 px-3 text-slate-700">
                          {item.dispatchLocation ? (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                              <MapPin size={12} className="text-amber-600 shrink-0" />
                              {item.dispatchLocation}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Not set</span>
                          )}
                        </td>

                        {/* Warehouse Manager */}
                        <td className="py-2.5 px-3 text-slate-800">
                          {item.warehouseManager ? (
                            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                              <UserCheck size={13} className="text-emerald-600 shrink-0" />
                              <span>{item.warehouseManager}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Not set</span>
                          )}
                        </td>

                        {/* Email & Mobile */}
                        <td className="py-2.5 px-3 text-slate-700">
                          <div className="space-y-0.5 text-[11px]">
                            {item.emailId ? (
                              <div className="flex items-center gap-1 text-slate-600">
                                <Mail size={12} className="text-slate-400 shrink-0" />
                                <span className="font-mono text-[10.5px]">{item.emailId}</span>
                              </div>
                            ) : null}
                            {item.mobileNo ? (
                              <div className="flex items-center gap-1 text-slate-600">
                                <Phone size={12} className="text-slate-400 shrink-0" />
                                <span className="font-mono text-[10.5px]">{item.mobileNo}</span>
                              </div>
                            ) : null}
                            {!item.emailId && !item.mobileNo && (
                              <span className="text-slate-400 italic">No contact provided</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          {canManageWarehouses && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                title="Edit Warehouse Details"
                              >
                                <Edit2 size={14} />
                              </button>
                              {deletingId === item.id ? (
                                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono">
                                  <span className="font-semibold text-rose-700">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (onDeleteWarehouse) {
                                        await onDeleteWarehouse(item.id);
                                      }
                                      setDeletingId(null);
                                    }}
                                    className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                    title="Confirm delete warehouse"
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
                                  title="Delete Warehouse"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
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
                <Edit2 size={16} className="text-amber-400" />
                <h3 className="text-xs font-extrabold font-mono uppercase tracking-wider">
                  Edit Warehouse Details
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
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Warehouse Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editWarehouseName}
                  onChange={(e) => setEditWarehouseName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Dispatch Location
                </label>
                <input
                  type="text"
                  list="edit-dispatch-location-suggestions"
                  value={editDispatchLocation}
                  onChange={(e) => setEditDispatchLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                {dispatchLocations.length > 0 && (
                  <datalist id="edit-dispatch-location-suggestions">
                    {dispatchLocations.map((loc) => (
                      <option key={loc.id} value={loc.name} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Warehouse Manager
                </label>
                <input
                  type="text"
                  value={editWarehouseManager}
                  onChange={(e) => setEditWarehouseManager(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Mobile No
                  </label>
                  <input
                    type="tel"
                    value={editMobileNo}
                    onChange={(e) => setEditMobileNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">
                  Warehouse / Managed By Title
                </label>
                <input
                  type="text"
                  value={editManagedByTitle}
                  onChange={(e) => setEditManagedByTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
                  className="bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Save size={14} />
                  {isSavingEdit ? "Saving..." : "Save Warehouse"}
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
        title="Import Warehouse & Fulfillment Centers"
        entityName="Warehouse Directory"
        fields={warehouseImportFields}
        onImport={handleImportWarehouses}
      />
    </div>
  );
}
