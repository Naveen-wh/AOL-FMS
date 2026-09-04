/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { User, ProjectWorkflow, SalesTask, Role, AccessLevel, Product, OrderOffer, Team } from "../types";
import { canViewTask, canViewOrderOffer, getReportingTreeUsers } from "../data";
import { IndianRupee, CheckCircle, TrendingUp, Target, Package, Building2, Users, BarChart3, Search, Filter, Settings, Save, X, Loader2, Eye, EyeOff, ChevronDown, ChevronUp, Calendar, FileText, ShoppingCart, Percent } from "lucide-react";
import AdminDriveSettings from "./AdminDriveSettings";
import { updateUserDetails } from "../lib/firebaseService";
import { formatCompactRupees, formatQuantityMT, getOrderTotalInvoiceAmount } from "../utils";

interface DashboardViewProps {
  activeUserId: string;
  users: User[];
  workflows: ProjectWorkflow[];
  products?: Product[];
  tasks: SalesTask[];
  orders?: OrderOffer[];
  clients?: any[];
  teams?: Team[];
  visibleSubTabs?: { [key: string]: string[] };
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean };
}

export default function DashboardView({
  activeUserId,
  users,
  workflows,
  products = [],
  tasks,
  orders = [],
  clients = [],
  teams = [],
  visibleSubTabs,
  levelWiseFilters,
}: DashboardViewProps) {
  const allSubTabs = useMemo(() => [
    { id: "reports" as const, label: "Overview Reports" },
    { id: "sp" as const, label: "SP (Sales Persons)" }
  ], []);

  const visibleDashboardSubTabs = visibleSubTabs?.["dashboard"];
  const filteredSubTabs = useMemo(() => {
    if (!visibleDashboardSubTabs) return allSubTabs;
    return allSubTabs.filter(st => visibleDashboardSubTabs.includes(st.id));
  }, [JSON.stringify(visibleDashboardSubTabs)]);

  const [activeSubTab, setActiveSubTab] = useState<"reports" | "sp">(
    filteredSubTabs[0]?.id || "reports"
  );

  React.useEffect(() => {
    if (filteredSubTabs.length > 0 && !filteredSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubTabs[0].id);
    }
  }, [filteredSubTabs, activeSubTab]);
  const [selectedSpFilter, setSelectedSpFilter] = useState<string>("ALL");
  const [spSearchTerm, setSpSearchTerm] = useState<string>("");
  const [spTeamFilter, setSpTeamFilter] = useState<string>("ALL");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    today: true,
    thisWeek: true,
    thisMonth: true,
    tillDate: true,
  });

  // State for dashboard card visibility configuration
  const [isVisibilityModalOpen, setIsVisibilityModalOpen] = useState(false);
  const [tempVisibility, setTempVisibility] = useState<Record<string, boolean>>({});
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);

  const activeUser = users.find((u) => u.id === activeUserId) || users[0] || {
    id: activeUserId || "unknown",
    name: "Standard Contributor",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    email: activeUserId || "",
    teamName: "Sales Development",
    targetQuota: 30000,
    avatarUrl: ""
  };

  const isAdmin = activeUser.role === Role.Admin;
  const isUserAdmin = activeUser.role === Role.Admin || activeUser.role === Role.SeniorManager;
  const isUserManager = activeUser.accessLevel === AccessLevel.Manager || activeUser.role === Role.Manager;

  const isReportOf = (targetUserId: string) => {
    const targetUser = users.find((u) => u.id === targetUserId);
    return targetUser?.reportsTo === activeUserId;
  };

  const isLevelFilterEnabled = !!levelWiseFilters?.["dashboard"];

  const reportingTree = useMemo(() => {
    return getReportingTreeUsers(activeUserId, users);
  }, [activeUserId, users]);

  const visibleUsers = useMemo(() => {
    return users.filter((u) => {
      if (isLevelFilterEnabled && !isUserAdmin) {
        const isSelf = u.id === activeUserId;
        const isReport = reportingTree.includes(u.id);
        return isSelf || isReport;
      }
      return true;
    });
  }, [users, activeUserId, isLevelFilterEnabled, isUserAdmin, reportingTree]);

  // Visible Orders
  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      return canViewOrderOffer(activeUserId, order, users, isLevelFilterEnabled);
    });
  }, [orders, activeUserId, users, isLevelFilterEnabled]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => canViewTask(activeUserId, task, users));
  }, [tasks, activeUserId, users]);

  // Overall KPIs (derived from Orders & Offers)
  const totalPipelineValue = visibleOrders.reduce((acc, order) => acc + getOrderTotalInvoiceAmount(order), 0);
  const closedWonOrders = visibleOrders.filter((o) => o.status === "Closed Won");
  const closedWonValue = closedWonOrders.reduce((acc, order) => acc + getOrderTotalInvoiceAmount(order), 0);
  const targetQuotaValue = activeUser.targetQuota || 30000;
  const quotaProgressPercentage = Math.min((closedWonValue / targetQuotaValue) * 100, 100);

  // Status counts for Order & Offer funnel distribution
  const statusCounts = {
    New: visibleOrders.filter((o) => o.status === "New").length,
    Contacted: visibleOrders.filter((o) => o.status === "Contacted").length,
    Proposal: visibleOrders.filter((o) => o.status === "Proposal").length,
    Negotiation: visibleOrders.filter((o) => o.status === "Negotiation").length,
    "Closed Won": visibleOrders.filter((o) => o.status === "Closed Won").length,
    "Closed Lost": visibleOrders.filter((o) => o.status === "Closed Lost").length,
  };

  const statusColors: Record<string, string> = {
    New: "bg-blue-500",
    Contacted: "bg-purple-500",
    Proposal: "bg-amber-500",
    Negotiation: "bg-orange-500",
    "Closed Won": "bg-emerald-500",
    "Closed Lost": "bg-rose-500",
  };

  // Filtered orders based on selected Sales Person in Reports view
  const filteredOrdersForReports = useMemo(() => {
    if (selectedSpFilter === "ALL") return visibleOrders;
    return visibleOrders.filter(
      (o) => o.assignedToUserId === selectedSpFilter || o.createdByUserId === selectedSpFilter
    );
  }, [visibleOrders, selectedSpFilter]);

  // TOP 5 SELLING PRODUCTS REPORT CALCULATION (from Orders & Offers)
  const topSellingProducts = useMemo(() => {
    const map: Record<string, { productId: string; productName: string; category: string; totalQty: number; totalValue: number; orderCount: number }> = {};

    filteredOrdersForReports.forEach((order) => {
      if (order.items && order.items.length > 0) {
        order.items.forEach((item) => {
          const key = item.productName || item.productId || "Uncategorized Item";
          const matchedProd = products.find((p) => p.name.toLowerCase() === key.toLowerCase() || p.id === item.productId);
          const cat = matchedProd?.category || "General";
          const qty = Number(item.quantity) || 1;
          const val = Number(item.amount) || (qty * (Number(item.rate) || 0)) || 0;

          if (!map[key]) {
            map[key] = { productId: matchedProd?.id || key, productName: key, category: cat, totalQty: 0, totalValue: 0, orderCount: 0 };
          }
          map[key].totalQty += qty;
          map[key].totalValue += val;
          map[key].orderCount += 1;
        });
      } else {
        const key = "General Order Items";
        if (!map[key]) {
          map[key] = { productId: key, productName: key, category: "General", totalQty: 0, totalValue: 0, orderCount: 0 };
        }
        map[key].totalQty += 1;
        map[key].totalValue += getOrderTotalInvoiceAmount(order);
        map[key].orderCount += 1;
      }
    });

    const list = Object.values(map);
    list.sort((a, b) => b.totalQty - a.totalQty || b.totalValue - a.totalValue);
    return list.slice(0, 5);
  }, [filteredOrdersForReports, products]);

  // TOP 5 COMPANIES / CLIENTS REPORT CALCULATION (from Orders & Offers)
  const topCompanies = useMemo(() => {
    const map: Record<string, { companyName: string; clientName: string; totalQty: number; totalValue: number; orderCount: number }> = {};

    filteredOrdersForReports.forEach((order) => {
      const company = order.companyName || order.clientName || "Unknown Company";
      const client = order.clientName || "Contact";
      let orderQty = 0;
      if (order.items && order.items.length > 0) {
        orderQty = order.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
      } else {
        orderQty = 1;
      }
      const val = getOrderTotalInvoiceAmount(order);

      if (!map[company]) {
        map[company] = { companyName: company, clientName: client, totalQty: 0, totalValue: 0, orderCount: 0 };
      }
      map[company].totalQty += orderQty;
      map[company].totalValue += val;
      map[company].orderCount += 1;
    });

    const list = Object.values(map);
    list.sort((a, b) => b.totalQty - a.totalQty || b.totalValue - a.totalValue);
    return list.slice(0, 5);
  }, [filteredOrdersForReports]);

  // ALL SALES PERSONS DATA FOR "SP" SUB-TAB (Considering only Orders & Offers)
  const salesPersonsData = useMemo(() => {
    return visibleUsers.map((u) => {
      const spOrders = visibleOrders.filter((o) => o.assignedToUserId === u.id || o.createdByUserId === u.id);

      let totalQty = 0;
      let totalRevenue = 0;
      const productMap: Record<string, { name: string; qty: number; value: number }> = {};
      const companyMap: Record<string, { name: string; qty: number; value: number }> = {};

      spOrders.forEach((order) => {
        const company = order.companyName || order.clientName || "Unknown Co.";
        const orderVal = getOrderTotalInvoiceAmount(order);
        totalRevenue += orderVal;

        if (order.items && order.items.length > 0) {
          order.items.forEach((item) => {
            const pName = item.productName || item.productId || "Item";
            const qty = Number(item.quantity) || 1;
            const val = Number(item.amount) || (qty * (Number(item.rate) || 0)) || 0;
            totalQty += qty;

            if (!productMap[pName]) productMap[pName] = { name: pName, qty: 0, value: 0 };
            productMap[pName].qty += qty;
            productMap[pName].value += val;

            if (!companyMap[company]) companyMap[company] = { name: company, qty: 0, value: 0 };
            companyMap[company].qty += qty;
            companyMap[company].value += val;
          });
        } else {
          totalQty += 1;
          const pName = "General Items";
          if (!productMap[pName]) productMap[pName] = { name: pName, qty: 0, value: 0 };
          productMap[pName].qty += 1;
          productMap[pName].value += orderVal;

          if (!companyMap[company]) companyMap[company] = { name: company, qty: 0, value: 0 };
          companyMap[company].qty += 1;
          companyMap[company].value += orderVal;
        }
      });

      const productsList = Object.values(productMap).sort((a, b) => b.qty - a.qty);
      const companiesList = Object.values(companyMap).sort((a, b) => b.qty - a.qty);

      const topProduct = productsList[0] || null;
      const topCompany = companiesList[0] || null;

      const orderCount = spOrders.length;
      const targetQuota = u.targetQuota || 30000;
      const quotaPct = Math.min((totalRevenue / targetQuota) * 100, 100);

      return {
        user: u,
        totalQty,
        totalRevenue,
        orderCount,
        topProduct,
        topCompany,
        productsList,
        companiesList,
        targetQuota,
        quotaPct,
      };
    });
  }, [visibleUsers, visibleOrders, products]);

  // Unique team names for filter
  const teamsList = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.teamName) set.add(u.teamName);
    });
    return Array.from(set);
  }, [users]);

  // Helper to open modal and prepare state (Admin only)
  const openVisibilityModal = () => {
    if (!isAdmin) return;
    const initial: Record<string, boolean> = {};
    users.forEach((u) => {
      initial[u.id] = u.showOnDashboard !== false;
    });
    setTempVisibility(initial);
    setIsVisibilityModalOpen(true);
  };

  // Helper to save visibility to database (Admin only)
  const handleSaveVisibility = async () => {
    if (!isAdmin) return;
    setIsSavingVisibility(true);
    try {
      const promises = (Object.entries(tempVisibility) as [string, boolean][]).map(async ([userId, isVisible]) => {
        const user = users.find((u) => u.id === userId);
        const currentVal = user?.showOnDashboard !== false;
        if (currentVal !== isVisible) {
          await updateUserDetails(userId, { showOnDashboard: isVisible });
        }
      });
      await Promise.all(promises);
      setIsVisibilityModalOpen(false);
    } catch (error) {
      console.error("Error saving card visibility:", error);
    } finally {
      setIsSavingVisibility(false);
    }
  };

  // Filtered SP list respecting the showOnDashboard visibility setting
  const filteredSalesPersons = useMemo(() => {
    return salesPersonsData.filter((sp) => {
      const isVisible = sp.user.showOnDashboard !== false;
      const matchSearch =
        sp.user.name.toLowerCase().includes(spSearchTerm.toLowerCase()) ||
        sp.user.email.toLowerCase().includes(spSearchTerm.toLowerCase()) ||
        sp.user.teamName.toLowerCase().includes(spSearchTerm.toLowerCase());
      const matchTeam = spTeamFilter === "ALL" || sp.user.teamName === spTeamFilter;
      return isVisible && matchSearch && matchTeam;
    });
  }, [salesPersonsData, spSearchTerm, spTeamFilter]);

  // Hierarchical list of salespersons (active user first, then direct reports, then sub-reports, then others)
  const orderedSalesPersons = useMemo(() => {
    const buildHierarchicalList = (
      currentId: string,
      remaining: typeof filteredSalesPersons,
      visited: Set<string>,
      depth: number,
      isUnderActiveUser: boolean
    ): Array<typeof filteredSalesPersons[0] & { depth: number; relation: string }> => {
      const result: Array<typeof filteredSalesPersons[0] & { depth: number; relation: string }> = [];
      
      const current = remaining.find((sp) => sp.user.id === currentId);
      if (current && !visited.has(currentId)) {
        visited.add(currentId);
        
        let relation = "Peer / Other";
        if (currentId === activeUserId) {
          relation = "You";
        } else if (isUnderActiveUser) {
          relation = `L${depth}`;
        } else {
          const isActiveUserUnderThisUser = getReportingTreeUsers(currentId, users).includes(activeUserId);
          if (isActiveUserUnderThisUser) {
            relation = "Senior / Manager";
          }
        }

        result.push({
          ...current,
          depth,
          relation
        });
      }

      const juniors = remaining.filter((sp) => sp.user.reportsTo === currentId && !visited.has(sp.user.id));
      for (const jr of juniors) {
        result.push(...buildHierarchicalList(
          jr.user.id,
          remaining,
          visited,
          (isUnderActiveUser || currentId === activeUserId) ? depth + 1 : 1,
          isUnderActiveUser || currentId === activeUserId
        ));
      }

      return result;
    };

    const visited = new Set<string>();
    const ordered: Array<typeof filteredSalesPersons[0] & { depth: number; relation: string }> = [];

    // 1. Build from active user first
    const activeTree = buildHierarchicalList(activeUserId, filteredSalesPersons, visited, 0, false);
    ordered.push(...activeTree);

    // 2. Build for other roots among the remaining unvisited users
    const unvisited = filteredSalesPersons.filter(sp => !visited.has(sp.user.id));
    const remainingUserIds = new Set(unvisited.map(sp => sp.user.id));
    const roots = unvisited.filter(sp => !sp.user.reportsTo || !remainingUserIds.has(sp.user.reportsTo));

    for (const r of roots) {
      ordered.push(...buildHierarchicalList(r.user.id, filteredSalesPersons, visited, 0, false));
    }

    // 3. Fallback for any disconnected users
    const leftOver = filteredSalesPersons.filter(sp => !visited.has(sp.user.id));
    for (const lo of leftOver) {
      ordered.push({
        ...lo,
        depth: 0,
        relation: "Peer / Other"
      });
    }

    return ordered;
  }, [filteredSalesPersons, activeUserId, users]);

  // Max quantities for scaling progress bars
  const maxProductQty = useMemo(() => {
    return Math.max(...topSellingProducts.map((p) => p.totalQty), 1);
  }, [topSellingProducts]);

  const maxCompanyQty = useMemo(() => {
    return Math.max(...topCompanies.map((c) => c.totalQty), 1);
  }, [topCompanies]);

  const dateFilteredMetrics = useMemo(() => {
    const now = new Date();
    
    // Helper to parse dates safely
    const getOrderDate = (o: OrderOffer) => new Date(o.createdAt);

    // 1. Today Check
    const isToday = (o: OrderOffer) => {
      const d = getOrderDate(o);
      return d.getFullYear() === now.getFullYear() &&
             d.getMonth() === now.getMonth() &&
             d.getDate() === now.getDate();
    };

    // 2. This Week Check (Week starting Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    
    const isThisWeek = (o: OrderOffer) => {
      const d = getOrderDate(o);
      return d >= startOfWeek && d < endOfWeek;
    };

    // 3. This Month Check
    const isThisMonth = (o: OrderOffer) => {
      const d = getOrderDate(o);
      return d.getFullYear() === now.getFullYear() &&
             d.getMonth() === now.getMonth();
    };

    // 4. Till Date Check
    const isTillDate = (o: OrderOffer) => {
      return true;
    };

    const calculateMetricsForSet = (ordersList: OrderOffer[]) => {
      // Total Offer: counts of having offer status (New, Contacted, Proposal, Negotiation) and its revenue
      const offerStatuses = ["New", "Contacted", "Proposal", "Negotiation"];
      const offerOrders = ordersList.filter(o => offerStatuses.includes(o.status));
      const offerCount = offerOrders.length;
      const offerRevenue = offerOrders.reduce((sum, o) => sum + getOrderTotalInvoiceAmount(o), 0);

      // Total Order: counts of having order status (Closed Won) and its revenue
      const orderOrders = ordersList.filter(o => o.status === "Closed Won");
      const orderCount = orderOrders.length;
      const orderRevenue = orderOrders.reduce((sum, o) => sum + getOrderTotalInvoiceAmount(o), 0);

      // Total Invoiced: count of order whose invoice attached and revenue
      const invoicedOrders = ordersList.filter(o => o.billingDetails?.invoiceNumber && o.billingDetails.invoiceNumber.trim() !== "");
      const invoicedCount = invoicedOrders.length;
      const invoicedRevenue = invoicedOrders.reduce((sum, o) => sum + getOrderTotalInvoiceAmount(o), 0);

      // Total Qty Sold: sum of qty whose invoice attached and revenue
      const totalQtySold = invoicedOrders.reduce((sum, o) => {
        const orderQty = o.items ? o.items.reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0) : 0;
        return sum + orderQty;
      }, 0);
      const qtySoldRevenue = invoicedRevenue;

      return {
        offerCount,
        offerRevenue,
        orderCount,
        orderRevenue,
        invoicedCount,
        invoicedRevenue,
        totalQtySold,
        qtySoldRevenue
      };
    };

    return [
      {
        id: "today",
        label: "Today",
        metrics: calculateMetricsForSet(filteredOrdersForReports.filter(isToday)),
        dateLabel: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      },
      {
        id: "thisWeek",
        label: "This Week",
        metrics: calculateMetricsForSet(filteredOrdersForReports.filter(isThisWeek)),
        dateLabel: `${startOfWeek.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      },
      {
        id: "thisMonth",
        label: "This Month",
        metrics: calculateMetricsForSet(filteredOrdersForReports.filter(isThisMonth)),
        dateLabel: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      },
      {
        id: "tillDate",
        label: "Till Date",
        metrics: calculateMetricsForSet(filteredOrdersForReports.filter(isTillDate)),
        dateLabel: "Cumulative History"
      }
    ];
  }, [filteredOrdersForReports]);

  return (
    <div className="space-y-4">
      {/* Tab Switcher: Overview Reports vs SP */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {filteredSubTabs.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveSubTab(st.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === st.id
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {st.id === "reports" ? (
                <BarChart3 size={14} className={activeSubTab === "reports" ? "text-emerald-600" : ""} />
              ) : (
                <Users size={14} className={activeSubTab === "sp" ? "text-emerald-600" : ""} />
              )}
              <span>{st.label}</span>
              {st.id === "sp" && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                  {visibleUsers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sales Person Selector when in Reports Sub-Tab */}
        {activeSubTab === "reports" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium hidden md:inline">Sales Person Filter:</span>
            <select
              value={selectedSpFilter}
              onChange={(e) => setSelectedSpFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL">All Sales Persons</option>
              {visibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.teamName || u.role})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* RENDER SUB-TAB 1: REPORTS */}
      {activeSubTab === "reports" && (
        <div className="space-y-4">
          {/* Scope Alert Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-slate-700">
            <div>
              <span id="scope-status" className="font-bold text-xs text-slate-900 block leading-tight">
                Scope Limit Notification: Showing {visibleOrders.length} active orders & offers
              </span>
              <span className="text-[10.5px] text-slate-500">
                Due to your <strong>{activeUser.role}</strong> scope, active data is filtered for team operations.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                {selectedSpFilter === "ALL" ? "All Sales Persons" : users.find((u) => u.id === selectedSpFilter)?.name || "Filtered SP"}
              </span>
            </div>
          </div>

          {/* Collapsible Date-Filtered Performance Sections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="text-slate-500" size={18} />
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Performance by Date Interval</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpandedSections({ today: true, thisWeek: true, thisMonth: true, tillDate: true })}
                  className="px-2 py-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded transition-all cursor-pointer"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpandedSections({ today: false, thisWeek: false, thisMonth: false, tillDate: false })}
                  className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-all cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {dateFilteredMetrics.map((section) => {
                const isExpanded = !!expandedSections[section.id];
                const m = section.metrics;

                return (
                  <div key={section.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs transition-all duration-200">
                    {/* Header bar */}
                    <button
                      onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50/75 hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          section.id === "today" ? "bg-amber-500 animate-pulse" :
                          section.id === "thisWeek" ? "bg-blue-500" :
                          section.id === "thisMonth" ? "bg-indigo-500" : "bg-emerald-500"
                        }`} />
                        <span className="font-bold text-slate-900 text-sm tracking-tight">{section.label}</span>
                        <span className="text-xs text-slate-500 font-mono">({section.dateLabel})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Compact totals on header when collapsed */}
                        {!isExpanded && (
                          <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono font-bold text-slate-600">
                            <span>Offers: {m.offerCount} ({formatCompactRupees(m.offerRevenue)})</span>
                            <span className="text-slate-300">|</span>
                            <span>Orders: {m.orderCount} ({formatCompactRupees(m.orderRevenue)})</span>
                          </div>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-slate-500 shrink-0" />
                        ) : (
                          <ChevronDown size={16} className="text-slate-500 shrink-0" />
                        )}
                      </div>
                    </button>

                    {/* Content Section */}
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 bg-white animate-fade-in animate-duration-200">
                        {/* CARD 1: Total Offer */}
                        <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-100 flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Offer</span>
                            <span className="bg-amber-100/70 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                              Offer Stage
                            </span>
                          </div>
                          <div>
                            <div className="text-lg font-extrabold text-slate-900 font-mono leading-none flex items-baseline gap-1.5" title={`₹${m.offerRevenue.toLocaleString('en-IN')}`}>
                              <span>{formatCompactRupees(m.offerRevenue)}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500 mt-1 block">
                              {m.offerCount} pending offer{m.offerCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        {/* CARD 2: Total Order */}
                        <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-100 flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Order</span>
                            <span className="bg-emerald-100/70 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                              Closed Won
                            </span>
                          </div>
                          <div>
                            <div className="text-lg font-extrabold text-slate-900 font-mono leading-none flex items-baseline gap-1.5" title={`₹${m.orderRevenue.toLocaleString('en-IN')}`}>
                              <span>{formatCompactRupees(m.orderRevenue)}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500 mt-1 block">
                              {m.orderCount} order{m.orderCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        {/* CARD 3: Total Invoiced */}
                        <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-100 flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Invoiced</span>
                            <span className="bg-blue-100/70 text-blue-800 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                              With Invoice
                            </span>
                          </div>
                          <div>
                            <div className="text-lg font-extrabold text-slate-900 font-mono leading-none flex items-baseline gap-1.5" title={`₹${m.invoicedRevenue.toLocaleString('en-IN')}`}>
                              <span>{formatCompactRupees(m.invoicedRevenue)}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500 mt-1 block">
                              {m.invoicedCount} invoice{m.invoicedCount !== 1 ? 's' : ''} mapped
                            </span>
                          </div>
                        </div>

                        {/* CARD 4: Total Qty Sold */}
                        <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-100 flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Qty Sold</span>
                            <span className="bg-indigo-100/70 text-indigo-800 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                              Items Shipped
                            </span>
                          </div>
                          <div>
                            <div className="text-lg font-extrabold text-slate-900 font-mono leading-none flex items-baseline gap-1.5" title={`${m.totalQtySold.toLocaleString('en-IN')} Kg`}>
                              <span>{formatQuantityMT(m.totalQtySold)}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500 mt-1 block" title={`₹${m.qtySoldRevenue.toLocaleString('en-IN')}`}>
                              Revenue: {formatCompactRupees(m.qtySoldRevenue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1: Pipeline Value */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-md shrink-0">
                <IndianRupee size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider font-mono block leading-none">Pipeline Value</span>
                <span className="text-base font-extrabold text-slate-900 font-mono block mt-0.5 leading-none" title={`₹${totalPipelineValue.toLocaleString('en-IN')}`}>
                  {formatCompactRupees(totalPipelineValue)}
                </span>
                <span className="text-slate-500 text-[10px] mt-0.5 block leading-none">
                  {visibleOrders.length} active orders & offers
                </span>
              </div>
            </div>

            {/* KPI 2: Closed Won Revenue */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-md shrink-0">
                <TrendingUp size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider font-mono block leading-none">Closed Revenue</span>
                <span className="text-base font-extrabold text-slate-900 font-mono block mt-0.5 leading-none" title={`₹${closedWonValue.toLocaleString('en-IN')}`}>
                  {formatCompactRupees(closedWonValue)}
                </span>
                <span className="text-emerald-600 text-[10px] font-semibold mt-0.5 block leading-none">
                  {closedWonOrders.length} closed won orders
                </span>
              </div>
            </div>

            {/* KPI 3: Quota Tracker */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <div className="min-w-0">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider font-mono block leading-none">Target Quota</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-0.5" title={`₹${targetQuotaValue.toLocaleString('en-IN')}`}>{formatCompactRupees(targetQuotaValue)}</span>
                </div>
                <div className="bg-blue-50 text-blue-600 p-1 rounded-md shrink-0">
                  <Target size={14} />
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px] font-semibold">
                  <span className="text-slate-500">Achieved:</span>
                  <span className="text-blue-600">{quotaProgressPercentage.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${quotaProgressPercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* KPI 4: Pending Tasks */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="bg-purple-50 text-purple-600 p-1.5 rounded-md shrink-0">
                <CheckCircle size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider font-mono block leading-none">Pending Tasks</span>
                <span className="text-base font-extrabold text-slate-900 font-mono block mt-0.5 leading-none">
                  {visibleTasks.filter((t) => t.status !== "Completed").length}
                </span>
                <span className="text-slate-500 text-[10px] mt-0.5 block leading-none">
                  {visibleTasks.filter((t) => t.status === "Completed").length} completed
                </span>
              </div>
            </div>
          </div>

          {/* TWO MAIN REPORTS REQUESTED BY USER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* REPORT 1: TOP 5 SELLING PRODUCTS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-50 text-emerald-700 p-2 rounded-lg">
                    <Package size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-mono tracking-tight">Top 5 Selling Products</h3>
                    <p className="text-[11px] text-slate-500">Ranked by total quantity sold (Metric Tonnes)</p>
                  </div>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  By Qty (MT)
                </span>
              </div>

              {topSellingProducts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-mono">
                  No sales product data available for this filter.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topSellingProducts.map((item, index) => {
                    const pct = (item.totalQty / maxProductQty) * 100;
                    return (
                      <div key={index} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 transition-all hover:bg-slate-100/80">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 font-mono ${
                              index === 0
                                ? "bg-amber-400 text-slate-950 shadow-xs"
                                : index === 1
                                ? "bg-slate-300 text-slate-900"
                                : index === 2
                                ? "bg-amber-700 text-white"
                                : "bg-slate-200 text-slate-700"
                            }`}>
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 block truncate leading-tight">
                                {item.productName}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {item.category} • {item.orderCount} deal{item.orderCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-extrabold text-emerald-700 font-mono block leading-tight" title={`${item.totalQty.toLocaleString('en-IN')} Kg`}>
                              {formatQuantityMT(item.totalQty)}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono font-semibold" title={`₹${item.totalValue.toLocaleString('en-IN')}`}>
                              {formatCompactRupees(item.totalValue)}
                            </span>
                          </div>
                        </div>

                        {/* Relative Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              index === 0 ? "bg-emerald-600" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.max(pct, 5)}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* REPORT 2: TOP 5 COMPANIES */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-50 text-blue-700 p-2 rounded-lg">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-mono tracking-tight">Top 5 Companies</h3>
                    <p className="text-[11px] text-slate-500">Ranked by total quantity purchased (Metric Tonnes)</p>
                  </div>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  By Qty (MT)
                </span>
              </div>

              {topCompanies.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-mono">
                  No company purchase data available for this filter.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topCompanies.map((item, index) => {
                    const pct = (item.totalQty / maxCompanyQty) * 100;
                    return (
                      <div key={index} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 transition-all hover:bg-slate-100/80">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 font-mono ${
                              index === 0
                                ? "bg-amber-400 text-slate-950 shadow-xs"
                                : index === 1
                                ? "bg-slate-300 text-slate-900"
                                : index === 2
                                ? "bg-amber-700 text-white"
                                : "bg-slate-200 text-slate-700"
                            }`}>
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 block truncate leading-tight">
                                {item.companyName}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium truncate block">
                                Contact: {item.clientName} • {item.orderCount} order{item.orderCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-extrabold text-blue-700 font-mono block leading-tight" title={`${item.totalQty.toLocaleString('en-IN')} Kg`}>
                              {formatQuantityMT(item.totalQty)}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono font-semibold" title={`₹${item.totalValue.toLocaleString('en-IN')}`}>
                              {formatCompactRupees(item.totalValue)}
                            </span>
                          </div>
                        </div>

                        {/* Relative Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              index === 0 ? "bg-blue-600" : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.max(pct, 5)}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Grid Content: Order / Offer Funnel & Product Catalog */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Order / Offer Pipeline Funnel */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
              <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-0.5">Order / Offer Funnel Distribution</h3>
              <p className="text-[10px] text-slate-500 mb-3">Visual stage count showing distribution of currently visible sales cycles from Orders & Offers.</p>

              <div className="space-y-2">
                {Object.entries(statusCounts).map(([stageName, count]) => {
                  const maxCount = Math.max(...Object.values(statusCounts), 1);
                  const countPercent = (count / maxCount) * 100;
                  const totalPercent = visibleOrders.length > 0 ? (count / visibleOrders.length) * 100 : 0;
                  return (
                    <div key={stageName} className="space-y-0.5">
                      <div className="flex justify-between text-[10.5px]">
                        <span className="font-semibold text-slate-700 text-[10.5px]">{stageName}</span>
                        <span className="text-slate-500 font-mono text-[9.5px]">
                          {count} {count === 1 ? "record" : "records"} ({totalPercent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-50 h-2.5 rounded-md overflow-hidden border border-slate-100 flex items-center">
                        <div
                          className={`${statusColors[stageName]} h-full rounded-md transition-all duration-500`}
                          style={{ width: `${Math.max(countPercent, count > 0 ? 3 : 0)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Catalog & Performance */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider mb-0.5">Product Performance Catalog</h3>
                <p className="text-[10px] text-slate-500 mb-2">Detailed catalog mapping product order volume and aggregate value.</p>

                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {products.length === 0 ? (
                    <div className="text-center py-6 text-[10px] text-slate-400 font-mono">
                      No active products defined in catalog.
                    </div>
                  ) : (
                    products.map((p) => {
                      // Calculate from visibleOrders
                      let productOrderCount = 0;
                      let productValue = 0;
                      let productQty = 0;

                      visibleOrders.forEach((o) => {
                        if (o.items && o.items.length > 0) {
                          const matchedItems = o.items.filter(
                            (it) => it.productId === p.id || it.productName?.toLowerCase() === p.name.toLowerCase()
                          );
                          if (matchedItems.length > 0) {
                            productOrderCount += 1;
                            matchedItems.forEach((it) => {
                              const qty = Number(it.quantity) || 1;
                              const val = Number(it.amount) || (qty * (Number(it.rate) || 0));
                              productQty += qty;
                              productValue += val;
                            });
                          }
                        }
                      });

                      return (
                        <div key={p.id} className="p-2 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-slate-800 block truncate leading-tight">{p.name}</span>
                            <span className="text-[9px] bg-slate-200 text-slate-600 font-mono font-semibold px-1 rounded inline-block mt-0.5 leading-none">{p.category}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-bold text-slate-950 font-mono block leading-tight" title={`₹${productValue.toLocaleString('en-IN')}`}>{formatCompactRupees(productValue)}</span>
                            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1 py-0.12 rounded border border-emerald-100 font-mono leading-none inline-block mt-0.5" title={`${productQty.toLocaleString('en-IN')} Kg`}>
                              {productOrderCount} {productOrderCount === 1 ? "order" : "orders"} • {formatQuantityMT(productQty)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Product catalogs are synchronized real-time from secure NoSQL Firestore.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENDER SUB-TAB 2: SP (SALES PERSONS SEPARATE CARDS) */}
      {activeSubTab === "sp" && (
        <div className="space-y-4">
          {/* Header Controls for SP Cards */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-50 text-emerald-700 p-2 rounded-lg">
                <Users size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-mono">Sales Persons Performance Cards</h3>
                <p className="text-[11px] text-slate-500">Individual quantity metrics & top sales report per sales representative</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Adjust Visibility button for admin only */}
              {isAdmin && (
                <button
                  onClick={openVisibilityModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0"
                  title="Configure which sales person cards are shown on the dashboard"
                >
                  <Settings size={13} className="text-indigo-600" />
                  <span>Adjust Visibility</span>
                </button>
              )}

              {/* Search */}
              <div className="relative flex-1 sm:w-48">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search sales person..."
                  value={spSearchTerm}
                  onChange={(e) => setSpSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Team Filter */}
              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={spTeamFilter}
                  onChange={(e) => setSpTeamFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Teams</option>
                  {teamsList.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Hierarchical Sales Persons Cards */}
          {orderedSalesPersons.length === 0 ? (
            <div className="bg-white p-8 text-center border border-slate-200 rounded-xl text-slate-400 font-mono text-xs">
              No sales persons found matching search, team, or active visibility filters.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Informational banner about tree structure */}
              <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100/50 p-2.5 rounded-xl text-xs text-indigo-800 font-mono font-bold">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <span>ORGANIZATION TREE VIEW: Logged-in user is listed first, followed recursively by their reporting hierarchy (L1, L2, etc.).</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderedSalesPersons.map((sp) => {
                  const isCurrentActive = sp.user.id === activeUserId;
                  const manager = users.find(u => u.id === sp.user.reportsTo);
                  
                  // Color codes for hierarchy relations
                  const relationColors = {
                    "You": "bg-emerald-100 text-emerald-800 border-emerald-200",
                    "L1": "bg-blue-100 text-blue-800 border-blue-200",
                    "L2": "bg-purple-100 text-purple-800 border-purple-200",
                    "Senior / Manager": "bg-amber-100 text-amber-800 border-amber-200",
                    "Peer / Other": "bg-slate-100 text-slate-600 border-slate-200"
                  };
                  
                  const badgeClass = relationColors[sp.relation as keyof typeof relationColors] || "bg-purple-100 text-purple-800 border-purple-200";

                  return (
                    <div
                      key={sp.user.id}
                      className={`bg-white rounded-xl border transition-all p-4 space-y-3.5 shadow-xs relative overflow-hidden ${
                        isCurrentActive
                          ? "border-emerald-300 ring-2 ring-emerald-500/20 bg-emerald-50/5"
                          : sp.relation === "L1"
                          ? "border-blue-200"
                          : sp.relation === "L2" || sp.relation.startsWith("L")
                          ? "border-purple-200"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {/* Left border accent representing tree levels */}
                      {sp.depth > 0 && (
                        <div 
                          className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                            sp.relation === "L1" ? "bg-blue-500" : "bg-purple-500"
                          }`}
                        />
                      )}

                      {/* User Header */}
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-mono font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs relative">
                            {sp.user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                            {/* Depth badge on avatar */}
                            {sp.depth > 0 && (
                              <span className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-[8px] font-mono font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                                L{sp.depth}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-slate-900 truncate block leading-tight">
                                {sp.user.name}
                              </span>
                              <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.2 rounded border leading-none ${badgeClass}`}>
                                {sp.relation.toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 truncate block mt-0.5">
                              {sp.user.role} • <span className="font-semibold text-slate-700">{sp.user.teamName || "Sales"}</span>
                            </span>
                          </div>
                        </div>

                        <span className="bg-slate-100 text-slate-700 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 font-semibold shrink-0">
                          {sp.orderCount} deal{sp.orderCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* PROMINENT QUANTITY & REVENUE METRICS */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono block leading-none">
                            Total Qty Sold
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-lg font-extrabold text-emerald-700 font-mono leading-none" title={`${sp.totalQty.toLocaleString('en-IN')} Kg`}>
                              {formatQuantityMT(sp.totalQty)}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono block leading-none">
                            Total Sales Revenue
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-lg font-extrabold text-slate-900 font-mono leading-none" title={`₹${sp.totalRevenue.toLocaleString('en-IN')}`}>
                              {formatCompactRupees(sp.totalRevenue)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quota Target Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10.5px]">
                          <span className="text-slate-500 font-medium">Target Quota ({formatCompactRupees(sp.targetQuota)})</span>
                          <span className="font-bold text-slate-800 font-mono">{sp.quotaPct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              sp.quotaPct >= 100 ? "bg-emerald-500" : "bg-blue-600"
                            }`}
                            style={{ width: `${Math.max(sp.quotaPct, 3)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* TOP HIGHLIGHTS (TOP PRODUCT & TOP COMPANY FOR THIS SP) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Top Product */}
                        <div className="p-2 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-800 block font-mono">
                            🏆 Top Product Sold
                          </span>
                          {sp.topProduct ? (
                            <div className="mt-0.5">
                              <span className="font-bold text-slate-900 block truncate text-xs">
                                {sp.topProduct.name}
                              </span>
                              <span className="text-[10px] text-emerald-700 font-mono font-bold" title={`${sp.topProduct.qty.toLocaleString('en-IN')} Kg • ₹${sp.topProduct.value.toLocaleString('en-IN')}`}>
                                {formatQuantityMT(sp.topProduct.qty)} • {formatCompactRupees(sp.topProduct.value)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic font-mono mt-0.5 block">No product sales yet</span>
                          )}
                        </div>

                        {/* Top Company */}
                        <div className="p-2 bg-blue-50/60 border border-blue-100 rounded-lg">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-800 block font-mono">
                            🏢 Top Client Company
                          </span>
                          {sp.topCompany ? (
                            <div className="mt-0.5">
                              <span className="font-bold text-slate-900 block truncate text-xs">
                                {sp.topCompany.name}
                              </span>
                              <span className="text-[10px] text-blue-700 font-mono font-bold" title={`${sp.topCompany.qty.toLocaleString('en-IN')} Kg • ₹${sp.topCompany.value.toLocaleString('en-IN')}`}>
                                {formatQuantityMT(sp.topCompany.qty)} • {formatCompactRupees(sp.topCompany.value)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic font-mono mt-0.5 block">No company orders yet</span>
                          )}
                        </div>
                      </div>

                      {/* PRODUCT QUANTITY BREAKDOWN LIST FOR SP */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                          Product Quantity Breakdown
                        </span>

                        {sp.productsList.length === 0 ? (
                          <div className="text-[10px] text-slate-400 font-mono italic">No product line items recorded.</div>
                        ) : (
                          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                            {sp.productsList.map((prod, idx) => {
                              const sharePct = sp.totalQty > 0 ? (prod.qty / sp.totalQty) * 100 : 0;
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-[11px] p-1.5 bg-slate-50 rounded-md border border-slate-100"
                                >
                                  <span className="font-medium text-slate-800 truncate min-w-0 pr-2">
                                    {prod.name}
                                  </span>
                                  <div className="text-right shrink-0 font-mono flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500">
                                      {sharePct.toFixed(0)}%
                                    </span>
                                    <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold text-[10.5px]" title={`${prod.qty.toLocaleString('en-IN')} Kg`}>
                                      {formatQuantityMT(prod.qty)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Hierarchy breadcrumb indicator */}
                      {manager && (
                        <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <span className="font-semibold text-slate-400">Reports To:</span>
                          {sp.user.role === Role.SeniorManager ? (
                            <span className="text-slate-700 font-bold">Admin</span>
                          ) : (
                            <>
                              <span className="text-slate-700 font-bold">{manager.name}</span>
                              <span className="text-slate-400">({manager.role})</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARD VISIBILITY ADJUSTMENT MODAL FOR ADMIN ONLY */}
      {isVisibilityModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200 max-h-[85vh] animate-scale-up">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 font-mono">
                  <Settings size={15} className="text-indigo-600 animate-spin-slow" />
                  <span>Dashboard Card Visibility</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Choose which sales representative performance cards are displayed on the active dashboard. This configuration applies globally for all portal viewers.
                </p>
              </div>
              <button
                onClick={() => setIsVisibilityModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
              {/* Grouped by Team for visibility toggles */}
              {(Object.entries(
                users.reduce<Record<string, User[]>>((groups, u) => {
                  const team = u.teamName || "Unassigned Team";
                  if (!groups[team]) groups[team] = [];
                  groups[team].push(u);
                  return groups;
                }, {})
              ) as [string, User[]][]).map(([teamName, teamUsers]) => {
                const teamCheckedCount = teamUsers.filter((u) => tempVisibility[u.id] !== false).length;
                const isAllChecked = teamCheckedCount === teamUsers.length;
                const isSomeChecked = teamCheckedCount > 0 && !isAllChecked;

                return (
                  <div key={teamName} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/50">
                    {/* Team Header with bulk toggle */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={isAllChecked}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate = isSomeChecked;
                            }
                          }}
                          onChange={() => {
                            const updated = { ...tempVisibility };
                            teamUsers.forEach((u) => {
                              updated[u.id] = !isAllChecked;
                            });
                            setTempVisibility(updated);
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono group-hover:text-indigo-600 transition">
                          {teamName}
                        </span>
                      </label>
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono font-semibold">
                        {teamCheckedCount}/{teamUsers.length} shown
                      </span>
                    </div>

                    {/* Team Users list */}
                    <div className="space-y-2 pl-5.5">
                      {teamUsers.map((u) => {
                        const isChecked = tempVisibility[u.id] !== false;
                        return (
                          <label
                            key={u.id}
                            className="flex items-center justify-between p-2 rounded-lg border border-slate-200/40 bg-white hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                                {u.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-800 truncate block leading-tight">
                                  {u.name}
                                </span>
                                <span className="text-[9.5px] text-slate-500 block truncate">
                                  {u.role}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {isChecked ? (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                  <Eye size={10} />
                                  <span>Visible</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                  <EyeOff size={10} />
                                  <span>Hidden</span>
                                </span>
                              )}
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setTempVisibility({
                                    ...tempVisibility,
                                    [u.id]: e.target.checked
                                  });
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsVisibilityModalOpen(false)}
                disabled={isSavingVisibility}
                className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVisibility}
                disabled={isSavingVisibility}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSavingVisibility ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Drive Settings if Admin */}
      {activeUser.role === Role.Admin && (
        <AdminDriveSettings
          activeUser={activeUser}
          teams={teams}
          users={users}
        />
      )}
    </div>
  );
}
