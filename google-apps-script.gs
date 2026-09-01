/**
 * Google Apps Script for Document Uploads (PO & Invoices) & Email Gateway
 * Full Support for Personal Google Drive & Google Workspace Shared Drives (Team Drives)
 * Sales Management Portal
 * 
 * =========================================================================
 * SETUP INSTRUCTIONS:
 * =========================================================================
 * 1. Go to https://script.google.com and click "New Project" (or open your existing project).
 * 2. Delete any existing code in Code.gs and PASTE THIS ENTIRE FILE.
 * 
 * 3. SHARED GOOGLE DRIVE / TEAM DRIVE INSTRUCTIONS (IMPORTANT!):
 *    - If you are using a Shared Google Drive:
 *      a) Open your Shared Drive in Google Drive (drive.google.com).
 *      b) Ensure the Google account deploying this script (e.g. naveen@chsurya.in)
 *         is added as a "Contributor", "Content Manager", or "Manager" on the Shared Drive.
 *      c) Create a folder inside the Shared Drive (e.g. "Customer_POs" or "SMS_PO").
 *      d) Open that folder, copy its URL from the browser address bar (e.g. https://drive.google.com/drive/folders/1ABCxyz...).
 *      e) Paste that folder URL in the Portal -> Admin Settings -> Google Drive Configuration (Folder ID / URL).
 * 
 * 4. ONE-TIME AUTHORIZATION:
 *    - In the top menu bar (next to "Debug"), select function "setupAndAuthorize".
 *    - Click "Run".
 *    - Click "Review Permissions" -> Choose your Google account.
 *    - Click "Advanced" -> "Go to Untitled project (unsafe)" -> Click "Allow".
 * 
 * 5. DEPLOY AS WEB APP:
 *    - Click the blue "Deploy" button (top right) -> "Manage deployments" (or "New deployment").
 *    - Click the Pencil ✏ (Edit) icon.
 *    - Under "Version", select "New version" (CRITICAL: always select New Version when updating!).
 *    - Execute as: "Me (your email address)"  <-- CRITICAL for zero-friction uploads!
 *    - Who has access: "Anyone"               <-- CRITICAL for seamless portal integration!
 *    - Click "Deploy".
 * 
 * 6. Copy the generated "Web app URL" (starts with https://script.google.com/macros/s/.../exec)
 *    and paste it into Portal Admin Settings (Google Drive Configuration / Email Config)!
 * =========================================================================
 */

// Optional: Default Google Drive Folder URL or Folder ID (can also be passed dynamically by the Portal)
var DEFAULT_FOLDER_LINK_OR_ID = "";

/**
 * Run this function ONCE in the Apps Script editor to authorize DriveApp and MailApp.
 */
function setupAndAuthorize() {
  var userEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  Logger.log("Authorizing script for: " + userEmail);

  // Test Drive access
  var testFolderName = "SMS_Portal_Drive_Ready";
  var folder = null;
  try {
    var folders = DriveApp.getFoldersByName(testFolderName);
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(testFolderName);
    Logger.log("Drive authorized. Test folder ID: " + folder.getId());
  } catch (dErr) {
    Logger.log("Drive notice: " + dErr);
  }

  // Test Mail access
  try {
    MailApp.sendEmail({
      to: userEmail,
      subject: "Google Apps Script Gateway Authorized!",
      body: "Your Google Apps Script Web App is authorized and ready to upload PO/Invoices to Google Drive (including Shared Drives) and send emails."
    });
  } catch (mErr) {
    Logger.log("MailApp notice: " + mErr);
  }

  return "SUCCESS: Authorized for " + userEmail + (folder ? (". Folder: " + folder.getName()) : "");
}

function doPost(e) {
  return handleRequest(e);
}

