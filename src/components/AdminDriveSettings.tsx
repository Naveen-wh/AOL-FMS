import React, { useState, useEffect } from "react";
import {
  getSharedDriveSettings,
  saveSharedDriveSettings,
  extractDriveFolderId,
  DriveSettings,
  DriveTargetVerification,
  testAppsScriptConnection,
  DEFAULT_PO_UPLOAD_APPS_SCRIPT_CODE,
  DEFAULT_INVOICE_UPLOAD_APPS_SCRIPT_CODE,
} from "../lib/googleDriveService";
import {
  Save,
  Loader2,
  Folder,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
  Lock,
  Zap,
  CheckCircle2,
  RefreshCw,
  Code,
  Copy,
  X,
  FileText,
  Receipt,
} from "lucide-react";
import { User } from "../types";
import { saveLog } from "../lib/firebaseService";

interface AdminDriveSettingsProps {
  onSettingsSaved?: () => void;
  activeUser: User;
}

export default function AdminDriveSettings({
  onSettingsSaved,
  activeUser,
}: AdminDriveSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 1. PO Upload Settings State
  const [poFolderName, setPoFolderName] = useState("SMS_PO");
  const [poFolderId, setPoFolderId] = useState("");
  const [poAppsScriptUrl, setPoAppsScriptUrl] = useState<string>(() => {
    try {
      return localStorage.getItem("sms_po_apps_script_url") || "";
    } catch {
      return "";
    }
  });
  const [isTestingPoGas, setIsTestingPoGas] = useState(false);
  const [poGasTestResult, setPoGasTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPoCodeModalOpen, setIsPoCodeModalOpen] = useState(false);
  const [copiedPoCode, setCopiedPoCode] = useState(false);
  const [isVerifyingPo, setIsVerifyingPo] = useState(false);
  const [poVerificationResult, setPoVerificationResult] = useState<DriveTargetVerification | null>(null);
  const [poVerificationError, setPoVerificationError] = useState<string | null>(null);

  // 2. Invoice Upload Settings State
  const [invoiceFolderName, setInvoiceFolderName] = useState("SMS_INVOICES");
  const [invoiceFolderId, setInvoiceFolderId] = useState("");
  const [invoiceAppsScriptUrl, setInvoiceAppsScriptUrl] = useState<string>(() => {
    try {
      return localStorage.getItem("sms_invoice_apps_script_url") || "";
    } catch {
      return "";
    }
  });
  const [isTestingInvGas, setIsTestingInvGas] = useState(false);
  const [invGasTestResult, setInvGasTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInvCodeModalOpen, setIsInvCodeModalOpen] = useState(false);
  const [copiedInvCode, setCopiedInvCode] = useState(false);
  const [isVerifyingInv, setIsVerifyingInv] = useState(false);
  const [invVerificationResult, setInvVerificationResult] = useState<DriveTargetVerification | null>(null);
  const [invVerificationError, setInvVerificationError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settings = await getSharedDriveSettings();
      if (settings) {
        // Load PO Settings
        setPoFolderName(settings.folderName || "SMS_PO");
        setPoFolderId(settings.folderId || "");
        if (settings.appsScriptUrl) {
          setPoAppsScriptUrl(settings.appsScriptUrl);
          try {
            localStorage.setItem("sms_po_apps_script_url", settings.appsScriptUrl);
          } catch {
            // ignore
          }
        }

        // Load Invoice Settings
        setInvoiceFolderName(settings.invoiceFolderName || "SMS_INVOICES");
        setInvoiceFolderId(settings.invoiceFolderId || "");
        if (settings.invoiceAppsScriptUrl) {
          setInvoiceAppsScriptUrl(settings.invoiceAppsScriptUrl);
          try {
            localStorage.setItem("sms_invoice_apps_script_url", settings.invoiceAppsScriptUrl);
          } catch {
            // ignore
          }
        }
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

  // Verification Handlers
  const handleVerifyPoFolder = () => {
    setIsVerifyingPo(true);
    setPoVerificationResult(null);
    setPoVerificationError(null);
    try {
      const clean = extractDriveFolderId(poFolderId);
      if (!clean) {
        throw new Error("Please enter a Google Drive Folder ID or Link to verify.");
      }
      setPoVerificationResult({
        id: clean,
        name: poFolderName || "SMS_PO",
        type: "shared_folder",
        description: `Valid Google Drive Target ID: ${clean}. Customer PO documents uploaded via the PO Apps Script Gateway will be saved here.`,
      });
    } catch (err: any) {
      setPoVerificationError(err.message || "Unable to parse Google Drive folder ID.");
    } finally {
      setIsVerifyingPo(false);
    }
  };

  const handleVerifyInvFolder = () => {
    setIsVerifyingInv(true);
    setInvVerificationResult(null);
    setInvVerificationError(null);
    try {
      const clean = extractDriveFolderId(invoiceFolderId);
      if (!clean) {
        throw new Error("Please enter a Google Drive Folder ID or Link to verify.");
      }
      setInvVerificationResult({
        id: clean,
        name: invoiceFolderName || "SMS_INVOICES",
        type: "shared_folder",
        description: `Valid Google Drive Target ID: ${clean}. Invoice documents uploaded via the Invoice Apps Script Gateway will be saved here.`,
      });
    } catch (err: any) {
      setInvVerificationError(err.message || "Unable to parse Google Drive folder ID.");
    } finally {
      setIsVerifyingInv(false);
    }
  };

  // Test Connection Handlers
  const handleTestPoAppsScript = async () => {
    if (!poAppsScriptUrl.trim()) return;
    setIsTestingPoGas(true);
    setPoGasTestResult(null);
    try {
      const res = await testAppsScriptConnection(poAppsScriptUrl.trim());
      setPoGasTestResult(res);
    } catch (err: any) {
      setPoGasTestResult({ success: false, message: err.message || "Failed to connect to PO Apps Script" });
    } finally {
      setIsTestingPoGas(false);
    }
  };

  const handleTestInvAppsScript = async () => {
    if (!invoiceAppsScriptUrl.trim()) return;
    setIsTestingInvGas(true);
    setInvGasTestResult(null);
    try {
      const res = await testAppsScriptConnection(invoiceAppsScriptUrl.trim());
      setInvGasTestResult(res);
    } catch (err: any) {
      setInvGasTestResult({ success: false, message: err.message || "Failed to connect to Invoice Apps Script" });
    } finally {
      setIsTestingInvGas(false);
    }
  };

  const handleCopyPoCode = () => {
    navigator.clipboard.writeText(DEFAULT_PO_UPLOAD_APPS_SCRIPT_CODE);
    setCopiedPoCode(true);
    setTimeout(() => setCopiedPoCode(false), 2500);
  };

  const handleCopyInvCode = () => {
    navigator.clipboard.writeText(DEFAULT_INVOICE_UPLOAD_APPS_SCRIPT_CODE);
    setCopiedInvCode(true);
    setTimeout(() => setCopiedInvCode(false), 2500);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!poFolderName.trim() && !invoiceFolderName.trim()) {
      alert("Please provide at least one folder name.");
      return;
    }

    const cleanPoFolderId = extractDriveFolderId(poFolderId);
    const cleanInvFolderId = extractDriveFolderId(invoiceFolderId);
    const cleanPoGasUrl = poAppsScriptUrl.trim();
    const cleanInvGasUrl = invoiceAppsScriptUrl.trim();

    setSaving(true);
    setSaveSuccess(false);
    try {
      try {
        localStorage.setItem("sms_po_apps_script_url", cleanPoGasUrl);
        localStorage.setItem("sms_invoice_apps_script_url", cleanInvGasUrl);
      } catch {
        // ignore
      }

      const current = await getSharedDriveSettings();
      const newSettings: DriveSettings = {
        // PO Settings
        folderName: (poFolderName || "SMS_PO").trim(),
        folderId: cleanPoFolderId,
        appsScriptUrl: cleanPoGasUrl,

        // Invoice Settings
        invoiceFolderName: (invoiceFolderName || "SMS_INVOICES").trim(),
        invoiceFolderId: cleanInvFolderId,
        invoiceAppsScriptUrl: cleanInvGasUrl,

        // Common
        driveType: current?.driveType || "shared_folder",
        allowAllTeams: true,
        allowedTeamIds: [],
        adminAccessToken: current?.adminAccessToken,
        tokenExpiry: current?.tokenExpiry,
        uploadMode: "apps_script",
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
          targetName: "PO & Invoice Google Apps Script Configuration",
          details: `ADMIN ACTION: ${activeUser.name} updated PO Gateway (${cleanPoGasUrl ? "Active" : "Not Set"}, Folder: "${poFolderName}") and Invoice Gateway (${cleanInvGasUrl ? "Active" : "Not Set"}, Folder: "${invoiceFolderName}")`,
        });
      }

      setPoFolderId(cleanPoFolderId);
      setInvoiceFolderId(cleanInvFolderId);
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
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
            <Zap size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Google Drive Storage &amp; Apps Script Settings
              </h2>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                <Lock size={9} /> Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Independent Google Apps Script gateways &amp; Google Drive target folders for Customer PO attachments and Invoices.
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {poAppsScriptUrl.trim() ? (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono">
              <CheckCircle2 size={12} className="text-amber-600" />
              <span>PO Gateway Active</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-xl text-[11px] font-medium font-mono">
              <AlertCircle size={12} className="text-slate-400" />
              <span>PO Gateway Not Set</span>
            </div>
          )}

          {invoiceAppsScriptUrl.trim() ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span>Invoice Gateway Active</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-xl text-[11px] font-medium font-mono">
              <AlertCircle size={12} className="text-slate-400" />
              <span>Invoice Gateway Not Set</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-6">
        {/* ============================================================ */}
        {/* SECTION 1: CUSTOMER PO DOCUMENT UPLOAD & FOLDER SETTINGS     */}
        {/* ============================================================ */}
        <div className="p-5 bg-gradient-to-br from-amber-50/50 via-orange-50/20 to-slate-50 border border-amber-200/80 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <FileText size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                  <span>Customer PO Document Settings</span>
                  {poAppsScriptUrl.trim() && (
                    <span className="bg-amber-100 text-amber-900 text-[8.5px] font-bold px-2 py-0.5 rounded-full font-mono">
                      PO Gateway Connected
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Target folder and Google Apps Script Web App for auto-uploading Customer PO PDFs.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPoCodeModalOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold border border-amber-300 transition-colors cursor-pointer"
            >
              <Code size={13} />
              <span>PO Setup Guide &amp; Code</span>
            </button>
          </div>

          {/* PO Apps Script URL */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">
              PO Google Apps Script Web App URL
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="url"
                value={poAppsScriptUrl}
                onChange={(e) => {
                  setPoAppsScriptUrl(e.target.value);
                  setPoGasTestResult(null);
                }}
                placeholder="https://script.google.com/macros/s/AKfycb..._PO_GATEWAY/exec"
                className="flex-1 text-xs border border-slate-300 bg-white px-3 py-2.5 rounded-xl outline-none font-mono focus:ring-1 focus:ring-amber-500 shadow-2xs"
              />
              <button
                type="button"
                onClick={handleTestPoAppsScript}
                disabled={isTestingPoGas || !poAppsScriptUrl.trim()}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                title="Test connection to PO Apps Script Web App"
              >
                {isTestingPoGas ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Test PO Gateway</span>
              </button>
            </div>
            {poGasTestResult && (
              <div
                className={`text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center gap-2 mt-1.5 ${
                  poGasTestResult.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <span>{poGasTestResult.success ? "✓" : "⚠️"}</span>
                <span>{poGasTestResult.message}</span>
              </div>
            )}
          </div>

          {/* PO Target Folder Name & ID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                PO Google Drive Folder Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={poFolderName}
                onChange={(e) => setPoFolderName(e.target.value)}
                placeholder="e.g. SMS_PO"
                required
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Central storage directory name for PO files (default: <code>SMS_PO</code>).
              </p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                PO Target Folder ID or Link <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={poFolderId}
                  onChange={(e) => {
                    setPoFolderId(e.target.value);
                    setPoVerificationResult(null);
                    setPoVerificationError(null);
                  }}
                  onBlur={() => {
                    if (poFolderId && (poFolderId.includes("drive.google.com") || poFolderId.includes("folders/"))) {
                      const clean = extractDriveFolderId(poFolderId);
                      if (clean) setPoFolderId(clean);
                    }
                  }}
                  placeholder="e.g. 1ABCxyz... or Google Drive URL"
                  className="flex-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                />
                {poFolderId.trim() !== "" && (
                  <button
                    type="button"
                    onClick={handleVerifyPoFolder}
                    disabled={isVerifyingPo}
                    className="shrink-0 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {isVerifyingPo ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                    <span>Verify</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Leave blank to automatically create and use folder <code>{poFolderName || "SMS_PO"}</code>.
              </p>
            </div>
          </div>

          {poVerificationResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">PO Target Verified: {poVerificationResult.description}</p>
                <p className="text-[11px] text-emerald-700 font-mono">Folder ID: {poVerificationResult.id}</p>
              </div>
            </div>
          )}
          {poVerificationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-[11px]">{poVerificationError}</p>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* SECTION 2: INVOICE DOCUMENT UPLOAD & FOLDER SETTINGS         */}
        {/* ============================================================ */}
        <div className="p-5 bg-gradient-to-br from-emerald-50/50 via-teal-50/20 to-slate-50 border border-emerald-200/80 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Receipt size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                  <span>Invoice Document Settings</span>
                  {invoiceAppsScriptUrl.trim() && (
                    <span className="bg-emerald-100 text-emerald-900 text-[8.5px] font-bold px-2 py-0.5 rounded-full font-mono">
                      Invoice Gateway Connected
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Target folder and Google Apps Script Web App for auto-uploading Billing Invoice documents.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsInvCodeModalOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl text-xs font-bold border border-emerald-300 transition-colors cursor-pointer"
            >
              <Code size={13} />
              <span>Invoice Setup Guide &amp; Code</span>
            </button>
          </div>

          {/* Invoice Apps Script URL */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">
              Invoice Google Apps Script Web App URL
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="url"
                value={invoiceAppsScriptUrl}
                onChange={(e) => {
                  setInvoiceAppsScriptUrl(e.target.value);
                  setInvGasTestResult(null);
                }}
                placeholder="https://script.google.com/macros/s/AKfycb..._INVOICE_GATEWAY/exec"
                className="flex-1 text-xs border border-slate-300 bg-white px-3 py-2.5 rounded-xl outline-none font-mono focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
              <button
                type="button"
                onClick={handleTestInvAppsScript}
                disabled={isTestingInvGas || !invoiceAppsScriptUrl.trim()}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                title="Test connection to Invoice Apps Script Web App"
              >
                {isTestingInvGas ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Test Invoice Gateway</span>
              </button>
            </div>
            {invGasTestResult && (
              <div
                className={`text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center gap-2 mt-1.5 ${
                  invGasTestResult.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <span>{invGasTestResult.success ? "✓" : "⚠️"}</span>
                <span>{invGasTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Invoice Target Folder Name & ID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Invoice Google Drive Folder Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={invoiceFolderName}
                onChange={(e) => setInvoiceFolderName(e.target.value)}
                placeholder="e.g. SMS_INVOICES"
                required
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Central storage directory name for Invoices (default: <code>SMS_INVOICES</code>).
              </p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Invoice Target Folder ID or Link <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={invoiceFolderId}
                  onChange={(e) => {
                    setInvoiceFolderId(e.target.value);
                    setInvVerificationResult(null);
                    setInvVerificationError(null);
                  }}
                  onBlur={() => {
                    if (invoiceFolderId && (invoiceFolderId.includes("drive.google.com") || invoiceFolderId.includes("folders/"))) {
                      const clean = extractDriveFolderId(invoiceFolderId);
                      if (clean) setInvoiceFolderId(clean);
                    }
                  }}
                  placeholder="e.g. 1XYZabc... or Google Drive URL"
                  className="flex-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                />
                {invoiceFolderId.trim() !== "" && (
                  <button
                    type="button"
                    onClick={handleVerifyInvFolder}
                    disabled={isVerifyingInv}
                    className="shrink-0 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {isVerifyingInv ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                    <span>Verify</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Leave blank to automatically create and use folder <code>{invoiceFolderName || "SMS_INVOICES"}</code>.
              </p>
            </div>
          </div>

          {invVerificationResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Invoice Target Verified: {invVerificationResult.description}</p>
                <p className="text-[11px] text-emerald-700 font-mono">Folder ID: {invVerificationResult.id}</p>
              </div>
            </div>
          )}
          {invVerificationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-[11px]">{invVerificationError}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 font-medium">
            Settings are saved to Firestore database and apply immediately to all sales &amp; billing users.
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-fade-in">
                <Check size={14} /> Drive Settings Saved!
              </span>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Drive Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* PO Google Apps Script Modal */}
      {isPoCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-150 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <FileText className="text-amber-500" size={20} />
                  <span>Customer PO Apps Script Deployment Guide</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Deploy this script in Google Apps Script to handle PO uploads directly into Google Drive.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPoCodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong>Open Google Apps Script:</strong> Go to{" "}
                  <a
                    href="https://script.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-700 hover:underline font-bold inline-flex items-center gap-0.5"
                  >
                    script.google.com <ExternalLink size={11} />
                  </a>{" "}
                  and click <strong>&quot;New project&quot;</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong>Paste PO Script Code:</strong> Erase all text in{" "}
                  <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">Code.gs</code>, paste the code below, and press <strong>Save</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-emerald-50 p-2.5 rounded-xl border border-emerald-300">
                <span className="bg-emerald-700 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="text-emerald-900">Run One-Time Authorization:</strong>
                  <p className="text-slate-700 mt-0.5">
                    Select <code className="bg-emerald-200 text-emerald-900 px-1 py-0.5 rounded font-bold font-mono">setupAndAuthorize</code> in the top toolbar dropdown and click <strong>&quot;Run&quot;</strong>. Authorize Google Drive access.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <strong>Deploy as Web App:</strong> Click <strong>Deploy</strong> → <strong>New deployment</strong>.
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-700">
                    <li>Select type: <strong>&quot;Web app&quot;</strong></li>
                    <li>Execute as: <strong>&quot;Me&quot;</strong></li>
                    <li>
                      Who has access:{" "}
                      <strong className="text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded font-black">
                        Anyone
                      </strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <strong>Copy Web App URL:</strong> Copy the URL ending in <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/exec</code> and paste it into the <strong>PO Google Apps Script Web App URL</strong> field!
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  PO Apps Script Code (Code.gs)
                </label>
                <button
                  type="button"
                  onClick={handleCopyPoCode}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-amber-200"
                >
                  {copiedPoCode ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{copiedPoCode ? "Copied!" : "Copy PO Code.gs"}</span>
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                {DEFAULT_PO_UPLOAD_APPS_SCRIPT_CODE}
              </pre>
            </div>

            <div className="pt-2 border-t border-slate-150 flex justify-end">
              <button
                type="button"
                onClick={() => setIsPoCodeModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Google Apps Script Modal */}
      {isInvCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-150 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Receipt className="text-emerald-600" size={20} />
                  <span>Invoice Apps Script Deployment Guide</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Deploy this script in Google Apps Script to handle Invoice uploads directly into Google Drive.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInvCodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong>Open Google Apps Script:</strong> Go to{" "}
                  <a
                    href="https://script.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:underline font-bold inline-flex items-center gap-0.5"
                  >
                    script.google.com <ExternalLink size={11} />
                  </a>{" "}
                  and click <strong>&quot;New project&quot;</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong>Paste Invoice Script Code:</strong> Erase all text in{" "}
                  <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">Code.gs</code>, paste the code below, and press <strong>Save</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-emerald-50 p-2.5 rounded-xl border border-emerald-300">
                <span className="bg-emerald-700 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="text-emerald-900">Run One-Time Authorization:</strong>
                  <p className="text-slate-700 mt-0.5">
                    Select <code className="bg-emerald-200 text-emerald-900 px-1 py-0.5 rounded font-bold font-mono">setupAndAuthorize</code> in the top toolbar dropdown and click <strong>&quot;Run&quot;</strong>. Authorize Google Drive access.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <strong>Deploy as Web App:</strong> Click <strong>Deploy</strong> → <strong>New deployment</strong>.
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-700">
                    <li>Select type: <strong>&quot;Web app&quot;</strong></li>
                    <li>Execute as: <strong>&quot;Me&quot;</strong></li>
                    <li>
                      Who has access:{" "}
                      <strong className="text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded font-black">
                        Anyone
                      </strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <strong>Copy Web App URL:</strong> Copy the URL ending in <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/exec</code> and paste it into the <strong>Invoice Google Apps Script Web App URL</strong> field!
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Invoice Apps Script Code (Code.gs)
                </label>
                <button
                  type="button"
                  onClick={handleCopyInvCode}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-emerald-200"
                >
                  {copiedInvCode ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{copiedInvCode ? "Copied!" : "Copy Invoice Code.gs"}</span>
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                {DEFAULT_INVOICE_UPLOAD_APPS_SCRIPT_CODE}
              </pre>
            </div>

            <div className="pt-2 border-t border-slate-150 flex justify-end">
              <button
                type="button"
                onClick={() => setIsInvCodeModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
