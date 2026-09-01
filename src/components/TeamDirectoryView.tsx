/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User, Role, AccessLevel, TeamTabSettings, Team } from "../types";
import { Shield, ChevronDown, CornerDownRight, Users, Mail, Target, Award, Save, Eye, Settings, Plus, Trash2, UserPlus, CheckCircle2 } from "lucide-react";
import { getReportingTreeUsers } from "../data";
import TeamDatabaseRegistryView from "./TeamDatabaseRegistryView";

interface TeamDirectoryViewProps {
  users: User[];
  activeUserId: string;
  onUpdateUser?: (userId: string, updates: Partial<User>) => Promise<void>;
  onAddUser?: (user: User) => Promise<void>;
  tabSettings?: TeamTabSettings[];
  onUpdateTabSettings?: (
    teamName: string,
    visibleTabs: string[],
    visibleSubTabs: { [key: string]: string[] },
    visibleSubSubTabs: { [key: string]: { [key: string]: string[] } },
    teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } },
    levelWiseFilters?: { [tabOrSubTabId: string]: boolean }
  ) => Promise<void>;
  teams?: Team[];
  onSaveTeam?: (team: Team) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  visibleSubTabs?: { [key: string]: string[] };
}

export default function TeamDirectoryView({ 
  users, 
  activeUserId, 
  onUpdateUser,
  onAddUser,
  tabSettings = [],
  onUpdateTabSettings,
  teams = [],
  onSaveTeam,
  onDeleteTeam,
  visibleSubTabs
}: TeamDirectoryViewProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(activeUserId);

  // New User creation form local states
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>(Role.User);
  const [newAccess, setNewAccess] = useState<AccessLevel>(AccessLevel.Editor);
  const [newTeam, setNewTeam] = useState("");
  const [newReportsTo, setNewReportsTo] = useState("");
  const [newQuota, setNewQuota] = useState<number>(30000);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addUserMsg, setAddUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Team creation local states
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState("");

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      setAddUserMsg({ type: "error", text: "Work Email Address and Full Name are required." });
      return;
    }
    if (!onAddUser) {
      setAddUserMsg({ type: "error", text: "Add user handler is not configured." });
      return;
    }

    setIsAddingUser(true);
    setAddUserMsg(null);
    const normalizedEmail = newEmail.trim().toLowerCase();

    try {
      const userObj: User = {
        id: normalizedEmail,
        email: normalizedEmail,
        name: newName.trim(),
        role: newRole,
        accessLevel: newAccess,
        teamName: newTeam.trim() || "General Executive",
        reportsTo: newReportsTo || undefined,
        targetQuota: Number(newQuota) || 30000,
        avatarUrl: newAvatarUrl.trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(newName.trim())}&background=0D9488&color=fff`
      };

      await onAddUser(userObj);
      setSelectedUserId(normalizedEmail);
      setAddUserMsg({
        type: "success",
        text: `User details for "${newName.trim()}" (${normalizedEmail}) registered successfully! When they sign in with this email, their profile will map automatically.`
      });

      // Reset form
      setNewEmail("");
      setNewName("");
      setNewRole(Role.User);
      setNewAccess(AccessLevel.Editor);
      setNewTeam("");
      setNewReportsTo("");
      setNewQuota(30000);
      setNewAvatarUrl("");
    } catch (err) {
      console.error("Error adding user details:", err);
      setAddUserMsg({ type: "error", text: "Failed to save user details to database." });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleAddTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    if (!onSaveTeam) return;
    setIsCreatingTeam(true);
    setTeamError("");
    try {
      const teamId = newTeamName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-") || "team-" + Date.now();
      if (teams.some((t) => t.id === teamId)) {
        setTeamError("A team with this name or ID already exists!");
        setIsCreatingTeam(false);
        return;
      }
      await onSaveTeam({
        id: teamId,
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
        createdAt: new Date().toISOString()
      });
      setNewTeamName("");
      setNewTeamDesc("");
    } catch (err) {
      setTeamError("Error saving team to Firestore.");
      console.error(err);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  // Auto select active user on load if valid
  useEffect(() => {
    if (activeUserId && users.some(u => u.id === activeUserId)) {
      setSelectedUserId(activeUserId);
    }
  }, [activeUserId, users]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0] || {
    id: "",
    name: "System Profile",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    email: "",
    teamName: "",
    targetQuota: 0,
    avatarUrl: ""
  };

  const reportingTeamIds = getReportingTreeUsers(selectedUser.id, users);
  const reportsCount = reportingTeamIds.length;

  const getManagerName = (reportsToId?: string) => {
    if (!reportsToId) return "Sterling Boards & Executive Committee";
    return users.find((u) => u.id === reportsToId)?.name || "N/A";
  };

  // Find direct reports only
  const directReports = users.filter((u) => u.reportsTo === selectedUser.id);

  // Active User permissions check
  const activeUserRecord = users.find((u) => u.id === activeUserId);
  const isAdmin = activeUserRecord?.role === Role.Admin;
  const isSeniorManager = activeUserRecord?.role === Role.SeniorManager;
  const canManageUsers = isAdmin;

  // Local state for Admin edit forms
  const [editName, setEditName] = useState(selectedUser.name);
  const [editRole, setEditRole] = useState(selectedUser.role);
  const [editAccess, setEditAccess] = useState(selectedUser.accessLevel);
  const [editTeam, setEditTeam] = useState(selectedUser.teamName || "");
  const [editQuota, setEditQuota] = useState(selectedUser.targetQuota || 0);
  const [editReportsTo, setEditReportsTo] = useState(selectedUser.reportsTo || "");
  const [isSaving, setIsSaving] = useState(false);

  // Sync edits state when selected user changes
  useEffect(() => {
    setEditName(selectedUser.name);
    setEditRole(selectedUser.role);
    setEditAccess(selectedUser.accessLevel);
    setEditTeam(selectedUser.teamName || "");
    setEditQuota(selectedUser.targetQuota || 0);
    setEditReportsTo(selectedUser.reportsTo || "");
  }, [
    selectedUser.id,
    selectedUser.name,
    selectedUser.role,
    selectedUser.accessLevel,
    selectedUser.teamName,
    selectedUser.targetQuota,
    selectedUser.reportsTo
  ]);

  const handleSaveUser = async () => {
    if (!isAdmin || !onUpdateUser || !selectedUser.id) return;
    setIsSaving(true);
    try {
      await onUpdateUser(selectedUser.id, {
        name: editName,
        role: editRole,
        accessLevel: editAccess,
        teamName: editTeam,
        targetQuota: Number(editQuota),
        reportsTo: editReportsTo || undefined
      });
    } catch (err) {
      console.error("Failed to save changes:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Styling helper for roles
  const getRoleBadgeClasses = (role: Role) => {
    switch (role) {
      case Role.Admin:
        return "bg-slate-900 text-purple-200 border-purple-500/30";
      case Role.SeniorManager:
        return "bg-emerald-950 text-emerald-300 border-emerald-500/30";
      case Role.Manager:
        return "bg-teal-950 text-teal-300 border-teal-500/30";
      case Role.TeamLead:
        return "bg-cyan-950 text-cyan-300 border-cyan-500/30";
      case Role.User:
        return "bg-blue-950 text-blue-300 border-blue-500/30";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // Tab Visibility helpers
  const uniqueTeams = Array.from(
    new Set(
      (teams.length > 0 ? teams.map((t) => t.name) : users.map((u) => u.teamName))
        .filter((t): t is string => Boolean(t && t.trim()))
    )
  );
    
  const TABS_CONFIG = [
    {
      id: "dashboard",
      label: "Executive Dashboard",
      subTabs: [
        { id: "reports", label: "Overview Reports" },
        { id: "sp", label: "SP (Sales Persons)" }
      ]
    },
    { id: "orders", label: "Orders & Offers" },
    {
      id: "indent",
      label: "Indent & Billing",
      subTabs: [
        { id: "logistics", label: "Logistic" },
        { id: "billing", label: "Billing" },
        { id: "invoice_attached", label: "Invoice Attached" }
      ]
    },
    {
      id: "payment_list",
      label: "Payment List",
      subTabs: [
        { id: "debtors", label: "Debtors" },
        { id: "payment_reminder", label: "Payment Reminder" },
        { id: "payment_reminder_consolidated", label: "Payment Reminder Consolidated" },
        { id: "fully_paid", label: "Fully Paid" }
      ]
    },
    {
      id: "clients",
      label: "Client Management"
    },
    { 
      id: "list_management", 
      label: "List Management",
      subTabs: [
        { 
          id: "products", 
          label: "Product Catalog",
          subSubTabs: [
            { id: "products_list", label: "Products" },
            { id: "products_dropdown", label: "Products Dropdown" }
          ]
        },
        { id: "users", label: "User Management" },
        { id: "teams", label: "Team Database Registry" },
        { id: "transporters", label: "Transporter Details" },
        { id: "warehouses", label: "Warehouse Details" },
        { id: "banks", label: "Payment Bank" },
        { id: "dropdowns", label: "Dropdowns" }
      ]
    },
    { 
      id: "team", 
      label: "Hierarchy & Team",
      subTabs: [
        { id: "hierarchy", label: "Hierarchy Tree" },
        { id: "registry", label: "Team Database Registry" },
        { id: "permissions", label: "Tab Visibility Console" }
      ]
    },
    { id: "logs", label: "Audit Log Trial" },
    { id: "email_templates", label: "Email Template Management" },
    {
      id: "about_me",
      label: "About Me",
      subTabs: [
        { id: "faq", label: "FAQs & Help Center" },
        { id: "bugs", label: "Bug & Feature Requests" }
      ]
    }
  ];

  const handleAllowAllForTeam = async (team: string) => {
    if (!onUpdateTabSettings) return;
    const newVisibleTabs = TABS_CONFIG.map(t => t.id);
    const newVisibleSubTabs: { [key: string]: string[] } = {};
    const newVisibleSubSubTabs: { [key: string]: { [key: string]: string[] } } = {};
    const newPermissions: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } } = {};

    TABS_CONFIG.forEach(tab => {
      newPermissions[tab.id] = { view: true, edit: true, add: true };
      if (tab.subTabs) {
        newVisibleSubTabs[tab.id] = tab.subTabs.map(st => st.id);
        tab.subTabs.forEach(subTab => {
          if (subTab.subSubTabs) {
            if (!newVisibleSubSubTabs[tab.id]) {
              newVisibleSubSubTabs[tab.id] = {};
            }
            newVisibleSubSubTabs[tab.id][subTab.id] = subTab.subSubTabs.map(sst => sst.id);
          }
        });
      }
    });

    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const levelWiseFilters = setting?.levelWiseFilters || {};

    await onUpdateTabSettings(team, newVisibleTabs, newVisibleSubTabs, newVisibleSubSubTabs, newPermissions, levelWiseFilters);
  };

  const handleBlockAllForTeam = async (team: string) => {
    if (!onUpdateTabSettings) return;
    const newPermissions: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } } = {};
    TABS_CONFIG.forEach(tab => {
      newPermissions[tab.id] = { view: false, edit: false, add: false };
    });
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const levelWiseFilters = setting?.levelWiseFilters || {};
    await onUpdateTabSettings(team, [], {}, {}, newPermissions, levelWiseFilters);
  };

  const getVisibleTabsForTeam = (team: string) => {
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    return setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
  };
  
  const getVisibleSubTabsForTeam = (team: string, tabId: string) => {
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    if (!setting) {
      const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
      return tabConfig?.subTabs?.map(st => st.id) || [];
    }
    return setting.visibleSubTabs?.[tabId] !== undefined
      ? setting.visibleSubTabs[tabId]
      : (TABS_CONFIG.find(t => t.id === tabId)?.subTabs?.map(st => st.id) || []);
  };
  
  const getVisibleSubSubTabsForTeam = (team: string, tabId: string, subTabId: string) => {
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
    const subTabConfig = tabConfig?.subTabs?.find(st => st.id === subTabId);
    const defaultSubSubTabs = subTabConfig?.subSubTabs?.map(sst => sst.id) || [];
    if (!setting) {
      return defaultSubSubTabs;
    }
    return setting.visibleSubSubTabs?.[tabId]?.[subTabId] !== undefined
      ? setting.visibleSubSubTabs[tabId][subTabId]
      : defaultSubSubTabs;
  };

  const getPermissionForTeam = (team: string, tabId: string, type: "view" | "edit" | "add"): boolean => {
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    if (!setting) return true;
    if (!setting.teamPermissions || !setting.teamPermissions[tabId]) {
      const visibleTabs = setting.visibleTabs || TABS_CONFIG.map(t => t.id);
      if (type === "view") {
        return visibleTabs.includes(tabId);
      }
      return true;
    }
    const val = setting.teamPermissions[tabId]?.[type];
    return val !== false; // defaults to true
  };

  const getLevelFilterForTeam = (team: string, tabOrSubTabId: string): boolean => {
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    if (!setting || !setting.levelWiseFilters) return false;
    return !!setting.levelWiseFilters[tabOrSubTabId];
  };

  const handleToggleLevelFilterForTeam = async (team: string, tabOrSubTabId: string) => {
    if (!onUpdateTabSettings) return;
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const currentVisibleTabs = setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
    const currentVisibleSubTabs = setting?.visibleSubTabs || {};
    const currentVisibleSubSubTabs = setting?.visibleSubSubTabs || {};
    const currentPermissions = setting?.teamPermissions || {};
    const currentLevelWiseFilters = setting?.levelWiseFilters || {};

    const updatedLevelWiseFilters = {
      ...currentLevelWiseFilters,
      [tabOrSubTabId]: !currentLevelWiseFilters[tabOrSubTabId]
    };

    await onUpdateTabSettings(
      team,
      currentVisibleTabs,
      currentVisibleSubTabs,
      currentVisibleSubSubTabs,
      currentPermissions,
      updatedLevelWiseFilters
    );
  };

  const handleTogglePermissionForTeam = async (team: string, tabId: string, type: "view" | "edit" | "add") => {
    if (!onUpdateTabSettings) return;
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const currentVisibleTabs = setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
    const currentVisibleSubTabs = setting?.visibleSubTabs || {};
    const currentVisibleSubSubTabs = setting?.visibleSubSubTabs || {};
    const currentPermissions = setting?.teamPermissions || {};
    const currentLevelWiseFilters = setting?.levelWiseFilters || {};

    const tabPerm = currentPermissions[tabId] || { view: true, edit: true, add: true };
    const newPermValue = !tabPerm[type];

    const updatedPermissions = {
      ...currentPermissions,
      [tabId]: {
        ...tabPerm,
        [type]: newPermValue
      }
    };

    let newVisibleTabs = [...currentVisibleTabs];
    if (updatedPermissions[tabId].view) {
      if (!newVisibleTabs.includes(tabId)) {
        newVisibleTabs = [...newVisibleTabs, tabId];
      }
    } else {
      newVisibleTabs = newVisibleTabs.filter(t => t !== tabId);
    }

    await onUpdateTabSettings(team, newVisibleTabs, currentVisibleSubTabs, currentVisibleSubSubTabs, updatedPermissions, currentLevelWiseFilters);
  };

  const handleToggleTabForTeam = async (team: string, tabId: string) => {
    if (!onUpdateTabSettings) return;
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const currentVisibleTabs = setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
    const currentVisibleSubTabs = setting?.visibleSubTabs || {};
    const currentVisibleSubSubTabs = setting?.visibleSubSubTabs || {};
    const currentPermissions = setting?.teamPermissions || {};
    const currentLevelWiseFilters = setting?.levelWiseFilters || {};

    let newVisibleTabs: string[];
    let newVisibleSubTabs = { ...currentVisibleSubTabs };
    let newVisibleSubSubTabs = { ...currentVisibleSubSubTabs };
    let updatedPermissions = { ...currentPermissions };

    if (currentVisibleTabs.includes(tabId)) {
      newVisibleTabs = currentVisibleTabs.filter((t) => t !== tabId);
      delete newVisibleSubTabs[tabId];
      delete newVisibleSubSubTabs[tabId];
      updatedPermissions[tabId] = { view: false, edit: false, add: false };
    } else {
      newVisibleTabs = [...currentVisibleTabs, tabId];
      updatedPermissions[tabId] = { view: true, edit: true, add: true };
      const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
      if (tabConfig?.subTabs) {
        newVisibleSubTabs[tabId] = tabConfig.subTabs.map(st => st.id);
        tabConfig.subTabs.forEach(subTab => {
          if (subTab.subSubTabs) {
            if (!newVisibleSubSubTabs[tabId]) {
              newVisibleSubSubTabs[tabId] = {};
            }
            newVisibleSubSubTabs[tabId][subTab.id] = subTab.subSubTabs.map(sst => sst.id);
          }
        });
      }
    }
    
    await onUpdateTabSettings(team, newVisibleTabs, newVisibleSubTabs, newVisibleSubSubTabs, updatedPermissions, currentLevelWiseFilters);
  };
  
  const handleToggleSubTabForTeam = async (team: string, tabId: string, subTabId: string) => {
    if (!onUpdateTabSettings) return;
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const currentVisibleTabs = setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
    const currentVisibleSubTabs = setting?.visibleSubTabs || {};
    const currentVisibleSubSubTabs = setting?.visibleSubSubTabs || {};
    const currentPermissions = setting?.teamPermissions || {};
    const currentLevelWiseFilters = setting?.levelWiseFilters || {};

    let newVisibleSubTabs = { ...currentVisibleSubTabs };
    let newVisibleSubSubTabs = { ...currentVisibleSubSubTabs };
    
    let tabSubTabs = newVisibleSubTabs[tabId];
    if (!tabSubTabs) {
      const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
      tabSubTabs = tabConfig?.subTabs?.map(st => st.id) || [];
    }
    
    let tabSubSubTabsMap = newVisibleSubSubTabs[tabId] || {};

    if (tabSubTabs.includes(subTabId)) {
      tabSubTabs = tabSubTabs.filter(s => s !== subTabId);
      delete tabSubSubTabsMap[subTabId];
    } else {
      tabSubTabs = [...tabSubTabs, subTabId];
      const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
      const subTabConfig = tabConfig?.subTabs?.find(st => st.id === subTabId);
      if (subTabConfig?.subSubTabs) {
        tabSubSubTabsMap[subTabId] = subTabConfig.subSubTabs.map(sst => sst.id);
      }
    }

    newVisibleSubTabs[tabId] = tabSubTabs;
    newVisibleSubSubTabs[tabId] = tabSubSubTabsMap;
    await onUpdateTabSettings(team, currentVisibleTabs, newVisibleSubTabs, newVisibleSubSubTabs, currentPermissions, currentLevelWiseFilters);
  };
  
  const handleToggleSubSubTabForTeam = async (team: string, tabId: string, subTabId: string, subSubTabId: string) => {
    if (!onUpdateTabSettings) return;
    const setting = tabSettings.find((s) => s.teamName.toLowerCase() === team.toLowerCase());
    const currentVisibleTabs = setting?.visibleTabs || TABS_CONFIG.map(t => t.id);
    const currentVisibleSubTabs = setting?.visibleSubTabs || {};
    const currentVisibleSubSubTabs = setting?.visibleSubSubTabs || {};
    const currentPermissions = setting?.teamPermissions || {};
    const currentLevelWiseFilters = setting?.levelWiseFilters || {};

    let newVisibleSubSubTabs = { ...currentVisibleSubSubTabs };
    let tabSubSubTabsMap = { ...(newVisibleSubSubTabs[tabId] || {}) };
    
    let subSubTabs = tabSubSubTabsMap[subTabId];
    if (!subSubTabs) {
      const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
      const subTabConfig = tabConfig?.subTabs?.find(st => st.id === subTabId);
      subSubTabs = subTabConfig?.subSubTabs?.map(sst => sst.id) || [];
    }

    if (subSubTabs.includes(subSubTabId)) {
      subSubTabs = subSubTabs.filter(s => s !== subSubTabId);
    } else {
      subSubTabs = [...subSubTabs, subSubTabId];
    }

    tabSubSubTabsMap[subTabId] = subSubTabs;
    newVisibleSubSubTabs[tabId] = tabSubSubTabsMap;
    await onUpdateTabSettings(team, currentVisibleTabs, currentVisibleSubTabs, newVisibleSubSubTabs, currentPermissions, currentLevelWiseFilters);
  };

  return (
    <div className="space-y-3">
      {/* Visual Hierarchy map introduction */}
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Award className="text-emerald-600" size={14} /> Organizational hierarchy mapping
          </h3>
          <p className="text-[10px] text-slate-500 leading-normal max-w-3xl mt-0.5">
            Everyone comes under the <strong>Admin</strong>. Senior Managers manage different sections (teams). 
            Managers control Team Leads who supervise Sales Users. Access controls are granted based on reporting trees.
          </p>
        </div>

        {canManageUsers && (
          <button
            type="button"
            onClick={() => setShowAddUserForm(!showAddUserForm)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer shrink-0"
          >
            <UserPlus size={14} />
            {showAddUserForm ? "Close Add User Form" : "Add New User Details"}
          </button>
        )}
      </div>

      {/* Add New User Form Panel (Visible for Admin and Senior Manager) */}
      {canManageUsers && showAddUserForm && (
        <div id="add-user-details-panel" className="bg-emerald-50/40 rounded-lg border border-emerald-300 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60 mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-100 text-emerald-800 p-1.5 rounded-md">
                <UserPlus size={16} />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">Add New User & Map Auth Registration</h4>
                <p className="text-[9.5px] text-emerald-700 font-mono">
                  Pre-configure work email, assigned role, reporting manager & team. When user registers with Auth using this email, their profile automatically maps.
                </p>
              </div>
            </div>
            <span className="text-[8.5px] font-bold uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
              {isAdmin ? "Admin Clearance" : "Senior Manager Clearance"}
            </span>
          </div>

          {addUserMsg && (
            <div
              className={`p-2.5 rounded text-[10px] font-medium flex items-center gap-2 mb-3 border ${
                addUserMsg.type === "success"
                  ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                  : "bg-rose-50 border-rose-300 text-rose-900"
              }`}
            >
              {addUserMsg.type === "success" ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <Shield size={14} className="text-rose-600 shrink-0" />}
              <span>{addUserMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleAddUserSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Work Email */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Work Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. colleague@company.com"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sarah Peterson"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Assigned Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                >
                  <option key="role-user" value={Role.User}>User (Sales Executive)</option>
                  <option key="role-tl" value={Role.TeamLead}>Team Lead</option>
                  <option key="role-mgr" value={Role.Manager}>Manager</option>
                  <option key="role-srmgr" value={Role.SeniorManager}>Senior Manager</option>
                  {isAdmin && <option key="role-admin" value={Role.Admin}>Admin</option>}
                </select>
              </div>

              {/* Access Level */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Access Level (ACL)
                </label>
                <select
                  value={newAccess}
                  onChange={(e) => setNewAccess(e.target.value as AccessLevel)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                >
                  <option key="acl-editor" value={AccessLevel.Editor}>Editor (Edit own records)</option>
                  <option key="acl-contrib" value={AccessLevel.Contributor}>Contributor (Edit subtree records)</option>
                  <option key="acl-mgr" value={AccessLevel.Manager}>Manager (Full department clearance)</option>
                </select>
              </div>

              {/* Team Group */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Team / Group Section
                </label>
                <select
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option key="team-none" value="">Select Team / Group...</option>
                  {uniqueTeams.map((t, idx) => (
                    <option key={`add-team-opt-${t}-${idx}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supervisor / Reports To */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Reporting Supervisor / Manager
                </label>
                <select
                  value={newReportsTo}
                  onChange={(e) => setNewReportsTo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option key="rep-none" value="">None (Top Matrix / Executive)</option>
                  {users.map((u, idx) => (
                    <option key={`add-rep-opt-${u.id || idx}-${idx}`} value={u.id}>
                      {u.name} ({u.role} - {u.teamName || 'No Team'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quota */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Individual Target Quota ($)
                </label>
                <input
                  type="number"
                  value={newQuota}
                  onChange={(e) => setNewQuota(Number(e.target.value))}
                  placeholder="30000"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Avatar URL */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-700 uppercase block">
                  Profile Avatar URL (Optional)
                </label>
                <input
                  type="url"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-emerald-200/50">
              <button
                type="button"
                onClick={() => setShowAddUserForm(false)}
                className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingUser}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-1.5 rounded-md flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <UserPlus size={14} />
                {isAddingUser ? "Saving User Details..." : "Register & Map User Details"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Hierarchical Structure Tree list */}
        <div className="lg:col-span-7 bg-white p-3 rounded-lg border border-slate-200">
          <h4 className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider mb-2.5 border-b border-slate-100 pb-1.5">
            Active Organizational Reporting Structure
          </h4>

          {/* Graphical Hierarchy Tree */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {(() => {
              const rootUsers = users.filter((u) => !u.reportsTo || !users.some((mgr) => mgr.id === u.reportsTo));
              const displayRootUsers = rootUsers.length > 0 ? rootUsers : users.filter((u) => u.role === Role.Admin);
              const finalRootUsers = displayRootUsers.length > 0 ? displayRootUsers : users;

              const renderUserNode = (user: User, depth: number = 0) => {
                const reports = users.filter((u) => u.reportsTo === user.id);
                const isSelected = selectedUserId === user.id;

                let roleBadgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                if (user.role === Role.Admin) roleBadgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                else if (user.role === Role.SeniorManager) roleBadgeColor = "bg-emerald-50 text-emerald-800 border-emerald-200";
                else if (user.role === Role.Manager) roleBadgeColor = "bg-teal-50 text-teal-800 border-teal-200";
                else if (user.role === Role.TeamLead) roleBadgeColor = "bg-cyan-50 text-cyan-800 border-cyan-200";

                return (
                  <div key={user.id} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-md border transition-all text-left cursor-pointer ${
                        isSelected
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-slate-50/60 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {depth > 0 && <CornerDownRight size={12} className="text-slate-400 shrink-0" />}
                        <img
                          src={user.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120"}
                          alt={user.name}
                          className="w-7 h-7 rounded-full border border-slate-300 object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <span className={`font-extrabold truncate block text-xs leading-none ${isSelected ? "text-white" : "text-slate-900"}`}>
                            {user.name}
                          </span>
                          <span className={`text-[9px] truncate block mt-0.5 font-mono uppercase ${isSelected ? "text-emerald-300" : "text-slate-500"}`}>
                            {user.role} {user.teamName ? `• ${user.teamName}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded border font-bold font-mono shrink-0 ${isSelected ? "bg-slate-800 text-emerald-400 border-slate-700" : roleBadgeColor}`}>
                        {user.role}
                      </span>
                    </button>

                    {reports.length > 0 && (
                      <div className="pl-5 border-l-2 border-slate-200/80 space-y-1.5 mt-1.5">
                        {reports.map((report) => renderUserNode(report, depth + 1))}
                      </div>
                    )}
                  </div>
                );
              };

              return finalRootUsers.map((u) => renderUserNode(u, 0));
            })()}
          </div>
        </div>

        {/* Selected Member Detail/Edit Panel */}
        <div className="lg:col-span-5 bg-slate-950 text-white p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-center pb-3 border-b border-slate-850 mb-3">
              <div className="relative inline-block mx-auto mb-1.5">
                <img
                  src={selectedUser.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120"}
                  alt={selectedUser.name}
                  className="w-14 h-14 rounded border-2 border-emerald-400 object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-0 right-0 bg-emerald-500 text-slate-950 p-1 rounded-full border border-slate-900">
                  <Shield size={10} />
                </span>
              </div>
              
              {canManageUsers ? (
                <div className="px-2 space-y-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-center bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-white font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    placeholder="User Name"
                  />
                  <span className="text-[8px] text-emerald-400 font-mono font-bold block font-mono uppercase">
                    {isAdmin ? "ADMIN EDITING ACTIVE" : "SENIOR MANAGER EDITING ACTIVE"}
                  </span>
                </div>
              ) : (
                <>
                  <h4 id="detail-member-name" className="text-xs font-bold tracking-tight leading-tight">{selectedUser.name}</h4>
                  <span className={`inline-block border text-[8px] px-1.5 py-0.2 rounded-full mt-1.5 font-bold font-mono tracking-wider uppercase ${getRoleBadgeClasses(selectedUser.role)}`}>
                    {selectedUser.role}
                  </span>
                </>
              )}
            </div>

            {/* Profile specifications */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Mail className="text-slate-500 shrink-0" size={13} />
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] uppercase font-mono text-slate-400 block leading-none">Work Email</span>
                  <span className="text-[10px] font-bold text-slate-300 truncate block font-mono leading-none mt-1">{selectedUser.email}</span>
                </div>
              </div>

              {/* Editable or Static Role Selector */}
              {canManageUsers && (
                <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-1.5 rounded border border-slate-900">
                  <div className="space-y-0.5">
                    <span className="text-[8px] uppercase font-mono text-emerald-400 block leading-none">Assigned Role</span>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as Role)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                    >
                      {Object.values(Role).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] uppercase font-mono text-emerald-400 block leading-none">Acl Matrix</span>
                    <select
                      value={editAccess}
                      onChange={(e) => setEditAccess(e.target.value as AccessLevel)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                    >
                      {Object.values(AccessLevel).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Users className="text-slate-500 shrink-0" size={13} />
                <div className="flex-1">
                  <span className="text-[8px] uppercase font-mono text-slate-400 block leading-none">Supervisor reporting anchor</span>
                  {canManageUsers ? (
                    <select
                      value={editReportsTo}
                      onChange={(e) => setEditReportsTo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                    >
                      <option value="">None (Top Matrix)</option>
                      {users
                        .filter((u) => u.id !== selectedUser.id) // Cannot report to self
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-300 block leading-none mt-1">{getManagerName(selectedUser.reportsTo)}</span>
                  )}
                </div>
              </div>

              {/* Team Group Input */}
              <div className="flex items-center gap-2">
                <Award className="text-slate-500 shrink-0" size={13} />
                <div className="flex-1">
                  <span className="text-[8px] uppercase font-mono text-slate-400 block leading-none">Team section / Group</span>
                  {canManageUsers ? (
                    <select
                      value={editTeam}
                      onChange={(e) => setEditTeam(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                    >
                      <option value="">Select Team / Group</option>
                      {Array.from(new Set([
                        ...teams.map((t) => t.name),
                        ...(editTeam ? [editTeam] : [])
                      ])).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-300 block leading-none mt-1">{selectedUser.teamName || "General Executive"}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Target className="text-slate-500 shrink-0" size={13} />
                <div className="flex-1">
                  <span className="text-[8px] uppercase font-mono text-slate-400 block leading-none">Individual Quota Target</span>
                  {canManageUsers ? (
                    <input
                      type="number"
                      value={editQuota}
                      onChange={(e) => setEditQuota(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-bold text-emerald-400 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-400 block font-mono leading-none mt-1">
                      ${(selectedUser.targetQuota || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Save Action Button */}
              {canManageUsers && (
                <button
                  type="button"
                  onClick={handleSaveUser}
                  disabled={isSaving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase font-mono py-1.5 rounded flex items-center justify-center gap-1 leading-none shadow-sm cursor-pointer mt-2"
                >
                  <Save size={11} />
                  {isSaving ? "Saving changes..." : "Persist details & Access Matrix"}
                </button>
              )}

              <div className="bg-slate-900 p-2 rounded-md border border-slate-800 mt-2">
                <span className="text-[8px] uppercase font-mono text-emerald-400 font-bold block mb-0.5">Authorization Matrix Coverage</span>
                <span className="text-[9.5px] font-bold block uppercase text-slate-100">{selectedUser.accessLevel || AccessLevel.Editor} Access level</span>
                <p className="text-[9px] text-slate-400 leading-normal font-mono mt-0.5">
                  {(selectedUser.accessLevel === AccessLevel.Editor || !selectedUser.accessLevel) && "Authorized to ADD and VIEW Leads. Can EDIT Leads ONLY if they created them. No deletion rights."}
                  {selectedUser.accessLevel === AccessLevel.Contributor && "Authorized to ADD and VIEW Leads. Can EDIT Leads created by themselves or anyone in their hierarchical reports subtree. No deletion rights."}
                  {selectedUser.accessLevel === AccessLevel.Manager && "Super Admin clearance. Authorized to VIEW, EDIT, and DELETE Leads and Tasks across all departments."}
                </p>
              </div>

              {selectedUser.teamName && (
                <div className="bg-slate-900 p-2 rounded-md border border-slate-800 mt-2 space-y-1.5" id={`team-tab-clearance-box-${selectedUser.id}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] uppercase font-mono text-cyan-400 font-bold block">
                      Team Tab Clearance ({selectedUser.teamName})
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleAllowAllForTeam(selectedUser.teamName || "")}
                        className="text-[7.5px] bg-cyan-950 hover:bg-cyan-900 text-cyan-400 border border-cyan-800 rounded px-1.5 py-0.5 font-mono font-bold uppercase cursor-pointer"
                        title="Enable all workspace tabs and sub-tabs for this team instantly"
                        id={`sidebar-allow-all-${selectedUser.id}`}
                      >
                        Allow All
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {TABS_CONFIG.map((tab) => {
                      const isTabEnabled = getVisibleTabsForTeam(selectedUser.teamName || "").includes(tab.id);
                      return (
                        <span
                          key={tab.id}
                          className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                            isTabEnabled
                              ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
                              : "bg-rose-950/20 border-rose-900/30 text-rose-400"
                          }`}
                        >
                          {tab.id === "indent" ? "Indent" : tab.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 mt-3 border-t border-slate-850 text-[10px] text-slate-500 bg-slate-900/40 p-2 rounded flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Subtree supervised: <strong className="text-slate-200">{reportsCount} nodes</strong>.</span>
          </div>
        </div>
      </div>

      {/* Admin Team Tab Visibility Management Panel */}
      {isAdmin && (
        <div id="team-tab-permissions-panel" className="bg-white rounded-lg border border-slate-200 p-4 mt-3 shadow-2xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-md">
              <Settings size={15} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-900">Team Workspace Tab Visibility Console</h3>
              <p className="text-[9px] text-emerald-600 font-mono leading-none mt-0.5 uppercase tracking-wider font-bold">
                Clearance Level: Platform Administrator
              </p>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mb-4 max-w-3xl leading-normal">
            Configure which specific navigation tabs are visible to each team. 
            When visibility is toggled off, members of that team are restricted from accessing that workspace and automatically redirected to their first available tab. 
            <strong className="text-emerald-700 ml-1">Note: Users with the Admin role always retain access to all tabs to prevent lockouts.</strong>
          </p>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-slate-50/20">
            {uniqueTeams.map((team) => {
              const visibleTabs = getVisibleTabsForTeam(team);
              return (
                <div key={team} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="md:col-span-3 space-y-2">
                    <div>
                      <span className="font-extrabold text-[11px] text-slate-900 block leading-tight">{team}</span>
                      <span className="text-[9px] font-mono font-medium text-slate-400 block mt-0.5">
                        {visibleTabs.length} of {TABS_CONFIG.length} tabs enabled
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAllowAllForTeam(team)}
                        className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded text-[8px] font-mono font-bold uppercase transition-all cursor-pointer"
                        title={`Enable all tabs and sub-tabs for ${team} instantly`}
                        id={`allow-all-btn-${team}`}
                      >
                        Allow All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBlockAllForTeam(team)}
                        className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 rounded text-[8px] font-mono font-bold uppercase transition-all cursor-pointer"
                        title={`Disable all tabs and sub-tabs for ${team} instantly`}
                        id={`block-all-btn-${team}`}
                      >
                        Block All
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-9 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {TABS_CONFIG.map((tab) => {
                        const isTabEnabled = visibleTabs.includes(tab.id);
                        return (
                          <div key={tab.id} className="flex flex-col gap-1 border border-slate-150 p-1.5 rounded-md bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleTabForTeam(team, tab.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border cursor-pointer ${
                                isTabEnabled
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-3xs"
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-500"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isTabEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-350"}`} />
                              {tab.label}
                            </button>

                            {isTabEnabled && (
                              <div className="flex flex-wrap items-center gap-1 mt-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 max-w-max shadow-4xs">
                                <span className="text-[7px] uppercase font-bold text-slate-400 mr-1 font-mono">Ops:</span>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePermissionForTeam(team, tab.id, "view")}
                                  className={`px-1 py-0.5 rounded text-[8px] font-bold font-mono transition-colors cursor-pointer ${
                                    getPermissionForTeam(team, tab.id, "view")
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : "bg-slate-100 text-slate-400 border border-slate-200 line-through"
                                  }`}
                                  title="Toggle Team View Permission"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePermissionForTeam(team, tab.id, "add")}
                                  className={`px-1 py-0.5 rounded text-[8px] font-bold font-mono transition-colors cursor-pointer ${
                                    getPermissionForTeam(team, tab.id, "add")
                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                      : "bg-slate-100 text-slate-400 border border-slate-200 line-through"
                                  }`}
                                  title="Toggle Team Add/Create Permission"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePermissionForTeam(team, tab.id, "edit")}
                                  className={`px-1 py-0.5 rounded text-[8px] font-bold font-mono transition-colors cursor-pointer ${
                                    getPermissionForTeam(team, tab.id, "edit")
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : "bg-slate-100 text-slate-400 border border-slate-200 line-through"
                                  }`}
                                  title="Toggle Team Edit/Update Permission"
                                >
                                  Edit
                                </button>
                                {["leads", "orders", "indent", "payment_list", "dashboard"].includes(tab.id) && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLevelFilterForTeam(team, tab.id)}
                                    className={`px-1 py-0.5 rounded text-[8px] font-bold font-mono transition-colors cursor-pointer border ${
                                      getLevelFilterForTeam(team, tab.id)
                                        ? "bg-purple-100 text-purple-800 border-purple-200 font-extrabold"
                                        : "bg-slate-100 text-slate-400 border-slate-200"
                                    }`}
                                    title="Toggle Level-wise Filtering (e.g. restrict to user's subordinate hierarchy tree)"
                                  >
                                    Level Filter: {getLevelFilterForTeam(team, tab.id) ? "ON" : "OFF"}
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {isTabEnabled && tab.subTabs && (
                              <div className="flex flex-wrap gap-1 ml-4 mt-1 border-l border-slate-200 pl-2">
                                {tab.subTabs.map((subTab) => {
                                  const isSubTabEnabled = getVisibleSubTabsForTeam(team, tab.id).includes(subTab.id);
                                  return (
                                    <div key={subTab.id} className="flex flex-col gap-1 items-start bg-slate-50/40 p-1 rounded-sm border border-slate-100 shadow-4xs">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSubTabForTeam(team, tab.id, subTab.id)}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold font-mono transition-all border cursor-pointer ${
                                          isSubTabEnabled
                                            ? "bg-blue-50 border-blue-200 text-blue-700"
                                            : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                                        }`}
                                      >
                                        {subTab.label}
                                      </button>
                                      {isSubTabEnabled && subTab.subSubTabs && (
                                        <div className="flex flex-wrap gap-0.5 ml-4 mt-1 border-l border-slate-200 pl-1">
                                          {subTab.subSubTabs.map((subSubTab) => {
                                            const isSubSubTabEnabled = getVisibleSubSubTabsForTeam(team, tab.id, subTab.id).includes(subSubTab.id);
                                            return (
                                              <button
                                                key={subSubTab.id}
                                                type="button"
                                                onClick={() => handleToggleSubSubTabForTeam(team, tab.id, subTab.id, subSubTab.id)}
                                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-bold font-mono transition-all border cursor-pointer ${
                                                  isSubSubTabEnabled
                                                    ? "bg-purple-50 border-purple-200 text-purple-700"
                                                    : "bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100"
                                                }`}
                                              >
                                                {subSubTab.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin / Manager Teams Management Database Panel */}
      {isAdmin && (
        <div id="teams-database-management-panel" className="mt-4">
          <TeamDatabaseRegistryView
            activeUserId={activeUserId}
            users={users}
            teams={teams}
            onSaveTeam={onSaveTeam}
            onDeleteTeam={onDeleteTeam}
          />
        </div>
      )}
    </div>
  );
}
