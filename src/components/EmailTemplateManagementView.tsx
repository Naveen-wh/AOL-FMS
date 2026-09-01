import React, { useState, useEffect, useMemo } from "react";
import { EmailTemplate, Role, User, EmailSendingConfig, EmailSendingMode, SmtpCredentials, EmailLimitsConfig, EmailDailyCounts } from "../types";
import { saveEmailTemplate, deleteEmailTemplateDoc, saveLog, getEmailSendingConfig, saveEmailSendingConfig, getEmailLimitsConfig, saveEmailLimitsConfig, getEmailDailyCounts, saveEmailSentLog } from "../lib/firebaseService";
import { auth } from "../firebase";
import { TEMPLATE_VARIABLE_GROUPS, replaceTemplateVars, getSampleTemplateContext } from "../lib/templateUtils";
import { Plus, Trash2, Edit2, Copy, Check, Info, Tag, Mail, Server, UserCheck, ShieldCheck, Send, AlertCircle, RefreshCw, Key, Settings, X, CheckCircle2, Lock, Eye, EyeOff, Loader2, Code, FileText, ExternalLink, HelpCircle, Sparkles } from "lucide-react";
import InlineDeleteConfirm from "./InlineDeleteConfirm";
import RichTextEditor from "./RichTextEditor";

interface EmailTemplateManagementViewProps {
  templates: EmailTemplate[];
  isAdmin: boolean;
  activeUser: User;
  users?: User[];
}

