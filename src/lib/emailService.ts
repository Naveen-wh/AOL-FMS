import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { saveEmailSentLog } from "./firebaseService";
import { EmailDeliveryStatus, EmailSentLog, EmailSendingConfig } from "../types";

export interface DispatchEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  htmlBody?: string;
  plainText?: string;
  fromName?: string;
  senderUserId?: string;
  senderUserName?: string;
  senderEmail?: string;
  replyTo?: string;
  category?: string;
  orderId?: string;
  invoiceNumber?: string;
  companyName?: string;
  clientName?: string;
  gasWebUrl?: string;
}

export interface DispatchEmailResult {
  ok: boolean;
  deliveryStatus: EmailDeliveryStatus;
  message: string;
  logId: string;
  rawResponse?: any;
}

// In-memory cache for fast config lookups
let cachedGasConfig: { defaultUrl?: string; userUrls: Record<string, string>; timestamp: number } | null = null;

export function clearGasConfigCache() {
  cachedGasConfig = null;
}

/**
 * Retrieves the configured Google Apps Script Web App URL from Firestore.
 * Supports per-user deployment URL resolution with global fallback.
 */
export async function getActiveGasWebUrl(userId?: string): Promise<string | undefined> {
  const isCacheFresh = cachedGasConfig && Date.now() - cachedGasConfig.timestamp < 15000;

  if (isCacheFresh && cachedGasConfig) {
    if (userId && cachedGasConfig.userUrls[userId]) {
      return cachedGasConfig.userUrls[userId];
    }
    if (cachedGasConfig.defaultUrl) {
      return cachedGasConfig.defaultUrl;
    }
  }

  try {
    const configSnap = await getDoc(doc(db, "settings", "email_sending_config"));
    let userUrls: Record<string, string> = {};
    let defaultUrl: string | undefined = undefined;

    if (configSnap.exists()) {
      const data = configSnap.data() as EmailSendingConfig;
      defaultUrl = data.gasWebUrl?.trim() || undefined;

      if (data.userGasConfigs) {
        for (const [uid, uConf] of Object.entries(data.userGasConfigs)) {
          if (uConf?.gasWebUrl?.trim()) {
            userUrls[uid] = uConf.gasWebUrl.trim();
          }
        }
      }

      // Check if user has a custom GAS URL in config
      if (userId && userUrls[userId]) {
        cachedGasConfig = { defaultUrl, userUrls, timestamp: Date.now() };
        return userUrls[userId];
      }
    }

    // Secondary check: look up user document directly if userId provided
    if (userId) {
      try {
        const userDocSnap = await getDoc(doc(db, "users", userId));
        if (userDocSnap.exists()) {
          const uData = userDocSnap.data();
          if (uData?.gasWebUrl?.trim()) {
            userUrls[userId] = uData.gasWebUrl.trim();
            cachedGasConfig = { defaultUrl, userUrls, timestamp: Date.now() };
            return uData.gasWebUrl.trim();
          }
        }
      } catch (uErr) {
        // Non-blocking
      }
    }

    cachedGasConfig = { defaultUrl, userUrls, timestamp: Date.now() };
    if (userId && userUrls[userId]) {
      return userUrls[userId];
    }
    return defaultUrl;
  } catch (err) {
    console.warn("[EmailService] Failed to read email_sending_config from Firestore:", err);
  }

  return undefined;
}

/**
 * Dispatches an email via Google Apps Script Web App.
 *
 * Fully compatible with BOTH:
 * 1. Firebase Hosting (pure static client-side mode with direct CORS-safe Google Apps Script fetch)
 * 2. Full-stack Dev / Cloud Run server proxy (/api/send-order-email)
 *
 * Automatically saves the audit log to Firestore 'email_sent_logs' in either environment.
 */