function doGet(e) {
  if (e && e.parameter && (e.parameter.action || e.parameter.payload || e.parameter.fileData || e.parameter.to)) {
    return handleRequest(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Sales Management Portal - Google Apps Script Gateway (Shared Drive & Mail Ready)",
    timestamp: new Date().toISOString(),
    user: Session.getEffectiveUser().getEmail(),
    hasDefaultFolder: Boolean(DEFAULT_FOLDER_LINK_OR_ID && DEFAULT_FOLDER_LINK_OR_ID.trim() !== "")
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
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

    // Route 1: Document / File Upload to Google Drive (Personal or Shared Drive)
    if (
      data.action === "upload_document" ||
      data.action === "upload_file" ||
      data.action === "upload_po" ||
      data.action === "upload_invoice" ||
      data.fileData ||
      data.base64
    ) {
      return handleFileUpload(data);
    }

    // Route 2: Email Sending
    if (data.to || data.action === "send_email") {
      return handleEmailRequest(data);
    }

    // Route 3: Ping / Health Check
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Gateway is online and listening",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Extracts clean Google Drive folder ID or Shared Drive ID from raw ID or full Drive URL
 * Supports:
 * - https://drive.google.com/drive/folders/1ABCxyz...
 * - https://drive.google.com/drive/u/0/folders/1ABCxyz...
 * - https://drive.google.com/drive/u/1/folders/1ABCxyz...
 * - https://drive.google.com/drive/u/0/drives/0AJxyz...
 * - https://drive.google.com/drive/folders/0AJxyz...
 * - Raw alphanumeric IDs
 */
function extractFolderId(input) {
  if (!input || typeof input !== "string") return "";
  var str = input.trim();
  
  var uFolderMatch = str.match(/\/u\/\d+\/folders\/([a-zA-Z0-9_\-]+)/);
  if (uFolderMatch && uFolderMatch[1]) return uFolderMatch[1];

  var folderMatch = str.match(/\/folders\/([a-zA-Z0-9_\-]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];

  var uDriveMatch = str.match(/\/u\/\d+\/drives\/([a-zA-Z0-9_\-]+)/);
  if (uDriveMatch && uDriveMatch[1]) return uDriveMatch[1];

  var driveMatch = str.match(/\/drives\/([a-zA-Z0-9_\-]+)/);
  if (driveMatch && driveMatch[1]) return driveMatch[1];

  var queryMatch = str.match(/[?&]id=([a-zA-Z0-9_\-]+)/);
  if (queryMatch && queryMatch[1]) return queryMatch[1];

  return str.split("?")[0].split("&")[0].trim();
}

/**
 * Resolves a Google Drive Folder or Shared Drive destination safely
 */
function resolveDestinationFolder(targetFolderId, defaultFolderName) {
  var folder = null;

  // 1. Try resolving by targetFolderId (works for all folders and Shared Drive folders)
  if (targetFolderId) {
    try {
      folder = DriveApp.getFolderById(targetFolderId);
      if (folder) return folder;
    } catch (fErr) {
      Logger.log("DriveApp.getFolderById notice for (" + targetFolderId + "): " + fErr);
    }
  }

  // 2. Try searching folders by name in accessible drives
  var searchName = defaultFolderName || "SMS_PO";
  try {
    var existingFolders = DriveApp.getFoldersByName(searchName);
    if (existingFolders.hasNext()) {
      return existingFolders.next();
    }
  } catch (searchErr) {
    Logger.log("getFoldersByName notice: " + searchErr);
  }

  // 3. Fallback: Create folder in root
  try {
    folder = DriveApp.createFolder(searchName);
    return folder;
  } catch (createErr) {
    Logger.log("createFolder notice: " + createErr);
    return DriveApp.getRootFolder();
  }
}

/**
 * Handles Document / File Upload (PO or Invoice PDF) to Google Drive / Shared Drive
 */
function handleFileUpload(data) {
  var rawData = data.fileData || data.base64 || "";
  if (!rawData) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Missing 'fileData' or 'base64' in payload"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Strip data: prefix if present (e.g. data:application/pdf;base64,...)
  var base64Content = rawData;
  if (rawData.indexOf(",") > -1) {
    base64Content = rawData.split(",")[1];
  }

  var fileName = data.fileName || data.name || ("Document_" + new Date().getTime() + ".pdf");
  var mimeType = data.mimeType || "application/pdf";
  var decodedBytes = Utilities.base64Decode(base64Content);
  var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

  // Determine Target Folder
  var rawFolderInput = data.folderId || data.folderUrl || data.folderLink || DEFAULT_FOLDER_LINK_OR_ID;
  var targetFolderId = extractFolderId(rawFolderInput);

  var parentFolder = resolveDestinationFolder(targetFolderId, data.folderName || "SMS_PO");

  if (!parentFolder) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Could not access or create target Google Drive folder. If using a Shared Drive, please ensure the Google account deploying the script is added to the Shared Drive with Contributor or Manager access."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Organize by Client/Company Name into subfolder if provided
  var destinationFolder = parentFolder;
  var clientName = data.clientName || data.companyName;
  if (clientName && clientName.trim() !== "") {
    var cleanClient = clientName.trim().replace(/[\/\\:*?"<>|]/g, "_");
    try {
      var subFolders = parentFolder.getFoldersByName(cleanClient);
      if (subFolders.hasNext()) {
        destinationFolder = subFolders.next();
      } else {
        destinationFolder = parentFolder.createFolder(cleanClient);
      }
    } catch (subErr) {
      Logger.log("Notice: Could not create/find client subfolder (" + cleanClient + "), saving in parent folder: " + subErr);
      destinationFolder = parentFolder;
    }
  }

  // Create the File in Google Drive
  var createdFile = destinationFolder.createFile(blob);

  // Set file sharing permission safely (Shared Drives manage permissions at drive/organization level)
  try {
    createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (permErr) {
    Logger.log("Notice: setSharing skipped (Shared Drive handles permissions): " + permErr);
  }

  var fileUrl = createdFile.getUrl();
  var downloadUrl = fileUrl;
  try {
    if (createdFile.getDownloadUrl) {
      downloadUrl = createdFile.getDownloadUrl();
    }
  } catch (dErr) {}

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    id: createdFile.getId(),
    name: createdFile.getName(),
    url: fileUrl,
    webViewLink: fileUrl,
    downloadUrl: downloadUrl,
    size: createdFile.getSize(),
    folderId: destinationFolder.getId(),
    folderName: destinationFolder.getName(),
    parentFolderName: parentFolder.getName(),
    docType: data.docType || "Document",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles Email Sending via MailApp
 */
function handleEmailRequest(data) {
  var to = data.to;
  var subject = data.subject || "No Subject";
  var body = data.text || data.html || data.body || "";
  var isHtml = /<[a-z][\s\S]*>/i.test(body);

  if (!to) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Missing 'to' recipient email address"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var mailOptions = {
    to: to,
    subject: subject,
    name: data.fromName || "Sales Management Portal"
  };

  if (isHtml) {
    mailOptions.htmlBody = body;
    mailOptions.body = body.replace(/<[^>]*>/g, ""); // plain text fallback
  } else {
    mailOptions.body = body;
  }

  if (data.cc) mailOptions.cc = data.cc;
  if (data.bcc) mailOptions.bcc = data.bcc;
  if (data.replyTo) mailOptions.replyTo = data.replyTo;

  // Handle PDF / Document attachments if provided
  if (data.attachments && Array.isArray(data.attachments)) {
    var blobs = [];
    for (var i = 0; i < data.attachments.length; i++) {
      var att = data.attachments[i];
      if (att && (att.data || att.base64)) {
        var rawB64 = att.data || att.base64;
        if (rawB64.indexOf(",") > -1) rawB64 = rawB64.split(",")[1];
        var attBytes = Utilities.base64Decode(rawB64);
        var attBlob = Utilities.newBlob(attBytes, att.mimeType || "application/pdf", att.name || ("Attachment_" + (i + 1) + ".pdf"));
        blobs.push(attBlob);
      }
    }
    if (blobs.length > 0) {
      mailOptions.attachments = blobs;
    }
  }

  MailApp.sendEmail(mailOptions);

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Email sent successfully to " + to,
    to: to,
    subject: subject,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
