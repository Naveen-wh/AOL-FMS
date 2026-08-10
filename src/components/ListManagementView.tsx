import React, { useState, useEffect, useMemo } from "react";
import { Package, Briefcase, Coins, Trash2, Edit2, SlidersHorizontal, Tag, Layers, Building2, Plus, Truck, MapPin, FileText, Warehouse, UserPlus, FileSpreadsheet, Check, X, Clock, Percent } from "lucide-react";
import ProductsView from "./ProductsView";
import ClientsView from "./ClientsView";
import AddUserManagementView from "./AddUserManagementView";
import TeamDatabaseRegistryView from "./TeamDatabaseRegistryView";
import TransporterManagementView from "./TransporterManagementView";
import WarehouseManagementView from "./WarehouseManagementView";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";

// PaymentBank type needs to be imported, assuming it is in types.ts
import { User, Team, Product, Client, PaymentBank, ProductCategory, ProductGroup, Manufacturer, SalesLead, ProjectWorkflow, SalesTask, FreightTerm, TransporterName, WarehouseManagedBy, DispatchLocation, Role, AccessLevel, PaymentTerm, PaymentCreditPeriod } from "../types";

interface ListManagementViewProps {
  activeUserId: string;
  users: User[];
  products: Product[];
  clients: Client[];
  teams: Team[];
  paymentBanks: PaymentBank[];
  categories: ProductCategory[];
  groups: ProductGroup[];
  manufacturers: Manufacturer[];
  freightTerms: FreightTerm[];
  transporters: TransporterName[];
  warehouses: WarehouseManagedBy[];
  dispatchLocations: DispatchLocation[];
  leads: SalesLead[];
  workflows: ProjectWorkflow[];
  tasks: SalesTask[];
  onAddProduct: (product: Omit<Product, "id" | "createdAt" | "createdByUserId">) => void;
  onEditProduct: (productId: string, product: Partial<Omit<Product, "id" | "createdAt" | "createdByUserId">>) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory: (data: Omit<ProductCategory, "id" | "createdAt">) => void;
  onEditCategory?: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onAddGroup: (data: Omit<ProductGroup, "id" | "createdAt">) => void;
  onEditGroup?: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onAddManufacturer: (data: Omit<Manufacturer, "id" | "createdAt">) => void;
  onEditManufacturer?: (id: string, name: string) => void;
  onDeleteManufacturer: (id: string) => void;
  onAddFreightTerm: (data: Omit<FreightTerm, "id" | "createdAt">) => void;
  onEditFreightTerm?: (id: string, name: string) => void;
  onDeleteFreightTerm: (id: string) => void;
  onAddTransporter: (data: Omit<TransporterName, "id" | "createdAt">) => void;
  onEditTransporter?: (id: string, name: string) => void;
  onDeleteTransporter: (id: string) => void;
  onAddWarehouse: (data: Omit<WarehouseManagedBy, "id" | "createdAt">) => void;
  onEditWarehouse?: (id: string, name: string) => void;
  onDeleteWarehouse: (id: string) => void;
  onAddDispatchLocation: (data: Omit<DispatchLocation, "id" | "createdAt">) => void;
  onEditDispatchLocation?: (id: string, name: string) => void;
  onDeleteDispatchLocation: (id: string) => void;
  onAddClient: (client: Omit<Client, "id" | "createdAt">) => void;
  onEditClient: (clientId: string, client: Partial<Omit<Client, "id" | "createdAt" | "createdByUserId">>) => void;
  onDeleteClient: (clientId: string) => void;
  onAddTask: (task: Omit<SalesTask, "id">) => void;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAddPaymentBank: (bank: Omit<PaymentBank, "id" | "createdAt">) => void;
  onDeletePaymentBank: (id: string) => void;
  onEditPaymentBank: (id: string, bank: Omit<PaymentBank, "id" | "createdAt">) => void;
  onAddUser?: (user: User) => Promise<void>;
  onUpdateUser?: (userId: string, updates: Partial<User>) => Promise<void>;
  onSaveTeam?: (team: Team) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  onSaveTransporter?: (transporter: TransporterName) => Promise<void>;
  onSaveWarehouse?: (warehouse: WarehouseManagedBy) => Promise<void>;
  visibleSubTabs?: { [key: string]: string[] };
  visibleSubSubTabs?: { [key: string]: { [key: string]: string[] } };
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
  paymentTerms?: PaymentTerm[];
  paymentCreditPeriods?: PaymentCreditPeriod[];
  onAddPaymentTerm?: (data: Omit<PaymentTerm, "id" | "createdAt">) => void;
  onEditPaymentTerm?: (id: string, name: string) => void;
  onDeletePaymentTerm?: (id: string) => void;
  onAddPaymentCreditPeriod?: (data: Omit<PaymentCreditPeriod, "id" | "createdAt">) => void;
  onEditPaymentCreditPeriod?: (id: string, name: string) => void;
  onDeletePaymentCreditPeriod?: (id: string) => void;
}

