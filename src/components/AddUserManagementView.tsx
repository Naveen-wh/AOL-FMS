import React, { useState } from "react";
import { User, Role, AccessLevel, Team } from "../types";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { UserPlus, Search, Shield, CheckCircle2, Edit2, Save, X, Users, Mail, Target, Award, UserCheck, AlertTriangle, FileSpreadsheet } from "lucide-react";

interface AddUserManagementViewProps {
  activeUserId: string;
  users: User[];
  teams?: Team[];
  onAddUser?: (user: User) => Promise<void>;
  onUpdateUser?: (userId: string, updates: Partial<User>) => Promise<void>;
}

export default function AddUserManagementView({
  activeUserId,
  users,
  teams = [],
  onAddUser,
  onUpdateUser,
}: AddUserManagementViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId);
  const isAdmin = activeUser?.role === Role.Admin;
  const isSeniorManager = activeUser?.role === Role.SeniorManager;
  const canAddUser = isAdmin;

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);

  const userImportFields: ImportFieldDefinition[] = [
    { key: "name", label: "Full Name", required: true, sampleValue: "Ananya Verma" },
    { key: "email", label: "Work Email Address", required: true, sampleValue: "ananya@aromaorganic.in" },
    { key: "role", label: "Role (Admin/SeniorManager/Manager/User)", sampleValue: "User" },
    { key: "accessLevel", label: "Access Level (Editor/Manager/Viewer)", sampleValue: "Editor" },
    { key: "teamName", label: "Department / Team", sampleValue: "Sales Executive" },
    { key: "reportsTo", label: "Reports To (Email)", sampleValue: "manager@aromaorganic.in" },
    { key: "targetQuota", label: "Monthly Target Quota (INR)", sampleValue: "50000" },
  ];

  const handleImportUsers = async (rows: Record<string, any>[]) => {
    let count = 0;
    if (!onAddUser) return { successCount: 0 };
    for (const row of rows) {
      if (row.name && row.email) {
        const emailNormalized = row.email.trim().toLowerCase();
        let roleVal = Role.User;
        if (row.role) {
          const r = row.role.trim().toLowerCase();
          if (r.includes("admin")) roleVal = Role.Admin;
          else if (r.includes("senior")) roleVal = Role.SeniorManager;
          else if (r.includes("manager")) roleVal = Role.Manager;
        }

        let accessVal = AccessLevel.Editor;
        if (row.accessLevel) {
          const a = row.accessLevel.trim().toLowerCase();
          if (a.includes("manager")) accessVal = AccessLevel.Manager;
          else if (a.includes("contrib")) accessVal = AccessLevel.Contributor;
          else accessVal = AccessLevel.Editor;
        }

        await onAddUser({
          id: emailNormalized,
          email: emailNormalized,
          name: row.name.trim(),
          role: roleVal,
          accessLevel: accessVal,
          teamName: row.teamName?.trim() || "General Executive",
          reportsTo: row.reportsTo?.trim() || undefined,
          targetQuota: Number(row.targetQuota) || 30000,
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Add User Form States
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>(Role.User);
  const [newAccess, setNewAccess] = useState<AccessLevel>(AccessLevel.Editor);
  const [newTeam, setNewTeam] = useState("");
  const [newReportsTo, setNewReportsTo] = useState("");
  const [newQuota, setNewQuota] = useState<number>(30000);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit User Modal/State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>(Role.User);
  const [editAccess, setEditAccess] = useState<AccessLevel>(AccessLevel.Editor);
  const [editTeam, setEditTeam] = useState("");
  const [editReportsTo, setEditReportsTo] = useState("");
  const [editQuota, setEditQuota] = useState<number>(30000);
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Derive unique teams list for dropdowns
  const uniqueTeams = Array.from(
    new Set(
      (teams.length > 0 ? teams.map((t) => t.name) : users.map((u) => u.teamName))
        .filter((t): t is string => Boolean(t && t.trim()))
    )
  );

  // Permission check function for editing a specific target user
  const canEditTargetUser = (targetUser: User): boolean => {
    if (isAdmin) return true;
    if (isSeniorManager) {
      // Senior Manager can edit users except Admins
      if (targetUser.role === Role.Admin) return false;
      return true;
    }
    // Users can edit themselves
    if (targetUser.id === activeUserId) return true;
    return false;
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      setAddMsg({ type: "error", text: "Work Email Address and Full Name are required." });
      return;
    }
    if (!onAddUser) {
      setAddMsg({ type: "error", text: "Add user service handler is missing." });
      return;
    }

    setIsAddingUser(true);
    setAddMsg(null);
    const normalizedEmail = newEmail.trim().toLowerCase();

    try {
      const newUserObj: User = {
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

      await onAddUser(newUserObj);
      setAddMsg({
        type: "success",
        text: `User details for "${newName.trim()}" (${normalizedEmail}) registered successfully! When they register or sign in with this email, their profile will map automatically.`
      });

      // Reset Form
      setNewEmail("");
      setNewName("");
      setNewRole(Role.User);
      setNewAccess(AccessLevel.Editor);
      setNewTeam("");
      setNewReportsTo("");
      setNewQuota(30000);
      setNewAvatarUrl("");
    } catch (err) {
      console.error("Error adding user:", err);
      setAddMsg({ type: "error", text: "Failed to create user details. Please try again." });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleStartEdit = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setEditName(targetUser.name);
    setEditRole(targetUser.role);
    setEditAccess(targetUser.accessLevel);
    setEditTeam(targetUser.teamName || "");
    setEditReportsTo(targetUser.reportsTo || "");
    setEditQuota(targetUser.targetQuota || 30000);
    setEditAvatarUrl(targetUser.avatarUrl || "");
    setEditMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingUserId || !onUpdateUser) return;

    setIsSavingEdit(true);
    setEditMsg(null);

    try {
      await onUpdateUser(editingUserId, {
        name: editName.trim(),
        role: editRole,
        accessLevel: editAccess,
        teamName: editTeam.trim() || undefined,
        reportsTo: editReportsTo || undefined,
        targetQuota: Number(editQuota) || 0,
        avatarUrl: editAvatarUrl.trim() || undefined,
      });

      setEditMsg({ type: "success", text: "User details updated successfully!" });
      setTimeout(() => {
        setEditingUserId(null);
        setEditMsg(null);
      }, 1200);
    } catch (err) {
      console.error("Error updating user:", err);
      setEditMsg({ type: "error", text: "Failed to update user details." });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filtered users list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.teamName && u.teamName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = selectedRoleFilter === "ALL" || u.role === selectedRoleFilter;
    const matchesTeam = selectedTeamFilter === "ALL" || u.teamName === selectedTeamFilter;

    return matchesSearch && matchesRole && matchesTeam;
  });

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="text-emerald-400 shrink-0" size={20} />
            <h2 className="text-sm font-extrabold tracking-wide uppercase font-mono">
              User Details & Auth Mapping Manager
            </h2>
          </div>
          <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl leading-relaxed">
            Pre-register user emails, role assignments, reporting hierarchies, and quota targets.
            When a team member creates an account or logs in with their email, their profile maps automatically.
          </p>
        </div>

        {canAddUser ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <FileSpreadsheet size={16} className="text-emerald-400" />
              <span>Import Users (Sheets / CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <UserPlus size={16} />
              {showAddForm ? "Hide Add Form" : "Add New User Details"}
            </button>
          </div>
        ) : (
          <div className="bg-slate-800/80 text-emerald-300 border border-slate-700 px-3 py-1.5 rounded text-[11px] font-mono flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-400" />
            <span>Read-Only View (Requires Admin or Senior Manager)</span>
          </div>
        )}
      </div>

      {/* Add New User Registration Form Panel */}
      {canAddUser && showAddForm && (
        <div className="bg-white rounded-xl border border-emerald-300 shadow-sm p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-100 text-emerald-800 p-2 rounded-lg">
                <UserPlus size={18} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Add New User Profile & Pre-Auth Mapping</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  All fields will be stored in database. When user signs in with this work email, authentication attaches instantly.
                </p>
              </div>
            </div>
            <span className="text-[9px] font-bold uppercase font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {isAdmin ? "Admin Permission" : "Senior Manager Permission"}
            </span>
          </div>

          {addMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                addMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : "bg-rose-50 border-rose-300 text-rose-900"
              }`}
            >
              {addMsg.type === "success" ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              )}
              <span>{addMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleAddUserSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Work Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. employee@company.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Robert Vance"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Assigned Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option key="r-usr" value={Role.User}>User (Sales Executive)</option>
                  <option key="r-tl" value={Role.TeamLead}>Team Lead</option>
                  <option key="r-mgr" value={Role.Manager}>Manager</option>
                  <option key="r-srmgr" value={Role.SeniorManager}>Senior Manager</option>
                  {isAdmin && <option key="r-adm" value={Role.Admin}>Admin</option>}
                </select>
              </div>

              {/* Access Level */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Access Control Level (ACL)
                </label>
                <select
                  value={newAccess}
                  onChange={(e) => setNewAccess(e.target.value as AccessLevel)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option key="acl-ed" value={AccessLevel.Editor}>Editor (Own Records)</option>
                  <option key="acl-cnt" value={AccessLevel.Contributor}>Contributor (Subtree Records)</option>
                  <option key="acl-mg" value={AccessLevel.Manager}>Manager (Full Department)</option>
                </select>
              </div>

              {/* Team Section */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Team / Group Section
                </label>
                <select
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option key="t-none" value="">Select Team...</option>
                  {uniqueTeams.map((t, idx) => (
                    <option key={`team-opt-${t}-${idx}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supervisor / Reports To */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Supervisor Anchor
                </label>
                <select
                  value={newReportsTo}
                  onChange={(e) => setNewReportsTo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option key="rep-none" value="">None (Top Matrix / Executive)</option>
                  {users.map((u, idx) => (
                    <option key={`rep-opt-${u.id || idx}-${idx}`} value={u.id}>
                      {u.name} ({u.role} - {u.teamName || "No Team"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quota */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Target Quota ($)
                </label>
                <input
                  type="number"
                  value={newQuota}
                  onChange={(e) => setNewQuota(Number(e.target.value))}
                  placeholder="30000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Avatar URL */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Avatar Picture URL (Optional)
                </label>
                <input
                  type="url"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingUser}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <UserPlus size={14} />
                {isAddingUser ? "Saving User Details..." : "Register User & Map Auth"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by name, email, or team..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Role Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Role:</span>
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-semibold focus:outline-none"
            >
              <option key="rf-all" value="ALL">All Roles</option>
              <option key="rf-adm" value={Role.Admin}>Admin</option>
              <option key="rf-srmgr" value={Role.SeniorManager}>Senior Manager</option>
              <option key="rf-mgr" value={Role.Manager}>Manager</option>
              <option key="rf-tl" value={Role.TeamLead}>Team Lead</option>
              <option key="rf-usr" value={Role.User}>User</option>
            </select>
          </div>

          {/* Team Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Team:</span>
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-semibold focus:outline-none"
            >
              <option key="tf-all" value="ALL">All Teams</option>
              {uniqueTeams.map((t, idx) => (
                <option key={`tf-opt-${t}-${idx}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Users Directory List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredUsers.map((u) => {
          const supervisor = users.find((sp) => sp.id === u.reportsTo);
          const isEditable = canEditTargetUser(u);

          return (
            <div
              key={u.id}
              className={`bg-white rounded-xl border transition-all p-3.5 flex flex-col justify-between space-y-3 ${
                u.id === activeUserId
                  ? "border-emerald-500 ring-2 ring-emerald-500/10 shadow-sm"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                {/* User Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={
                        u.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=0D9488&color=fff`
                      }
                      alt={u.name}
                      className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        {u.name}
                        {u.id === activeUserId && (
                          <span className="bg-emerald-100 text-emerald-800 text-[8.5px] font-mono px-1.5 py-0.2 rounded font-bold">
                            You
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1 truncate max-w-[180px]">
                        <Mail size={10} className="text-slate-400 shrink-0" />
                        {u.email}
                      </p>
                    </div>
                  </div>

                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(u)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Edit User Details"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>

                {/* Badges and Properties */}
                <div className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-[8.5px] font-mono uppercase text-slate-400 block font-bold">Assigned Role</span>
                    <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-0.5">
                      <Shield size={11} className="text-emerald-600 shrink-0" />
                      {u.role}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] font-mono uppercase text-slate-400 block font-bold">Access Level</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                      <Award size={11} className="text-blue-600 shrink-0" />
                      {u.accessLevel}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] font-mono uppercase text-slate-400 block font-bold">Team / Group</span>
                    <span className="font-medium text-slate-700 flex items-center gap-1 mt-0.5 truncate">
                      <Users size={11} className="text-slate-400 shrink-0" />
                      {u.teamName || "Unassigned"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] font-mono uppercase text-slate-400 block font-bold">Target Quota</span>
                    <span className="font-mono font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                      <Target size={11} className="text-emerald-600 shrink-0" />
                      ${(u.targetQuota || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Supervisor Anchor */}
                <div className="mt-2 text-[9.5px] bg-slate-50 p-1.5 rounded border border-slate-100 font-mono text-slate-600">
                  <span className="text-slate-400">Reports To: </span>
                  <span className="font-bold text-slate-800">
                    {supervisor ? `${supervisor.name} (${supervisor.role})` : "Top Executive Matrix"}
                  </span>
                </div>
              </div>

              {/* Card Footer status indicator */}
              <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Auth Profile Mapped
                </span>
                <span>ID: {u.id}</span>
              </div>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="col-span-full bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
            <Users size={28} className="mx-auto text-slate-400" />
            <p className="text-xs font-bold text-slate-700">No User Profiles Found</p>
            <p className="text-[11px] text-slate-500">Try adjusting your search criteria or add new user details above.</p>
          </div>
        )}
      </div>

      {/* Edit User Modal Drawer */}
      {editingUserId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-emerald-400" />
                <h3 className="text-xs font-extrabold font-mono uppercase tracking-wider">
                  Edit User Details: {editName || editingUserId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
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

            <form onSubmit={handleSaveEdit} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Name */}
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Assigned Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as Role)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option key="ed-r-usr" value={Role.User}>User (Sales Executive)</option>
                    <option key="ed-r-tl" value={Role.TeamLead}>Team Lead</option>
                    <option key="ed-r-mgr" value={Role.Manager}>Manager</option>
                    <option key="ed-r-srmgr" value={Role.SeniorManager}>Senior Manager</option>
                    {isAdmin && <option key="ed-r-adm" value={Role.Admin}>Admin</option>}
                  </select>
                </div>

                {/* Access Level */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Access Control Level
                  </label>
                  <select
                    value={editAccess}
                    onChange={(e) => setEditAccess(e.target.value as AccessLevel)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option key="ed-acl-ed" value={AccessLevel.Editor}>Editor (Own Records)</option>
                    <option key="ed-acl-cnt" value={AccessLevel.Contributor}>Contributor (Subtree Records)</option>
                    <option key="ed-acl-mg" value={AccessLevel.Manager}>Manager (Full Department)</option>
                  </select>
                </div>

                {/* Team */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Team / Section
                  </label>
                  <select
                    value={editTeam}
                    onChange={(e) => setEditTeam(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option key="ed-tm-none" value="">Unassigned / General</option>
                    {uniqueTeams.map((t, idx) => (
                      <option key={`ed-team-opt-${t}-${idx}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reports To */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Supervisor Anchor
                  </label>
                  <select
                    value={editReportsTo}
                    onChange={(e) => setEditReportsTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option key="ed-rep-none" value="">None (Top Executive)</option>
                    {users
                      .filter((u) => u.id !== editingUserId)
                      .map((u, idx) => (
                        <option key={`ed-rep-opt-${u.id || idx}-${idx}`} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Quota */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Target Quota ($)
                  </label>
                  <input
                    type="number"
                    value={editQuota}
                    onChange={(e) => setEditQuota(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Avatar URL */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono text-[11px] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUserId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Save size={14} />
                  {isSavingEdit ? "Saving Changes..." : "Save User Details"}
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
        title="Import User Profiles & Pre-Auth Mappings"
        entityName="User Profiles"
        fields={userImportFields}
        onImport={handleImportUsers}
      />
    </div>
  );
}
