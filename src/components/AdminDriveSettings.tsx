import React, { useState, useEffect, useMemo } from "react";
import {
  getSharedDriveSettings,
  saveSharedDriveSettings,
  ensureGoogleDriveAccess,
  hasDriveConnection,
  extractDriveFolderId,
  verifyDriveFolderOrSharedDrive,
  DriveTargetVerification,
  DriveSettings,
} from "../lib/googleDriveService";
import {
  Save,
  Loader2,
  Folder,
  ShieldCheck,
  Users,
  Check,
  AlertCircle,
  ExternalLink,
  Lock,
  RefreshCw,
  Info,
  Layers,
  Search,
} from "lucide-react";
import { User, Team } from "../types";
import { saveLog } from "../lib/firebaseService";

interface AdminDriveSettingsProps {
  onSettingsSaved?: () => void;
  activeUser: User;
  teams?: Team[];
  users?: User[];
}

export default function AdminDriveSettings({
  onSettingsSaved,
  activeUser,
  teams = [],
  users = [],
}: AdminDriveSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [folderName, setFolderName] = useState("SMS_PO");
  const [driveType, setDriveType] = useState<"shared_drive" | "shared_folder" | "my_drive" | undefined>(undefined);
  const [allowAllTeams, setAllowAllTeams] = useState<boolean>(true);
  const [allowedTeamIds, setAllowedTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState<number | undefined>(undefined);

  // Verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<DriveTargetVerification | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Combine unique team names from teams prop and users prop
  const availableTeams = useMemo(() => {
    const map = new Map<string, { id: string; name: string; memberCount: number }>();

    // From teams master
    teams.forEach((t) => {
      if (t.name) {
        map.set(t.name.toLowerCase(), {
          id: t.id || t.name,
          name: t.name,
          memberCount: 0,
        });
      }
    });

    // Count user members and add missing team names
    users.forEach((u) => {
      if (u.teamName && u.teamName.trim() !== "") {
        const key = u.teamName.trim().toLowerCase();
        if (map.has(key)) {
          const item = map.get(key)!;
          item.memberCount += 1;
        } else {
          map.set(key, {
            id: u.teamName.trim(),
            name: u.teamName.trim(),
            memberCount: 1,
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, users]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settings = await getSharedDriveSettings();
      if (settings) {
        setFolderId(settings.folderId || "");
        setFolderName(settings.folderName || "SMS_PO");
        setDriveType(settings.driveType);
        setAllowAllTeams(settings.allowAllTeams !== false);
        setAllowedTeamIds(settings.allowedTeamIds || []);
        setHasConnection(hasDriveConnection(settings));
        setTokenExpiry(settings.tokenExpiry);
      } else {
        setFolderName("SMS_PO");
        setAllowAllTeams(true);
        setAllowedTeamIds([]);
        setHasConnection(hasDriveConnection(null));
      }
    } catch (err) {
      console.error("Error loading drive settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleFolderIdChange = (val: string) => {
    setFolderId(val);
    setVerificationResult(null);
    setVerificationError(null);
  };

  const handleFolderIdBlur = () => {
    if (folderId && (folderId.includes("drive.google.com") || folderId.includes("folders/") || folderId.includes("drives/"))) {
      const clean = extractDriveFolderId(folderId);
      if (clean && clean !== folderId) {
        setFolderId(clean);
      }
    }
  };

  const handleVerifyDriveId = async (forceReauth = false) => {
    const cleanId = extractDriveFolderId(folderId);
    if (!cleanId) {
      setVerificationError("Please enter a Google Drive Folder ID or Shared Drive ID to test.");
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);
    setVerificationResult(null);

    try {
      const token = await ensureGoogleDriveAccess(forceReauth);
      const result = await verifyDriveFolderOrSharedDrive(token, cleanId);
      setVerificationResult(result);
      setFolderId(result.id);
      if (result.type === "shared_drive" || result.type === "shared_folder" || result.type === "my_drive") {
        setDriveType(result.type);
      }
      if (result.name && (!folderName || folderName === "SMS_PO")) {
        setFolderName(result.name);
      }
      setHasConnection(true);
    } catch (err: any) {
      console.error("Drive ID verification error:", err);
      setVerificationError(err.message || "Failed to verify ID. Ensure Google Drive is authorized and the ID is correct.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleTeam = (teamIdentifier: string) => {
    setAllowedTeamIds((prev) => {
      const exists = prev.some(
        (t) => t.toLowerCase() === teamIdentifier.toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (t) => t.toLowerCase() !== teamIdentifier.toLowerCase()
        );
      } else {
        return [...prev, teamIdentifier];
      }
    });
  };

  const handleSelectAllTeams = () => {
    setAllowedTeamIds(availableTeams.map((t) => t.name));
  };

  const handleClearAllTeams = () => {
    setAllowedTeamIds([]);
  };

  const handleAuthorizeDrive = async () => {
    setIsAuthorizing(true);
    setAuthError(null);
    try {
      await ensureGoogleDriveAccess(true);
      await loadSettings();
    } catch (err: any) {
      console.error("Error authorizing Google Drive:", err);
      setAuthError(
        err.message ||
          "Failed to authorize Google Drive. Please ensure pop-ups are allowed in your browser."
      );
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!folderName.trim()) {
      alert("Please provide a folder or drive name.");
      return;
    }

    const cleanFolderId = extractDriveFolderId(folderId);

    setSaving(true);
    setSaveSuccess(false);
    try {
      const current = await getSharedDriveSettings();
      const newSettings: DriveSettings = {
        folderName: folderName.trim(),
        folderId: cleanFolderId,
        driveType: driveType || current?.driveType || "my_drive",
        allowAllTeams: allowAllTeams,
        allowedTeamIds: allowAllTeams ? [] : allowedTeamIds,
        adminAccessToken: current?.adminAccessToken,
        tokenExpiry: current?.tokenExpiry,
      };

      await saveSharedDriveSettings(newSettings);

      if (activeUser) {
        await saveLog({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.name,
          actionType: "Update Google Drive Settings",
          targetType: "Settings",
          targetId: "google_drive",
          targetName: "Google Drive / Shared Drive Configuration",
          details: `ADMIN ACTION: ${activeUser.name} updated Google Drive Shared Folder/Drive configuration. Name: "${folderName}" (ID: ${cleanFolderId || "Auto"}, Type: ${newSettings.driveType}), Team Access: ${allowAllTeams ? "All Teams" : allowedTeamIds.join(", ")}`,
        });
      }

      setFolderId(cleanFolderId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      if (onSettingsSaved) onSettingsSaved();
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings to Firestore.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center text-slate-500 text-xs">
        <Loader2 className="animate-spin mr-2" size={16} /> Loading Google Drive configuration...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <Folder size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Google Drive & Shared Drives (Team Drives) Configuration
              </h2>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                <Lock size={9} /> Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure your central Google Drive folder or Google Shared Drive (Team Drive) for POs and Invoices.
            </p>
          </div>
        </div>

        {/* Live Status & Quick Auth */}
        <div className="flex items-center gap-2">
          {hasConnection ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>OAuth Connected</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span>Session Timed Out</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleAuthorizeDrive}
            disabled={isAuthorizing}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
            title="Authorize or refresh Google Drive access"
          >
            {isAuthorizing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            <span>{hasConnection ? "Re-authorize" : "Connect Drive"}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-6">
        {/* Section 1: Central Folder / Shared Drive Config */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-mono text-[10px] font-bold flex items-center justify-center border border-indigo-200">
                1
              </span>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                Google Drive or Shared Drive (Team Drive) Details
              </h3>
            </div>
            {driveType && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Layers size={10} />
                {driveType === "shared_drive"
                  ? "Shared Drive (Root)"
                  : driveType === "shared_folder"
                  ? "Folder inside Shared Drive"
                  : "My Drive Folder"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Folder or Shared Drive Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. SMS_PO or Company Shared Drive"
                required
                className="w-full text-xs font-medium text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Display name for the central storage location.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  Folder ID or Shared Drive ID / URL <span className="text-slate-400 font-normal">(Shared Drives Supported)</span>
                </label>
                {folderId.trim() && (
                  <button
                    type="button"
                    onClick={handleVerifyDriveId}
                    disabled={isVerifying}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    {isVerifying ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                    <span>Test / Verify ID</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={folderId}
                  onChange={(e) => handleFolderIdChange(e.target.value)}
                  onBlur={handleFolderIdBlur}
                  placeholder="e.g. 0ABcDeF123456789... or full Google Drive URL"
                  className="w-full text-xs font-medium text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Paste the Shared Drive ID, Folder ID, or full Drive URL. Supports <strong>Google Shared Drives</strong> and <strong>My Drive</strong> folders.
              </p>
            </div>
          </div>

          {/* Verification Feedback Banner */}
          {verificationResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <span>Verified Google Drive Target:</span>
                  <span className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px]">
                    {verificationResult.name}
                  </span>
                </p>
                <p className="text-[11px] text-emerald-800">
                  {verificationResult.description} (Clean ID: <code className="font-mono text-emerald-950 select-all font-semibold">{verificationResult.id}</code>)
                </p>
              </div>
            </div>
          )}

          {verificationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <span className="font-bold">Verification Notice:</span> {verificationError}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleVerifyDriveId(true)}
                disabled={isVerifying}
                className="self-start sm:self-auto shrink-0 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                {isVerifying ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                <span>Re-authorize & Test</span>
              </button>
            </div>
          )}

          {/* Shared Drive info box */}
          <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-indigo-950">
            <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-indigo-950 flex items-center gap-1.5">
                <span>Google Shared Drives (Team Drives) & My Drive Supported:</span>
              </p>
              <p className="text-indigo-900">
                You can specify a <strong>Google Shared Drive (Team Drive)</strong> ID, a subfolder inside a Shared Drive, or a standard My Drive folder. All upload and subfolder creation requests utilize full Shared Drive API parameters (<code>supportsAllDrives</code> and <code>includeItemsFromAllDrives</code>) so files are securely stored in your team's designated workspace drive.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Team Access Permissions */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 font-mono text-[10px] font-bold flex items-center justify-center border border-emerald-200">
                2
              </span>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                Team Access & Re-connect Permissions
              </h3>
            </div>

            {!allowAllTeams && availableTeams.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllTeams}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClearAllTeams}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Control which teams have access to connect to Google Drive, re-authorize if the connection times out, and upload customer POs / Invoices.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                allowAllTeams
                  ? "border-emerald-300 bg-emerald-50/40 text-emerald-950 shadow-2xs"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="teamAccess"
                checked={allowAllTeams}
                onChange={() => setAllowAllTeams(true)}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Users size={14} className={allowAllTeams ? "text-emerald-600" : "text-slate-400"} />
                  <span>All Teams (Open Access)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  All active team members across the organization can connect and upload documents to Google Drive.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                !allowAllTeams
                  ? "border-blue-300 bg-blue-50/40 text-blue-950 shadow-2xs"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="teamAccess"
                checked={!allowAllTeams}
                onChange={() => setAllowAllTeams(false)}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck size={14} className={!allowAllTeams ? "text-blue-600" : "text-slate-400"} />
                  <span>Specific Teams Only</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Only users belonging to the selected teams (plus Admins) can connect & upload documents.
                </p>
              </div>
            </label>
          </div>

          {/* Team Checkboxes if Specific Teams Selected */}
          {!allowAllTeams && (
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="text-[11px] font-bold text-slate-700 uppercase font-mono tracking-wider">
                Select Authorized Teams:
              </div>

              {availableTeams.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  No teams found in the database. Please add teams in the Team Directory tab.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {availableTeams.map((t) => {
                    const isChecked = allowedTeamIds.some(
                      (id) => id.toLowerCase() === t.name.toLowerCase()
                    );
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                          isChecked
                            ? "bg-white border-blue-400 text-blue-950 font-bold shadow-2xs"
                            : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleTeam(t.name)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="truncate">{t.name}</span>
                        </div>
                        {t.memberCount > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0 ml-1">
                            {t.memberCount} {t.memberCount === 1 ? "user" : "users"}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {allowedTeamIds.length === 0 && (
                <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mt-2">
                  <AlertCircle size={12} /> Warning: No specific teams selected. Only Admins will have Google Drive access until teams are selected.
                </p>
              )}
            </div>
          )}
        </div>

        {authError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            Changes saved to Firestore settings will immediately apply across all active sessions.
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-fade-in">
                <Check size={14} /> Configuration Saved!
              </span>
            )}

            <button
              type="submit"
              disabled={saving || !folderName.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
