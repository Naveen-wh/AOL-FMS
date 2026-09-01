import React, { useState, useEffect, useMemo } from "react";
import {
  ensureGoogleDriveAccess,
  getSharedDriveSettings,
  saveSharedDriveSettings,
  extractDriveFolderId,
  verifyDriveFolderOrSharedDrive,
  hasDriveConnection,
  DriveSettings,
  DriveTargetVerification,
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
  Zap,
  CheckCircle2,
  RefreshCw,
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
  const [driveType, setDriveType] = useState<"shared_drive" | "shared_folder" | "my_drive" | undefined>("shared_folder");
  const [allowAllTeams, setAllowAllTeams] = useState<boolean>(true);
  const [allowedTeamIds, setAllowedTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Authentication & Verification State
  const [hasConnection, setHasConnection] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenExpiryTime, setTokenExpiryTime] = useState<number | null>(null);

  // Folder Verification State
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
        setDriveType(settings.driveType || "shared_folder");
        setAllowAllTeams(settings.allowAllTeams !== false);
        setAllowedTeamIds(settings.allowedTeamIds || []);
        setHasConnection(hasDriveConnection(settings));
        if (settings.tokenExpiry) {
          setTokenExpiryTime(settings.tokenExpiry);
        }
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

  const handleConnectGoogleDrive = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const token = await ensureGoogleDriveAccess(true);
      if (token) {
        setHasConnection(true);
        setTokenExpiryTime(Date.now() + 3500 * 1000);
        // Refresh settings from Firestore
        await loadSettings();
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      setAuthError(err.message || "Failed to authorize Google Drive. Please allow pop-ups and try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleVerifyFolder = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    setVerificationError(null);

    try {
      const token = await ensureGoogleDriveAccess(false);
      const clean = extractDriveFolderId(folderId);
      if (!clean) {
        throw new Error("Please enter a Google Drive Folder ID or Shared Drive Link to verify.");
      }

      const result = await verifyDriveFolderOrSharedDrive(token, clean);
      setVerificationResult(result);
      if (result.name && (!folderName || folderName === "SMS_PO")) {
        setFolderName(result.name);
      }
      if (result.type) {
        setDriveType(result.type);
      }
    } catch (err: any) {
      console.error("Folder verification error:", err);
      setVerificationError(err.message || "Unable to access this Google Drive folder. Please check ID and permissions.");
    } finally {
      setIsVerifying(false);
    }
  };

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
        driveType: driveType || current?.driveType || "shared_folder",
        allowAllTeams: allowAllTeams,
        allowedTeamIds: allowAllTeams ? [] : allowedTeamIds,
        adminAccessToken: current?.adminAccessToken,
        tokenExpiry: current?.tokenExpiry,
        uploadMode: "google_drive_oauth",
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
          targetName: "Google Drive OAuth Configuration",
          details: `ADMIN ACTION: ${activeUser.name} updated Google Drive Target: "${folderName}" (ID: ${cleanFolderId || "Auto"}), Team Access: ${allowAllTeams ? "All Teams" : allowedTeamIds.join(", ")}`,
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
                Google Drive Storage & Authentication
              </h2>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                <Lock size={9} /> Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Securely authenticate and upload customer POs & Invoices directly to your organization's Google Drive or Shared Drive.
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          {hasConnection ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Google Drive Connected</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-2xs">
              <AlertCircle size={14} />
              <span>Authentication Needed</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-6">
        {/* Section 1: Google Drive OAuth Connection */}
        <div className="p-4 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Zap size={16} className="fill-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <span>Google Drive Authentication & Access</span>
                  {hasConnection && (
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full font-mono">
                      Active
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Authorize Google Drive once using Google OAuth. The connection is shared across all authorized sales team members.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={isAuthenticating}
              className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                hasConnection
                  ? "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
              }`}
            >
              {isAuthenticating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Connecting with Google...</span>
                </>
              ) : hasConnection ? (
                <>
                  <RefreshCw size={14} className="text-slate-500" />
                  <span>Reconnect / Refresh Token</span>
                </>
              ) : (
                <>
                  <Zap size={14} className="fill-white" />
                  <span>Connect Google Drive</span>
                </>
              )}
            </button>
          </div>

          {/* Connection Status Details */}
          {hasConnection && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">Google Drive Connection Active</p>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Your sales team can upload POs and Invoices directly to Google Drive. Uploaded files will be automatically organized by client name.
                </p>
              </div>
            </div>
          )}

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">Google Authentication Error</p>
                <p className="text-[11px] leading-relaxed">{authError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Central Folder / Shared Drive Target Config */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] font-bold flex items-center justify-center border border-slate-300">
                2
              </span>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                Target Google Drive Folder or Shared Drive (Team Drive)
              </h3>
            </div>
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
                Display name for the central storage location (created automatically if not found).
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  Folder ID, Shared Drive Link or ID <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderId}
                  onChange={(e) => handleFolderIdChange(e.target.value)}
                  onBlur={handleFolderIdBlur}
                  placeholder="e.g. https://drive.google.com/drive/folders/1ABCxyz... or 0ABcDeF123..."
                  className="flex-1 text-xs font-medium text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
                {folderId.trim() !== "" && (
                  <button
                    type="button"
                    onClick={handleVerifyFolder}
                    disabled={isVerifying}
                    className="shrink-0 inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {isVerifying ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    <span>Verify</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Paste the Shared Drive ID, Folder ID, or full Google Drive URL. Leave blank for default auto-created <code>SMS_PO</code> folder.
              </p>
            </div>
          </div>

          {/* Verification Feedback */}
          {verificationResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Target Verified: {verificationResult.description}</p>
                <p className="text-[11px] text-emerald-700">
                  Folder ID: <code className="font-mono">{verificationResult.id}</code>
                </p>
              </div>
            </div>
          )}

          {verificationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-fade-in">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Verification Notice</p>
                <p className="text-[11px] leading-relaxed">{verificationError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Team Access Permissions */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 font-mono text-[10px] font-bold flex items-center justify-center border border-emerald-200">
                3
              </span>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                Team Access Permissions
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
            Control which teams have access to upload documents to Google Drive.
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
                  All active team members across the organization can upload documents to Google Drive.
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
                  Only users belonging to the selected teams (plus Admins) can upload documents.
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