export default function EmailTemplateManagementView({ templates, isAdmin, activeUser, users = [] }: EmailTemplateManagementViewProps) {
  const [mainTab, setMainTab] = useState<"templates" | "sending_settings">("templates");
  
  // Template editing states
  const [isAdding, setIsAdding] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [assignedForm, setAssignedForm] = useState<"create_order" | "edit_order" | "invoice_issuance" | "payment_reminder" | "payment_reminder_consolidated" | "any">("any");

  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Email Sending Configuration state
  const [sendingConfig, setSendingConfig] = useState<EmailSendingConfig>({
    mode: "single_setted_id",
    singleConfig: { smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", fromName: "", secure: false },
    userConfigs: {},
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // User SMTP edit modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUserForSmtp, setSelectedUserForSmtp] = useState<User | null>(null);
  const [userSmtpForm, setUserSmtpForm] = useState<SmtpCredentials>({
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    fromName: "",
    secure: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showSinglePassword, setShowSinglePassword] = useState(false);

  // Test email modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testTargetConfig, setTestTargetConfig] = useState<{ name: string; credentials?: SmtpCredentials; gasWebUrl?: string } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Google Apps Script Modal Guide
  const [showGasGuideModal, setShowGasGuideModal] = useState(false);
  const [copiedGasScript, setCopiedGasScript] = useState(false);

  // User table search filter
  const [userSearchTerm, setUserSearchTerm] = useState("");

  // Email limits states
  const [limitsConfig, setLimitsConfig] = useState<EmailLimitsConfig>({
    create_order: 50,
    edit_order: 50,
    invoice_issuance: 30,
    payment_reminder: 100,
    payment_reminder_consolidated: 100,
  });
  const [dailyCounts, setDailyCounts] = useState<EmailDailyCounts>({
    create_order: 0,
    edit_order: 0,
    invoice_issuance: 0,
    payment_reminder: 0,
    payment_reminder_consolidated: 0,
  });
  const [isSavingLimits, setIsSavingLimits] = useState(false);
  const [isLoadingLimits, setIsLoadingLimits] = useState(false);

  // Live Email Preview Modal States
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    name: string;
    subject: string;
    body: string;
    to: string;
    cc: string;
    bcc: string;
    assignedForm: string;
  } | null>(null);
  const [previewViewMode, setPreviewViewMode] = useState<"html" | "plain">("html");
  const [previewTestEmail, setPreviewTestEmail] = useState("");
  const [isSendingPreviewTest, setIsSendingPreviewTest] = useState(false);
  const [previewTestStatus, setPreviewTestStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleOpenLivePreview = (tmpl: {
    name: string;
    subject: string;
    body: string;
    to: string;
    cc: string;
    bcc: string;
    assignedForm: string;
  }) => {
    setPreviewData(tmpl);
    setPreviewViewMode("html");
    setPreviewTestEmail(activeUser?.email || "");
    setPreviewTestStatus(null);
    setLivePreviewOpen(true);
  };

  useEffect(() => {
    if (isAdmin && mainTab === "sending_settings") {
      setIsLoadingLimits(true);
      
      // Fetch limits config
      getEmailLimitsConfig()
        .then((cfg) => {
          setLimitsConfig(cfg);
        })
        .catch(console.error);

      // Fetch today's counts (Asia/Kolkata timezone)
      const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const todayStr = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
      getEmailDailyCounts(todayStr)
        .then((counts) => {
          setDailyCounts(counts);
        })
        .catch(console.error)
        .finally(() => setIsLoadingLimits(false));
    }
  }, [isAdmin, mainTab]);

  const handleSaveLimits = async () => {
    setIsSavingLimits(true);
    try {
      await saveEmailLimitsConfig(limitsConfig);
      await saveLog({
        id: `log-limits-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Sending Mode",
        targetType: "Settings",
        targetId: "email_limits_config",
        targetName: "Daily Email Sending Limits",
        details: `Updated daily event email limits - Create Order: ${limitsConfig.create_order}, Edit Order: ${limitsConfig.edit_order}, Invoice Issuance: ${limitsConfig.invoice_issuance}, Payment Reminder: ${limitsConfig.payment_reminder}, Consolidated Payment: ${limitsConfig.payment_reminder_consolidated}`
      });
      setStatusMessage({ type: "success", text: "Daily email sending limits successfully updated in the system!" });
      
      // Clear status after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: `Failed to save daily limits: ${err.message}` });
    } finally {
      setIsSavingLimits(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      setIsLoadingConfig(true);
      getEmailSendingConfig()
        .then((cfg) => {
          setSendingConfig({
            mode: cfg.mode || "single_setted_id",
            gasWebUrl: cfg.gasWebUrl || "",
            singleConfig: cfg.singleConfig || { smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", fromName: "", secure: false },
            userConfigs: cfg.userConfigs || {},
            updatedAt: cfg.updatedAt,
            updatedBy: cfg.updatedBy,
          });
        })
        .finally(() => setIsLoadingConfig(false));
    }
  }, [isAdmin]);

  const resetTemplateForm = () => {
    setName("");
    setSubject("");
    setBody("");
    setTo("");
    setCc("");
    setBcc("");
    setIsDefault(false);
    setAssignedForm("any");
    setEditingTemplate(null);
    setIsAdding(false);
    setActiveGroupFilter("all");
  };

  const handleCopyVariable = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleInsertVariableToBody = (key: string) => {
    setBody((prev) => prev + ` ${key} `);
  };

  const handleSaveTemplate = async () => {
    if (!isAdmin || !name || !subject || !body) return;
    
    if (isDefault) {
      for (const tmpl of templates) {
        if (tmpl.isDefault && tmpl.id !== editingTemplate?.id) {
          await saveEmailTemplate({ ...tmpl, isDefault: false });
        }
      }
    }

    const isEdit = !!editingTemplate;
    const template: EmailTemplate = {
      id: editingTemplate?.id || `tmpl-${Date.now()}`,
      name,
      subject,
      body,
      to: to.trim() || undefined,
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      createdAt: editingTemplate?.createdAt || new Date().toISOString(),
      isDefault,
      assignedForm: assignedForm === "any" ? undefined : assignedForm,
    };
    await saveEmailTemplate(template);

    await saveLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.name,
      actionType: isEdit ? "Update Email Template" : "Create Email Template",
      targetType: "EmailTemplate",
      targetId: template.id,
      targetName: template.name,
      details: `${activeUser.name} ${isEdit ? "updated" : "created"} email template "${template.name}" with subject "${template.subject}"`
    });

    resetTemplateForm();
  };

  // Save Email Sending Mode or Single Config
  const handleSaveMode = async (newMode: EmailSendingMode) => {
    const updated: EmailSendingConfig = {
      ...sendingConfig,
      mode: newMode,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };
    setSendingConfig(updated);
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Sending Mode",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: "Email Sending Settings",
        details: `${activeUser.name} changed email sending mode to "${newMode === "single_setted_id" ? "Single Setted ID" : "Logged In User ID"}"`
      });
      setStatusMessage({ type: "success", text: `Email sending mode updated to "${newMode === "single_setted_id" ? "Single Setted ID" : "Logged In User ID"}"` });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save email mode: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveSingleConfig = async () => {
    const updated: EmailSendingConfig = {
      ...sendingConfig,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Single Setted ID Config",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: "Single Setted ID SMTP",
        details: `${activeUser.name} updated Single Setted ID SMTP config (${sendingConfig.singleConfig?.smtpUser || "N/A"})`
      });
      setStatusMessage({ type: "success", text: "Single Setted ID SMTP configuration saved successfully!" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save single SMTP config: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Open User SMTP Modal
  const handleOpenUserSmtpModal = (u: User) => {
    setSelectedUserForSmtp(u);
    const existing = sendingConfig.userConfigs?.[u.id] || {};
    setUserSmtpForm({
      smtpHost: existing.smtpHost || "",
      smtpPort: existing.smtpPort || 587,
      smtpUser: existing.smtpUser || u.email || "",
      smtpPass: existing.smtpPass || "",
      fromName: existing.fromName || u.name || "",
      secure: existing.secure || false,
    });
    setUserModalOpen(true);
  };

  const handleSaveUserSmtp = async () => {
    if (!selectedUserForSmtp) return;
    const updatedUserConfigs = {
      ...(sendingConfig.userConfigs || {}),
      [selectedUserForSmtp.id]: { ...userSmtpForm },
    };

    const updated: EmailSendingConfig = {
      ...sendingConfig,
      userConfigs: updatedUserConfigs,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };

    setSendingConfig(updated);
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update User SMTP Credentials",
        targetType: "User",
        targetId: selectedUserForSmtp.id,
        targetName: selectedUserForSmtp.name,
        details: `${activeUser.name} updated SMTP credentials for user "${selectedUserForSmtp.name}" (${selectedUserForSmtp.email})`
      });
      setUserModalOpen(false);
      setStatusMessage({ type: "success", text: `SMTP credentials saved for user ${selectedUserForSmtp.name}!` });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save user SMTP: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleRemoveUserSmtp = async (userId: string, userName: string) => {
    const updatedUserConfigs = { ...(sendingConfig.userConfigs || {}) };
    delete updatedUserConfigs[userId];

    const updated: EmailSendingConfig = {
      ...sendingConfig,
      userConfigs: updatedUserConfigs,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };

    setSendingConfig(updated);
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Remove User SMTP Credentials",
        targetType: "User",
        targetId: userId,
        targetName: userName,
        details: `${activeUser.name} removed custom SMTP credentials for user "${userName}"`
      });
      setStatusMessage({ type: "success", text: `Removed custom SMTP credentials for ${userName}` });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to remove user SMTP: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Test Email Runner
  const handleOpenTestModal = (targetName: string, creds?: SmtpCredentials, gasUrl?: string) => {
    setTestTargetConfig({ name: targetName, credentials: creds, gasWebUrl: gasUrl });
    setTestRecipientEmail(activeUser.email || "");
    setTestResult(null);
    setTestModalOpen(true);
  };

  const handleRunTestEmail = async () => {
    if (!testTargetConfig || !testRecipientEmail) return;
    setIsSendingTest(true);
    setTestResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/test-email-config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken || ""}`
        },
        body: JSON.stringify({
          gasWebUrl: testTargetConfig.gasWebUrl,
          smtpHost: testTargetConfig.credentials?.smtpHost,
          smtpPort: testTargetConfig.credentials?.smtpPort,
          smtpUser: testTargetConfig.credentials?.smtpUser,
          smtpPass: testTargetConfig.credentials?.smtpPass,
          fromName: testTargetConfig.credentials?.fromName,
          secure: testTargetConfig.credentials?.secure,
          testRecipient: testRecipientEmail,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === "success") {
        setTestResult({ type: "success", text: data.message || `Test email successfully delivered to ${testRecipientEmail}!` });
      } else {
        setTestResult({ type: "error", text: data.message || "Failed to send test email" });
      }
    } catch (err: any) {
      setTestResult({ type: "error", text: err.message || "Network error connecting to test email server" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveGasConfig = async () => {
    const updated: EmailSendingConfig = {
      ...sendingConfig,
      mode: "google_apps_script",
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };
    setSendingConfig(updated);
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Config",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: "Google Apps Script Web App",
        details: `${activeUser.name} updated Google Apps Script Web App URL (${sendingConfig.gasWebUrl || "N/A"})`
      });
      setStatusMessage({ type: "success", text: "Google Apps Script Web App configuration saved successfully!" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save Google Apps Script URL: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const filteredGroups = TEMPLATE_VARIABLE_GROUPS.filter((group) => {
    if (activeGroupFilter !== "all" && group.id !== activeGroupFilter) {
      return false;
    }
    return true;
  });

  const allVariablesFlat = useMemo(() => {
    return Array.from(new Set(TEMPLATE_VARIABLE_GROUPS.flatMap((g) => g.variables.map((v) => v.key))));
  }, []);

  const filteredUsers = users.filter((u) => {
    if (!userSearchTerm) return true;
    const term = userSearchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.teamName || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="text-indigo-600" size={22} /> Email Center & Notifications
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage automated email templates, event placeholders, and configure SMTP email sending options (Single Setted ID or Logged-in User ID)
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMainTab("templates")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mainTab === "templates"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Mail size={14} /> Templates ({templates.length})
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setMainTab("sending_settings")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mainTab === "sending_settings"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Settings size={14} /> Email Sending Options
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className={`p-3.5 rounded-xl mb-4 text-xs font-semibold flex items-center justify-between ${
          statusMessage.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: EMAIL TEMPLATES MANAGEMENT */}
      {mainTab === "templates" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Email Notification Templates</h3>
              <p className="text-xs text-slate-500">Configure email layout, subjects, dynamic placeholders, and auto-recipients</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setIsAdding(true);
                  setEditingTemplate(null);
                  setName("");
                  setSubject("");
                  setBody("");
                  setTo("");
                  setCc("");
                  setBcc("");
                  setAssignedForm("any");
                  setActiveGroupFilter("all");
                }}
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 cursor-pointer shadow-2xs transition-colors"
              >
                <Plus size={16} /> Add Template
              </button>
            )}
          </div>
          
          {(isAdding || editingTemplate) && (
            <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Template Name</label>
                  <input
                    placeholder="e.g. Standard Invoice Issuance Template"
                    className="w-full p-2.5 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assign to Specific Form / Event</label>
                  <select
                    className="w-full p-2.5 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold"
                    value={assignedForm}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setAssignedForm(val);
                    }}
                  >
                    <option value="any">🌐 Any Form / Event (Default Global Fallback)</option>
                    <option value="create_order">📋 Create Order & Offer Form</option>
                    <option value="edit_order">✏️ Edit Order & Offer Form</option>
                    <option value="invoice_issuance">🧾 Invoice Issuance Form</option>
                    <option value="payment_reminder">💰 Payment Reminder Form</option>
                    <option value="payment_reminder_consolidated">📊 Consolidated Payment Reminder Form</option>
                  </select>
                </div>
              </div>

              {/* Form-wise & Event-wise Available Variables Explorer Panel */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag size={13} className="text-indigo-600" /> Form & Event Variables Library
                    </h3>
                    <p className="text-[11px] text-slate-500">Click any variable tag to insert into email body or click copy icon</p>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveGroupFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-[11px] whitespace-nowrap ${
                        activeGroupFilter === "all"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      All Categories
                    </button>
                    {TEMPLATE_VARIABLE_GROUPS.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveGroupFilter(group.id)}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-[11px] whitespace-nowrap ${
                          activeGroupFilter === group.id
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {filteredGroups.map((group) => (
                    <div key={group.id} className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800 font-mono">{group.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{group.description}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {group.variables.map((v) => (
                          <div
                            key={`${group.id}-${v.key}`}
                            onClick={() => handleInsertVariableToBody(v.key)}
                            className="bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group relative flex flex-col justify-between"
                            title="Click to insert variable into Email Body"
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                {v.key}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyVariable(v.key);
                                }}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors"
                                title="Copy variable key"
                              >
                                {copiedKey === v.key ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                              </button>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-800">{v.label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{v.description}</div>
                            <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">e.g. {v.sampleValue}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-2 text-[11px] text-indigo-800 flex items-start gap-1.5">
                  <Info size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Event Hierarchy Note:</strong> <code className="bg-white px-1 rounded border border-indigo-200">{"{{creatorName}}"}</code>, <code className="bg-white px-1 rounded border border-indigo-200">{"{{creatorPhone}}"}</code>, and <code className="bg-white px-1 rounded border border-indigo-200">{"{{creatorEmail}}"}</code> represent the logged-in user who triggered the event.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Subject</label>
                <input
                  placeholder="e.g. Order Confirmation #{{recordId}} for {{clientName}} - {{companyName}}"
                  className="w-full p-2.5 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">To (Placeholders / Emails)</label>
                  <input
                    placeholder="e.g. {{email}}, {{assignedToEmail}}"
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">CC</label>
                  <input
                    placeholder="e.g. {{teamLeadEmail}}, {{creatorEmail}}"
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">BCC</label>
                  <input
                    placeholder="e.g. {{managerEmail}}, archive@company.com"
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Body (Rich Text)</label>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <Sparkles size={11} /> Auto-Send Format: HTML View
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenLivePreview({
                        name: name || "Draft Template",
                        subject: subject || "No Subject",
                        body: body,
                        to: to,
                        cc: cc,
                        bcc: bcc,
                        assignedForm: assignedForm,
                      });
                    }}
                    className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Eye size={13} /> Live Preview Draft
                  </button>
                </div>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Design your email body here... Select text to apply colors, bold styles, or custom fonts!"
                  availableVariables={allVariablesFlat}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    id="is-default-template"
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="is-default-template" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Set as Default Template for this Form / Event
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenLivePreview({
                        name: name || "Draft Template",
                        subject: subject || "No Subject",
                        body: body,
                        to: to,
                        cc: cc,
                        bcc: bcc,
                        assignedForm: assignedForm,
                      });
                    }}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye size={14} /> Preview Email
                  </button>
                  <button
                    type="button"
                    onClick={resetTemplateForm}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                  >
                    Save Email Template
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="flex justify-between items-start p-3.5 border border-slate-200 rounded-xl bg-white shadow-2xs hover:border-indigo-200 transition-all">
                <div className="flex-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                    {tmpl.name}
                    {tmpl.isDefault && <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] px-1.5 py-0.5 rounded-full font-semibold">Default</span>}
                    {tmpl.assignedForm && tmpl.assignedForm !== "any" && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] px-1.5 py-0.5 rounded-full font-semibold">
                        {tmpl.assignedForm === "create_order" && "Create Order Form"}
                        {tmpl.assignedForm === "edit_order" && "Edit Order Form"}
                        {tmpl.assignedForm === "invoice_issuance" && "Invoice Form"}
                        {tmpl.assignedForm === "payment_reminder" && "Payment Reminder Form"}
                        {tmpl.assignedForm === "payment_reminder_consolidated" && "Consolidated Payment Reminder Form"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1"><span className="font-semibold text-slate-600">Subject:</span> {tmpl.subject}</div>
                  {(tmpl.to || tmpl.cc || tmpl.bcc) && (
                    <div className="text-[10px] text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      {tmpl.to && <span><strong>To:</strong> {tmpl.to}</span>}
                      {tmpl.cc && <span><strong>CC:</strong> {tmpl.cc}</span>}
                      {tmpl.bcc && <span><strong>BCC:</strong> {tmpl.bcc}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      handleOpenLivePreview({
                        name: tmpl.name,
                        subject: tmpl.subject,
                        body: tmpl.body,
                        to: tmpl.to || "",
                        cc: tmpl.cc || "",
                        bcc: tmpl.bcc || "",
                        assignedForm: tmpl.assignedForm || "any",
                      });
                    }}
                    className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    title="Live Preview Template with Sample Data"
                  >
                    <Eye size={13} /> Live Preview
                  </button>

                  {isAdmin && (
                    <>
                      <button onClick={() => {
                        setEditingTemplate(tmpl);
                        setName(tmpl.name);
                        setSubject(tmpl.subject);
                        setBody(tmpl.body);
                        setTo(tmpl.to || "");
                        setCc(tmpl.cc || "");
                        setBcc(tmpl.bcc || "");
                        setIsDefault(tmpl.isDefault || false);
                        setAssignedForm(tmpl.assignedForm || "any");
                        setIsAdding(true);
                      }} className="text-slate-500 hover:text-indigo-600 p-1.5 rounded-lg border border-slate-200 hover:border-indigo-200 hover:bg-slate-50 transition-colors cursor-pointer" title="Edit Template"><Edit2 size={15} /></button>
                      <InlineDeleteConfirm
                        id={`delete-template-${tmpl.id}`}
                        title="Delete template"
                        onConfirm={async () => {
                          await deleteEmailTemplateDoc(tmpl.id);
                          await saveLog({
                            id: `log-${Date.now()}`,
                            timestamp: new Date().toISOString(),
                            userId: activeUser.id,
                            userName: activeUser.name,
                            actionType: "Delete Email Template",
                            targetType: "EmailTemplate",
                            targetId: tmpl.id,
                            targetName: tmpl.name,
                            details: `${activeUser.name} deleted email template "${tmpl.name}"`
                          });
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: EMAIL SENDER & SMTP CONFIGURATION (ADMIN ONLY) */}
      {mainTab === "sending_settings" && isAdmin && (
        <div className="space-y-6">
          {/* Mode Selection Heading & Interactive Selector */}
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server size={18} className="text-indigo-600" /> Outgoing Email Sending Option
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select how outgoing system emails should be dispatched: via Google Apps Script Web App (Recommended), Single Setted ID, or Individual Logged-In User Credentials.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Option 1: Google Apps Script Web App */}
            <div
              onClick={() => handleSaveMode("google_apps_script")}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                sendingConfig.mode === "google_apps_script"
                  ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${sendingConfig.mode === "google_apps_script" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Code size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      Google Apps Script
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold">Recommended</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">Google Workspace Email Gateway</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="email_sending_mode"
                  checked={sendingConfig.mode === "google_apps_script"}
                  onChange={() => handleSaveMode("google_apps_script")}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 mt-1 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Dispatches emails via a <strong>Google Apps Script Web App</strong> URL using your authenticated Google Workspace or Gmail account. No SMTP passwords required!
              </p>
              {sendingConfig.mode === "google_apps_script" && (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md inline-flex items-center gap-1 w-fit">
                  <CheckCircle2 size={12} /> Currently Active Mode
                </div>
              )}
            </div>

            {/* Option 2: Single Setted ID */}
            <div
              onClick={() => handleSaveMode("single_setted_id")}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                sendingConfig.mode === "single_setted_id"
                  ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${sendingConfig.mode === "single_setted_id" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Server size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Single Setted ID</h4>
                    <p className="text-[11px] text-slate-500">Global Centralized SMTP Account</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="email_sending_mode"
                  checked={sendingConfig.mode === "single_setted_id"}
                  onChange={() => handleSaveMode("single_setted_id")}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 mt-1 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-600 mt-3">
                All outgoing system emails will be sent using a <strong>single centralized SMTP credential set</strong> configured below.
              </p>
              {sendingConfig.mode === "single_setted_id" && (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-md inline-flex items-center gap-1 w-fit">
                  <CheckCircle2 size={12} /> Currently Active Mode
                </div>
              )}
            </div>

            {/* Option 3: Logged In User ID */}
            <div
              onClick={() => handleSaveMode("logged_in_user_id")}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                sendingConfig.mode === "logged_in_user_id"
                  ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${sendingConfig.mode === "logged_in_user_id" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Logged In User ID</h4>
                    <p className="text-[11px] text-slate-500">Per-User Email Credentials</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="email_sending_mode"
                  checked={sendingConfig.mode === "logged_in_user_id"}
                  onChange={() => handleSaveMode("logged_in_user_id")}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 mt-1 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Emails will be dispatched using the <strong>logged-in user's individual SMTP credentials</strong>.
              </p>
              {sendingConfig.mode === "logged_in_user_id" && (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-md inline-flex items-center gap-1 w-fit">
                  <CheckCircle2 size={12} /> Currently Active Mode
                </div>
              )}
            </div>
          </div>

          {/* GOOGLE APPS SCRIPT CONFIGURATION PANEL */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Code size={16} className="text-emerald-700" /> Google Apps Script Web App Integration
                </h4>
                <p className="text-xs text-slate-600">
                  Enter your deployed Google Apps Script Web App URL to send emails directly via Gmail without SMTP server configuration.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGasGuideModal(true)}
                  className="flex items-center gap-1.5 bg-white border border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100/50 cursor-pointer transition-colors shadow-2xs"
                >
                  <FileText size={13} className="text-emerald-700" /> View Apps Script Code & Setup Steps
                </button>
                {sendingConfig.gasWebUrl && (
                  <button
                    type="button"
                    onClick={() => handleOpenTestModal("Google Apps Script Web App", undefined, sendingConfig.gasWebUrl)}
                    className="flex items-center gap-1.5 bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Send size={13} /> Test Apps Script Email
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                Google Apps Script Web App URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="flex-1 p-2.5 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800"
                  value={sendingConfig.gasWebUrl || ""}
                  onChange={(e) =>
                    setSendingConfig({
                      ...sendingConfig,
                      gasWebUrl: e.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  onClick={handleSaveGasConfig}
                  disabled={isSavingConfig}
                  className="flex items-center justify-center gap-1.5 bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-800 cursor-pointer transition-colors shadow-2xs disabled:opacity-50 shrink-0"
                >
                  {isSavingConfig ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save Apps Script URL
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Form 1: Single Setted ID Settings */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Server size={16} className="text-indigo-600" /> Single Setted ID SMTP Configuration
                </h4>
                <p className="text-xs text-slate-500">
                  Configure global SMTP host, port, username, and password for centralized email dispatch
                </p>
              </div>
              {sendingConfig.singleConfig?.smtpHost && (
                <button
                  type="button"
                  onClick={() => handleOpenTestModal("Single Setted ID SMTP", sendingConfig.singleConfig || {})}
                  className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 cursor-pointer transition-colors shadow-2xs"
                >
                  <Send size={13} /> Test Single SMTP Email
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Host Server</label>
                <input
                  type="text"
                  placeholder="e.g. smtp.gmail.com or mail.company.com"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={sendingConfig.singleConfig?.smtpHost || ""}
                  onChange={(e) =>
                    setSendingConfig({
                      ...sendingConfig,
                      singleConfig: { ...(sendingConfig.singleConfig || {}), smtpHost: e.target.value },
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Port</label>
                <input
                  type="number"
                  placeholder="587 or 465"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={sendingConfig.singleConfig?.smtpPort || 587}
                  onChange={(e) => {
                    const portNum = Number(e.target.value);
                    setSendingConfig({
                      ...sendingConfig,
                      singleConfig: {
                        ...(sendingConfig.singleConfig || {}),
                        smtpPort: portNum,
                        secure: portNum === 465,
                      },
                    });
                  }}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Display Sender Name</label>
                <input
                  type="text"
                  placeholder="e.g. Aroma Organic Sales Team"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={sendingConfig.singleConfig?.fromName || ""}
                  onChange={(e) =>
                    setSendingConfig({
                      ...sendingConfig,
                      singleConfig: { ...(sendingConfig.singleConfig || {}), fromName: e.target.value },
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Account Email / Username</label>
                <input
                  type="email"
                  placeholder="e.g. sales@aromaorganic.in"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={sendingConfig.singleConfig?.smtpUser || ""}
                  onChange={(e) =>
                    setSendingConfig({
                      ...sendingConfig,
                      singleConfig: { ...(sendingConfig.singleConfig || {}), smtpUser: e.target.value },
                    })
                  }
                />
              </div>

              <div className="relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Account Password / App Pass</label>
                <div className="relative">
                  <input
                    type={showSinglePassword ? "text" : "password"}
                    placeholder="Enter SMTP password or app key"
                    className="w-full p-2.5 pr-9 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    value={sendingConfig.singleConfig?.smtpPass || ""}
                    onChange={(e) =>
                      setSendingConfig({
                        ...sendingConfig,
                        singleConfig: { ...(sendingConfig.singleConfig || {}), smtpPass: e.target.value },
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowSinglePassword(!showSinglePassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSinglePassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="single_smtp_secure"
                  checked={sendingConfig.singleConfig?.secure || false}
                  onChange={(e) =>
                    setSendingConfig({
                      ...sendingConfig,
                      singleConfig: {
                        ...(sendingConfig.singleConfig || {}),
                        secure: e.target.checked,
                        smtpPort: e.target.checked ? 465 : (sendingConfig.singleConfig?.smtpPort === 465 ? 587 : (sendingConfig.singleConfig?.smtpPort || 587)),
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="single_smtp_secure" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Direct SSL/TLS (Port 465) / STARTTLS (Port 587)
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSingleConfig}
                disabled={isSavingConfig}
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
              >
                {isSavingConfig ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save Single Setted ID Config
              </button>
            </div>
          </div>

          {/* Configuration Table 2: Logged In User Email Credentials Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <UserCheck size={16} className="text-indigo-600" /> Logged In User Credentials Matrix
                </h4>
                <p className="text-xs text-slate-500">
                  Configure custom SMTP login credentials for each user. Active when "Logged In User ID" mode is selected.
                </p>
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search user by name, email..."
                  className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-150">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">User Details</th>
                    <th className="p-3">Role & Team</th>
                    <th className="p-3">Configured SMTP Credentials</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 italic text-xs">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const userSmtp = sendingConfig.userConfigs?.[u.id];
                      const isConfigured = !!(userSmtp?.smtpHost && userSmtp?.smtpUser);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{u.name}</div>
                            <div className="text-[11px] text-slate-500">{u.email}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-700 capitalize">{u.role}</div>
                            <div className="text-[10px] text-slate-400">{u.teamName || "No Team"}</div>
                          </td>
                          <td className="p-3">
                            {isConfigured ? (
                              <div>
                                <div className="font-mono text-xs font-semibold text-indigo-700">{userSmtp.smtpUser}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {userSmtp.smtpHost}:{userSmtp.smtpPort} {userSmtp.fromName ? `(${userSmtp.fromName})` : ""}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Not configured (Uses fallback)</span>
                            )}
                          </td>
                          <td className="p-3">
                            {isConfigured ? (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1">
                                <Check size={11} /> Configured
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                Unconfigured
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenUserSmtpModal(u)}
                                className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-indigo-200"
                              >
                                <Edit2 size={13} /> {isConfigured ? "Edit SMTP" : "Configure SMTP"}
                              </button>
                              {isConfigured && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenTestModal(`${u.name}'s SMTP`, userSmtp)}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                    title="Test user SMTP email"
                                  >
                                    <Send size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUserSmtp(u.id, u.name)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Remove custom credentials"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Email Limits & Abuse Control Panel */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-indigo-600" /> Daily Email Limits & Abuse Control
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configure real-time backend safety constraints to restrict bulk sending, avoid spam-triggering, and guard your company domain's sender reputation.
                </p>
              </div>
              <button
                onClick={handleSaveLimits}
                disabled={isSavingLimits}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                {isSavingLimits ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Settings size={14} /> Update Limits
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Event 1: Create Order & Offer */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Create Order / Offer</span>
                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {dailyCounts.create_order} / {limitsConfig.create_order} Sent
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-500" 
                        style={{ width: `${Math.min(100, (dailyCounts.create_order / (limitsConfig.create_order || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                      <span>Today's usage</span>
                      <span>{Math.round((dailyCounts.create_order / (limitsConfig.create_order || 1)) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-600">Daily Limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={limitsConfig.create_order}
                      onChange={(e) => setLimitsConfig(prev => ({ ...prev, create_order: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">/ day</span>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-400">Restricts automated loop creation on new entries.</p>
                </div>
              </div>

              {/* Event 2: Edit Order & Offer */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Edit Order / Offer</span>
                    <span className="text-[10px] font-mono font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                      {dailyCounts.edit_order} / {limitsConfig.edit_order} Sent
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-violet-600 transition-all duration-500" 
                        style={{ width: `${Math.min(100, (dailyCounts.edit_order / (limitsConfig.edit_order || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                      <span>Today's usage</span>
                      <span>{Math.round((dailyCounts.edit_order / (limitsConfig.edit_order || 1)) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-600">Daily Limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={limitsConfig.edit_order}
                      onChange={(e) => setLimitsConfig(prev => ({ ...prev, edit_order: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium font-mono text-slate-800 focus:outline-none focus:border-violet-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">/ day</span>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-400">Throttles emails generated on rapid order updates.</p>
                </div>
              </div>

              {/* Event 3: Invoice Issuance */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice Issuance</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {dailyCounts.invoice_issuance} / {limitsConfig.invoice_issuance} Sent
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-600 transition-all duration-500" 
                        style={{ width: `${Math.min(100, (dailyCounts.invoice_issuance / (limitsConfig.invoice_issuance || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                      <span>Today's usage</span>
                      <span>{Math.round((dailyCounts.invoice_issuance / (limitsConfig.invoice_issuance || 1)) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-600">Daily Limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={limitsConfig.invoice_issuance}
                      onChange={(e) => setLimitsConfig(prev => ({ ...prev, invoice_issuance: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">/ day</span>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-400">Regulates billing, dispatch notes, & formal invoice dispatches.</p>
                </div>
              </div>

              {/* Event 4: Payment Reminder */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Reminder</span>
                    <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      {dailyCounts.payment_reminder} / {limitsConfig.payment_reminder} Sent
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-rose-600 transition-all duration-500" 
                        style={{ width: `${Math.min(100, (dailyCounts.payment_reminder / (limitsConfig.payment_reminder || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                      <span>Today's usage</span>
                      <span>{Math.round((dailyCounts.payment_reminder / (limitsConfig.payment_reminder || 1)) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-600">Daily Limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={limitsConfig.payment_reminder}
                      onChange={(e) => setLimitsConfig(prev => ({ ...prev, payment_reminder: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium font-mono text-slate-800 focus:outline-none focus:border-rose-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">/ day</span>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-400">Guards single-invoice reminders against spamming recipients.</p>
                </div>
              </div>

              {/* Event 5: Consolidated Payment Reminder */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Consolidated Remind</span>
                    <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      {dailyCounts.payment_reminder_consolidated} / {limitsConfig.payment_reminder_consolidated} Sent
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-600 transition-all duration-500" 
                        style={{ width: `${Math.min(100, (dailyCounts.payment_reminder_consolidated / (limitsConfig.payment_reminder_consolidated || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                      <span>Today's usage</span>
                      <span>{Math.round((dailyCounts.payment_reminder_consolidated / (limitsConfig.payment_reminder_consolidated || 1)) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-600">Daily Limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={limitsConfig.payment_reminder_consolidated}
                      onChange={(e) => setLimitsConfig(prev => ({ ...prev, payment_reminder_consolidated: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium font-mono text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">/ day</span>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-400">Enforces bulk outstanding overview limits for company accounts.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: USER SMTP CREDENTIALS EDIT MODAL */}
      {userModalOpen && selectedUserForSmtp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Key className="text-indigo-600" size={18} /> Configure User SMTP Credentials
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedUserForSmtp.name} ({selectedUserForSmtp.email})
                </p>
              </div>
              <button
                onClick={() => setUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Display Sender Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe (Sales Lead)"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={userSmtpForm.fromName || ""}
                  onChange={(e) => setUserSmtpForm({ ...userSmtpForm, fromName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Host Server</label>
                <input
                  type="text"
                  placeholder="e.g. smtp.gmail.com"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={userSmtpForm.smtpHost || ""}
                  onChange={(e) => setUserSmtpForm({ ...userSmtpForm, smtpHost: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Port</label>
                <input
                  type="number"
                  placeholder="587 or 465"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={userSmtpForm.smtpPort || 587}
                  onChange={(e) => {
                    const portNum = Number(e.target.value);
                    setUserSmtpForm({
                      ...userSmtpForm,
                      smtpPort: portNum,
                      secure: portNum === 465,
                    });
                  }}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Email / Username</label>
                <input
                  type="email"
                  placeholder="e.g. john@aromaorganic.in"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={userSmtpForm.smtpUser || ""}
                  onChange={(e) => setUserSmtpForm({ ...userSmtpForm, smtpUser: e.target.value })}
                />
              </div>

              <div className="relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SMTP Password / App Key</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter SMTP password"
                    className="w-full p-2.5 pr-9 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    value={userSmtpForm.smtpPass || ""}
                    onChange={(e) => setUserSmtpForm({ ...userSmtpForm, smtpPass: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user_smtp_secure"
                  checked={userSmtpForm.secure || false}
                  onChange={(e) => {
                    setUserSmtpForm({
                      ...userSmtpForm,
                      secure: e.target.checked,
                      smtpPort: e.target.checked ? 465 : (userSmtpForm.smtpPort === 465 ? 587 : (userSmtpForm.smtpPort || 587)),
                    });
                  }}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="user_smtp_secure" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Direct SSL/TLS (Port 465) / STARTTLS (Port 587)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUserSmtp}
                disabled={isSavingConfig}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingConfig ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save User Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TEST EMAIL MODAL */}
      {testModalOpen && testTargetConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Send className="text-emerald-600" size={18} /> Test Email Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Target: <strong>{testTargetConfig.name}</strong>{" "}
                  {testTargetConfig.credentials?.smtpUser ? `(${testTargetConfig.credentials.smtpUser})` : testTargetConfig.gasWebUrl ? `(Google Apps Script)` : ""}
                </p>
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Recipient Test Email</label>
              <input
                type="email"
                placeholder="Enter email to receive test message"
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                value={testRecipientEmail}
                onChange={(e) => setTestRecipientEmail(e.target.value)}
              />
            </div>

            {testResult && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                testResult.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}>
                {testResult.type === "success" ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                <div>{testResult.text}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRunTestEmail}
                disabled={isSendingTest || !testRecipientEmail}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSendingTest ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send Test Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: GOOGLE APPS SCRIPT SETUP GUIDE MODAL */}
      {showGasGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Code className="text-emerald-600" size={20} /> Google Apps Script Setup & Code
                </h3>
                <p className="text-xs text-slate-500">
                  Follow these simple steps to deploy your Google Apps Script email gateway in 1 minute
                </p>
              </div>
              <button
                onClick={() => setShowGasGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Steps List */}
            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                <div>
                  <strong>Open Google Apps Script:</strong> Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5">script.google.com <ExternalLink size={11} /></a> and click <strong>"New Project"</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                <div>
                  <strong>Paste Script Code:</strong> Erase all existing text in <code className="bg-slate-200 px-1 py-0.5 rounded">Code.gs</code>, paste the updated code below, and click <strong>Save (Ctrl+S)</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-emerald-50 p-2.5 rounded-xl border border-emerald-300">
                <span className="bg-emerald-700 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                <div>
                  <strong className="text-emerald-900">Run One-Time Authorization (Crucial Step!):</strong>
                  <p className="text-slate-700 mt-0.5">
                    In the top toolbar dropdown in Google Apps Script (next to "Debug"), select <code className="bg-emerald-200 text-emerald-900 px-1 py-0.5 rounded font-bold">setupAndAuthorize</code> and click <strong>"Run"</strong>.
                    Click <strong>"Review Permissions"</strong> &rarr; Select your Google account &rarr; Click <em>Advanced</em> &rarr; <em>Go to Untitled project (unsafe)</em> &rarr; Click <strong>Allow</strong>. This grants <code className="font-mono">MailApp.sendEmail</code> permission to run without errors!
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <span className="bg-amber-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">4</span>
                <div>
                  <strong>Deploy Web App:</strong> Click <strong>Deploy</strong> (top right) &rarr; <strong>New deployment</strong> (or if editing existing: <strong>Manage deployments</strong> &rarr; Edit Pencil icon &rarr; Select <strong>"New version"</strong>).
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-700">
                    <li>Execute as: <strong>Me (your email account)</strong> <span className="text-slate-500">(Allows background portal server calls to send emails automatically)</span></li>
                    <li>Who has access: <strong className="text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-black">Anyone</strong> <span className="text-red-700 font-bold">(Do NOT select "Anyone within organization" or "Only me" as Google will block API calls)</span></li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="bg-emerald-600 text-white font-bold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">5</span>
                <div>
                  <strong>Copy Web App URL:</strong> Copy the generated Web App URL (starts with <code className="bg-slate-200 px-1 py-0.5 rounded">https://script.google.com/macros/s/.../exec</code>) and paste it into the setting input above!
                </div>
              </div>
            </div>

            {/* Code Box */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Google Apps Script Code (Code.gs)</label>
                <button
                  type="button"
                  onClick={() => {
                    const code = `function doPost(e) {
  return handleEmailRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.to || e.parameter.payload)) {
    return handleEmailRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Sales Portal Google Apps Script Email Gateway"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleEmailRequest(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      if (e.parameter.payload) {
        try {
          data = JSON.parse(e.parameter.payload);
        } catch (pErr) {
          data = e.parameter;
        }
      } else {
        data = e.parameter;
      }
    }

    var to = data.to;
    var subject = data.subject || "No Subject";
    var body = data.text || data.html || data.body || "";
    var isHtml = /<[a-z][\\s\\S]*>/i.test(body);

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Missing recipient 'to' address"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var options = { to: to, subject: subject };
    if (data.cc) options.cc = data.cc;
    if (data.bcc) options.bcc = data.bcc;
    if (data.fromName) options.name = data.fromName;

    if (isHtml) {
      options.htmlBody = body;
      options.body = body.replace(/<[^>]*>/g, "");
    } else {
      options.body = body;
    }

    MailApp.sendEmail(options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Email successfully sent via Google Apps Script Web App",
      to: to
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
                    navigator.clipboard.writeText(code);
                    setCopiedGasScript(true);
                    setTimeout(() => setCopiedGasScript(false), 2500);
                  }}
                  className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  {copiedGasScript ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  {copiedGasScript ? "Copied Code!" : "Copy Script Code"}
                </button>
              </div>

              <pre className="p-3 bg-slate-900 text-emerald-400 text-[11px] rounded-xl font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
{`function doPost(e) {
  return handleEmailRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.to || e.parameter.payload)) {
    return handleEmailRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Sales Portal Google Apps Script Email Gateway"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleEmailRequest(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (err) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      if (e.parameter.payload) {
        try { data = JSON.parse(e.parameter.payload); } catch (err) { data = e.parameter; }
      } else {
        data = e.parameter;
      }
    }

    var to = data.to;
    var subject = data.subject || "No Subject";
    var body = data.text || data.html || data.body || "";
    var isHtml = /<[a-z][\\s\\S]*>/i.test(body);

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing recipient 'to' address" })).setMimeType(ContentService.MimeType.JSON);
    }

    var options = { to: to, subject: subject };
    if (data.cc) options.cc = data.cc;
    if (data.bcc) options.bcc = data.bcc;
    if (data.fromName) options.name = data.fromName;

    // Un-escape escaped HTML tags like &lt;b&gt; -> <b> and &lt;table&gt; -> <table>
    var rawText = data.html || data.text || data.body || "";
    var cleanBody = rawText
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    var hasHtml = /<[a-z][\s\S]*>/i.test(cleanBody);
    var htmlContent = hasHtml ? cleanBody : '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">' + cleanBody.replace(/\n/g, "<br/>") + '</div>';
    var plainTextContent = htmlContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

    options.htmlBody = htmlContent;
    options.body = plainTextContent;

    MailApp.sendEmail(options);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Email successfully sent via Google Apps Script Web App", to: to })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`}
              </pre>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-950">
                  <AlertCircle size={14} className="text-amber-600" /> How to Create & Live-Preview Email Templates:
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-900 font-medium">
                  <li><strong>Create Template:</strong> Click <em>Add Template</em>, enter a name, and select the assigned Form/Event.</li>
                  <li><strong>Insert Dynamic Variables:</strong> Click any variable badge from the library (e.g., <code className="bg-amber-100 px-1 rounded">{"{{clientName}}"}</code>, <code className="bg-amber-100 px-1 rounded">{"{{itemsTable}}"}</code>, <code className="bg-amber-100 px-1 rounded">{"{{bankDetailsTable}}"}</code>) to place it in the body.</li>
                  <li><strong>Rich Formatting:</strong> Use bold, text colors, bullet lists, and font sizes to design your email.</li>
                  <li><strong>Live Preview:</strong> Click <strong>Live Preview</strong> (<Eye size={12} className="inline" />) to view the rendered email with sample data and test-send directly to your inbox before saving!</li>
                </ol>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGasGuideModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE EMAIL PREVIEW MODAL */}
      {livePreviewOpen && previewData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                  <Eye size={18} className="text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Live Email Client Preview</h3>
                  <p className="text-xs text-indigo-200/80 font-medium">
                    Template: <span className="text-white font-semibold">{previewData.name}</span> ({previewData.assignedForm || "Global"})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewViewMode("html")}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      previewViewMode === "html" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    HTML View
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewMode("plain")}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      previewViewMode === "plain" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Plain Text View
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setLivePreviewOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Email Client Top Bar Header Mockup */}
            {(() => {
              const sampleCtx = getSampleTemplateContext(previewData.assignedForm);
              const evaluatedSubject = replaceTemplateVars(previewData.subject, sampleCtx) || "No Subject";
              const evaluatedTo = replaceTemplateVars(previewData.to || "{{email}}", sampleCtx);
              const evaluatedCc = replaceTemplateVars(previewData.cc || "", sampleCtx);
              const evaluatedBcc = replaceTemplateVars(previewData.bcc || "", sampleCtx);
              const rawEvaluatedBody = replaceTemplateVars(previewData.body, sampleCtx);
              
              const formatPreviewHtml = (htmlStr: string) => {
                if (!htmlStr) return "";
                let clean = htmlStr.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                const hasHtml = /<[a-z][\s\S]*>/i.test(clean);
                if (!hasHtml) {
                  return clean.replace(/\n/g, "<br/>");
                }
                const tableRegex = /(<table[\s\S]*?<\/table>)/gi;
                const parts = clean.split(tableRegex);
                return parts.map(p => {
                  if (p.toLowerCase().startsWith("<table")) return p.replace(/<br\s*\/?>/gi, "").replace(/\s*\n\s*/g, " ");
                  if (/<(br|p|div|h[1-6]|ul|ol|li)\b[^>]*>/i.test(p)) return p;
                  return p.replace(/\n/g, "<br/>");
                }).join("");
              };

              const formattedHtmlBody = formatPreviewHtml(rawEvaluatedBody);
              const plainTextBody = formattedHtmlBody
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n")
                .replace(/<\/div>/gi, "\n")
                .replace(/<\/tr>/gi, "\n")
                .replace(/<[^>]*>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&");

              return (
                <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6 space-y-4">
                  {/* Fake Email Envelope Header */}
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subject</span>
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                        Preview Mode: Sample Data Applied
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-900">{evaluatedSubject}</div>

                    <div className="pt-2 border-t border-slate-100 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 w-12 text-right shrink-0">From:</span>
                        <span className="font-semibold text-slate-800">Aroma Organics Limited &lt;gcp@aromaorganic.in&gt;</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="font-bold text-slate-500 w-12 text-right shrink-0">To:</span>
                        <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{evaluatedTo || "demo@company.com"}</span>
                      </div>
                      {evaluatedCc && (
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-bold text-slate-500 w-12 text-right shrink-0">CC:</span>
                          <span className="text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{evaluatedCc}</span>
                        </div>
                      )}
                      {evaluatedBcc && (
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-bold text-slate-500 w-12 text-right shrink-0">BCC:</span>
                          <span className="text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{evaluatedBcc}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Render Body Frame */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 min-h-[300px]">
                    {previewViewMode === "html" ? (
                      <div
                        className="prose max-w-none text-slate-800 font-sans text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formattedHtmlBody }}
                      />
                    ) : (
                      <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                        {plainTextBody}
                      </pre>
                    )}
                  </div>

                  {/* Send Test Email Section */}
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Send size={16} className="text-indigo-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-indigo-950">Send Test Email to Inbox</div>
                        <div className="text-[11px] text-indigo-700">Test how this template looks in your real email inbox</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="your-email@domain.com"
                        value={previewTestEmail}
                        onChange={(e) => setPreviewTestEmail(e.target.value)}
                        className="px-3 py-1.5 text-xs rounded-xl border border-indigo-200 bg-white font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-56"
                      />
                      <button
                        type="button"
                        disabled={isSendingPreviewTest || !previewTestEmail}
                        onClick={async () => {
                          if (!previewTestEmail) return;
                          setIsSendingPreviewTest(true);
                          setPreviewTestStatus(null);
                          try {
                            const token = await auth.currentUser?.getIdToken();
                            const res = await fetch("/api/send-order-email", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({
                                to: previewTestEmail,
                                subject: evaluatedSubject,
                                text: formattedHtmlBody,
                                html: formattedHtmlBody,
                                htmlBody: formattedHtmlBody,
                                plainText: plainTextBody,
                                category: previewData.assignedForm || "general",
                                fromName: "Aroma Organics Sales Portal",
                              }),
                            });
                            const data = await res.json();
                            const isSuccess = data.status === "success" && data.deliveryStatus !== "Failed";
                            if (isSuccess) {
                              setPreviewTestStatus({ type: "success", text: `Test email sent to ${previewTestEmail}!` });
                            } else {
                              setPreviewTestStatus({ type: "error", text: data.message || "Failed to send test email" });
                            }

                            await saveEmailSentLog({
                              id: `log-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                              to: previewTestEmail,
                              subject: evaluatedSubject,
                              category: previewData.assignedForm || "general",
                              status: isSuccess ? "Sent" : "Failed",
                              timestamp: new Date().toISOString(),
                              senderUserId: auth.currentUser?.uid,
                              error: isSuccess ? undefined : data.message,
                            });
                          } catch (err: any) {
                            setPreviewTestStatus({ type: "error", text: err.message || "Network error" });
                          } finally {
                            setIsSendingPreviewTest(false);
                          }
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow-2xs"
                      >
                        {isSendingPreviewTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Send Test
                      </button>
                    </div>
                  </div>

                  {previewTestStatus && (
                    <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      previewTestStatus.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                    }`}>
                      {previewTestStatus.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                      <span>{previewTestStatus.text}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <Info size={13} className="text-indigo-600" /> Variables replaced automatically using active system context.
              </span>
              <button
                type="button"
                onClick={() => setLivePreviewOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
