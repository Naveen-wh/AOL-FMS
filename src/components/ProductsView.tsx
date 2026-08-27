/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { User, Role, Product, Team, ProductCategory, ProductGroup, Manufacturer, AccessLevel } from "../types";
import { canEditProduct, canDeleteProduct } from "../data";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import {
  Plus,
  Trash2,
  X,
  Check,
  Search,
  Package,
  Building2,
  Layers,
  Cpu,
  Tag,
  Edit2,
  SlidersHorizontal,
  Bookmark,
  FileSpreadsheet,
  Lock,
} from "lucide-react";

interface ProductsViewProps {
  activeUserId: string;
  users: User[];
  products: Product[];
  teams: Team[];
  categories: ProductCategory[];
  groups: ProductGroup[];
  manufacturers: Manufacturer[];
  onAddProduct: (product: Omit<Product, "id" | "createdAt" | "createdByUserId">) => void;
  onEditProduct: (productId: string, product: Partial<Omit<Product, "id" | "createdAt" | "createdByUserId">>) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory: (data: Omit<ProductCategory, "id" | "createdAt">) => void;
  onDeleteCategory: (id: string) => void;
  onAddGroup: (data: Omit<ProductGroup, "id" | "createdAt">) => void;
  onDeleteGroup: (id: string) => void;
  onAddManufacturer: (data: Omit<Manufacturer, "id" | "createdAt">) => void;
  onDeleteManufacturer: (id: string) => void;
  visibleSubSubTabs?: string[];
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } };
}

