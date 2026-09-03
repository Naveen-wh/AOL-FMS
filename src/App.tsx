/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { User, ProjectWorkflow, SalesTask, ActionLog, Role, AccessLevel, TeamTabSettings, Client, Team, Product, OrderOffer, PaymentBank, ProductCategory, ProductGroup, Manufacturer, FreightTerm, DeliveryTerm, TransporterName, WarehouseManagedBy, DispatchLocation, EmailTemplate, PaymentDetails, PaymentReceiptRecord, PaymentTerm, PaymentCreditPeriod, FAQItem, BugRequest, TaxRate, BadDebtor, EmailSentLog } from "./types";
import {
  canDeleteTask,
  canDeleteClient,
  canDeleteOrderOffer,
  canDeleteProduct,
  INITIAL_TAX_RATES,
} from "./data";

// Firebase imports
import { auth, signOut, onAuthStateChanged } from "./firebase";
import { 
  seedDatabaseIfEmpty, 
  subscribeCollection, 
  saveTask, 
  deleteTaskDoc, 
  saveLog, 
  clearAllLogsInFirestore, 
  updateUserDetails,
  syncUserProfile,
  saveTeamTabSettings,
  saveClient,
  deleteClientDoc,
  saveTeam,
  deleteTeamDoc,
  saveProduct,
  deleteProductDoc,
  saveOrder,
  deleteOrderDoc,
  savePaymentBank,
  deletePaymentBankDoc,
  saveProductCategory,
  deleteProductCategoryDoc,
  saveProductGroup,
  deleteProductGroupDoc,
  saveManufacturer,
  deleteManufacturerDoc,
  saveFreightTerm,
  deleteFreightTermDoc,
  saveDeliveryTerm,
  deleteDeliveryTermDoc,
  saveTransporter,
  deleteTransporterDoc,
  saveWarehouse,
  deleteWarehouseDoc,
  saveDispatchLocation,
  deleteDispatchLocationDoc,
  isAuditLogEnabled,
  setAuditLogEnabled,
  saveEmailTemplate,
  deleteEmailTemplateDoc,
  savePaymentTerm,
  deletePaymentTermDoc,
  savePaymentCreditPeriod,
  deletePaymentCreditPeriodDoc,
  subscribeTaxRates,
  saveTaxRatesList,
  saveFAQ,
  deleteFAQDoc,
  saveBugRequest,
  deleteBugRequestDoc,
  subscribeEmailSentLogs,
  saveEmailSentLog
} from "./lib/firebaseService";

// Sub-components
import ListManagementView from "./components/ListManagementView";
import ClientsView from "./components/ClientsView";
import AuthScreen from "./components/AuthScreen";
import PendingOnboardingScreen from "./components/PendingOnboardingScreen";
import DashboardView from "./components/DashboardView";
import OrdersOffersView from "./components/OrdersOffersView";
import IndentView from "./components/IndentView";
import PaymentListView from "./components/PaymentListView";
import ProductsView from "./components/ProductsView";
import TeamDirectoryView from "./components/TeamDirectoryView";
import AuditLogsView from "./components/AuditLogsView";
import EmailTemplateManagementView from "./components/EmailTemplateManagementView";
import AboutMeView from "./components/AboutMeView";
import { AolLogo } from "./components/AolLogo";