export default function ListManagementView({
  activeUserId,
  users,
  products,
  clients,
  teams,
  paymentBanks,
  categories,
  groups,
  manufacturers,
  freightTerms,
  transporters,
  warehouses,
  dispatchLocations,
  paymentTerms = [],
  paymentCreditPeriods = [],
  leads,
  workflows,
  tasks,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onAddManufacturer,
  onEditManufacturer,
  onDeleteManufacturer,
  onAddFreightTerm,
  onEditFreightTerm,
  onDeleteFreightTerm,
  onAddTransporter,
  onEditTransporter,
  onDeleteTransporter,
  onAddWarehouse,
  onEditWarehouse,
  onDeleteWarehouse,
  onAddDispatchLocation,
  onEditDispatchLocation,
  onDeleteDispatchLocation,
  onAddPaymentTerm,
  onEditPaymentTerm,
  onDeletePaymentTerm,
  onAddPaymentCreditPeriod,
  onEditPaymentCreditPeriod,
  onDeletePaymentCreditPeriod,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onAddTask,
  onToggleTaskComplete,
  onDeleteTask,
  onAddPaymentBank,
  onDeletePaymentBank,
  onEditPaymentBank,
  onAddUser,
  onUpdateUser,
  onSaveTeam,
  onDeleteTeam,
  onSaveTransporter,
  onSaveWarehouse,
  visibleSubTabs,
  visibleSubSubTabs,
  teamPermissions,
  levelWiseFilters,
}: ListManagementViewProps) {
  const allSubTabs = [
    { id: "products", label: "Product Catalog", icon: Package },
    { id: "users", label: "User Management", icon: UserPlus },
    { id: "teams", label: "Team Database Registry", icon: Building2 },
    { id: "transporters", label: "Transporter Name", icon: Truck },
    { id: "warehouses", label: "Warehouse Details", icon: Warehouse },
    { id: "banks", label: "Payment Bank", icon: Coins },
    { id: "dropdowns", label: "Dropdowns", icon: SlidersHorizontal },
  ];

  const visibleTabsForList = visibleSubTabs?.["list_management"] || allSubTabs.map(t => t.id);
  const filteredSubTabs = useMemo(() => {
    return allSubTabs.filter(t => visibleTabsForList.includes(t.id));
  }, [JSON.stringify(visibleTabsForList)]);

  const activeUser = users.find(u => u.id === activeUserId);
  const isManagerOrAdmin = activeUser?.accessLevel === AccessLevel.Manager || activeUser?.role === Role.Admin || activeUser?.role === Role.Manager || activeUser?.role === Role.SeniorManager;
  const canAddDropdowns = isManagerOrAdmin || activeUser?.accessLevel === AccessLevel.Contributor || activeUser?.accessLevel === AccessLevel.Editor;
  const canEditDropdowns = canAddDropdowns;
  const canDeleteDropdowns = canAddDropdowns;

  const [activeSubTab, setActiveSubTab] = useState(filteredSubTabs[0]?.id || "products");
  const [isAddBankOpen, setIsAddBankOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<PaymentBank | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);
  const [isImportBankOpen, setIsImportBankOpen] = useState(false);

  const bankImportFields: ImportFieldDefinition[] = [
    { key: "bankName", label: "Bank Name", required: true, sampleValue: "HDFC Bank" },
    { key: "accountHolderName", label: "Account Holder Name", sampleValue: "Aroma Organics Pvt Ltd" },
    { key: "accountNumber", label: "Account Number", required: true, sampleValue: "50200012345678" },
    { key: "ifscCode", label: "IFSC Code", sampleValue: "HDFC0001234" },
    { key: "branch", label: "Branch Name", sampleValue: "Fort Branch, Mumbai" },
    { key: "address", label: "Bank Address", sampleValue: "Mumbai, MH" },
  ];

  const handleImportBanks = async (rows: Record<string, any>[]) => {
    let count = 0;
    if (!onAddPaymentBank) return { successCount: 0 };
    for (const row of rows) {
      if (row.bankName && row.accountNumber) {
        await onAddPaymentBank({
          bankName: row.bankName.trim(),
          accountHolderName: row.accountHolderName?.trim() || "Company Account",
          accountNumber: String(row.accountNumber).trim(),
          ifscCode: row.ifscCode?.trim() || "",
          branch: row.branch?.trim() || "",
          address: row.address?.trim() || "",
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Keep activeSubTab in sync if permissions change
  useEffect(() => {
    if (filteredSubTabs.length > 0 && !filteredSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubTabs[0].id);
    }
  }, [filteredSubTabs, activeSubTab]);

  // Extract visible sub-sub-tabs for the current tab
  const currentSubSubTabs = visibleSubSubTabs?.["list_management"]?.[activeSubTab];

  return (
    <div className="space-y-4">
      {/* Sub-tab selection */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-0.5 scrollbar-thin whitespace-nowrap">
        {filteredSubTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold font-mono uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                active ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={12} className={active ? "text-emerald-600" : "text-slate-400"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {filteredSubTabs.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-center font-medium text-xs font-mono mt-3">
          ⚠️ ACCESS RESTRICTED: No list management features are enabled for your team workspace.
        </div>
      ) : (
        <>
          {/* Render sub-view */}
          {activeSubTab === "products" && (
        <ProductsView
          activeUserId={activeUserId}
          users={users}
          products={products}
          teams={teams}
          categories={categories}
          groups={groups}
          manufacturers={manufacturers}
          onAddProduct={onAddProduct}
          onEditProduct={onEditProduct}
          onDeleteProduct={onDeleteProduct}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
          onAddGroup={onAddGroup}
          onDeleteGroup={onDeleteGroup}
          onAddManufacturer={onAddManufacturer}
          onDeleteManufacturer={onDeleteManufacturer}
          visibleSubSubTabs={currentSubSubTabs}
          teamPermissions={teamPermissions}
        />
      )}
      {activeSubTab === "users" && (
        <AddUserManagementView
          activeUserId={activeUserId}
          users={users}
          teams={teams}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
        />
      )}
      {activeSubTab === "teams" && (
        <TeamDatabaseRegistryView
          activeUserId={activeUserId}
          users={users}
          teams={teams}
          onSaveTeam={onSaveTeam}
          onDeleteTeam={onDeleteTeam}
        />
      )}
      {activeSubTab === "transporters" && (
        <TransporterManagementView
          activeUserId={activeUserId}
          users={users}
          transporters={transporters}
          onAddTransporter={onAddTransporter}
          onSaveTransporter={onSaveTransporter}
          onDeleteTransporter={onDeleteTransporter}
        />
      )}
      {activeSubTab === "warehouses" && (
        <WarehouseManagementView
          activeUserId={activeUserId}
          users={users}
          warehouses={warehouses}
          dispatchLocations={dispatchLocations}
          onAddWarehouse={onAddWarehouse}
          onSaveWarehouse={onSaveWarehouse}
          onDeleteWarehouse={onDeleteWarehouse}
        />
      )}
      {activeSubTab === "dropdowns" && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            <h2 className="text-xs font-bold text-slate-500 uppercase font-mono tracking-wider mb-1">List Dropdowns Configuration</h2>
            <p className="text-xs text-slate-500">Configure global choices for Product Categories, Product Groups, Manufacturers, Freight Terms, Transporters, Warehouses, and Dispatch Locations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <LocalDropdownSection
              title="Category"
              icon={Tag}
              items={categories}
              onAdd={onAddCategory}
              onEdit={onEditCategory}
              onDelete={onDeleteCategory}
              placeholder="e.g. Software, Hardware..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Product Group"
              icon={Layers}
              items={groups}
              onAdd={onAddGroup}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
              placeholder="e.g. Applications, Cloud Services..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Manufacturer"
              icon={Building2}
              items={manufacturers}
              onAdd={onAddManufacturer}
              onEdit={onEditManufacturer}
              onDelete={onDeleteManufacturer}
              placeholder="e.g. Apex Systems, Apex AI Labs..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Freight Term"
              icon={FileText}
              items={freightTerms}
              onAdd={onAddFreightTerm}
              onEdit={onEditFreightTerm}
              onDelete={onDeleteFreightTerm}
              placeholder="e.g. FOB, CIF, EXW..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Transporter Name"
              icon={Truck}
              items={transporters}
              onAdd={onAddTransporter}
              onEdit={onEditTransporter}
              onDelete={onDeleteTransporter}
              placeholder="e.g. FedEx, Apex Logistics..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Warehouse Managed By"
              icon={Warehouse}
              items={warehouses}
              onAdd={onAddWarehouse}
              onEdit={onEditWarehouse}
              onDelete={onDeleteWarehouse}
              placeholder="e.g. Warehouse Team, Partner 3PL..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Dispatch Location"
              icon={MapPin}
              items={dispatchLocations}
              onAdd={onAddDispatchLocation}
              onEdit={onEditDispatchLocation}
              onDelete={onDeleteDispatchLocation}
              placeholder="e.g. Chicago Hub, main facility..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Payment Terms"
              icon={Percent}
              items={paymentTerms}
              onAdd={onAddPaymentTerm || (() => {})}
              onEdit={onEditPaymentTerm}
              onDelete={onDeletePaymentTerm || (() => {})}
              placeholder="e.g. 50% Advance, 50% Dispatch..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
            <LocalDropdownSection
              title="Payment Credit Period ( No. Of Days )"
              icon={Clock}
              items={paymentCreditPeriods}
              onAdd={onAddPaymentCreditPeriod || (() => {})}
              onEdit={onEditPaymentCreditPeriod}
              onDelete={onDeletePaymentCreditPeriod || (() => {})}
              placeholder="e.g. 30 Days, 45 Days, Immediate..."
              canAdd={canAddDropdowns}
              canEdit={canEditDropdowns}
              canDelete={canDeleteDropdowns}
            />
          </div>
        </div>
      )}
      {activeSubTab === "banks" && (
        <div className="p-6 bg-white rounded-xl border border-slate-200">
           <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-bold text-slate-800 uppercase font-mono">Payment Banks</h2>
             <div className="flex items-center gap-2">
               {isManagerOrAdmin && (
                 <button
                   type="button"
                   onClick={() => setIsImportBankOpen(true)}
                   className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                 >
                   <FileSpreadsheet size={13} className="text-emerald-400" />
                   <span>Import Banks (Sheets / CSV)</span>
                 </button>
               )}
               {isManagerOrAdmin ? (
                 <button onClick={() => setIsAddBankOpen(true)} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg flex items-center gap-1.5 cursor-pointer hover:bg-emerald-700">
                   <Package size={12} /> Add Bank
                 </button>
               ) : (
                 <button disabled title="Requires Manager or Admin role." className="px-3 py-1.5 text-xs font-bold bg-slate-300 text-slate-400 rounded-lg flex items-center gap-1.5 cursor-not-allowed">
                   <Package size={12} /> Add Bank
                 </button>
               )}
             </div>
           </div>
           
           <div className="space-y-2 font-mono">
             {paymentBanks.map(bank => (
               <div key={bank.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg text-xs border border-slate-100">
                 <div>
                   <p className="font-bold text-slate-800">{bank.bankName}</p>
                   <p className="text-slate-500">Account: {bank.accountNumber}</p>
                 </div>
                 <div className="flex gap-2">
                    {isManagerOrAdmin ? (
                      <>
                        <button onClick={() => setEditingBank(bank)} className="text-amber-600 p-1 hover:bg-amber-50 rounded cursor-pointer" title="Edit Bank">
                          <Edit2 size={14} />
                        </button>
                        {deletingBankId === bank.id ? (
                          <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono">
                            <span className="font-semibold text-rose-700">Delete?</span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeletePaymentBank(bank.id);
                                setDeletingBankId(null);
                              }}
                              className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                              title="Confirm delete bank"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingBankId(null)}
                              className="text-slate-500 hover:bg-slate-200 p-0.5 rounded cursor-pointer transition-all"
                              title="Cancel delete"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeletingBankId(bank.id)} className="text-rose-600 p-1 hover:bg-rose-50 rounded cursor-pointer" title="Delete Bank">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button disabled className="text-slate-300 p-1 cursor-not-allowed" title="Edit forbidden. Requires Manager role.">
                          <Edit2 size={14} className="opacity-45" />
                        </button>
                        <button disabled className="text-slate-300 p-1 cursor-not-allowed" title="Delete forbidden. Requires Manager role.">
                          <Trash2 size={14} className="opacity-45" />
                        </button>
                      </>
                    )}
                 </div>
               </div>
             ))}
           </div>
           
           {isAddBankOpen && (
             <BankModal onClose={() => setIsAddBankOpen(false)} onSave={onAddPaymentBank} />
           )}
           {editingBank && (
             <BankModal onClose={() => setEditingBank(null)} onSave={(data) => { onEditPaymentBank(editingBank.id, data); setEditingBank(null); }} initialBank={editingBank} />
           )}

           {/* Bank Data Import Modal */}
           <DataImportModal
             isOpen={isImportBankOpen}
             onClose={() => setIsImportBankOpen(false)}
             title="Import Payment Banks"
             entityName="Payment Banks"
             fields={bankImportFields}
             onImport={handleImportBanks}
           />
        </div>
      )}
      </>
      )}
    </div>
  );
}

function LocalDropdownSection({
  title,
  icon: Icon,
  items,
  onAdd,
  onEdit,
  onDelete,
  placeholder,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}: {
  title: string;
  icon: any;
  items: any[];
  onAdd: (data: any) => void;
  onEdit?: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  placeholder: string;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd || !name.trim()) return;
    onAdd({ name: name.trim() });
    setName("");
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditingValue(item.name || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const saveEdit = (id: string) => {
    if (!editingValue.trim() || !onEdit) return;
    onEdit(id, editingValue.trim());
    setEditingId(null);
    setEditingValue("");
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-3xs flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <Icon size={16} />
          </div>
          <h3 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wide">{title}</h3>
        </div>
        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
          {items.length} {items.length === 1 ? "option" : "options"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={name}
          disabled={!canAdd}
          onChange={(e) => setName(e.target.value)}
          placeholder={canAdd ? placeholder : "Requires permission to add"}
          className="flex-1 text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-400 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canAdd || !name.trim()}
          title={canAdd ? `Add to ${title}` : "Requires permission to add."}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      <div className="flex-1 overflow-y-auto max-h-[300px] pr-1 space-y-1.5 font-mono">
        {items.length === 0 ? (
          <p className="text-slate-400 text-[11px] text-center py-8">No entries yet.</p>
        ) : (
          items.map((item) => {
            const isEditingThis = editingId === item.id;
            return (
              <div
                key={item.id}
                className="flex justify-between items-center text-xs px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg hover:border-slate-200 transition-all font-medium text-slate-700 gap-2"
              >
                {isEditingThis ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <input
                      type="text"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(item.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 text-xs border border-emerald-500 bg-white px-2 py-1 rounded outline-none text-slate-900 font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
                      disabled={!editingValue.trim()}
                      className="text-emerald-700 hover:bg-emerald-100 p-1 rounded transition-all cursor-pointer disabled:opacity-40"
                      title="Save changes"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-slate-400 hover:bg-slate-200 p-1 rounded transition-all cursor-pointer"
                      title="Cancel edit"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="truncate">{item.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && onEdit ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="text-slate-400 hover:text-amber-600 p-1 rounded hover:bg-amber-50 transition-all cursor-pointer"
                          title={`Edit "${item.name}"`}
                        >
                          <Edit2 size={13} />
                        </button>
                      ) : (
                        <button
                          disabled
                          title="Edit forbidden for your role/access level."
                          className="text-slate-300 p-1 rounded cursor-not-allowed"
                        >
                          <Edit2 size={13} className="opacity-40" />
                        </button>
                      )}

                      {deletingId === item.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in">
                          <span className="font-semibold text-rose-700">Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              onDelete(item.id);
                              setDeletingId(null);
                            }}
                            className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                            title="Confirm delete"
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
                      ) : canDelete ? (
                        <button
                          type="button"
                          onClick={() => setDeletingId(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-all cursor-pointer"
                          title={`Delete "${item.name}"`}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button
                          disabled
                          title="Delete forbidden for your role/access level."
                          className="text-slate-300 p-1 rounded cursor-not-allowed"
                        >
                          <Trash2 size={13} className="opacity-40" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function BankModal({ onClose, onSave, initialBank }: { onClose: () => void, onSave: (bank: Omit<PaymentBank, "id" | "createdAt">) => void, initialBank?: PaymentBank }) {
  const [bankName, setBankName] = useState(initialBank?.bankName || "");
  const [accountHolderName, setAccountHolderName] = useState(initialBank?.accountHolderName || "");
  const [accountNumber, setAccountNumber] = useState(initialBank?.accountNumber || "");
  const [ifscCode, setIfscCode] = useState(initialBank?.ifscCode || "");
  const [branch, setBranch] = useState(initialBank?.branch || "");
  const [address, setAddress] = useState(initialBank?.address || "");
  
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-slate-200">
        <h2 className="text-sm font-bold text-slate-800 mb-4 uppercase font-mono">{initialBank ? "Edit Bank" : "Add New Bank"}</h2>
        <div className="space-y-3">
          <input type="text" placeholder="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <input type="text" placeholder="Account Holder Name" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <input type="text" placeholder="Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <input type="text" placeholder="IFSC Code" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <input type="text" placeholder="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg" />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
            <button onClick={() => { onSave({ bankName, accountHolderName, accountNumber, ifscCode, branch, address }); onClose(); }} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg cursor-pointer">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