export default function ProductsView({
  activeUserId,
  users,
  products = [],
  teams = [],
  categories = [],
  groups = [],
  manufacturers = [],
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onAddCategory,
  onDeleteCategory,
  onAddGroup,
  onDeleteGroup,
  onAddManufacturer,
  onDeleteManufacturer,
  visibleSubSubTabs,
  teamPermissions,
}: ProductsViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];
  const isExecutive = activeUser.teamName === "Executive" || activeUser.role === Role.Admin;

  const teamCanAdd = activeUser.role === Role.Admin || teamPermissions?.["list_management"]?.add !== false;
  const teamCanEdit = activeUser.role === Role.Admin || teamPermissions?.["list_management"]?.edit !== false;

  const allSubSubTabs = [
    { id: "products_list", label: "Products" },
    { id: "products_dropdown", label: "Products Dropdown" },
  ];

  const filteredSubSubTabs = useMemo(() => {
    return allSubSubTabs.filter(t => 
      !visibleSubSubTabs || visibleSubSubTabs.includes(t.id)
    );
  }, [JSON.stringify(visibleSubSubTabs)]);

  const [activeSubTab, setActiveSubTab] = useState<string>(filteredSubSubTabs[0]?.id || "products_list");

  // Keep activeSubTab in sync if permissions change
  useEffect(() => {
    if (filteredSubSubTabs.length > 0 && !filteredSubSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubSubTabs[0].id);
    }
  }, [filteredSubSubTabs, activeSubTab]);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const productImportFields: ImportFieldDefinition[] = [
    { key: "name", label: "Product Name", required: true, sampleValue: "Organic Ashwagandha Extract" },
    { key: "category", label: "Category", sampleValue: "Botanical Extracts" },
    { key: "group", label: "Product Group", sampleValue: "Nutraceuticals" },
    { key: "manufacturer", label: "Manufacturer", sampleValue: "Aroma Organics" },
    { key: "teamName", label: "Team Name", sampleValue: "Sales Executive" },
    { key: "hsnCode", label: "HSN Code", sampleValue: "38122090" },
  ];

  const handleImportProducts = async (rows: Record<string, any>[]) => {
    let count = 0;
    for (const row of rows) {
      if (row.name && row.name.trim()) {
        await onAddProduct({
          name: row.name.trim(),
          category: row.category?.trim() || "General",
          group: row.group?.trim() || "General",
          manufacturer: row.manufacturer?.trim() || "Generic",
          teamName: isExecutive ? (row.teamName?.trim() || undefined) : (activeUser.teamName || undefined),
          hsnCode: row.hsnCode?.trim() || "",
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Add Product form fields
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [productTeam, setProductTeam] = useState(isExecutive ? "" : activeUser.teamName);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit Product form fields
  const [editProductName, setEditProductName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editHsnCode, setEditHsnCode] = useState("");
  const [editProductTeam, setEditProductTeam] = useState("");


  // ----------------------------------------------------
  // FILTER PRODUCTS (TEAM SEGREGATION)
  // ----------------------------------------------------
  const filteredProducts = products.filter((p) => {
    // 1. Team Segregation:
    // Non-Executive/Non-Admin users can only view products belonging to their own team
    if (!isExecutive && p.teamName && p.teamName !== activeUser.teamName) {
      return false;
    }

    // 2. Search filtering
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.group.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manufacturer.toLowerCase().includes(searchTerm.toLowerCase());

    // 3. Category filter
    const matchesCategory = categoryFilter === "All" || p.category === categoryFilter;

    // 4. Team filter
    const matchesTeam = teamFilter === "All" || p.teamName === teamFilter;

    return matchesSearch && matchesCategory && matchesTeam;
  });

  // Extract unique categories for filter dropdown
  const uniqueCategories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean);

  // ----------------------------------------------------
  // SUBMIT HANDLERS
  // ----------------------------------------------------
  const handleOpenAdd = () => {
    setProductName("");
    setCategory("");
    setGroup("");
    setManufacturer("");
    setHsnCode("");
    setProductTeam(isExecutive ? "" : activeUser.teamName);
    setIsAddOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !category.trim() || !group.trim() || !manufacturer.trim()) {
      alert("Please fill in all required fields.");
      return;
    }

    onAddProduct({
      name: productName.trim(),
      category: category.trim(),
      group: group.trim(),
      manufacturer: manufacturer.trim(),
      teamName: isExecutive ? (productTeam || undefined) : (activeUser.teamName || undefined),
      hsnCode: hsnCode.trim(),
    });

    setIsAddOpen(false);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setEditProductName(p.name);
    setEditCategory(p.category);
    setEditGroup(p.group);
    setEditManufacturer(p.manufacturer);
    setEditHsnCode(p.hsnCode || "");
    setEditProductTeam(p.teamName || "");
    setIsEditOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editProductName.trim() || !editCategory.trim() || !editGroup.trim() || !editManufacturer.trim()) {
      alert("Please fill in all required fields.");
      return;
    }

    onEditProduct(editingProduct.id, {
      name: editProductName.trim(),
      category: editCategory.trim(),
      group: editGroup.trim(),
      manufacturer: editManufacturer.trim(),
      teamName: isExecutive ? (editProductTeam || undefined) : (activeUser.teamName || undefined),
      hsnCode: editHsnCode.trim(),
    });

    setIsEditOpen(false);
    setEditingProduct(null);
  };

  return (
    <div id="products-catalog-container" className="flex flex-col gap-4">
      {/* Sub-tab selection */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto whitespace-nowrap pb-0.5 scrollbar-thin">
        {filteredSubSubTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`text-xs font-bold px-3 py-1.5 cursor-pointer transition-all ${
              activeSubTab === tab.id ? "border-b-2 border-emerald-600 text-emerald-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredSubSubTabs.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-center font-medium text-xs font-mono">
          ⚠️ ACCESS RESTRICTED: No product catalog features are enabled for your team workspace.
        </div>
      ) : activeSubTab === "products_list" ? (
        <>
          {/* Overview stats ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <Package size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium font-mono uppercase">Total Products</div>
            <div className="text-lg font-bold text-slate-800 leading-none mt-1">
              {products.length}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex items-center gap-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Tag size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium font-mono uppercase">Categories</div>
            <div className="text-lg font-bold text-slate-800 leading-none mt-1">
              {uniqueCategories.length}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex items-center gap-3">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
            <Layers size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium font-mono uppercase">Your Team Access</div>
            <div className="text-sm font-semibold text-slate-800 mt-1 leading-none truncate max-w-[180px]">
              {activeUser.teamName || "Unassigned"}
            </div>
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search products by name, category, manufacturer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500"
          >
            <option value="All">All Categories</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Team Filter - Only visible for Executive / Admin */}
          {isExecutive && (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500"
            >
              <option value="All">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
              <option value="">Unassigned</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeUser.role === Role.Admin && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Import (Sheets / CSV)</span>
            </button>
          )}

          {teamCanAdd ? (
            <button
              onClick={handleOpenAdd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus size={14} /> Add Product
            </button>
          ) : (
            <button
              disabled
              title="Your team does not have add permission."
              className="bg-slate-100 text-slate-400 border border-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-not-allowed"
            >
              <Lock size={14} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Product list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] uppercase font-bold font-mono tracking-wider text-slate-400">
                <th className="py-2.5 px-4">Product Name</th>
                <th className="py-2.5 px-3">HSN Code</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Product Group</th>
                <th className="py-2.5 px-3">Manufacturer</th>
                <th className="py-2.5 px-3">Authorized Team Segregation</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Package size={32} className="text-slate-300 stroke-[1.5]" />
                      <p className="text-sm text-slate-500 font-semibold">No products found</p>
                      <p className="text-[10px] text-slate-400 max-w-[280px]">
                        {searchTerm || categoryFilter !== "All" || teamFilter !== "All"
                          ? "Adjust your filters or query text to find matches."
                          : "No products exist inside this team segment. Create one above."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-slate-100 rounded text-slate-500">
                          <Cpu size={13} />
                        </div>
                        {p.name}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-slate-600 font-mono text-[11px] font-bold">
                        {p.hsnCode || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-600 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-slate-500 font-medium">{p.group}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Building2 size={12} className="text-slate-400" />
                        {p.manufacturer}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg ${
                          p.teamName === "Executive"
                            ? "bg-purple-50 text-purple-600 border border-purple-200"
                            : p.teamName === "Enterprise Sales"
                            ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
                            : p.teamName?.includes("Mid-Market")
                            ? "bg-blue-50 text-blue-600 border border-blue-200"
                            : p.teamName?.includes("SME")
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {p.teamName || "Unassigned"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-mono">
                        {canEditProduct(activeUserId, p, users) && teamCanEdit ? (
                          <button
                            onClick={() => handleOpenEdit(p)}
                            title="Edit Product"
                            className="p-1 text-amber-600 hover:bg-amber-50 rounded-md transition-all cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                        ) : (
                          <button
                            disabled
                            title={!teamCanEdit ? "Your team does not have edit permission." : "Edit forbidden. Requires creator or team contributor permission."}
                            className="p-1 text-slate-300 bg-slate-50 rounded-md cursor-not-allowed border border-transparent"
                          >
                            <Lock size={13} className="opacity-45" />
                          </button>
                        )}

                        {canDeleteProduct(activeUserId, p, users) ? (
                          deletingId === p.id ? (
                            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono">
                              <span className="font-semibold text-rose-700">Delete?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteProduct(p.id);
                                  setDeletingId(null);
                                }}
                                className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                title="Confirm delete product"
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
                              onClick={() => setDeletingId(p.id)}
                              title="Delete Product"
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )
                        ) : (
                          <button
                            disabled
                            title="Delete forbidden. Requires Manager role."
                            className="p-1 text-slate-300 bg-slate-50 rounded-md cursor-not-allowed border border-transparent"
                          >
                            <Trash2 size={13} className="opacity-45" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

        </>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ListSection title="Categories" items={categories} onAdd={onAddCategory} onDelete={onDeleteCategory} />
            <ListSection title="Product Groups" items={groups} onAdd={onAddGroup} onDelete={onDeleteGroup} />
            <ListSection title="Manufacturers" items={manufacturers} onAdd={onAddManufacturer} onDelete={onDeleteManufacturer} />
          </div>
        </div>
      )}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-emerald-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                <h3 className="text-sm font-bold tracking-tight">Add New Product</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cloud Infrastructure Suite"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">HSN Code</label>
                <input
                  type="text"
                  placeholder="e.g. 38122090"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Category *</label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Product Group *</label>
                <select
                  required
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                >
                  <option value="">Select Product Group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Manufacturer *</label>
                <select
                  required
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                >
                  <option value="">Select Manufacturer</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Associated Team {isExecutive ? "(Optional)" : ""}
                </label>
                <select
                  value={isExecutive ? productTeam : (activeUser.teamName || "")}
                  onChange={(e) => isExecutive && setProductTeam(e.target.value)}
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

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="text-xs font-semibold px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs font-bold px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {isEditOpen && editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-amber-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold tracking-tight">Modify Product Specifications</h3>
              </div>
              <button
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingProduct(null);
                }}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cloud Infrastructure Suite"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">HSN Code</label>
                <input
                  type="text"
                  placeholder="e.g. 38122090"
                  value={editHsnCode}
                  onChange={(e) => setEditHsnCode(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Category *</label>
                <select
                  required
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Product Group *</label>
                <select
                  required
                  value={editGroup}
                  onChange={(e) => setEditGroup(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                >
                  <option value="">Select Product Group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">Manufacturer *</label>
                <select
                  required
                  value={editManufacturer}
                  onChange={(e) => setEditManufacturer(e.target.value)}
                  className="w-full text-sm border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                >
                  <option value="">Select Manufacturer</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Associated Team {isExecutive ? "(Optional)" : ""}
                </label>
                <select
                  value={isExecutive ? editProductTeam : (activeUser.teamName || "")}
                  onChange={(e) => isExecutive && setEditProductTeam(e.target.value)}
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

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingProduct(null);
                  }}
                  className="text-xs font-semibold px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs font-bold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  Save Modifications
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
        title="Import Products into Catalog"
        entityName="Product Catalog"
        fields={productImportFields}
        onImport={handleImportProducts}
      />
    </div>
  );
}

function ListSection({ title, items, onAdd, onDelete }: { title: string, items: any[], onAdd: (data: any) => void, onDelete: (id: string) => void }) {
  const [name, setName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <h3 className="font-bold text-slate-800">{title}</h3>
      <div className="flex gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-1.5 rounded-lg" />
        <button onClick={() => { if (name.trim()) { onAdd({ name: name.trim() }); setName(""); } }} className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">Add</button>
      </div>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded font-mono">
            <span>{item.name}</span>
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
            ) : (
              <button onClick={() => setDeletingId(item.id)} className="text-rose-600 hover:bg-rose-50 p-1 rounded cursor-pointer" title="Delete">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