// Lucide Icons
import {
  LayoutDashboard,
  Coins,
  Folders,
  Users2,
  FileClock,
  Briefcase,
  LogOut,
  Shield,
  Mail,
  Loader2,
  Package,
  ShoppingBag,
  Receipt,
  CreditCard,
  HelpCircle,
  Type,
  Sun,
  Moon,
  ChevronDown
} from "lucide-react";

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [isPendingOnboarding, setIsPendingOnboarding] = useState<boolean>(false);
  const [unonboardedEmail, setUnonboardedEmail] = useState<string>("");

  // Collection states
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [tabSettings, setTabSettings] = useState<TeamTabSettings[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [orders, setOrders] = useState<OrderOffer[]>([]);
  const [paymentBanks, setPaymentBanks] = useState<PaymentBank[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [freightTerms, setFreightTerms] = useState<FreightTerm[]>([]);
  const [deliveryTerms, setDeliveryTerms] = useState<DeliveryTerm[]>([]);
  const [transporters, setTransporters] = useState<TransporterName[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseManagedBy[]>([]);
  const [dispatchLocations, setDispatchLocations] = useState<DispatchLocation[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [paymentDetailsList, setPaymentDetailsList] = useState<PaymentDetails[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [paymentCreditPeriods, setPaymentCreditPeriods] = useState<PaymentCreditPeriod[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>(INITIAL_TAX_RATES);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [bugRequests, setBugRequests] = useState<BugRequest[]>([]);
  const [badDebtors, setBadDebtors] = useState<BadDebtor[]>([]);
  const [emailSentLogs, setEmailSentLogs] = useState<EmailSentLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [isAuditLogEnabledState, setIsAuditLogEnabledState] = useState<boolean>(true);

  // Application Theme state (light / dark)
  type AppTheme = "light" | "dark";
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem("app_theme");
    if (saved === "dark" || saved === "light") return saved;
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  // Application Font Size state (small = default current size, medium = increased, large = large size)
  type AppFontSize = "small" | "medium" | "large";
  const [fontSize, setFontSize] = useState<AppFontSize>(() => {
    const saved = localStorage.getItem("app_font_size");
    return (saved === "medium" || saved === "large" || saved === "small") ? saved : "small";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-font-size", fontSize);
    localStorage.setItem("app_font_size", fontSize);
  }, [fontSize]);

  // User profile dropdown menu state (anchored to user name pill)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    async function fetchStatus() {
      const enabled = await isAuditLogEnabled();
      setIsAuditLogEnabledState(enabled);
    }
    fetchStatus();
  }, []);

  const handleToggleAuditLog = async (enabled: boolean) => {
    await setAuditLogEnabled(enabled);
    setIsAuditLogEnabledState(enabled);
  };

  // Initial Seed & Auth Connection
  useEffect(() => {
    setAuthLoading(true);

    // Safety fallback timer to prevent endless loading screen
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 3000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(safetyTimer);
      if (firebaseUser?.email) {
        try {
          // Check if user details exist in Firestore user database
          const profile = await syncUserProfile(
            firebaseUser.email,
            firebaseUser.displayName || "",
            firebaseUser.photoURL || undefined
          );

          if (profile) {
            setActiveUserId(profile.id);
            setIsAuthenticated(true);
            setIsPendingOnboarding(false);
            setUnonboardedEmail("");
          } else {
            // User authenticated in Firebase Auth but NOT onboarded in Firestore user DB
            setIsAuthenticated(false);
            setIsPendingOnboarding(true);
            setUnonboardedEmail(firebaseUser.email);
            setActiveUserId("");
          }
          setAuthLoading(false);

          // Seed firestore if empty asynchronously in background
          seedDatabaseIfEmpty().catch((err) => {
            console.error("[Firebase] Error during background seeding:", err);
          });
        } catch (err) {
          console.error("Error establishing authenticated profile user:", err);
          setIsAuthenticated(false);
          setIsPendingOnboarding(false);
          setAuthLoading(false);
        }
      } else {
        setIsAuthenticated(false);
        setIsPendingOnboarding(false);
        setUnonboardedEmail("");
        setActiveUserId("");
        setAuthLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribeAuth();
    };
  }, []);

  // Setup dynamic firestore standard listener subscriptions
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log("[Firebase] Setting up query listeners...");
    const unsubUsers = subscribeCollection<User>("users", setUsers);
    const unsubWorkflows = subscribeCollection<ProjectWorkflow>("workflows", setWorkflows);
    const unsubProducts = subscribeCollection<Product>("products", setProducts, "createdAt");
    const unsubTasks = subscribeCollection<SalesTask>("tasks", setTasks);
    const unsubLogs = subscribeCollection<ActionLog>("logs", setLogs, "timestamp");
    const unsubTabSettings = subscribeCollection<TeamTabSettings>("tabSettings", setTabSettings);
    const unsubClients = subscribeCollection<Client>("clients", setClients, "createdAt");
    const unsubTeams = subscribeCollection<Team>("teams", setTeams, "createdAt");
    const unsubOrders = subscribeCollection<OrderOffer>("orders", setOrders, "createdAt");
    const unsubPaymentBanks = subscribeCollection<PaymentBank>("payment_banks", setPaymentBanks, "createdAt");
    const unsubProductCategories = subscribeCollection<ProductCategory>("product_categories", setProductCategories, "createdAt");
    const unsubProductGroups = subscribeCollection<ProductGroup>("product_groups", setProductGroups, "createdAt");
    const unsubManufacturers = subscribeCollection<Manufacturer>("manufacturers", setManufacturers, "createdAt");
    const unsubFreightTerms = subscribeCollection<FreightTerm>("freight_terms", setFreightTerms, "createdAt");
    const unsubDeliveryTerms = subscribeCollection<DeliveryTerm>("delivery_terms", setDeliveryTerms, "createdAt");
    const unsubTransporters = subscribeCollection<TransporterName>("transporters", setTransporters, "createdAt");
    const unsubWarehouses = subscribeCollection<WarehouseManagedBy>("warehouses", setWarehouses, "createdAt");
    const unsubDispatchLocations = subscribeCollection<DispatchLocation>("dispatch_locations", setDispatchLocations, "createdAt");
    const unsubEmailTemplates = subscribeCollection<EmailTemplate>("email_templates", setEmailTemplates, "createdAt");
    const unsubPaymentDetails = subscribeCollection<PaymentDetails>("payment_details", setPaymentDetailsList);
    const unsubPaymentTerms = subscribeCollection<PaymentTerm>("payment_terms", setPaymentTerms, "createdAt");
    const unsubPaymentCreditPeriods = subscribeCollection<PaymentCreditPeriod>("payment_credit_periods", setPaymentCreditPeriods, "createdAt");
    const unsubTaxRates = subscribeTaxRates(setTaxRates);
    const unsubFaqs = subscribeCollection<FAQItem>("faqs", setFaqs, "createdAt");
    const unsubBugs = subscribeCollection<BugRequest>("bug_requests", setBugRequests, "createdAt");
    const unsubBadDebtors = subscribeCollection<BadDebtor>("bad_debtors", setBadDebtors, "createdAt");
    const unsubEmailSentLogs = subscribeEmailSentLogs(setEmailSentLogs);

    return () => {
      unsubUsers();
      unsubWorkflows();
      unsubProducts();
      unsubTasks();
      unsubLogs();
      unsubTabSettings();
      unsubClients();
      unsubTeams();
      unsubOrders();
      unsubPaymentBanks();
      unsubProductCategories();
      unsubProductGroups();
      unsubManufacturers();
      unsubFreightTerms();
      unsubDeliveryTerms();
      unsubTransporters();
      unsubWarehouses();
      unsubDispatchLocations();
      unsubEmailTemplates();
      unsubPaymentDetails();
      unsubPaymentTerms();
      unsubPaymentCreditPeriods();
      unsubTaxRates();
      unsubFaqs();
      unsubBugs();
      unsubBadDebtors();
      unsubEmailSentLogs();
    };
  }, [isAuthenticated]);

  // Derive current user reference object
  const activeUser = users.find((u) => u.id === activeUserId) || {
    id: activeUserId || "unknown",
    name: "Standard Contributor",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    email: activeUserId || "",
    teamName: "Sales Development",
    targetQuota: 30000,
    avatarUrl: ""
  };

  // Tab permissions configuration matching
  const isUserAdmin = activeUser.role === Role.Admin;
  const userTeamSetting = tabSettings.find(
    (s) => s.teamName.toLowerCase() === activeUser.teamName.toLowerCase()
  );

  const allTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orders", label: "Orders & Offers", icon: ShoppingBag },
    { id: "indent", label: "Indent", icon: Receipt },
    { id: "payment_list", label: "Payment List", icon: CreditCard },
    { id: "clients", label: "Client Management", icon: Briefcase },
    { id: "list_management", label: "List Management", icon: Folders },
    { id: "team", label: "Hierarchy & Team", icon: Users2 },
    { id: "logs", label: "Audit Log Trial", icon: FileClock },
    { id: "email_templates", label: "Email Templates", icon: Mail },
    { id: "about_me", label: "About Me", icon: HelpCircle },
  ];

  const visibleTabs = useMemo(() => {
    return allTabs.filter((tab) => {
      if (isUserAdmin) return true;
      if (!userTeamSetting) return true; // Default to all visible if no setting document
      if (userTeamSetting.teamPermissions && userTeamSetting.teamPermissions[tab.id] !== undefined) {
        return userTeamSetting.teamPermissions[tab.id].view !== false;
      }
      return userTeamSetting.visibleTabs ? userTeamSetting.visibleTabs.includes(tab.id) : true;
    });
  }, [isUserAdmin, userTeamSetting?.teamName, JSON.stringify(userTeamSetting?.visibleTabs), JSON.stringify(userTeamSetting?.teamPermissions)]);

  // Safe redirect if on an unauthorized tab
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // Re-check onboarding status
  const handleRefreshOnboardingStatus = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    setAuthLoading(true);
    try {
      const profile = await syncUserProfile(
        auth.currentUser.email,
        auth.currentUser.displayName || "",
        auth.currentUser.photoURL || undefined
      );
      if (profile) {
        setActiveUserId(profile.id);
        setIsAuthenticated(true);
        setIsPendingOnboarding(false);
        setUnonboardedEmail("");
      } else {
        setIsAuthenticated(false);
        setIsPendingOnboarding(true);
        setUnonboardedEmail(auth.currentUser.email);
      }
    } catch (err) {
      console.error("Error re-checking onboarding status:", err);
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign out handle
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setIsAuthenticated(false);
      setIsPendingOnboarding(false);
      setUnonboardedEmail("");
      setActiveUserId("");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // State handlers for orders
  const handleAddOrder = async (newOrderData: Omit<OrderOffer, "id" | "createdAt" | "createdByUserId"> | OrderOffer) => {
    const passedId = (newOrderData as any).id;
    const orderId = passedId || `order-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newOrder: OrderOffer = {
      ...newOrderData,
      id: orderId,
      createdAt: (newOrderData as any).createdAt || new Date().toISOString(),
      createdByUserId: (newOrderData as any).createdByUserId || activeUser.id,
    };
    
    await saveOrder(newOrder);
    
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: newOrder.billingDetails?.invoiceNumber ? "Map Invoice" : "Create Order",
      targetType: "Order",
      targetId: orderId,
      targetName: newOrder.companyName,
      details: newOrder.billingDetails?.invoiceNumber
        ? `${activeUser.name} imported historical order with invoice #${newOrder.billingDetails.invoiceNumber} for "${newOrder.companyName}" (Total: ₹${newOrder.totalValue.toLocaleString()})`
        : `${activeUser.name} created sales order/offer for client "${newOrder.clientName}" at "${newOrder.companyName}" with total value of ₹${newOrder.totalValue.toLocaleString()}`
    });
  };

  const handleEditOrder = async (updatedOrder: OrderOffer) => {
    const oldOrder = orders.find((o) => o.id === updatedOrder.id);
    await saveOrder(updatedOrder);

    let details = `${activeUser.name} modified order for "${updatedOrder.companyName}"`;
    let actionType: ActionLog["actionType"] = "Edit Order";

    if (oldOrder) {
      const oldInvoice = oldOrder.billingDetails?.invoiceNumber;
      const newInvoice = updatedOrder.billingDetails?.invoiceNumber;
      const oldFile = oldOrder.billingDetails?.invoiceFileUrl;
      const newFile = updatedOrder.billingDetails?.invoiceFileUrl;

      if (!oldInvoice && newInvoice) {
        actionType = "Map Invoice";
        details = `${activeUser.name} mapped invoice #${newInvoice} and uploaded file "${updatedOrder.billingDetails?.invoiceFileName || 'invoice'}" for order of "${updatedOrder.companyName}"`;
      } else if (oldInvoice && newInvoice && (oldInvoice !== newInvoice || oldFile !== newFile)) {
        actionType = "Update Invoice";
        details = `${activeUser.name} updated mapped invoice for "${updatedOrder.companyName}" to #${newInvoice}`;
      } else if (oldOrder.status !== updatedOrder.status) {
        actionType = "Update Order Status";
        details = `${activeUser.name} modified order status to "${updatedOrder.status}" for "${updatedOrder.companyName}"`;
      } else if (JSON.stringify(oldOrder.closedWonDetails) !== JSON.stringify(updatedOrder.closedWonDetails)) {
        actionType = "Map Customer PO";
        details = `${activeUser.name} mapped customer PO details for "${updatedOrder.companyName}" (PO: ${updatedOrder.closedWonDetails?.customerPoNumber || 'N/A'})`;
      }
    }

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType,
      targetType: "Order",
      targetId: updatedOrder.id,
      targetName: updatedOrder.companyName,
      details
    });
  };

  const handleDeleteOrder = async (orderId: string) => {
    const orderToDelete = orders.find((o) => o.id === orderId);
    if (!orderToDelete) return;
    if (!canDeleteOrderOffer(activeUser.id, orderToDelete, users)) {
      alert("Delete forbidden. Requires Manager role, Admin clearance, or record ownership.");
      return;
    }

    await deleteOrderDoc(orderId);

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Order",
      targetType: "Order",
      targetId: orderId,
      targetName: orderToDelete.companyName,
      details: `${activeUser.name} deleted sales order "${orderToDelete.companyName}"`
    });
  };

  const handleAddProductCategory = async (data: Omit<ProductCategory, "id" | "createdAt">) => {
    const categoryId = `cat-${Date.now()}`;
    await saveProductCategory({ ...data, id: categoryId, createdAt: new Date().toISOString() });
    
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Category",
      targetType: "Category",
      targetId: categoryId,
      targetName: data.name,
      details: `${activeUser.name} added new product category: "${data.name}"`
    });
  };
  const handleEditProductCategory = async (id: string, name: string) => {
    const category = productCategories.find(c => c.id === id);
    const updated = { ...category, id, name, createdAt: category?.createdAt || new Date().toISOString() };
    await saveProductCategory(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Category",
      targetType: "Category",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited product category: "${name}"`
    });
  };
  const handleDeleteProductCategory = async (id: string) => {
    const category = productCategories.find(c => c.id === id);
    await deleteProductCategoryDoc(id);
    
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Category",
      targetType: "Category",
      targetId: id,
      targetName: category?.name || id,
      details: `${activeUser.name} deleted product category: "${category?.name || id}"`
    });
  };
  const handleAddProductGroup = async (data: Omit<ProductGroup, "id" | "createdAt">) => {
    const groupId = `grp-${Date.now()}`;
    await saveProductGroup({ ...data, id: groupId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Group",
      targetType: "Group",
      targetId: groupId,
      targetName: data.name,
      details: `${activeUser.name} added new product group: "${data.name}"`
    });
  };
  const handleEditProductGroup = async (id: string, name: string) => {
    const group = productGroups.find(c => c.id === id);
    const updated = { ...group, id, name, createdAt: group?.createdAt || new Date().toISOString() };
    await saveProductGroup(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Group",
      targetType: "Group",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited product group: "${name}"`
    });
  };
  const handleDeleteProductGroup = async (id: string) => {
    const group = productGroups.find(c => c.id === id);
    await deleteProductGroupDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Group",
      targetType: "Group",
      targetId: id,
      targetName: group?.name || id,
      details: `${activeUser.name} deleted product group: "${group?.name || id}"`
    });
  };
  const handleAddManufacturer = async (data: Omit<Manufacturer, "id" | "createdAt">) => {
    const manId = `man-${Date.now()}`;
    await saveManufacturer({ ...data, id: manId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Manufacturer",
      targetType: "Manufacturer",
      targetId: manId,
      targetName: data.name,
      details: `${activeUser.name} added new manufacturer: "${data.name}"`
    });
  };
  const handleEditManufacturer = async (id: string, name: string) => {
    const man = manufacturers.find(c => c.id === id);
    const updated = { ...man, id, name, createdAt: man?.createdAt || new Date().toISOString() };
    await saveManufacturer(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Manufacturer",
      targetType: "Manufacturer",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited manufacturer: "${name}"`
    });
  };
  const handleDeleteManufacturer = async (id: string) => {
    const man = manufacturers.find(c => c.id === id);
    await deleteManufacturerDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Manufacturer",
      targetType: "Manufacturer",
      targetId: id,
      targetName: man?.name || id,
      details: `${activeUser.name} deleted manufacturer: "${man?.name || id}"`
    });
  };
  const handleAddFreightTerm = async (data: Omit<FreightTerm, "id" | "createdAt">) => {
    const termId = `frt-${Date.now()}`;
    await saveFreightTerm({ ...data, id: termId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Freight Term",
      targetType: "Freight Term",
      targetId: termId,
      targetName: data.name,
      details: `${activeUser.name} added new freight term: "${data.name}"`
    });
  };
  const handleEditFreightTerm = async (id: string, name: string) => {
    const term = freightTerms.find(c => c.id === id);
    const updated = { ...term, id, name, createdAt: term?.createdAt || new Date().toISOString() };
    await saveFreightTerm(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Freight Term",
      targetType: "Freight Term",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited freight term: "${name}"`
    });
  };
  const handleDeleteFreightTerm = async (id: string) => {
    const term = freightTerms.find(c => c.id === id);
    await deleteFreightTermDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Freight Term",
      targetType: "Freight Term",
      targetId: id,
      targetName: term?.name || id,
      details: `${activeUser.name} deleted freight term: "${term?.name || id}"`
    });
  };
  const handleAddDeliveryTerm = async (data: Omit<DeliveryTerm, "id" | "createdAt">) => {
    const dtId = `dt-${Date.now()}`;
    await saveDeliveryTerm({ ...data, id: dtId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Delivery Term",
      targetType: "Delivery Term",
      targetId: dtId,
      targetName: data.name,
      details: `${activeUser.name} created delivery term: "${data.name}"`
    });
  };
  const handleEditDeliveryTerm = async (id: string, name: string) => {
    const term = deliveryTerms.find(c => c.id === id);
    const updated = { ...term, id, name, createdAt: term?.createdAt || new Date().toISOString() };
    await saveDeliveryTerm(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Delivery Term",
      targetType: "Delivery Term",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited delivery term: "${name}"`
    });
  };
  const handleDeleteDeliveryTerm = async (id: string) => {
    const term = deliveryTerms.find(c => c.id === id);
    await deleteDeliveryTermDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Delivery Term",
      targetType: "Delivery Term",
      targetId: id,
      targetName: term?.name || id,
      details: `${activeUser.name} deleted delivery term: "${term?.name || id}"`
    });
  };
  const handleAddTransporter = async (data: Omit<TransporterName, "id" | "createdAt">) => {
    const transId = `trn-${Date.now()}`;
    await saveTransporter({ ...data, id: transId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Transporter",
      targetType: "Transporter",
      targetId: transId,
      targetName: data.name,
      details: `${activeUser.name} added new transporter: "${data.name}"`
    });
  };
  const handleEditTransporter = async (id: string, name: string) => {
    const trans = transporters.find(c => c.id === id);
    const updated = { ...trans, id, name, createdAt: trans?.createdAt || new Date().toISOString() };
    await saveTransporter(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Transporter",
      targetType: "Transporter",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited transporter: "${name}"`
    });
  };
  const handleDeleteTransporter = async (id: string) => {
    const trans = transporters.find(c => c.id === id);
    await deleteTransporterDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Transporter",
      targetType: "Transporter",
      targetId: id,
      targetName: trans?.name || id,
      details: `${activeUser.name} deleted transporter: "${trans?.name || id}"`
    });
  };
  const handleAddWarehouse = async (data: Omit<WarehouseManagedBy, "id" | "createdAt">) => {
    await saveWarehouse({ ...data, id: `whs-${Date.now()}`, createdAt: new Date().toISOString() });
  };
  const handleEditWarehouse = async (id: string, name: string) => {
    const wh = warehouses.find(c => c.id === id);
    const updated = { ...wh, id, name, createdAt: wh?.createdAt || new Date().toISOString() };
    await saveWarehouse(updated);
  };
  const handleDeleteWarehouse = async (id: string) => {
    await deleteWarehouseDoc(id);
  };
  const handleAddDispatchLocation = async (data: Omit<DispatchLocation, "id" | "createdAt">) => {
    await saveDispatchLocation({ ...data, id: `dsp-${Date.now()}`, createdAt: new Date().toISOString() });
  };
  const handleEditDispatchLocation = async (id: string, name: string) => {
    const loc = dispatchLocations.find(c => c.id === id);
    const updated = { ...loc, id, name, createdAt: loc?.createdAt || new Date().toISOString() };
    await saveDispatchLocation(updated);
  };
  const handleDeleteDispatchLocation = async (id: string) => {
    await deleteDispatchLocationDoc(id);
  };

  const handleAddPaymentTerm = async (data: Omit<PaymentTerm, "id" | "createdAt">) => {
    const termId = `pay-${Date.now()}`;
    await savePaymentTerm({ ...data, id: termId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Payment Term",
      targetType: "Payment Term",
      targetId: termId,
      targetName: data.name,
      details: `${activeUser.name} added new payment term: "${data.name}"`
    });
  };
  const handleEditPaymentTerm = async (id: string, name: string) => {
    const term = paymentTerms.find(c => c.id === id);
    const updated = { ...term, id, name, createdAt: term?.createdAt || new Date().toISOString() };
    await savePaymentTerm(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Payment Term",
      targetType: "Payment Term",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited payment term: "${name}"`
    });
  };
  const handleDeletePaymentTerm = async (id: string) => {
    const term = paymentTerms.find(c => c.id === id);
    await deletePaymentTermDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Payment Term",
      targetType: "Payment Term",
      targetId: id,
      targetName: term?.name || id,
      details: `${activeUser.name} deleted payment term: "${term?.name || id}"`
    });
  };

  const handleAddPaymentCreditPeriod = async (data: Omit<PaymentCreditPeriod, "id" | "createdAt">) => {
    const periodId = `pcp-${Date.now()}`;
    await savePaymentCreditPeriod({ ...data, id: periodId, createdAt: new Date().toISOString() });
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Payment Credit Period",
      targetType: "Payment Credit Period",
      targetId: periodId,
      targetName: data.name,
      details: `${activeUser.name} added new payment credit period: "${data.name}"`
    });
  };
  const handleEditPaymentCreditPeriod = async (id: string, name: string) => {
    const period = paymentCreditPeriods.find(c => c.id === id);
    const updated = { ...period, id, name, createdAt: period?.createdAt || new Date().toISOString() };
    await savePaymentCreditPeriod(updated);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Payment Credit Period",
      targetType: "Payment Credit Period",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited payment credit period: "${name}"`
    });
  };
  const handleDeletePaymentCreditPeriod = async (id: string) => {
    const period = paymentCreditPeriods.find(c => c.id === id);
    await deletePaymentCreditPeriodDoc(id);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Payment Credit Period",
      targetType: "Payment Credit Period",
      targetId: id,
      targetName: period?.name || id,
      details: `${activeUser.name} deleted payment credit period: "${period?.name || id}"`
    });
  };

  const handleAddTaxRate = async (data: Omit<TaxRate, "id" | "createdAt">) => {
    const taxId = `tax-${Date.now()}`;
    const newRate: TaxRate = { ...data, id: taxId, createdAt: new Date().toISOString() };
    const currentList = taxRates && taxRates.length > 0 ? taxRates : INITIAL_TAX_RATES;
    const updatedList = [...currentList, newRate];
    await saveTaxRatesList(updatedList);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Tax Rate",
      targetType: "Tax Rate",
      targetId: taxId,
      targetName: data.name,
      details: `${activeUser.name} added new tax rate: "${data.name}"`
    });
  };
  const handleEditTaxRate = async (id: string, name: string) => {
    const currentList = taxRates && taxRates.length > 0 ? taxRates : INITIAL_TAX_RATES;
    const updatedList = currentList.map(t => t.id === id ? { ...t, name } : t);
    await saveTaxRatesList(updatedList);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Tax Rate",
      targetType: "Tax Rate",
      targetId: id,
      targetName: name,
      details: `${activeUser.name} edited tax rate: "${name}"`
    });
  };
  const handleDeleteTaxRate = async (id: string) => {
    const currentList = taxRates && taxRates.length > 0 ? taxRates : INITIAL_TAX_RATES;
    const target = currentList.find(t => t.id === id);
    const updatedList = currentList.filter(t => t.id !== id);
    await saveTaxRatesList(updatedList);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Tax Rate",
      targetType: "Tax Rate",
      targetId: id,
      targetName: target?.name || id,
      details: `${activeUser.name} deleted tax rate: "${target?.name || id}"`
    });
  };

  const handleAddPaymentBank = async (newBankData: Omit<PaymentBank, "id" | "createdAt">) => {
    const bankId = `bank-${Date.now()}`;
    const newBank: PaymentBank = {
      ...newBankData,
      id: bankId,
      createdAt: new Date().toISOString(),
    };
    
    await savePaymentBank(newBank);
    
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Order",
      targetType: "Order",
      targetId: bankId,
      targetName: newBank.bankName,
      details: `${activeUser.name} added new bank: "${newBank.bankName}"`
    });
  };
  const handleDeletePaymentBank = async (id: string) => {
    await deletePaymentBankDoc(id);
  };
  const handleEditPaymentBank = async (id: string, updatedBankData: Omit<PaymentBank, "id" | "createdAt">) => {
    const updatedBank: PaymentBank = {
      ...updatedBankData,
      id,
      createdAt: paymentBanks.find(b => b.id === id)?.createdAt || new Date().toISOString()
    };
    await savePaymentBank(updatedBank);
  };

  // State handlers for clients
  const handleAddClient = async (newClientData: Omit<Client, "id" | "createdAt">) => {
    const clientId = `client-${Date.now()}`;
    const newClient: Client = {
      ...newClientData,
      id: clientId,
      createdAt: new Date().toISOString(),
      createdByUserId: activeUser.id
    };
    await saveClient(newClient);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Lead",
      targetType: "User",
      targetId: clientId,
      targetName: newClient.companyName,
      details: `${activeUser.name} registered new client profile for "${newClient.fullName}" at "${newClient.companyName}"`
    });
  };

  const handleDeleteClient = async (clientId: string) => {
    const clientToDelete = clients.find((c) => c.id === clientId);
    if (!clientToDelete) return;
    if (!canDeleteClient(activeUser.id, clientToDelete, users)) {
      alert("Delete forbidden. Requires Manager role, Admin clearance, or record ownership.");
      return;
    }
    await deleteClientDoc(clientId);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Lead",
      targetType: "User",
      targetId: clientId,
      targetName: clientToDelete.companyName,
      details: `${activeUser.name} deleted client profile of "${clientToDelete.fullName}" at "${clientToDelete.companyName}"`
    });
  };

  const handleEditClient = async (clientId: string, updatedData: Partial<Omit<Client, "id" | "createdAt" | "createdByUserId">>) => {
    const targetClient = clients.find((c) => c.id === clientId);
    if (!targetClient) return;

    const updatedClient: Client = {
      ...targetClient,
      ...updatedData
    };

    await saveClient(updatedClient);

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Lead",
      targetType: "User",
      targetId: clientId,
      targetName: updatedClient.companyName,
      details: `${activeUser.name} edited client profile for "${updatedClient.fullName}" at "${updatedClient.companyName}"`
    });
  };

  // State handlers for products
  const handleAddProduct = async (newProductData: Omit<Product, "id" | "createdAt">) => {
    const productId = `prod-${Date.now()}`;
    const newProduct: Product = {
      ...newProductData,
      id: productId,
      createdAt: new Date().toISOString(),
      createdByUserId: activeUser.id
    };
    await saveProduct(newProduct);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Product",
      targetType: "Product",
      targetId: productId,
      targetName: newProduct.name,
      details: `${activeUser.name} registered new product entry "${newProduct.name}" in catalog`
    });
  };

  const handleEditProduct = async (productId: string, updatedData: Partial<Omit<Product, "id" | "createdAt" | "createdByUserId">>) => {
    const targetProduct = products.find((p) => p.id === productId);
    if (!targetProduct) return;
    const updatedProduct: Product = {
      ...targetProduct,
      ...updatedData
    };
    await saveProduct(updatedProduct);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Product",
      targetType: "Product",
      targetId: productId,
      targetName: updatedProduct.name,
      details: `${activeUser.name} modified properties of product "${updatedProduct.name}"`
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    const productToDelete = products.find((p) => p.id === productId);
    if (!productToDelete) return;
    if (!canDeleteProduct(activeUser.id, productToDelete, users)) {
      alert("Delete forbidden. Requires Manager role, Admin clearance, or record ownership.");
      return;
    }
    await deleteProductDoc(productId);
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Product",
      targetType: "Product",
      targetId: productId,
      targetName: productToDelete.name,
      details: `${activeUser.name} deleted product entry of "${productToDelete.name}"`
    });
  };

  // State handlers for tasks
  const handleAddTask = async (newTaskData: Omit<SalesTask, "id">) => {
    const taskId = `task-${Date.now()}`;
    const newTask: SalesTask = {
      ...newTaskData,
      id: taskId,
    };
    
    await saveTask(newTask);

    const assigneeName = users.find((u) => u.id === newTask.assignedToUserId)?.name || "Unassigned";
    
    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Create Task",
      targetType: "Task",
      targetId: taskId,
      targetName: newTask.title,
      details: `${activeUser.name} assigned task "${newTask.title}" to "${assigneeName}" (Priority: ${newTask.priority})`
    });
  };

  const handleToggleTaskComplete = async (taskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    const updatedStatus: SalesTask["status"] = targetTask.status === "Completed" ? "In Progress" : "Completed";
    const updatedTask = { ...targetTask, status: updatedStatus };

    await saveTask(updatedTask);

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Edit Task",
      targetType: "Task",
      targetId: taskId,
      targetName: targetTask.title,
      details: `${activeUser.name} toggled completion status of task "${targetTask.title}" to "${updatedStatus}"`
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;
    if (!canDeleteTask(activeUser.id, taskToDelete, users)) {
      alert("Delete forbidden. Requires Manager role, Admin clearance, or record ownership.");
      return;
    }

    await deleteTaskDoc(taskId);

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: "Delete Task",
      targetType: "Task",
      targetId: taskId,
      targetName: taskToDelete.title,
      details: `${activeUser.name} deleted task "${taskToDelete.title}"`
    });
  };

  // Clear log state
  const handleClearLogs = async () => {
    await clearAllLogsInFirestore(logs);
  };

  // Admin hierarchy editor
  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const targetUser = users.find((u) => u.id.toLowerCase() === userId.toLowerCase());
      await updateUserDetails(userId, updates, targetUser);
      
      const targetName = targetUser?.name || userId;

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Edit User",
        targetType: "User",
        targetId: userId,
        targetName,
        details: `ADMIN ACTION: ${activeUser.name} updated structural properties of individual ${targetName} (${userId}). Updates: ${Object.keys(updates).map(k => `${k} to "${(updates as any)[k]}"`).join(", ")}`
      });
    } catch (err) {
      console.error("Hierarchy change failed:", err);
    }
  };

  // Admin & Senior Manager user creation & pre-auth mapping
  const handleAddUser = async (newUser: User) => {
    try {
      await updateUserDetails(newUser.id, newUser);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Create User",
        targetType: "User",
        targetId: newUser.id,
        targetName: newUser.name,
        details: `${activeUser.role} ${activeUser.name} created user details for ${newUser.name} (${newUser.email}) mapped to role ${newUser.role} & team ${newUser.teamName || 'N/A'}`
      });
    } catch (err) {
      console.error("Add user details failed:", err);
      throw err;
    }
  };

  // Admin tab visibility updater
  const handleUpdateTabSettings = async (
    teamName: string,
    visibleTabs: string[],
    visibleSubTabs: { [key: string]: string[] },
    visibleSubSubTabs: { [key: string]: { [key: string]: string[] } },
    teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } },
    levelWiseFilters?: { [tabOrSubTabId: string]: boolean }
  ) => {
    try {
      await saveTeamTabSettings(teamName, visibleTabs, visibleSubTabs, visibleSubSubTabs, teamPermissions, levelWiseFilters);

      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Edit User",
        targetType: "User",
        targetId: teamName,
        targetName: teamName,
        details: `ADMIN ACTION: ${activeUser.name} updated Tab Visibilities & team-wise view/edit/add permissions for Team "${teamName}".`
      });
    } catch (err) {
      console.error("Updating tab visibilities failed:", err);
    }
  };

  // Splendid full screen loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
        <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-emerald-400">Loading Access clearance...</span>
      </div>
    );
  }

  // Intercept authentication & onboarding flow
  if (isPendingOnboarding) {
    return (
      <PendingOnboardingScreen
        email={unonboardedEmail}
        onRefresh={handleRefreshOnboardingStatus}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!isAuthenticated || !activeUserId) {
    return <AuthScreen onAuthSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="bg-[#f8fafc] dark:bg-slate-950 min-h-screen text-slate-800 dark:text-slate-100 antialiased font-sans flex flex-col">
      {/* Dynamic Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-[95%] mx-auto px-3 sm:px-4 lg:px-5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AolLogo size="md" className="h-7 sm:h-8" />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
                Sales Management Portal
              </h1>
            </div>
          </div>

          {/* Connected Authenticated Profile & Dropdown Controls */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              id="user-profile-menu-button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className={`flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-xl border transition-all cursor-pointer select-none text-left ${
                isUserMenuOpen
                  ? "bg-slate-100 dark:bg-slate-800 border-emerald-500/40 dark:border-emerald-500/40 ring-2 ring-emerald-500/20 shadow-xs"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-250 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600"
              }`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="true"
              title="Click to open User Menu (Theme, Font Size, Logout)"
            >
              <img
                src={activeUser.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=60"}
                alt={activeUser.name}
                className="w-6 h-6 rounded-md object-cover border border-slate-200 dark:border-slate-600 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-900 dark:text-slate-100 leading-none block truncate max-w-[110px] sm:max-w-[150px]">
                  {activeUser.name}
                </span>
                <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 truncate">
                  {activeUser.role} • {activeUser.accessLevel}
                </span>
              </div>
              <ChevronDown
                size={13}
                className={`text-slate-400 dark:text-slate-400 transition-transform duration-200 shrink-0 ml-0.5 ${
                  isUserMenuOpen ? "rotate-180 text-emerald-600 dark:text-emerald-400" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div
                id="user-profile-dropdown"
                className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl shadow-slate-900/15 p-3.5 z-50 space-y-3 animate-scaleUp text-slate-800 dark:text-slate-100"
                style={{ transformOrigin: "top right" }}
              >
                {/* User Info Header */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <img
                    src={activeUser.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80"}
                    alt={activeUser.name}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeUser.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {activeUser.email || `${activeUser.name.toLowerCase().replace(/\s+/g, ".")}@aol.com`}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        {activeUser.role}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {activeUser.accessLevel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dark / Light Mode Option */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 min-w-0">
                      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-2xs border border-slate-200/70 dark:border-slate-600 shrink-0 flex items-center justify-center w-7 h-7">
                        {theme === "dark" ? <Moon size={14} className="text-indigo-400 shrink-0" /> : <Sun size={14} className="text-amber-500 shrink-0" />}
                      </div>
                      <div className="leading-tight min-w-0">
                        <span className="block text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">Appearance</span>
                        <span className="block text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {theme === "dark" ? "Dark Mode" : "Light Mode"}
                        </span>
                      </div>
                    </div>

                    {/* Light / Dark Mode Toggle Pills */}
                    <div className="flex items-center p-0.5 bg-slate-200/70 dark:bg-slate-950 rounded-lg border border-slate-250 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          theme === "light"
                            ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        title="Switch to Light mode"
                      >
                        <Sun size={12} className={theme === "light" ? "text-amber-500 shrink-0" : "text-slate-400 shrink-0"} />
                        <span>Light</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          theme === "dark"
                            ? "bg-slate-800 text-indigo-300 shadow-2xs font-extrabold"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        title="Switch to Dark mode"
                      >
                        <Moon size={12} className={theme === "dark" ? "text-indigo-400 shrink-0" : "text-slate-400 shrink-0"} />
                        <span>Dark</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Font Size Option */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 min-w-0">
                      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-2xs border border-slate-200/70 dark:border-slate-600 shrink-0 flex items-center justify-center w-7 h-7">
                        <Type size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      </div>
                      <div className="leading-tight min-w-0">
                        <span className="block text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">Font Scale</span>
                        <span className="block text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {fontSize === "small" ? "Small (100%)" : fontSize === "medium" ? "Medium (110%)" : "Large (120%)"}
                        </span>
                      </div>
                    </div>

                    {/* S / M / L Selector */}
                    <div className="flex items-center p-0.5 bg-slate-200/70 dark:bg-slate-950 rounded-lg border border-slate-250 dark:border-slate-800 font-mono shrink-0">
                      <button
                        type="button"
                        onClick={() => setFontSize("small")}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          fontSize === "small"
                            ? "bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400 shadow-2xs font-black"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        title="Small Font (100%)"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontSize("medium")}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          fontSize === "medium"
                            ? "bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400 shadow-2xs font-black"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        title="Medium Font (110%)"
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontSize("large")}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          fontSize === "large"
                            ? "bg-white text-emerald-700 dark:bg-slate-800 dark:text-emerald-400 shadow-2xs font-black"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                        title="Large Font (120%)"
                      >
                        L
                      </button>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Logout Option */}
                <div>
                  <button
                    type="button"
                    id="user-dropdown-logout-btn"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-100 dark:hover:border-rose-900/60 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-rose-100/80 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 group-hover:bg-rose-200 dark:group-hover:bg-rose-900 transition-colors flex items-center justify-center w-7 h-7">
                        <LogOut size={14} className="shrink-0" />
                      </div>
                      <span className="font-bold">Sign Out / Log Out</span>
                    </div>
                    <span className="text-[10px] font-mono text-rose-400 dark:text-rose-500 font-normal">
                      Exit session
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[95%] w-full mx-auto px-3 sm:px-4 lg:px-5 py-3">
        
        {/* Tab Selection Row */}
        <div className="flex border-b border-slate-200/85 mb-3 overflow-x-auto gap-1 pb-0.5 scrollbar-thin">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider border-b-2 transition-all whitespace-nowrap -mb-0.5 cursor-pointer ${
                  active
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon size={12} className={active ? "text-emerald-600" : "text-slate-400"} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active Tab Screen Render */}
        <div className="animate-fade-in">
          {activeTab === "dashboard" && (
            <DashboardView
              activeUserId={activeUserId}
              users={users}
              workflows={workflows}
              products={products}
              tasks={tasks}
              orders={orders}
              clients={clients}
              teams={teams}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
            />
          )}

          {activeTab === "orders" && (
            <OrdersOffersView
              activeUserId={activeUserId}
              users={users}
              orders={orders}
              paymentBanks={paymentBanks}
              products={products}
              clients={clients}
              teams={teams}
              freightTerms={freightTerms}
              deliveryTerms={deliveryTerms}
              transporters={transporters}
              warehouses={warehouses}
              dispatchLocations={dispatchLocations}
              paymentTerms={paymentTerms}
              paymentCreditPeriods={paymentCreditPeriods}
              taxRates={taxRates}
              onAddOrder={handleAddOrder}
              onEditOrder={handleEditOrder}
              onDeleteOrder={handleDeleteOrder}
              onAddPaymentBank={handleAddPaymentBank}
              onAddClient={handleAddClient}
              emailTemplates={emailTemplates}
              emailSentLogs={emailSentLogs}
              teamPermissions={userTeamSetting?.teamPermissions}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
            />
          )}

          {activeTab === "indent" && (
            <IndentView
              activeUserId={activeUserId}
              users={users}
              orders={orders}
              clients={clients}
              onEditOrder={handleEditOrder}
              onAddOrder={handleAddOrder}
              paymentBanks={paymentBanks}
              freightTerms={freightTerms}
              deliveryTerms={deliveryTerms}
              transporters={transporters}
              warehouses={warehouses}
              dispatchLocations={dispatchLocations}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
              emailTemplates={emailTemplates}
              emailSentLogs={emailSentLogs}
              teamPermissions={userTeamSetting?.teamPermissions}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
            />
          )}

          {activeTab === "payment_list" && (
            <PaymentListView
              activeUserId={activeUserId}
              users={users}
              orders={orders}
              badDebtors={badDebtors}
              onEditOrder={handleEditOrder}
              paymentBanks={paymentBanks}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
              emailTemplates={emailTemplates}
              emailSentLogs={emailSentLogs}
              paymentDetailsList={paymentDetailsList}
              teamPermissions={userTeamSetting?.teamPermissions}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
              onNavigateToBilling={(orderId) => {
                setActiveTab("indent");
              }}
            />
          )}

          {activeTab === "clients" && (
            <ClientsView
              activeUserId={activeUserId}
              users={users}
              clients={clients}
              teams={teams}
              onAddClient={handleAddClient}
              onEditClient={handleEditClient}
              onDeleteClient={handleDeleteClient}
              orders={orders}
              workflows={workflows}
              products={products}
              tasks={tasks}
              onAddTask={handleAddTask}
              onToggleTaskComplete={handleToggleTaskComplete}
              onDeleteTask={handleDeleteTask}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
            />
          )}

          {activeTab === "list_management" && (
            <ListManagementView
              activeUserId={activeUserId}
              users={users}
              products={products}
              clients={clients}
              teams={teams}
              paymentBanks={paymentBanks}
              categories={productCategories}
              groups={productGroups}
              manufacturers={manufacturers}
              freightTerms={freightTerms}
              deliveryTerms={deliveryTerms}
              transporters={transporters}
              warehouses={warehouses}
              dispatchLocations={dispatchLocations}
              paymentTerms={paymentTerms}
              paymentCreditPeriods={paymentCreditPeriods}
              taxRates={taxRates}
              workflows={workflows}
              tasks={tasks}
              onAddProduct={handleAddProduct}
              onEditProduct={handleEditProduct}
              onDeleteProduct={handleDeleteProduct}
              onAddCategory={handleAddProductCategory}
              onEditCategory={handleEditProductCategory}
              onDeleteCategory={handleDeleteProductCategory}
              onAddGroup={handleAddProductGroup}
              onEditGroup={handleEditProductGroup}
              onDeleteGroup={handleDeleteProductGroup}
              onAddManufacturer={handleAddManufacturer}
              onEditManufacturer={handleEditManufacturer}
              onDeleteManufacturer={handleDeleteManufacturer}
              onAddFreightTerm={handleAddFreightTerm}
              onEditFreightTerm={handleEditFreightTerm}
              onDeleteFreightTerm={handleDeleteFreightTerm}
              onAddDeliveryTerm={handleAddDeliveryTerm}
              onEditDeliveryTerm={handleEditDeliveryTerm}
              onDeleteDeliveryTerm={handleDeleteDeliveryTerm}
              onAddTransporter={handleAddTransporter}
              onEditTransporter={handleEditTransporter}
              onDeleteTransporter={handleDeleteTransporter}
              onAddWarehouse={handleAddWarehouse}
              onEditWarehouse={handleEditWarehouse}
              onDeleteWarehouse={handleDeleteWarehouse}
              onAddDispatchLocation={handleAddDispatchLocation}
              onEditDispatchLocation={handleEditDispatchLocation}
              onDeleteDispatchLocation={handleDeleteDispatchLocation}
              onAddPaymentTerm={handleAddPaymentTerm}
              onEditPaymentTerm={handleEditPaymentTerm}
              onDeletePaymentTerm={handleDeletePaymentTerm}
              onAddPaymentCreditPeriod={handleAddPaymentCreditPeriod}
              onEditPaymentCreditPeriod={handleEditPaymentCreditPeriod}
              onDeletePaymentCreditPeriod={handleDeletePaymentCreditPeriod}
              onAddTaxRate={handleAddTaxRate}
              onEditTaxRate={handleEditTaxRate}
              onDeleteTaxRate={handleDeleteTaxRate}
              onAddClient={handleAddClient}
              onEditClient={handleEditClient}
              onDeleteClient={handleDeleteClient}
              onAddTask={handleAddTask}
              onToggleTaskComplete={handleToggleTaskComplete}
              onDeleteTask={handleDeleteTask}
              onAddPaymentBank={handleAddPaymentBank}
              onDeletePaymentBank={handleDeletePaymentBank}
              onEditPaymentBank={handleEditPaymentBank}
              onAddUser={handleAddUser}
              onUpdateUser={handleUpdateUser}
              onSaveTeam={saveTeam}
              onDeleteTeam={deleteTeamDoc}
              onSaveTransporter={saveTransporter}
              onSaveWarehouse={saveWarehouse}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
              visibleSubSubTabs={userTeamSetting?.visibleSubSubTabs}
              teamPermissions={userTeamSetting?.teamPermissions}
              levelWiseFilters={userTeamSetting?.levelWiseFilters}
            />
          )}


          {activeTab === "team" && (
            <TeamDirectoryView
              users={users}
              activeUserId={activeUserId}
              onUpdateUser={handleUpdateUser}
              onAddUser={handleAddUser}
              tabSettings={tabSettings}
              onUpdateTabSettings={handleUpdateTabSettings}
              teams={teams}
              onSaveTeam={saveTeam}
              onDeleteTeam={deleteTeamDoc}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
            />
          )}

          {activeTab === "logs" && (
            <AuditLogsView
              logs={logs}
              onClearLogs={handleClearLogs}
              isAdmin={activeUser.role === Role.Admin}
              isAuditLogEnabled={isAuditLogEnabledState}
              onToggleAuditLog={handleToggleAuditLog}
            />
          )}

          {activeTab === "email_templates" && (
            <EmailTemplateManagementView
              templates={emailTemplates}
              isAdmin={activeUser.role === Role.Admin}
              activeUser={activeUser}
              users={users}
            />
          )}

          {activeTab === "about_me" && (
            <AboutMeView
              activeUserId={activeUserId}
              users={users}
              faqs={faqs}
              bugRequests={bugRequests}
              onSaveFAQ={saveFAQ}
              onDeleteFAQ={deleteFAQDoc}
              onSaveBugRequest={saveBugRequest}
              onDeleteBugRequest={deleteBugRequestDoc}
              visibleSubTabs={userTeamSetting?.visibleSubTabs}
            />
          )}

        </div>
      </main>

      {/* Footer credits bar */}
      <footer className="bg-white border-t border-slate-200 py-3 mt-4 shrink-0">
        <div className="max-w-[95%] mx-auto px-3 sm:px-4 lg:px-5 flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-400 gap-1.5">
          <span>
            Sales Management Portal • Powered securely by Cloud Firebase Authentication & Firestore NoSQL Data Storage
          </span>
          <div className="flex items-center gap-1 text-slate-400 font-mono">
            <span className="h-1 w-1 bg-emerald-500 rounded-full"></span>
            <span>Real-time Permission Authorization Locked</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
