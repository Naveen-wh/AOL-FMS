import React, { useState, useEffect } from "react";
import { getSharedDriveSettings, saveSharedDriveSettings } from "../lib/googleDriveService";
import { DriveSettings } from "../lib/googleDriveService";
import { Save, Loader2, Folder } from "lucide-react";
import { User } from "../types";
import { saveLog } from "../lib/firebaseService";

interface AdminDriveSettingsProps {
  onSettingsSaved?: () => void;
  activeUser?: User;
}

export default function AdminDriveSettings({ onSettingsSaved, activeUser }: AdminDriveSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      const settings = await getSharedDriveSettings();
      if (settings) {
        setFolderId(settings.folderId);
        setFolderName(settings.folderName);
      }
      setLoading(false);
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newSettings: DriveSettings = {
        folderName,
        folderId,
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
          targetName: "Google Drive Folder Configuration",
          details: `ADMIN ACTION: ${activeUser.name} updated Google Drive Shared Folder configuration to folder "${folderName}" (Folder ID: ${folderId})`
        });
      }

      alert("Settings saved successfully!");
      if (onSettingsSaved) onSettingsSaved();
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 flex items-center justify-center text-slate-500 text-xs"><Loader2 className="animate-spin mr-2" size={14} /> Loading settings...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
      <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
        <Folder size={16} className="text-blue-500" />
        Shared Google Drive Configuration
      </h3>
      <div className="space-y-2">
        <input
          type="text"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="Folder Name (e.g., SMS_PO)"
          className="w-full p-2 text-xs border rounded-md"
        />
        <input
          type="text"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          placeholder="Google Drive Folder ID"
          className="w-full p-2 text-xs border rounded-md font-mono"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !folderId || !folderName}
        className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
      >
        {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
        {saving ? "Saving..." : "Save Configuration"}
      </button>
    </div>
  );
}
