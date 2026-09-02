import React, { useState, useEffect, useMemo } from "react";
import { EmailTemplate, Role, User, EmailSendingConfig, EmailSendingMode, SmtpCredentials, EmailLimitsConfig, EmailDailyCounts, UserGasConfig } from "../types";
import { saveEmailTemplate, deleteEmailTemplateDoc, saveLog, getEmailSendingConfig, saveEmailSendingConfig, getEmailLimitsConfig, saveEmailLimitsConfig, getEmailDailyCounts, saveEmailSentLog } from "../lib/firebaseService";
import { auth } from "../firebase";
import { TEMPLATE_VARIABLE_GROUPS, replaceTemplateVars, getSampleTemplateContext } from "../lib/templateUtils";
import { dispatchSystemEmail, clearGasConfigCache } from "../lib/emailService";
import { Plus, Trash2, Edit2, Copy, Check, Info, Tag, Mail, Server, UserCheck, ShieldCheck, Send, AlertCircle, RefreshCw, Key, Settings, X, CheckCircle2, Lock, Eye, EyeOff, Loader2, Code, FileText, ExternalLink, HelpCircle, Sparkles, Search, Users, Globe, User as UserIcon } from "lucide-react";
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
    mode: "google_apps_script",
    gasWebUrl: "",
    userGasConfigs: {},
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Per-User Google Apps Script Web App Management states
  const [userGasConfigs, setUserGasConfigs] = useState<Record<string, { gasWebUrl?: string; fromName?: string; senderEmail?: string }>>({});
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userFilterStatus, setUserFilterStatus] = useState<"all" | "configured" | "fallback">("all");
  const [selectedUserForTest, setSelectedUserForTest] = useState<User | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [isSavingAllUsers, setIsSavingAllUsers] = useState(false);
  const [copiedInstructionsUserId, setCopiedInstructionsUserId] = useState<string | null>(null);

  // Test email modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Google Apps Script Modal Guide
  const [showGasGuideModal, setShowGasGuideModal] = useState(false);
  const [copiedGasScript, setCopiedGasScript] = useState(false);

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
          const userGasMap: Record<string, { gasWebUrl?: string; fromName?: string; senderEmail?: string }> = {
            ...(cfg.userGasConfigs || {})
          };

          // Also merge any gasWebUrl that might be saved on user profiles
          users.forEach((u) => {
            if (!userGasMap[u.id]) {
              userGasMap[u.id] = {
                gasWebUrl: u.gasWebUrl || "",
                fromName: `${u.name} - Aroma Organics`,
                senderEmail: u.email,
              };
            } else if (!userGasMap[u.id].gasWebUrl && u.gasWebUrl) {
              userGasMap[u.id].gasWebUrl = u.gasWebUrl;
            }
          });

          setSendingConfig({
            mode: "google_apps_script",
            gasWebUrl: cfg.gasWebUrl || "",
            userGasConfigs: userGasMap,
            updatedAt: cfg.updatedAt,
            updatedBy: cfg.updatedBy,
          });
          setUserGasConfigs(userGasMap);
        })
        .finally(() => setIsLoadingConfig(false));
    }
  }, [isAdmin, users]);

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

  // Google Apps Script Code Generator
  const getAppsScriptCodeSnippet = () => `/**
 * Aroma Organics / Google Workspace Automated Sales Email Dispatcher
 * Dispatches automated order, offer, indent, invoice, and payment reminder emails.
 */

function setupAndAuthorize() {
  Logger.log("Authorized successfully for user: " + Session.getActiveUser().getEmail());
}

function doPost(e) {
  return handleEmailRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.to || e.parameter.payload)) {
    return handleEmailRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    activeUser: Session.getActiveUser().getEmail() || "Service Account",
    service: "Sales Portal Google Apps Script Email Gateway"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleEmailRequest(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (jsonErr) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      if (e.parameter.payload) {
        try { data = JSON.parse(e.parameter.payload); } catch (pErr) { data = e.parameter; }
      } else {
        data = e.parameter;
      }
    }

    var to = data.to;
    var subject = data.subject || "Sales Portal Notification";
    var rawBody = data.html || data.text || data.htmlBody || data.body || "";

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing recipient 'to' address" })).setMimeType(ContentService.MimeType.JSON);
    }

    // Clean & Unescape HTML entities (e.g. &lt;table&gt; -> <table>)
    var cleanBody = rawBody
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    var hasHtml = /<[a-z][\\s\\S]*>/i.test(cleanBody);
    var htmlContent = hasHtml
      ? cleanBody
      : '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">' + cleanBody.replace(/\\n/g, "<br/>") + '</div>';

    var plainTextContent = cleanBody
      .replace(/<br\\s*\\/?>/gi, "\\n")
      .replace(/<\\/p>/gi, "\\n")
      .replace(/<\\/div>/gi, "\\n")
      .replace(/<\\/tr>/gi, "\\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

    // Sender & Identity Settings for Google Workspace
    var senderName = data.fromName || data.senderUserName || "Sales Portal";
    var replyToEmail = data.replyTo || data.senderEmail || "";

    var options = {
      to: to,
      subject: subject,
      htmlBody: htmlContent,
      body: plainTextContent,
      name: senderName
    };

    if (replyToEmail) {
      options.replyTo = replyToEmail;
    }

    if (data.cc) options.cc = data.cc;
    if (data.bcc) options.bcc = data.bcc;

    // Dispatch via MailApp (Dispatches directly from the Google account running the script)
    MailApp.sendEmail(options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Email successfully dispatched via Google Apps Script Web App",
      to: to,
      sender: senderName,
      replyTo: replyToEmail || undefined
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  // Test Email Runner for Google Apps Script Web App
  const handleOpenTestModal = () => {
    setSelectedUserForTest(null);
    setTestRecipientEmail(activeUser.email || "");
    setTestResult(null);
    setTestModalOpen(true);
  };

  const handleOpenUserTestModal = (user: User) => {
    setSelectedUserForTest(user);
    setTestRecipientEmail(activeUser.email || user.email || "");
    setTestResult(null);
    setTestModalOpen(true);
  };

  const handleRunTestEmail = async () => {
    if (!testRecipientEmail) return;
    setIsSendingTest(true);
    setTestResult(null);

    const isUserSpecific = !!selectedUserForTest;
    const testUser = selectedUserForTest || activeUser;
    const userCustomGasUrl = selectedUserForTest ? (userGasConfigs[selectedUserForTest.id]?.gasWebUrl || "").trim() : "";
    const activeGasUrl = userCustomGasUrl || sendingConfig.gasWebUrl?.trim();

    try {
      const result = await dispatchSystemEmail({
        to: testRecipientEmail,
        subject: isUserSpecific
          ? `[Test] User Direct Email Check for ${testUser.name} (${new Date().toLocaleDateString()})`
          : `[Test] Sales Management Portal - Company Gateway Check (${new Date().toLocaleDateString()})`,
        text: `<div style="font-family: Arial, sans-serif; padding: 16px; color: #1e293b;">
          <h2 style="color: #059669; margin-top: 0;">✓ Google Apps Script Email Dispatch Successful!</h2>
          <p>${isUserSpecific
            ? `This live test email was dispatched directly through <strong>${testUser.name}'s</strong> personal Google Apps Script Web App (sending from <strong>${testUser.email}</strong>).`
            : `This live test email was dispatched via the Default Company Gateway Google Apps Script Web App.`
          }</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <p><strong>Configured Sender:</strong> ${testUser.name} (${testUser.email || "N/A"})</p>
          <p><strong>Role & Team:</strong> ${testUser.role} - ${testUser.teamName || "General"}</p>
          <p><strong>Recipient:</strong> ${testRecipientEmail}</p>
          <p><strong>Gateway Mode:</strong> ${userCustomGasUrl ? "Personal Deployed Web App" : "Company Default Web App"}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Automated order notifications, invoice alerts, and payment reminders triggered by ${testUser.name} will now originate seamlessly from their account.</p>
        </div>`,
        fromName: `${testUser.name} - Aroma Organics`,
        senderUserName: testUser.name,
        senderUserId: testUser.id,
        senderEmail: testUser.email,
        replyTo: testUser.email,
        category: "test_email",
        gasWebUrl: activeGasUrl || undefined,
      });

      if (result.ok && result.deliveryStatus !== "Failed") {
        setTestResult({
          type: "success",
          text: `Test email successfully delivered to ${testRecipientEmail} via Google Apps Script (${testUser.name})!`,
        });
      } else {
        setTestResult({
          type: "error",
          text: result.message || "Failed to send test email. Please check your Google Apps Script URL and permissions.",
        });
      }
    } catch (err: any) {
      setTestResult({ type: "error", text: err.message || "Network error connecting to email service" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveGasConfig = async () => {
    let cleanUrl = (sendingConfig.gasWebUrl || "").trim();
    if (cleanUrl.endsWith("/dev")) {
      cleanUrl = cleanUrl.replace(/\/dev$/, "/exec");
    }

    const updated: EmailSendingConfig = {
      ...sendingConfig,
      gasWebUrl: cleanUrl,
      mode: "google_apps_script",
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };
    setSendingConfig(updated);
    setIsSavingConfig(true);
    try {
      await saveEmailSendingConfig(updated);
      clearGasConfigCache();
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Config",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: "Company Default Google Apps Script URL",
        details: `${activeUser.name} updated Company Default Google Apps Script Web App URL to: ${cleanUrl || "N/A"}`
      });
      setStatusMessage({ type: "success", text: "Company Default Google Apps Script URL saved successfully!" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save Google Apps Script URL: ${err.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveIndividualUserGasUrl = async (user: User) => {
    setSavingUserId(user.id);
    let currentUrl = (userGasConfigs[user.id]?.gasWebUrl || "").trim();
    if (currentUrl.endsWith("/dev")) {
      currentUrl = currentUrl.replace(/\/dev$/, "/exec");
    }

    const updatedUserConfigs = {
      ...(sendingConfig.userGasConfigs || {}),
      [user.id]: {
        gasWebUrl: currentUrl,
        fromName: `${user.name} - Aroma Organics`,
        senderEmail: user.email,
      },
    };

    const updatedConfig: EmailSendingConfig = {
      ...sendingConfig,
      userGasConfigs: updatedUserConfigs,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };

    setSendingConfig(updatedConfig);
    setUserGasConfigs(updatedUserConfigs);

    try {
      await saveEmailSendingConfig(updatedConfig);
      clearGasConfigCache();
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Config",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: `Google Apps Script URL for ${user.name}`,
        details: `${activeUser.name} updated Google Apps Script Web App URL for ${user.name} (${user.email}) to: ${currentUrl || "Default Company Gateway"}`
      });
      setStatusMessage({ type: "success", text: `Apps Script URL for ${user.name} saved successfully!` });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save URL for ${user.name}: ${err.message}` });
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveAllUserGasUrls = async () => {
    setIsSavingAllUsers(true);
    
    const cleanedConfigs: Record<string, { gasWebUrl?: string; fromName?: string; senderEmail?: string }> = {};
    for (const [uid, conf] of Object.entries(userGasConfigs) as [string, { gasWebUrl?: string; fromName?: string; senderEmail?: string }][]) {
      let url = (conf?.gasWebUrl || "").trim();
      if (url.endsWith("/dev")) url = url.replace(/\/dev$/, "/exec");
      const u = users.find((x) => x.id === uid);
      cleanedConfigs[uid] = {
        gasWebUrl: url,
        fromName: conf?.fromName || (u ? `${u.name} - Aroma Organics` : undefined),
        senderEmail: conf?.senderEmail || u?.email,
      };
    }

    const updatedConfig: EmailSendingConfig = {
      ...sendingConfig,
      userGasConfigs: cleanedConfigs,
      updatedAt: new Date().toISOString(),
      updatedBy: activeUser.name,
    };

    setSendingConfig(updatedConfig);
    setUserGasConfigs(cleanedConfigs);

    try {
      await saveEmailSendingConfig(updatedConfig);
      clearGasConfigCache();
      await saveLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUser.id,
        userName: activeUser.name,
        actionType: "Update Email Config",
        targetType: "Settings",
        targetId: "email_sending_config",
        targetName: "All Per-User Google Apps Script URLs",
        details: `${activeUser.name} saved per-user Google Apps Script Web App URLs for all users.`
      });
      setStatusMessage({ type: "success", text: "All user Google Apps Script URLs saved successfully!" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Failed to save user URLs: ${err.message}` });
    } finally {
      setIsSavingAllUsers(false);
    }
  };

  const handleCopyInstructionsForUser = (user: User) => {
    const text = `Hi ${user.name},

Please follow these 4 quick steps to deploy your Google Apps Script email dispatcher so the Sales Portal can send emails directly from your email (${user.email}):

1. Open Google Apps Script: Go to https://script.google.com and click "New project".
2. Erase any existing text in Code.gs and paste the exact code below:
----------------------------------------
${getAppsScriptCodeSnippet()}
----------------------------------------
3. In the top bar, select "setupAndAuthorize" in the function dropdown (next to Debug) and click "Run".
   - Click "Review Permissions" -> Choose your account (${user.email}) -> Advanced -> Go to Untitled project (unsafe) -> Allow.
4. Deploy as Web App:
   - Click "Deploy" (top right) -> "New deployment"
   - Click the gear icon -> Select "Web app"
   - Execute as: "Me (${user.email})"
   - Who has access: "Anyone" (Required for the portal webhook)
   - Click "Deploy" and copy your Web App URL (starts with https://script.google.com/macros/s/.../exec)

Please reply with your Web App URL so Admin can add it to your profile in the portal!`;

    navigator.clipboard.writeText(text);
    setCopiedInstructionsUserId(user.id);
    setTimeout(() => setCopiedInstructionsUserId(null), 2500);
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

  const { filteredUsersForGas, configuredUsersCount, fallbackUsersCount } = useMemo(() => {
    let configured = 0;
    const list = users.filter((u) => {
      const customUrl = (userGasConfigs[u.id]?.gasWebUrl || "").trim();
      const hasCustom = !!customUrl;
      if (hasCustom) configured++;

      const query = userSearchTerm.toLowerCase();
      const matchesSearch =
        u.name.toLowerCase().includes(query) ||
        (u.email || "").toLowerCase().includes(query) ||
        (u.teamName && u.teamName.toLowerCase().includes(query)) ||
        u.role.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (userFilterStatus === "configured") return hasCustom;
      if (userFilterStatus === "fallback") return !hasCustom;
      return true;
    });

    return {
      filteredUsersForGas: list,
      configuredUsersCount: configured,
      fallbackUsersCount: users.length - configured,
    };
  }, [users, userSearchTerm, userFilterStatus, userGasConfigs]);

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="text-indigo-600" size={22} /> Email Center & Notifications
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage automated email templates, dynamic event placeholders, and Google Apps Script Web App email dispatcher
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

      {/* TAB 2: EMAIL SENDER CONFIGURATION (GOOGLE APPS SCRIPT ONLY) (ADMIN ONLY) */}
      {mainTab === "sending_settings" && isAdmin && (
        <div className="space-y-6">
          {/* Mode Selection Heading & Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Code size={18} className="text-emerald-600" /> Google Apps Script Email Dispatcher
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                All outgoing system emails are routed securely through your deployed <strong>Google Apps Script Web App</strong> (Gmail / Google Workspace Gateway). No SMTP credentials or passwords are required in the portal.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
              <CheckCircle2 size={14} className="text-emerald-600" /> Active Dispatch Method
            </div>
          </div>

          {/* GOOGLE APPS SCRIPT CONFIGURATION PANEL */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200 pb-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Code size={16} className="text-emerald-700" /> Google Apps Script Web App Deployment URL
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Enter your deployed Google Apps Script Web App URL to dispatch emails automatically via your Google Workspace or Gmail account.
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
                    onClick={handleOpenTestModal}
                    className="flex items-center gap-1.5 bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Send size={13} /> Test Apps Script Email
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                Company Default Google Apps Script Web App URL
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
                  {isSavingConfig ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save Default Gateway URL
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Used as the company-wide fallback email gateway whenever a user does not have an individual Web App URL configured below.
              </p>
            </div>
          </div>

          {/* PER-USER GOOGLE APPS SCRIPT WEB APP URLS (OPTION 1) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                    Option 1 Enabled
                  </span>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users size={18} className="text-indigo-600" /> Per-User Personal Web App URLs
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Save deployed Google Apps Script Web App URLs for individual users. When a logged-in user creates an order, issues an invoice, or triggers a payment reminder, the email will dispatch directly from <strong>their own Google Workspace / Gmail account</strong>!
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveAllUserGasUrls}
                  disabled={isSavingAllUsers}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingAllUsers ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save All User URLs
                </button>
              </div>
            </div>

            {/* Filter & Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              {/* Search input */}
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user by name, email, role, or team..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setUserFilterStatus("all")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    userFilterStatus === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  All ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterStatus("configured")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    userFilterStatus === "configured" ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Configured ({configuredUsersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterStatus("fallback")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    userFilterStatus === "fallback" ? "bg-amber-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Fallback ({fallbackUsersCount})
                </button>
              </div>
            </div>

            {/* Users List Table / Card Rows */}
            <div className="space-y-3">
              {filteredUsersForGas.map((u) => {
                const userGasUrl = userGasConfigs[u.id]?.gasWebUrl || "";
                const hasPersonalGas = !!userGasUrl.trim();
                const isSavingThis = savingUserId === u.id;
                const isCopiedInstructions = copiedInstructionsUserId === u.id;

                return (
                  <div
                    key={`user-gas-row-${u.id}`}
                    className={`p-4 rounded-xl border transition-all ${
                      hasPersonalGas
                        ? "bg-white border-emerald-200/90 shadow-2xs hover:border-emerald-300"
                        : "bg-slate-50/70 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      {/* User Info */}
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs overflow-hidden">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            u.name.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{u.name}</span>
                            <span className="text-[10px] font-semibold bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded">
                              {u.role}
                            </span>
                            {hasPersonalGas ? (
                              <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Personal Web App Active
                              </span>
                            ) : (
                              <span className="text-[9px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                Uses Company Default
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                            <span>{u.email || "No email assigned"}</span>
                            {u.teamName && <span className="text-slate-400">• {u.teamName}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Gas URL Input & Actions */}
                      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="url"
                            placeholder="Paste user's Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec)"
                            value={userGasUrl}
                            onChange={(e) => {
                              let val = e.target.value;
                              if (val.trim().endsWith("/dev")) {
                                val = val.trim().replace(/\/dev$/, "/exec");
                              }
                              setUserGasConfigs((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...(prev[u.id] || {}),
                                  gasWebUrl: val,
                                  senderEmail: u.email,
                                  fromName: `${u.name} - Aroma Organics`,
                                },
                              }));
                            }}
                            className={`w-full py-2 px-3 text-xs rounded-xl border outline-none font-mono transition-all ${
                              hasPersonalGas
                                ? "bg-white border-emerald-300 text-slate-900 focus:ring-2 focus:ring-emerald-500"
                                : "bg-white border-slate-200 text-slate-600 focus:ring-2 focus:ring-indigo-500"
                            }`}
                          />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Save Button */}
                          <button
                            type="button"
                            onClick={() => handleSaveIndividualUserGasUrl(u)}
                            disabled={isSavingThis}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Save this user's Google Apps Script URL"
                          >
                            {isSavingThis ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            <span>Save</span>
                          </button>

                          {/* Test Email via this user's gateway */}
                          <button
                            type="button"
                            onClick={() => handleOpenUserTestModal(u)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            title={`Send a test email using ${u.name}'s Google Apps Script gateway`}
                          >
                            <Send size={13} />
                            <span>Test</span>
                          </button>

                          {/* Copy Deployment Instructions for this user */}
                          <button
                            type="button"
                            onClick={() => handleCopyInstructionsForUser(u)}
                            className={`p-2 rounded-xl border transition-all cursor-pointer ${
                              isCopiedInstructions
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                            title="Copy step-by-step deployment instructions personalized for this user"
                          >
                            {isCopiedInstructions ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredUsersForGas.length === 0 && (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
                  <Users size={24} className="mx-auto text-slate-400" />
                  <p className="text-xs font-bold text-slate-700">No users match the search filter</p>
                  <p className="text-[11px] text-slate-500">Try clearing your search term or selecting "All Users".</p>
                </div>
              )}
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

      {/* TEST EMAIL MODAL (GOOGLE APPS SCRIPT) */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Send className="text-emerald-600" size={18} /> Test Apps Script Email Gateway
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedUserForTest ? (
                    <span>Testing user dispatch for <strong>{selectedUserForTest.name}</strong> ({selectedUserForTest.email || "N/A"})</span>
                  ) : (
                    <span>Testing <strong>Company Default Gateway</strong></span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target URL Info Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700 space-y-1 font-mono">
              <div className="text-[10px] uppercase font-bold text-slate-400">Target Web App URL</div>
              <div className="truncate text-slate-800 font-semibold">
                {selectedUserForTest
                  ? (userGasConfigs[selectedUserForTest.id]?.gasWebUrl || sendingConfig.gasWebUrl || "No URL Configured (Will fail)")
                  : (sendingConfig.gasWebUrl || "No URL Configured (Will fail)")}
              </div>
              <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                {selectedUserForTest && userGasConfigs[selectedUserForTest.id]?.gasWebUrl
                  ? `⚡ Using ${selectedUserForTest.name}'s personal Google Apps Script Web App`
                  : `○ Using Company Default Gateway`}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Recipient Test Email</label>
              <input
                type="email"
                placeholder="Enter email to receive test message"
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
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
                    const code = `/**
 * Aroma Organics / Google Workspace Automated Sales Email Dispatcher
 * Dispatches automated order, offer, indent, invoice, and payment reminder emails.
 */

function setupAndAuthorize() {
  Logger.log("Authorized successfully for user: " + Session.getActiveUser().getEmail());
}

function doPost(e) {
  return handleEmailRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.to || e.parameter.payload)) {
    return handleEmailRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    activeUser: Session.getActiveUser().getEmail() || "Service Account",
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
    var subject = data.subject || "Sales Portal Notification";
    var rawBody = data.html || data.text || data.htmlBody || data.body || "";

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Missing recipient 'to' email address"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Clean & Unescape any escaped HTML entities (e.g. &lt;table&gt; -> <table>)
    var cleanBody = rawBody
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    var hasHtml = /<[a-z][\\s\\S]*>/i.test(cleanBody);
    var htmlContent = hasHtml
      ? cleanBody
      : '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">' + cleanBody.replace(/\\n/g, "<br/>") + '</div>';

    var plainTextContent = cleanBody
      .replace(/<br\\s*\\/?>/gi, "\\n")
      .replace(/<\\/p>/gi, "\\n")
      .replace(/<\\/div>/gi, "\\n")
      .replace(/<\\/tr>/gi, "\\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

    // Sender & Identity Settings for Google Workspace
    var senderName = data.fromName || data.senderUserName || "Sales Portal";
    var replyToEmail = data.replyTo || data.senderEmail || "";

    var options = {
      to: to,
      subject: subject,
      htmlBody: htmlContent,
      body: plainTextContent,
      name: senderName
    };

    if (replyToEmail) {
      options.replyTo = replyToEmail;
    }

    if (data.cc) {
      options.cc = data.cc;
    }

    if (data.bcc) {
      options.bcc = data.bcc;
    }

    // Dispatch via MailApp
    MailApp.sendEmail(options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Email successfully dispatched via Google Apps Script",
      to: to,
      subject: subject,
      sender: senderName,
      replyTo: replyToEmail || undefined
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
{`/**
 * Aroma Organics / Google Workspace Automated Sales Email Dispatcher
 * Dispatches automated order, offer, indent, invoice, and payment reminder emails.
 */

function setupAndAuthorize() {
  Logger.log("Authorized successfully for user: " + Session.getActiveUser().getEmail());
}

function doPost(e) {
  return handleEmailRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.to || e.parameter.payload)) {
    return handleEmailRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    activeUser: Session.getActiveUser().getEmail() || "Service Account",
    service: "Sales Portal Google Apps Script Email Gateway"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleEmailRequest(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (jsonErr) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      if (e.parameter.payload) {
        try { data = JSON.parse(e.parameter.payload); } catch (pErr) { data = e.parameter; }
      } else {
        data = e.parameter;
      }
    }

    var to = data.to;
    var subject = data.subject || "Sales Portal Notification";
    var rawBody = data.html || data.text || data.htmlBody || data.body || "";

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing recipient 'to' address" })).setMimeType(ContentService.MimeType.JSON);
    }

    // Clean & Unescape HTML entities (e.g. &lt;table&gt; -> <table>)
    var cleanBody = rawBody
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    var hasHtml = /<[a-z][\\s\\S]*>/i.test(cleanBody);
    var htmlContent = hasHtml
      ? cleanBody
      : '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">' + cleanBody.replace(/\\n/g, "<br/>") + '</div>';

    var plainTextContent = cleanBody
      .replace(/<br\\s*\\/?>/gi, "\\n")
      .replace(/<\\/p>/gi, "\\n")
      .replace(/<\\/div>/gi, "\\n")
      .replace(/<\\/tr>/gi, "\\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

    // Sender & Identity Settings for Google Workspace
    var senderName = data.fromName || data.senderUserName || "Sales Portal";
    var replyToEmail = data.replyTo || data.senderEmail || "";

    var options = {
      to: to,
      subject: subject,
      htmlBody: htmlContent,
      body: plainTextContent,
      name: senderName
    };

    if (replyToEmail) {
      options.replyTo = replyToEmail;
    }

    if (data.cc) options.cc = data.cc;
    if (data.bcc) options.bcc = data.bcc;

    // Dispatch via MailApp
    MailApp.sendEmail(options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Email successfully sent via Google Apps Script Web App",
      to: to,
      sender: senderName,
      replyTo: replyToEmail || undefined
    })).setMimeType(ContentService.MimeType.JSON);

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
                            const result = await dispatchSystemEmail({
                              to: previewTestEmail,
                              subject: evaluatedSubject,
                              text: formattedHtmlBody,
                              html: formattedHtmlBody,
                              htmlBody: formattedHtmlBody,
                              plainText: plainTextBody,
                              category: previewData.assignedForm || "general",
                              fromName: `${activeUser.name} - Sales Portal`,
                              senderUserName: activeUser.name,
                              senderUserId: activeUser.id,
                              senderEmail: activeUser.email,
                              replyTo: activeUser.email,
                              gasWebUrl: sendingConfig.gasWebUrl?.trim() || undefined,
                            });

                            const isSuccess = result.ok && result.deliveryStatus !== "Failed";
                            if (isSuccess) {
                              setPreviewTestStatus({ type: "success", text: `Test email sent to ${previewTestEmail} via Google Apps Script!` });
                            } else {
                              setPreviewTestStatus({ type: "error", text: result.message || "Failed to send test email" });
                            }
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
