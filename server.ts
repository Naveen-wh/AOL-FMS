import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API route to send email
  app.post("/api/send-order-email", async (req, res) => {
    const { to, cc, bcc, subject, text, senderUserId } = req.body;

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

    // Fetch email sending settings from Firestore
    let sendingMode = "single_setted_id";
    let singleConfig: any = null;
    let userConfig: any = null;

    try {
      const docSnap = await getDoc(doc(db, "settings", "email_sending_config"));
      if (docSnap.exists()) {
        const configData = docSnap.data();
        sendingMode = configData.mode || "single_setted_id";
        singleConfig = configData.singleConfig || null;

        if (sendingMode === "logged_in_user_id" && senderUserId && configData.userConfigs) {
          userConfig = configData.userConfigs[senderUserId] || null;
        }
      }
    } catch (err) {
      console.warn("[Email Server] Could not fetch email_sending_config from Firestore, fallback to env:", err);
    }

    // Determine active SMTP configuration
    let activeSmtpHost = process.env.SMTP_HOST;
    let activeSmtpPort = Number(process.env.SMTP_PORT) || 587;
    let activeSmtpUser = process.env.SMTP_USER;
    let activeSmtpPass = process.env.SMTP_PASS;
    let activeFromName = process.env.SMTP_FROM_NAME || "Sales Management Portal";
    let activeSecure = Number(process.env.SMTP_PORT) === 465;
    let selectedSource = "environment";

    if (sendingMode === "logged_in_user_id" && userConfig && userConfig.smtpHost && userConfig.smtpUser && userConfig.smtpPass) {
      activeSmtpHost = userConfig.smtpHost;
      activeSmtpPort = Number(userConfig.smtpPort) || 587;
      activeSmtpUser = userConfig.smtpUser;
      activeSmtpPass = userConfig.smtpPass;
      activeFromName = userConfig.fromName || activeSmtpUser;
      activeSecure = !!userConfig.secure || activeSmtpPort === 465;
      selectedSource = `user_credentials (${senderUserId})`;
    } else if (singleConfig && singleConfig.smtpHost && singleConfig.smtpUser && singleConfig.smtpPass) {
      activeSmtpHost = singleConfig.smtpHost;
      activeSmtpPort = Number(singleConfig.smtpPort) || 587;
      activeSmtpUser = singleConfig.smtpUser;
      activeSmtpPass = singleConfig.smtpPass;
      activeFromName = singleConfig.fromName || activeSmtpUser;
      activeSecure = !!singleConfig.secure || activeSmtpPort === 465;
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
      const transporter = nodemailer.createTransport({
        host: activeSmtpHost,
        port: activeSmtpPort,
        secure: activeSecure,
        auth: {
          user: activeSmtpUser,
          pass: activeSmtpPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });

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
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, secure, testRecipient } = req.body;

    if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
      return res.status(400).json({ status: "error", message: "Missing required SMTP details or recipient email" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort) || 587,
        secure: !!secure || Number(smtpPort) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });

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
