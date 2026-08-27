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

    let { to, cc, bcc, subject, text, senderUserId, category } = req.body;

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

    const isHtml = /<[a-z][\s\S]*>/i.test(text);
    const plainText = isHtml ? text.replace(/<[^>]*>/g, "") : text;

    // Convert email body text to clean HTML without breaking HTML tables with <br/> tags
    const formatEmailHtml = (bodyStr: string) => {
      if (!bodyStr) return "";
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(bodyStr);
      if (!hasHtmlTags) {
        return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">${bodyStr.replace(/\n/g, "<br/>")}</div>`;
      }
      // Split text by <table>...</table> blocks
      const tableRegex = /(<table[\s\S]*?<\/table>)/gi;
      const parts = bodyStr.split(tableRegex);
      const formattedParts = parts.map((part) => {
        if (part.toLowerCase().startsWith("<table")) {
          // Clean stray <br/> tags and extra newlines inside table HTML
          return part.replace(/<br\s*\/?>/gi, "").replace(/\s*\n\s*/g, " ");
        } else {
          return part.replace(/\n/g, "<br/>");
        }
      });
      return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">${formattedParts.join("")}</div>`;
    };

    const htmlText = formatEmailHtml(text);

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

    if (!activeSmtpHost || !activeSmtpUser || !activeSmtpPass) {
      console.log(`[Email Simulation] Mode: ${sendingMode}, Source: ${selectedSource}, SenderUserId: ${senderUserId || 'N/A'}, To: ${to}, Subject: ${subject}`);
      return res.json({ 
        status: "success", 
        simulated: true, 
        sendingMode,
        source: selectedSource,
        message: "Email simulated successfully (SMTP credentials not configured)" 
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
      res.json({ 
        status: "success", 
        sendingMode, 
        source: selectedSource, 
        senderEmail: activeSmtpUser 
      });
    } catch (error: any) {
      console.error("Error sending email via SMTP, falling back to simulation:", error);
      res.json({ 
        status: "success", 
        simulated: true, 
        sendingMode,
        source: selectedSource,
        warning: `SMTP error (${error.message || "Unexpected socket close"}), email recorded & simulated successfully.` 
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

    const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, secure, testRecipient } = req.body;

    if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
      return res.status(400).json({ status: "error", message: "Missing required SMTP details or recipient email" });
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
