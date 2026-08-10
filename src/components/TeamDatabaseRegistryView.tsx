import React, { useState } from "react";
import { User, Role, AccessLevel, Team } from "../types";
import DataImportModal, { ImportFieldDefinition } from "./DataImportModal";
import { formatDate } from "../utils";
import { Users, Plus, Trash2, Edit2, Save, X, Check, Search, Shield, CheckCircle2, AlertTriangle, Building2, UserCheck, Info, FileSpreadsheet } from "lucide-react";

interface TeamDatabaseRegistryViewProps {
  activeUserId: string;
  users: User[];
  teams?: Team[];
  onSaveTeam?: (team: Team) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
}

export default function TeamDatabaseRegistryView({
  activeUserId,
  users,
  teams = [],
  onSaveTeam,
  onDeleteTeam,
}: TeamDatabaseRegistryViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId);
  const isAdmin = activeUser?.role === Role.Admin;
  const isSeniorManager = activeUser?.role === Role.SeniorManager;
  const isManager = activeUser?.role === Role.Manager;
  
  // Role / Access clearance to edit team details
  const canManageTeams = isAdmin || isSeniorManager || (isManager && activeUser?.accessLevel === AccessLevel.Manager);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);

  const teamImportFields: ImportFieldDefinition[] = [
    { key: "name", label: "Team / Department Name", required: true, sampleValue: "North India Sales" },
    { key: "description", label: "Team Purpose / Description", sampleValue: "Handles Delhi NCR and Punjab territories" },
  ];

  const handleImportTeams = async (rows: Record<string, any>[]) => {
    let count = 0;
    if (!onSaveTeam) return { successCount: 0 };
    for (const row of rows) {
      if (row.name && row.name.trim()) {
        const nameStr = row.name.trim();
        const generatedId = nameStr.toLowerCase().replace(/[^a-z0-9]/g, "-") || `team-${Date.now()}`;
        await onSaveTeam({
          id: generatedId,
          name: nameStr,
          description: row.description?.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
        count++;
      }
    }
    return { successCount: count };
  };

  // Create Team state
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit Team Modal / Drawer state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDesc, setEditTeamDesc] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      setCreateMsg({ type: "error", text: "Team Group Name is required." });
      return;
    }
    if (!onSaveTeam) {
      setCreateMsg({ type: "error", text: "Team save handler is not configured." });
      return;
    }

    setIsCreatingTeam(true);
    setCreateMsg(null);

    try {
      const generatedId = newTeamName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-") || `team-${Date.now()}`;
      if (teams.some((t) => t.id === generatedId || t.name.toLowerCase() === newTeamName.trim().toLowerCase())) {
        setCreateMsg({ type: "error", text: `A team named "${newTeamName.trim()}" already exists in the database!` });
        setIsCreatingTeam(false);
        return;
      }

      const newTeamObj: Team = {
        id: generatedId,
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await onSaveTeam(newTeamObj);
      setCreateMsg({
        type: "success",
        text: `Team group "${newTeamName.trim()}" registered successfully in Firestore Database!`,
      });

      setNewTeamName("");
      setNewTeamDesc("");
    } catch (err) {
      console.error("Error saving team:", err);
      setCreateMsg({ type: "error", text: "Failed to create team group in database." });
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleStartEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setEditTeamName(team.name);
    setEditTeamDesc(team.description || "");
    setEditMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeamId || !editTeamName.trim() || !onSaveTeam) return;

    setIsSavingEdit(true);
    setEditMsg(null);

    try {
      const existingTeam = teams.find((t) => t.id === editingTeamId);
      const updatedTeamObj: Team = {
        id: editingTeamId,
        name: editTeamName.trim(),
        description: editTeamDesc.trim() || undefined,
        createdAt: existingTeam?.createdAt || new Date().toISOString(),
      };

      await onSaveTeam(updatedTeamObj);
      setEditMsg({ type: "success", text: "Team details updated successfully!" });

      setTimeout(() => {
        setEditingTeamId(null);
        setEditMsg(null);
      }, 1200);
    } catch (err) {
      console.error("Error updating team:", err);
      setEditMsg({ type: "error", text: "Failed to update team details." });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filtered teams list
  const filteredTeams = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="text-purple-400 shrink-0" size={20} />
            <h2 className="text-sm font-extrabold tracking-wide uppercase font-mono">
              Teams Database Registry Console
            </h2>
          </div>
          <p className="text-xs text-purple-100/80 mt-1 max-w-2xl leading-relaxed">
            Manage central team sections and department groups in Firestore database.
            Adding or editing a team group here updates team choices across user profiles and visibility matrices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageTeams && (
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Import Teams (Sheets / CSV)</span>
            </button>
          )}

          <div className="bg-slate-800/80 text-purple-300 border border-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5">
            <Shield size={14} className="text-purple-400" />
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
        {/* Left Column: Register New Team Form (for authorized roles) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="bg-purple-100 text-purple-800 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Register New Team Group</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  Create a new team section for your sales organization
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

            {canManageTeams ? (
              <form onSubmit={handleCreateTeamSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Team / Department Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Sales APAC Regional"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase block">
                    Group Description
                  </label>
                  <textarea
                    value={newTeamDesc}
                    onChange={(e) => setNewTeamDesc(e.target.value)}
                    rows={3}
                    placeholder="e.g. Asia-Pacific enterprise regional office and key account executive team"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingTeam}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  {isCreatingTeam ? "Registering Team..." : "Register Team in Database"}
                </button>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center text-xs text-slate-500">
                You need Manager or Admin role clearance to register new teams.
              </div>
            )}
          </div>

          {/* Quick Info Box */}
          <div className="bg-purple-50/50 border border-purple-200/60 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-bold text-purple-900">
              <Info size={14} className="text-purple-600 shrink-0" />
              <span>Team Registry Impact</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              Teams created here automatically populate team dropdowns in user profile assignments, lead assignments, and tab visibility matrices across the portal.
            </p>
          </div>
        </div>

        {/* Right Column: Registered Teams List & Edit Management */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-purple-600" />
              <h3 className="text-xs font-bold text-slate-900">
                Registered Firestore Teams ({teams.length})
              </h3>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search team name or description..."
                className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>
          </div>

          {/* Teams Grid */}
          <div className="space-y-2.5">
            {filteredTeams.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
                <Building2 size={28} className="mx-auto text-slate-400" />
                <p className="text-xs font-bold text-slate-700">No Teams Found</p>
                <p className="text-[11px] text-slate-500">
                  {searchTerm ? "No team matches your search query." : "No teams registered in database yet. Add one using the form."}
                </p>
              </div>
            ) : (
              filteredTeams.map((team) => {
                const assignedMembers = users.filter((u) => u.teamName === team.name);
                const memberCount = assignedMembers.length;

                return (
                  <div
                    key={team.id}
                    className="bg-white border border-slate-200 hover:border-purple-300 rounded-xl p-3.5 transition-all shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-extrabold text-slate-900">{team.name}</h4>
                          <span className="text-[9px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-bold">
                            ID: {team.id}
                          </span>
                          <span className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                            {memberCount} Active {memberCount === 1 ? "Member" : "Members"}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-600 leading-normal">
                          {team.description || "No specific description recorded for this team section."}
                        </p>
                      </div>

                      {/* Actions */}
                      {canManageTeams && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(team)}
                            className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Team Details"
                          >
                            <Edit2 size={14} />
                          </button>
                          {deletingTeamId === team.id ? (
                            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-[11px] animate-fade-in font-mono">
                              <span className="font-semibold text-rose-700">Delete?</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onDeleteTeam) {
                                    await onDeleteTeam(team.id);
                                  }
                                  setDeletingTeamId(null);
                                }}
                                className="text-white bg-rose-600 hover:bg-rose-700 p-0.5 rounded cursor-pointer transition-all"
                                title="Confirm delete team"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTeamId(null)}
                                className="text-slate-500 hover:bg-slate-200 p-0.5 rounded cursor-pointer transition-all"
                                title="Cancel delete"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingTeamId(team.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Team"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Assigned User Avatars Pill */}
                    {memberCount > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                        <div className="flex items-center gap-1 flex-wrap">
                          <UserCheck size={12} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-700">Assigned Team:</span>
                          <div className="flex items-center -space-x-1 ml-1">
                            {assignedMembers.slice(0, 5).map((m) => (
                              <img
                                key={m.id}
                                src={
                                  m.avatarUrl ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=0D9488&color=fff`
                                }
                                alt={m.name}
                                title={`${m.name} (${m.role})`}
                                className="w-5 h-5 rounded-full border border-white object-cover"
                              />
                            ))}
                          </div>
                          {memberCount > 5 && (
                            <span className="text-[9px] font-mono text-slate-400 font-bold ml-1">
                              +{memberCount - 5} more
                            </span>
                          )}
                        </div>

                        <span className="text-[9px] font-mono text-slate-400">
                          Created: {team.createdAt ? formatDate(team.createdAt) : "N/A"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit Team Modal Drawer */}
      {editingTeamId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-purple-400" />
                <h3 className="text-xs font-extrabold font-mono uppercase tracking-wider">
                  Edit Team Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTeamId(null)}
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
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Team / Section Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase block">
                  Group Description
                </label>
                <textarea
                  value={editTeamDesc}
                  onChange={(e) => setEditTeamDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTeamId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Save size={14} />
                  {isSavingEdit ? "Saving..." : "Save Team Details"}
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
        title="Import Team Groups into Database"
        entityName="Team Groups"
        fields={teamImportFields}
        onImport={handleImportTeams}
      />
    </div>
  );
}