export async function dispatchSystemEmail(payload: DispatchEmailPayload): Promise<DispatchEmailResult> {
  const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const logTimestamp = new Date().toISOString();

  const currentAuthUser = auth.currentUser;
  const senderUserId = payload.senderUserId || currentAuthUser?.uid || undefined;
  const senderUserName = payload.senderUserName || currentAuthUser?.displayName || "System User";
  const senderEmail = payload.senderEmail || currentAuthUser?.email || "";
  const fromName = payload.fromName || senderUserName || "Sales Management Portal";
  const replyTo = payload.replyTo || senderEmail || undefined;

  const htmlContent = payload.html || payload.htmlBody || payload.text || "";
  const plainTextContent = payload.plainText || (payload.text ? payload.text.replace(/<[^>]*>/g, "") : "");

  // Determine target Google Apps Script URL
  let targetGasUrl = payload.gasWebUrl?.trim();
  if (!targetGasUrl) {
    targetGasUrl = (await getActiveGasWebUrl(senderUserId))?.trim();
  }

  const logAudit = async (status: EmailDeliveryStatus, error?: string): Promise<EmailSentLog> => {
    const logItem: EmailSentLog = {
      id: logId,
      orderId: payload.orderId,
      invoiceNumber: payload.invoiceNumber,
      companyName: payload.companyName,
      clientName: payload.clientName,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      category: payload.category || "general",
      status,
      timestamp: logTimestamp,
      error,
      senderUserId,
      senderUserName,
      senderEmail: senderEmail || "Google Workspace Gateway",
    };

    try {
      await saveEmailSentLog(logItem);
    } catch (err) {
      console.warn("[EmailService] Could not persist log to Firestore:", err);
    }
    return logItem;
  };

  if (!payload.to || !payload.to.trim()) {
    await logAudit("Failed", "Recipient email address is missing");
    return {
      ok: false,
      deliveryStatus: "Failed",
      message: "Recipient email address is missing.",
      logId,
    };
  }

  const requestBody = {
    to: payload.to,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject,
    text: htmlContent,
    html: htmlContent,
    htmlBody: htmlContent,
    plainText: plainTextContent,
    fromName,
    senderEmail,
    senderUserName,
    senderUserId,
    replyTo,
    category: payload.category || "general",
    orderId: payload.orderId || undefined,
    invoiceNumber: payload.invoiceNumber || undefined,
    companyName: payload.companyName || undefined,
    clientName: payload.clientName || undefined,
    gasWebUrl: targetGasUrl,
  };

  // 1. Try server proxy route first if running on fullstack / dev environment
  let serverSucceeded = false;
  let serverErrorMsg: string | null = null;

  try {
    const idToken = await currentAuthUser?.getIdToken();
    const serverRes = await fetch("/api/send-order-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken || ""}`,
      },
      body: JSON.stringify(requestBody),
    });

    const contentType = serverRes.headers.get("content-type") || "";
    // If server responded with JSON (valid fullstack backend, NOT Firebase Hosting SPA fallback)
    if (serverRes.ok && contentType.includes("application/json")) {
      const data = await serverRes.json();
      if (data.status === "success" && data.deliveryStatus !== "Failed") {
        serverSucceeded = true;
        return {
          ok: true,
          deliveryStatus: "Sent",
          message: data.message || `Email sent successfully to ${payload.to}`,
          logId: data.log?.id || logId,
          rawResponse: data,
        };
      } else {
        serverErrorMsg = data.message || "Server reported failure sending email";
      }
    } else if (!serverRes.ok && contentType.includes("application/json")) {
      const data = await serverRes.json().catch(() => ({}));
      serverErrorMsg = data.message || `Server returned error ${serverRes.status}`;
    }
  } catch (err: any) {
    // Network error or 404 in static client environment - proceed to direct GAS fallback
    serverErrorMsg = err?.message || "Server endpoint unavailable";
  }

  // If server didn't handle it, we execute directly via Google Apps Script Web App (Firebase Hosting mode)
  if (!targetGasUrl) {
    const msg = serverErrorMsg || "Google Apps Script Web App URL is not configured in Email Settings.";
    await logAudit("Failed", msg);
    return {
      ok: false,
      deliveryStatus: "Failed",
      message: "Google Apps Script Web App URL is not configured. Please configure it in Email Settings.",
      logId,
    };
  }

  try {
    // Use text/plain to bypass CORS preflight issues on Google Apps Script Web Apps
    const directRes = await fetch(targetGasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(requestBody),
      redirect: "follow",
    });

    let resultData: any = null;
    try {
      resultData = await directRes.json();
    } catch {
      // In some cases Google Apps Script redirect returns text or opaque output
      resultData = { status: directRes.ok ? "success" : "pending" };
    }

    if (resultData && resultData.status === "error") {
      const errorText = resultData.message || "Google Apps Script returned an error";
      await logAudit("Failed", errorText);
      return {
        ok: false,
        deliveryStatus: "Failed",
        message: errorText,
        logId,
        rawResponse: resultData,
      };
    }

    // Success via direct Google Apps Script Web App
    await logAudit("Sent");
    return {
      ok: true,
      deliveryStatus: "Sent",
      message: `Email dispatched successfully to ${payload.to} via Google Apps Script`,
      logId,
      rawResponse: resultData,
    };
  } catch (err: any) {
    const errorText = err?.message || "Failed to reach Google Apps Script Web App";
    await logAudit("Failed", errorText);
    return {
      ok: false,
      deliveryStatus: "Failed",
      message: `Failed to send email: ${errorText}`,
      logId,
    };
  }
}
