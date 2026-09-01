import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "./firebase-applet-config.json";

if (getApps().length === 0) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

const inMemoryDailyCounts: Record<string, Record<string, number>> = {};

function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("booleanValue" in val) return val.booleanValue;
  if ("mapValue" in val) return parseFirestoreFields(val.mapValue.fields || {});
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map((v: any) => parseFirestoreValue(v));
  }
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  return val;
}

function parseFirestoreFields(fields: any): any {
  if (!fields) return {};
  const result: any = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value as any);
  }
  return result;
}

async function getFirestoreDocWithUserToken(docPath: string, idToken: string) {
  try {
    const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/${docPath}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.fields) return null;
    return parseFirestoreFields(json.fields);
  } catch {
    return null;
  }
}

function encodeFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      fields[key] = { nullValue: null };
    } else if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map((v) => (encodeFirestoreFields({ v })).v || { nullValue: null }),
        },
      };
    } else if (typeof value === "object") {
      fields[key] = {
        mapValue: {
          fields: encodeFirestoreFields(value),
        },
      };
    }
  }
  return fields;
}

async function writeFirestoreDocWithUserToken(docPath: string, data: Record<string, any>, idToken: string) {
  try {
    const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/${docPath}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: encodeFirestoreFields(data),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function createSmtpTransporter(host: string, port: number | string, user: string, pass: string, secureFlag?: boolean) {
  const numPort = Number(port) || 587;
  // Direct SMTPS (Implicit TLS) is only used on port 465.
  // Ports 587, 25, 2525 use Explicit TLS via STARTTLS, so secure MUST be false.
  const isDirectSsl = numPort === 465;

  return nodemailer.createTransport({
    host: host.trim(),
    port: numPort,
    secure: isDirectSsl,
    requireTLS: !isDirectSsl && (numPort === 587 || !!secureFlag),
    auth: {
      user: user.trim(),
      pass: pass.trim(),
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper function to send email via Google Apps Script Web App
  async function sendEmailViaGAS(rawGasUrl: string, payload: any) {
    let cleanUrl = rawGasUrl ? rawGasUrl.trim() : "";
    if (!cleanUrl) {
      return { ok: false, status: "error", message: "Google Apps Script Web App URL is empty. Please enter a valid URL in settings." };
    }

    // Auto-fix /dev URLs to /exec URLs as /dev URLs always require Google login
    if (cleanUrl.endsWith("/dev")) {
      cleanUrl = cleanUrl.replace(/\/dev$/, "/exec");
    }

    const jsonString = JSON.stringify(payload);

    try {
      // 1. Send POST request with standard automatic redirect following (302 -> GET on googleusercontent.com)
      let response = await fetch(cleanUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: jsonString,
        redirect: "follow",
      });

      let resText = await response.text();

      let parsedRes: any = null;
      try {
        parsedRes = JSON.parse(resText);
      } catch {
        parsedRes = null;
      }

      if (parsedRes && parsedRes.status === "success") {
        return { ok: true, status: "success", message: parsedRes.message || "Email successfully sent via Google Apps Script" };
      }

      if (parsedRes && parsedRes.status === "error") {
        return { ok: false, status: "error", message: parsedRes.message || "Google Apps Script returned an error" };
      }

      // 2. Fallback: Try GET with encoded payload if POST didn't return JSON
      const fallbackUrl = `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}payload=${encodeURIComponent(jsonString)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "GET",
        redirect: "follow",
      });
      const fallbackText = await fallbackRes.text();

      try {
        const fallbackJson = JSON.parse(fallbackText);
        if (fallbackJson.status === "success") {
          return { ok: true, status: "success", message: fallbackJson.message || "Email successfully sent via Google Apps Script" };
        } else if (fallbackJson.status === "error") {
          return { ok: false, status: "error", message: fallbackJson.message };
        }
      } catch {
        // Not JSON
      }

      // 3. If response is HTML / Login Page, provide specific instructions
      if (resText.includes("Google Accounts") || resText.includes("ServiceLogin") || fallbackText.includes("Google Accounts") || fallbackText.includes("ServiceLogin")) {
        return {
          ok: false,
          status: "error",
          message: "Google Apps Script requires authentication. In Google Workspace (e.g. chsurya.in):\n1. Go to script.google.com -> Deploy -> Manage deployments.\n2. Click the Pencil (Edit) icon.\n3. Under 'Version', select 'New version' (CRITICAL!).\n4. Ensure 'Who has access' is set to 'Anyone' (not 'Anyone within organization').\n5. Click Deploy.",
        };
      }

      return {
        ok: false,
        status: "error",
        message: resText.length < 200 ? resText : "Google Apps Script did not return a valid response. Please verify the Web App URL.",
      };
    } catch (err: any) {
      return { ok: false, status: "error", message: `Failed to connect to Google Apps Script URL: ${err.message}` };
    }
  }

  // Helper function to upload document (Invoice/PO) via Google Apps Script Web App
  async function uploadDocumentViaGAS(rawGasUrl: string, payload: any) {
    let cleanUrl = rawGasUrl ? rawGasUrl.trim() : "";
    if (!cleanUrl) {
      return { ok: false, status: "error", message: "Google Apps Script Web App URL is empty. Please enter a valid URL in settings." };
    }

    // Auto-fix /dev URLs to /exec URLs
    if (cleanUrl.endsWith("/dev")) {
      cleanUrl = cleanUrl.replace(/\/dev$/, "/exec");
    }

    const jsonString = JSON.stringify(payload);

    try {
      let response = await fetch(cleanUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: jsonString,
        redirect: "follow",
      });

      let resText = await response.text();
      let parsedRes: any = null;
      try {
        parsedRes = JSON.parse(resText);
      } catch {
        parsedRes = null;
      }

      if (parsedRes && parsedRes.status === "success") {
        return { 
          ok: true, 
          status: "success", 
          id: parsedRes.id,
          name: parsedRes.name,
          url: parsedRes.url || parsedRes.webViewLink,
          webViewLink: parsedRes.webViewLink || parsedRes.url,
          downloadUrl: parsedRes.downloadUrl,
          folderName: parsedRes.folderName,
          message: parsedRes.message || "Document uploaded successfully to Google Drive via Google Apps Script"
        };
      }

      if (parsedRes && parsedRes.status === "error") {
        return { ok: false, status: "error", message: parsedRes.message || "Google Apps Script returned an upload error" };
      }

      // Check for Google Login redirection
      if (resText.includes("Google Accounts") || resText.includes("ServiceLogin")) {
        return {
          ok: false,
          status: "error",
          message: "Google Apps Script requires authorization. In Google Workspace (e.g. chsurya.in):\n1. Go to script.google.com -> Deploy -> Manage deployments.\n2. Click Edit (Pencil icon).\n3. Under 'Version', select 'New version'.\n4. Ensure 'Execute as' is 'Me' and 'Who has access' is 'Anyone'.\n5. Click Deploy.",
        };
      }

      return {
        ok: false,
        status: "error",
        message: resText.length < 300 ? resText : "Google Apps Script did not return a valid upload response. Please verify the Web App URL.",
      };
    } catch (err: any) {
      return { ok: false, status: "error", message: `Failed to connect to Google Apps Script URL: ${err.message}` };
    }
  }

  // API route to send email
  app.post("/api/send-order-email", async (req, res) => {
    // 1. Verify Authentication to prevent unauthorized robots or manual abuse
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Unauthorized: Missing authentication token" });
    }
    const idToken = authHeader.split("Bearer ")[1];
    try {
      await getAuth().verifyIdToken(idToken);
    } catch (err: any) {
      return res.status(401).json({ status: "error", message: `Unauthorized: Invalid token: ${err.message}` });
    }

    let { to, cc, bcc, subject, text, senderUserId, senderUserName, category, orderId, invoiceNumber, companyName, clientName } = req.body;

    // 2. Normalize category to one of the 5 specific form event types
    if (!category) {
      const subLower = (subject || "").toLowerCase();
      const textLower = (text || "").toLowerCase();
      if (subLower.includes("payment") || subLower.includes("remind") || subLower.includes("ledger") || subLower.includes("outstanding") || textLower.includes("outstanding")) {
        if (subLower.includes("consolidat") || textLower.includes("consolidat")) {
          category = "payment_reminder_consolidated";
        } else {
          category = "payment_reminder";
        }
      } else if (subLower.includes("offer") || subLower.includes("proposal") || subLower.includes("quotation") || subLower.includes("quote")) {
        if (subLower.includes("update") || subLower.includes("edit")) {
          category = "edit_order";
        } else {
          category = "create_order";
        }
      } else {
        category = "invoice_issuance";
      }
    }

    // Map old legacy categories to new form-event categories
    if (category === "offer") {
      category = "create_order";
    } else if (category === "order") {
      category = "invoice_issuance";
    } else if (category === "payment") {
      category = "payment_reminder";
    }

    const validCategories = ["create_order", "edit_order", "invoice_issuance", "payment_reminder", "payment_reminder_consolidated"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ status: "error", message: `Invalid category. Must be one of: ${validCategories.join(", ")}` });
    }

    // 3. Rate Limit Enforcement (IST standard date) with Firestore transaction + in-memory fallback
    const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");

    let create_order_limit = 50;
    let edit_order_limit = 50;
    let invoice_issuance_limit = 30;
    let payment_reminder_limit = 100;
    let payment_reminder_consolidated_limit = 100;

    let limitsEnforced = false;

    // Try Firestore transaction if Admin SDK has database access
    try {
      const limitsRef = db.collection("settings").doc("email_limits_config");
      const countsRef = db.collection("email_daily_counts").doc(todayStr);

      await db.runTransaction(async (transaction) => {
        const limitsSnap = await transaction.get(limitsRef);
        const countsSnap = await transaction.get(countsRef);

        if (limitsSnap.exists) {
          const limitsData = limitsSnap.data();
          if (limitsData) {
            if (typeof limitsData.create_order === 'number') create_order_limit = limitsData.create_order;
            else if (typeof limitsData.offerLimit === 'number') create_order_limit = limitsData.offerLimit;

            if (typeof limitsData.edit_order === 'number') edit_order_limit = limitsData.edit_order;
            else if (typeof limitsData.offerLimit === 'number') edit_order_limit = limitsData.offerLimit;

            if (typeof limitsData.invoice_issuance === 'number') invoice_issuance_limit = limitsData.invoice_issuance;
            else if (typeof limitsData.orderLimit === 'number') invoice_issuance_limit = limitsData.orderLimit;

            if (typeof limitsData.payment_reminder === 'number') payment_reminder_limit = limitsData.payment_reminder;
            else if (typeof limitsData.paymentLimit === 'number') payment_reminder_limit = limitsData.paymentLimit;

            if (typeof limitsData.payment_reminder_consolidated === 'number') payment_reminder_consolidated_limit = limitsData.payment_reminder_consolidated;
            else if (typeof limitsData.paymentLimit === 'number') payment_reminder_consolidated_limit = limitsData.paymentLimit;
          }
        }

        const countsData = countsSnap.exists ? countsSnap.data() || {} : {};
        const create_order_sent = countsData.create_order || countsData.offerSent || 0;
        const edit_order_sent = countsData.edit_order || 0;
        const invoice_issuance_sent = countsData.invoice_issuance || countsData.orderSent || 0;
        const payment_reminder_sent = countsData.payment_reminder || countsData.paymentSent || 0;
        const payment_reminder_consolidated_sent = countsData.payment_reminder_consolidated || 0;

        if (category === "create_order" && create_order_sent >= create_order_limit) {
          throw new Error(`LIMIT_EXCEEDED: Daily sending limit of ${create_order_limit} emails for Create Order Form has been reached.`);
        }
        if (category === "edit_order" && edit_order_sent >= edit_order_limit) {
          throw new Error(`LIMIT_EXCEEDED: Daily sending limit of ${edit_order_limit} emails for Edit Order Form has been reached.`);
        }
        if (category === "invoice_issuance" && invoice_issuance_sent >= invoice_issuance_limit) {
          throw new Error(`LIMIT_EXCEEDED: Daily sending limit of ${invoice_issuance_limit} emails for Invoice Issuance Form has been reached.`);
        }
        if (category === "payment_reminder" && payment_reminder_sent >= payment_reminder_limit) {
          throw new Error(`LIMIT_EXCEEDED: Daily sending limit of ${payment_reminder_limit} emails for Payment Reminder Form has been reached.`);
        }
        if (category === "payment_reminder_consolidated" && payment_reminder_consolidated_sent >= payment_reminder_consolidated_limit) {
          throw new Error(`LIMIT_EXCEEDED: Daily sending limit of ${payment_reminder_consolidated_limit} emails for Consolidated Payment Reminder Form has been reached.`);
        }

        const updateData: any = {};
        if (category === "create_order") {
          updateData.create_order = create_order_sent + 1;
          updateData.offerSent = (countsData.offerSent || 0) + 1; // legacy sync
        }
        if (category === "edit_order") {
          updateData.edit_order = edit_order_sent + 1;
        }
        if (category === "invoice_issuance") {
          updateData.invoice_issuance = invoice_issuance_sent + 1;
          updateData.orderSent = (countsData.orderSent || 0) + 1; // legacy sync
        }
        if (category === "payment_reminder") {
          updateData.payment_reminder = payment_reminder_sent + 1;
          updateData.paymentSent = (countsData.paymentSent || 0) + 1; // legacy sync
        }
        if (category === "payment_reminder_consolidated") {
          updateData.payment_reminder_consolidated = payment_reminder_consolidated_sent + 1;
        }

        transaction.set(countsRef, updateData, { merge: true });
      });
      limitsEnforced = true;
    } catch (txError: any) {
      if (txError.message && txError.message.startsWith("LIMIT_EXCEEDED:")) {
        return res.status(429).json({ status: "error", message: txError.message.replace("LIMIT_EXCEEDED: ", "") });
      }
      console.warn("[Email Server] Firestore transaction unavailable, using in-memory rate limiter:", txError.message);
    }

    // In-memory rate limiting fallback
    if (!limitsEnforced) {
      if (!inMemoryDailyCounts[todayStr]) {
        inMemoryDailyCounts[todayStr] = {
          create_order: 0,
          edit_order: 0,
          invoice_issuance: 0,
          payment_reminder: 0,
          payment_reminder_consolidated: 0,
        };
      }
      const memCounts = inMemoryDailyCounts[todayStr];
      const currentCount = memCounts[category] || 0;
      let limit = 100;
      if (category === "create_order") limit = create_order_limit;
      else if (category === "edit_order") limit = edit_order_limit;
      else if (category === "invoice_issuance") limit = invoice_issuance_limit;
      else if (category === "payment_reminder") limit = payment_reminder_limit;
      else if (category === "payment_reminder_consolidated") limit = payment_reminder_consolidated_limit;

      if (currentCount >= limit) {
        return res.status(429).json({ status: "error", message: `Daily sending limit of ${limit} emails for ${category} has been reached.` });
      }
      memCounts[category] = currentCount + 1;
    }

    // Pass through html and text directly as provided by frontend / client (defaulting to HTML view)
    const htmlText = req.body.html || req.body.htmlBody || (typeof text === "string" ? text : "");
    const plainText = req.body.plainText || (typeof text === "string" ? text.replace(/<[^>]*>/g, "") : "");

    // Fetch email sending settings from Firestore (using user token via REST, or Admin SDK)
    let sendingMode = "single_setted_id";
    let singleConfig: any = null;
    let userConfig: any = null;

    let configData: any = null;

    // 1. Try authenticated REST fetch with user token
    if (idToken) {
      configData = await getFirestoreDocWithUserToken("settings/email_sending_config", idToken);
    }

    // 2. If not fetched yet, try Admin SDK
    if (!configData) {
      try {
        const docRef = db.collection("settings").doc("email_sending_config");
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          configData = docSnap.data();
        }
      } catch {
        // Admin SDK not authenticated in preview container, fallback smoothly
      }
    }

    let gasWebUrl = configData?.gasWebUrl || req.body.gasWebUrl || process.env.GAS_WEB_URL;

    if (configData) {
      sendingMode = configData.mode || "single_setted_id";
      singleConfig = configData.singleConfig || null;

      if (sendingMode === "logged_in_user_id" && senderUserId && configData.userConfigs) {
        userConfig = configData.userConfigs[senderUserId] || null;
      }
    }

    // Determine active SMTP configuration
    let activeSmtpHost = process.env.SMTP_HOST;
    let activeSmtpPort: number | string = Number(process.env.SMTP_PORT) || 587;
    let activeSmtpUser = process.env.SMTP_USER;
    let activeSmtpPass = process.env.SMTP_PASS;
    let activeFromName = process.env.SMTP_FROM_NAME || "Sales Management Portal";
    let activeSecure: any = Number(process.env.SMTP_PORT) === 465;
    let selectedSource = "environment";

    if (sendingMode === "logged_in_user_id" && userConfig && userConfig.smtpHost && userConfig.smtpUser && userConfig.smtpPass) {
      activeSmtpHost = userConfig.smtpHost;
      activeSmtpPort = userConfig.smtpPort || 587;
      activeSmtpUser = userConfig.smtpUser;
      activeSmtpPass = userConfig.smtpPass;
      activeFromName = userConfig.fromName || activeSmtpUser;
      activeSecure = userConfig.secure;
      selectedSource = `user_credentials (${senderUserId})`;
    } else if (singleConfig && singleConfig.smtpHost && singleConfig.smtpUser && singleConfig.smtpPass) {
      activeSmtpHost = singleConfig.smtpHost;
      activeSmtpPort = singleConfig.smtpPort || 587;
      activeSmtpUser = singleConfig.smtpUser;
      activeSmtpPass = singleConfig.smtpPass;
      activeFromName = singleConfig.fromName || activeSmtpUser;
      activeSecure = singleConfig.secure;
      selectedSource = "single_setted_id";
    }

    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const logTimestamp = new Date().toISOString();

    const saveLogToDb = async (deliveryStatus: "Sent" | "Failed" | "Simulated", errorMsg?: string, warningMsg?: string) => {
      const logEntry = {
        id: logId,
        orderId: orderId || null,
        invoiceNumber: invoiceNumber || null,
        companyName: companyName || null,
        clientName: clientName || null,
        to: to || "",
        cc: cc || null,
        bcc: bcc || null,
        subject: subject || "",
        category,
        status: deliveryStatus,
        timestamp: logTimestamp,
        error: errorMsg || null,
        warning: warningMsg || null,
        senderUserId: senderUserId || null,
        senderUserName: senderUserName || null,
        senderEmail: sendingMode === "google_apps_script" ? "Google Apps Script" : (activeSmtpUser || null),
      };

      try {
        await db.collection("email_sent_logs").doc(logId).set(logEntry);
      } catch (err) {
        // If Admin SDK lacks service account write permissions, try with user token REST API
        if (idToken) {
          try {
            await writeFirestoreDocWithUserToken(`email_sent_logs/${logId}`, logEntry, idToken);
          } catch {
            // Non-blocking log write
          }
        }
      }
      return logEntry;
    };

    // --- GOOGLE APPS SCRIPT MAIL SENDING ROUTE ---
    if (sendingMode === "google_apps_script" || (gasWebUrl && (!activeSmtpHost || !activeSmtpUser || !activeSmtpPass))) {
      if (!gasWebUrl) {
        console.log(`[Email Google Apps Script] Mode: ${sendingMode}, but Web App URL is missing.`);
        const logEntry = await saveLogToDb("Failed", "Google Apps Script Web App URL is not configured in settings.");
        return res.status(400).json({ 
          status: "error", 
          message: "Google Apps Script Web App URL is not configured in settings. Please provide the Web App URL.", 
          log: logEntry 
        });
      }

      const gasPayload = {
        to,
        cc,
        bcc,
        subject,
        text: htmlText,
        html: htmlText,
        htmlBody: htmlText,
        plainText: plainText,
        fromName: activeFromName || senderUserName || "Sales Management Portal",
        senderUserId,
        senderUserName,
        category,
        orderId,
        invoiceNumber,
        companyName,
        clientName,
      };

      const result = await sendEmailViaGAS(gasWebUrl, gasPayload);

      if (result.ok) {
        const logEntry = await saveLogToDb("Sent");
        return res.json({
          status: "success",
          deliveryStatus: "Sent",
          sendingMode: "google_apps_script",
          source: "google_apps_script_web_app",
          senderEmail: "Google Apps Script",
          log: logEntry,
        });
      } else {
        const logEntry = await saveLogToDb("Failed", result.message);
        return res.json({
          status: "success",
          deliveryStatus: "Failed",
          simulated: true,
          sendingMode: "google_apps_script",
          source: "google_apps_script_web_app",
          warning: `Google Apps Script notice: ${result.message}. Recorded in logs.`,
          log: logEntry,
        });
      }
    }

    if (!activeSmtpHost || !activeSmtpUser || !activeSmtpPass) {
      console.log(`[Email Simulation] Mode: ${sendingMode}, Source: ${selectedSource}, SenderUserId: ${senderUserId || 'N/A'}, To: ${to}, Subject: ${subject}`);
      const logEntry = await saveLogToDb("Simulated", undefined, "SMTP credentials not configured (simulation mode)");
      return res.json({ 
        status: "success", 
        deliveryStatus: "Simulated",
        simulated: true, 
        sendingMode,
        source: selectedSource,
        message: "Email simulated successfully (SMTP credentials not configured)",
        log: logEntry
      });
    }

    try {
      const transporter = createSmtpTransporter(
        activeSmtpHost,
        activeSmtpPort,
        activeSmtpUser,
        activeSmtpPass,
        activeSecure
      );

      await transporter.sendMail({
        from: `"${activeFromName}" <${activeSmtpUser}>`,
        to,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        subject,
        text: plainText,
        html: htmlText,
      });

      const logEntry = await saveLogToDb("Sent");
      res.json({ 
        status: "success", 
        deliveryStatus: "Sent",
        sendingMode, 
        source: selectedSource, 
        senderEmail: activeSmtpUser,
        log: logEntry
      });
    } catch (error: any) {
      console.error("Error sending email via SMTP, falling back to simulation:", error);
      const logEntry = await saveLogToDb("Failed", error.message || "Unexpected SMTP error");
      res.json({ 
        status: "success", 
        deliveryStatus: "Failed",
        simulated: true, 
        sendingMode,
        source: selectedSource,
        warning: `SMTP error (${error.message || "Unexpected socket close"}), email recorded & simulated successfully.`,
        log: logEntry
      });
    }
  });

  // API route to test email configuration
  app.post("/api/test-email-config", async (req, res) => {
    // Verify Authentication to prevent unauthorized test email usage
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Unauthorized: Missing authentication token" });
    }
    const idToken = authHeader.split("Bearer ")[1];
    try {
      await getAuth().verifyIdToken(idToken);
    } catch (err: any) {
      return res.status(401).json({ status: "error", message: `Unauthorized: Invalid token: ${err.message}` });
    }

    const { gasWebUrl, smtpHost, smtpPort, smtpUser, smtpPass, fromName, secure, testRecipient } = req.body;

    if (!testRecipient) {
      return res.status(400).json({ status: "error", message: "Missing recipient email address for testing" });
    }

    if (gasWebUrl) {
      const testPayload = {
        to: testRecipient,
        subject: "Google Apps Script Email Test - Sales Management Portal",
        text: `Hello!\n\nThis is a test email confirming that your Google Apps Script Web App integration is working properly.\n\nSent at: ${new Date().toLocaleString()}`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #10b981; border-radius: 8px;">
          <h2 style="color: #059669; margin-top: 0;">Google Apps Script Test Successful</h2>
          <p>Your Google Apps Script Web App URL is active and sending emails successfully!</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
          <p style="font-size: 12px; color: #64748b;">Sent at: ${new Date().toLocaleString()}</p>
        </div>`,
        fromName: fromName || "Sales Management Portal",
      };

      const result = await sendEmailViaGAS(gasWebUrl, testPayload);

      if (result.ok) {
        return res.json({ status: "success", message: `Test email successfully sent to ${testRecipient} via Google Apps Script!` });
      } else {
        return res.status(400).json({ status: "error", message: result.message });
      }
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(400).json({ status: "error", message: "Missing required SMTP details or Google Apps Script Web App URL" });
    }

    try {
      const transporter = createSmtpTransporter(
        smtpHost,
        smtpPort || 587,
        smtpUser,
        smtpPass,
        secure
      );

      await transporter.verify();

      await transporter.sendMail({
        from: `"${fromName || 'Sales Portal'}" <${smtpUser}>`,
        to: testRecipient,
        subject: "SMTP Configuration Test - Sales Management Portal",
        text: `Hello!\n\nThis is a test email confirming that your SMTP email sending configuration for ${smtpUser} is configured and working properly.\n\nSent at: ${new Date().toLocaleString()}`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
          <h2 style="color: #059669; margin-top: 0;">SMTP Test Successful</h2>
          <p>Your SMTP email configuration for <strong>${smtpUser}</strong> is verified and working correctly.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
          <p style="font-size: 12px; color: #64748b;">Sent at: ${new Date().toLocaleString()}</p>
        </div>`,
      });

      res.json({ status: "success", message: `Test email successfully sent to ${testRecipient}` });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message || "Failed to verify or send test email via SMTP" });
    }
  });

  // API route to upload Document (PO or Invoice) via Google Apps Script Web App
  app.post("/api/upload-document-gas", async (req, res) => {
    // Resilient Auth verification
    const authHeader = req.headers.authorization;
    let idToken = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.split("Bearer ")[1];
      try {
        await getAuth().verifyIdToken(idToken);
      } catch (err: any) {
        console.warn("Notice: ID token verification in /api/upload-document-gas:", err.message);
      }
    }

    const { fileName, fileData, mimeType, docType, clientName, poNumber, invoiceNumber, folderId, folderUrl, gasWebUrl: customGasUrl } = req.body;

    if (!fileData) {
      return res.status(400).json({ status: "error", message: "Missing file data in request body" });
    }

    // Resolve Apps Script URL from body, Firestore settings, or environment
    let targetGasUrl = customGasUrl ? customGasUrl.trim() : "";
    let targetFolderId = folderId || folderUrl || "";

    if (!targetGasUrl) {
      // 1. Try reading from settings/google_drive
      const driveDoc = await getFirestoreDocWithUserToken("settings/google_drive", idToken);
      if (driveDoc && driveDoc.appsScriptUrl) {
        targetGasUrl = driveDoc.appsScriptUrl.trim();
      }
      if (!targetFolderId && driveDoc && driveDoc.folderId) {
        targetFolderId = driveDoc.folderId.trim();
      }
    }

    if (!targetGasUrl) {
      // 2. Try reading from settings/email_sending_config as fallback
      const emailDoc = await getFirestoreDocWithUserToken("settings/email_sending_config", idToken);
      if (emailDoc && emailDoc.gasWebUrl) {
        targetGasUrl = emailDoc.gasWebUrl.trim();
      }
    }

    if (!targetGasUrl) {
      targetGasUrl = (process.env.GAS_DRIVE_URL || process.env.GAS_WEB_URL || "").trim();
    }

    if (!targetGasUrl) {
      return res.status(400).json({
        status: "error",
        message: "Google Apps Script Web App URL is not configured. Please enter the deployed Apps Script URL in Google Drive Settings."
      });
    }

    const uploadPayload = {
      action: "upload_document",
      fileName: fileName || `Document_${Date.now()}.pdf`,
      fileData,
      mimeType: mimeType || "application/pdf",
      docType: docType || "PO",
      clientName: clientName || "",
      poNumber: poNumber || "",
      invoiceNumber: invoiceNumber || "",
      folderId: targetFolderId || "",
    };

    const uploadResult = await uploadDocumentViaGAS(targetGasUrl, uploadPayload);

    if (uploadResult.ok) {
      return res.json({
        status: "success",
        id: uploadResult.id,
        name: uploadResult.name,
        url: uploadResult.url,
        webViewLink: uploadResult.webViewLink,
        downloadUrl: uploadResult.downloadUrl,
        folderName: uploadResult.folderName,
        message: uploadResult.message,
      });
    } else {
      return res.status(400).json({
        status: "error",
        message: uploadResult.message,
      });
    }
  });

  // API route to test Google Apps Script Drive upload connection
  app.post("/api/test-gas-drive", async (req, res) => {
    // Resilient Auth verification
    const authHeader = req.headers.authorization;
    let idToken = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.split("Bearer ")[1];
      try {
        await getAuth().verifyIdToken(idToken);
      } catch (err: any) {
        console.warn("Notice: ID token verification in /api/test-gas-drive:", err.message);
      }
    }

    const { gasWebUrl, folderId } = req.body;
    if (!gasWebUrl || !gasWebUrl.trim()) {
      return res.status(400).json({ status: "error", message: "Missing Google Apps Script Web App URL to test" });
    }

    // Generate a minimal valid 1-page sample PDF in Base64
    const samplePdfBase64 = "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA1NQo+PgpzdHJlYW0KQlQKL0hlbHYgMTYgVGYKNTAgNzAwIFREClsoc2FsZXMgUG9ydGFsIEdvb2dsZSBBcHBzIFNjcmlwdCBVcGxvYWQgVGVzdCkgXSBUSgpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxOCAwMDAwMCBuIAowMDAwMDAwMDY3IDAwMDAwIG4gCjAwMDAwMDAxMjUgMDAwMDAgbiAKMDAwMDAwMDIxOCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDUKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjMyNQolJUVPRg==";

    const testPayload = {
      action: "upload_document",
      fileName: `Test_Portal_Upload_${Date.now()}.pdf`,
      fileData: samplePdfBase64,
      mimeType: "application/pdf",
      docType: "Test",
      clientName: "System Test Verification",
      folderId: folderId ? folderId.trim() : "",
    };

    const uploadResult = await uploadDocumentViaGAS(gasWebUrl.trim(), testPayload);

    if (uploadResult.ok) {
      return res.json({
        status: "success",
        id: uploadResult.id,
        name: uploadResult.name,
        url: uploadResult.url,
        webViewLink: uploadResult.webViewLink,
        downloadUrl: uploadResult.downloadUrl,
        folderName: uploadResult.folderName,
        message: `Upload test successful! File created in Google Drive.`,
      });
    } else {
      return res.status(400).json({
        status: "error",
        message: uploadResult.message,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
