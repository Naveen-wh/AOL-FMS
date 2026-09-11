/**
 * Google Drive integration service using Google Drive API v3.
 * Handles direct Google Drive OAuth authentication, folder/Shared Drive resolution,
 * client subfolder organization, and multipart file uploads.
 */

import { auth, getGoogleProvider, signInWithPopup, db, doc, getDoc, setDoc } from "../firebase";
import { GoogleAuthProvider } from "firebase/auth";

let cachedAccessToken: string | null = null;

export interface DriveSettings {
  // PO Upload Settings
  folderName: string;
  folderId: string;
  appsScriptUrl?: string;

  // Invoice Upload Settings
  invoiceFolderName?: string;
  invoiceFolderId?: string;
  invoiceAppsScriptUrl?: string;

  // Common / Legacy fields
  driveType?: "shared_drive" | "shared_folder" | "my_drive";
  adminAccessToken?: string;
  tokenExpiry?: number;
  allowAllTeams?: boolean;
  allowedTeamIds?: string[];
  uploadMode?: "google_drive_oauth" | "apps_script";
}

/**
 * Complete Google Apps Script template code for uploading Customer PO documents to Google Drive.
 * Deployed as a Web App (Execute as: Me, Who has access: Anyone) so portal users do not need to authenticate every time.
 */
export const DEFAULT_PO_UPLOAD_APPS_SCRIPT_CODE = `/**
 * GOOGLE APPS SCRIPT WEB APP FOR AUTO-UPLOADING CUSTOMER PO DOCUMENTS TO GOOGLE DRIVE
 * (Zero OAuth login required by portal users)
 * 
 * Deployment Steps:
 * 1. Open https://script.google.com and click "New project".
 * 2. Replace all code in Code.gs with this exact script.
 * 3. In the top toolbar, select function "setupAndAuthorize" and click "Run".
 *    Authorize access to Google Drive when prompted by Google.
 * 4. Click "Deploy" (top right) -> "New deployment".
 *    - Click the gear icon -> Select "Web app"
 *    - Description: "PO Document Upload Gateway"
 *    - Execute as: "Me (your Google email)"
 *    - Who has access: "Anyone" (Required for background portal uploads without popup)
 * 5. Click "Deploy" and copy the Web App URL (starts with https://script.google.com/macros/s/.../exec).
 * 6. Paste the Web App URL into the Sales Management Portal (Dashboard -> Admin Settings -> PO Upload Settings)!
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No POST body content received."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Invalid JSON payload: " + parseErr.message
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var base64Data = data.fileData;
    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Missing fileData (base64 string)."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var fileName = data.fileName || ("PO_Document_" + (new Date()).getTime() + ".pdf");
    var mimeType = data.mimeType || "application/pdf";
    var folderId = data.folderId || "";
    var folderName = data.folderName || "SMS_PO";
    var clientName = data.clientName || "";

    // 1. Decode base64 to byte array blob
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);

    // 2. Resolve target root folder
    var parentFolder;
    if (folderId && folderId.trim() !== "") {
      try {
        parentFolder = DriveApp.getFolderById(folderId.trim());
      } catch (err) {
        parentFolder = getOrCreateFolder(folderName);
      }
    } else {
      parentFolder = getOrCreateFolder(folderName);
    }

    // 3. Resolve client subfolder if provided
    var targetFolder = parentFolder;
    if (clientName && clientName.trim() !== "") {
      targetFolder = getOrCreateSubfolder(parentFolder, clientName.trim());
    }

    // 4. Create file in Google Drive
    var file = targetFolder.createFile(blob);

    // 5. Set sharing permission to View for Anyone with Link
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Sharing error (domain policy may restrict): " + shareErr);
    }

    var webViewLink = file.getUrl();
    var fileId = file.getId();

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      id: fileId,
      name: file.getName(),
      webViewLink: webViewLink,
      url: webViewLink,
      size: file.getSize()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    service: "PO Upload Google Drive Gateway",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function getOrCreateSubfolder(parentFolder, subfolderName) {
  var folders = parentFolder.getFoldersByName(subfolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(subfolderName);
}

// Run this once inside Google Apps Script editor to authorize DriveApp
function setupAndAuthorize() {
  var root = DriveApp.getRootFolder();
  Logger.log("DriveApp authorization successful: " + root.getName());
}
`;

/**
 * Complete Google Apps Script template code for uploading Invoice documents to Google Drive.
 * Deployed as a separate Web App so Invoices can be organized in their own dedicated Google Drive location.
 */
export const DEFAULT_INVOICE_UPLOAD_APPS_SCRIPT_CODE = `/**
 * GOOGLE APPS SCRIPT WEB APP FOR AUTO-UPLOADING INVOICE DOCUMENTS TO GOOGLE DRIVE
 * (Zero OAuth login required by portal users)
 * 
 * Deployment Steps:
 * 1. Open https://script.google.com and click "New project".
 * 2. Replace all code in Code.gs with this exact script.
 * 3. In the top toolbar, select function "setupAndAuthorize" and click "Run".
 *    Authorize access to Google Drive when prompted by Google.
 * 4. Click "Deploy" (top right) -> "New deployment".
 *    - Click the gear icon -> Select "Web app"
 *    - Description: "Invoice Document Upload Gateway"
 *    - Execute as: "Me (your Google email)"
 *    - Who has access: "Anyone" (Required for background portal uploads without popup)
 * 5. Click "Deploy" and copy the Web App URL (starts with https://script.google.com/macros/s/.../exec).
 * 6. Paste the Web App URL into the Sales Management Portal (Dashboard -> Admin Settings -> Invoice Upload Settings)!
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No POST body content received."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Invalid JSON payload: " + parseErr.message
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var base64Data = data.fileData;
    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Missing fileData (base64 string)."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var fileName = data.fileName || ("INV_Document_" + (new Date()).getTime() + ".pdf");
    var mimeType = data.mimeType || "application/pdf";
    var folderId = data.folderId || "";
    var folderName = data.folderName || "SMS_INVOICES";
    var clientName = data.clientName || "";

    // 1. Decode base64 to byte array blob
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);

    // 2. Resolve target root folder
    var parentFolder;
    if (folderId && folderId.trim() !== "") {
      try {
        parentFolder = DriveApp.getFolderById(folderId.trim());
      } catch (err) {
        parentFolder = getOrCreateFolder(folderName);
      }
    } else {
      parentFolder = getOrCreateFolder(folderName);
    }

    // 3. Resolve client subfolder if provided
    var targetFolder = parentFolder;
    if (clientName && clientName.trim() !== "") {
      targetFolder = getOrCreateSubfolder(parentFolder, clientName.trim());
    }

    // 4. Create file in Google Drive
    var file = targetFolder.createFile(blob);

    // 5. Set sharing permission to View for Anyone with Link
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Sharing error (domain policy may restrict): " + shareErr);
    }

    var webViewLink = file.getUrl();
    var fileId = file.getId();

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      id: fileId,
      name: file.getName(),
      webViewLink: webViewLink,
      url: webViewLink,
      size: file.getSize()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    service: "Invoice Upload Google Drive Gateway",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function getOrCreateSubfolder(parentFolder, subfolderName) {
  var folders = parentFolder.getFoldersByName(subfolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(subfolderName);
}

// Run this once inside Google Apps Script editor to authorize DriveApp
function setupAndAuthorize() {
  var root = DriveApp.getRootFolder();
  Logger.log("DriveApp authorization successful: " + root.getName());
}
`;

/**
 * Extracts and sanitizes a Google Drive Folder ID or Shared Drive ID
 * from a raw ID or full Google Drive URL (including Shared Drives /folders/ or /drives/ URLs).
 */
export function extractDriveFolderId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // Pattern: https://drive.google.com/drive/u/0/folders/XYZ or /folders/XYZ
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_\-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  // Pattern: https://drive.google.com/drive/u/0/drives/XYZ or /drives/XYZ (Shared Drive Root)
  const driveMatch = trimmed.match(/\/drives\/([a-zA-Z0-9_\-]+)/);
  if (driveMatch && driveMatch[1]) {
    return driveMatch[1];
  }

  // Pattern: ?id=XYZ or &id=XYZ
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_\-]+)/);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  // Strip query parameters if pasted as ID with ?...
  const cleanId = trimmed.split("?")[0].split("&")[0].trim();
  return cleanId;
}

// Listen to auth sign-out to clear the cached token in memory
auth.onAuthStateChanged((user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

export function hasDriveConnection(settings?: DriveSettings | null): boolean {
  const platformToken = (window as any).googleOAuthToken;
  if (platformToken && typeof platformToken === "string") {
    return true;
  }
  if (cachedAccessToken) {
    return true;
  }
  if (settings && settings.adminAccessToken) {
    const expiry = settings.tokenExpiry;
    if (!expiry || expiry > Date.now()) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a specific user / team is authorized to connect to Google Drive and upload files.
 * Admins are always authorized.
 * If allowAllTeams is true (or undefined), all users are authorized.
 * Otherwise, the user's teamName or ID must be in allowedTeamIds.
 */
export function isUserTeamAllowedForDrive(
  user?: { role?: string; teamName?: string; id?: string } | null,
  settings?: DriveSettings | null
): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  if (!settings) return true; // Default allowed if not configured yet
  if (settings.allowAllTeams !== false) return true; // Default is all teams allowed
  if (!settings.allowedTeamIds || settings.allowedTeamIds.length === 0) return true;

  const userTeam = (user.teamName || "").trim().toLowerCase();
  return settings.allowedTeamIds.some(
    (t) => t.trim().toLowerCase() === userTeam || t.toLowerCase() === (user.id || "").toLowerCase()
  );
}

/**
 * Ensures we have a valid Google Drive access token.
 * If not cached or stored, prompts the user via Google pop-up to authorize.
 * When saving the refreshed token to Firestore, it preserves the pre-configured folderId and folderName.
 */
export async function ensureGoogleDriveAccess(forcePrompt = false): Promise<string> {
  // 1. If we have a system-injected token from AI Studio, ALWAYS prefer it as it requires zero popups.
  const platformToken = (window as any).googleOAuthToken;
  if (platformToken && typeof platformToken === "string") {
    cachedAccessToken = platformToken;
    return platformToken;
  }

  if (cachedAccessToken && !forcePrompt) {
    return cachedAccessToken;
  }

  // 2. Read from Firestore if available
  if (!forcePrompt) {
    try {
      const settings = await getSharedDriveSettings();
      if (settings && settings.adminAccessToken) {
        const expiry = settings.tokenExpiry;
        if (!expiry || expiry > Date.now()) {
          cachedAccessToken = settings.adminAccessToken;
          return settings.adminAccessToken;
        }
      }
    } catch (e) {
      console.error("Failed to load shared token from Firestore:", e);
    }
  }

  // 3. User initiated action or forcePrompt is true: prompt via popup
  try {
    const result = await signInWithPopup(auth, getGoogleProvider());
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error("No access token returned from Google Auth. Please ensure Drive permissions were approved.");
    }

    cachedAccessToken = token;

    // Save the new token to Firestore WITHOUT touching folderId, folderName or team settings!
    try {
      const currentSettings = await getSharedDriveSettings();
      const updatedSettings: DriveSettings = {
        folderName: currentSettings?.folderName || "SMS_PO",
        folderId: currentSettings?.folderId || "",
        driveType: currentSettings?.driveType || "shared_folder",
        allowAllTeams: currentSettings?.allowAllTeams ?? true,
        allowedTeamIds: currentSettings?.allowedTeamIds || [],
        adminAccessToken: token,
        tokenExpiry: Date.now() + 3500 * 1000, // expires in ~1 hour
        uploadMode: "google_drive_oauth",
      };
      await saveSharedDriveSettings(updatedSettings);
    } catch (e) {
      console.error("Failed to save retrieved token to Firestore:", e);
    }

    return token;
  } catch (error: any) {
    if (error?.code === "auth/popup-blocked" || error?.message?.includes("popup-blocked")) {
      const msg = "Google authorization pop-up was blocked by your browser. Please allow pop-ups for this site and try again.";
      console.warn(msg);
      throw new Error(msg);
    }
    console.error("Error securing Google Drive OAuth Token:", error);
    throw error;
  }
}

/**
 * Loads shared drive settings from Firestore
 */
export async function getSharedDriveSettings(): Promise<DriveSettings | null> {
  try {
    const docRef = doc(db, "settings", "google_drive");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as DriveSettings;
    }
    return null;
  } catch (error) {
    console.error("Error loading shared Drive settings from Firestore:", error);
    return null;
  }
}

/**
 * Saves shared drive settings to Firestore
 */
export async function saveSharedDriveSettings(settings: DriveSettings): Promise<void> {
  const docRef = doc(db, "settings", "google_drive");
  await setDoc(docRef, settings);
}

/**
 * Saves Apps Script upload URL to both localStorage and Firestore settings
 */
export async function saveAppsScriptUploadUrl(url: string): Promise<void> {
  const trimmed = (url || "").trim();
  try {
    localStorage.setItem("sms_po_apps_script_url", trimmed);
  } catch (e) {
    // ignore
  }
  try {
    const docRef = doc(db, "settings", "google_drive");
    await setDoc(docRef, { appsScriptUrl: trimmed, uploadMode: "apps_script" }, { merge: true });
  } catch (error) {
    console.error("Error saving appsScriptUrl to Firestore:", error);
  }
}

export function isDriveApiDisabledError(err: any): boolean {
  const msg = typeof err === "string" ? err : (err?.message || JSON.stringify(err || {}));
  return (
    msg.includes("accessNotConfigured") ||
    msg.includes("SERVICE_DISABLED") ||
    msg.includes("Google Drive API has not been used") ||
    msg.includes("drive.googleapis.com") ||
    msg.includes("GOOGLE_DRIVE_API_DISABLED")
  );
}

export function parseDriveApiError(errText: string, defaultContext: string): Error {
  if (
    errText.includes("accessNotConfigured") ||
    errText.includes("SERVICE_DISABLED") ||
    errText.includes("Google Drive API has not been used")
  ) {
    let projectNum = "";
    const match = errText.match(/project[s]?\/([0-9]+)/) || errText.match(/project=([0-9]+)/);
    if (match && match[1]) {
      projectNum = match[1];
    }
    const url = projectNum 
      ? `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${projectNum}`
      : "https://console.developers.google.com/apis/api/drive.googleapis.com/overview";

    return new Error(
      `GOOGLE_DRIVE_API_DISABLED: Google Drive API is disabled on your Google Cloud project (${projectNum || "GCP"}). Enable it at: ${url}`
    );
  }

  try {
    const parsed = JSON.parse(errText);
    if (parsed.error && parsed.error.message) {
      return new Error(`${defaultContext}: ${parsed.error.message}`);
    }
  } catch (e) {
    // not json
  }

  return new Error(`${defaultContext}: ${errText}`);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Finds or creates a folder with the given name in Google Drive or Shared Drives.
 */
export async function findOrCreateFolderByName(token: string, folderName: string): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  const queryStr = encodeURIComponent(`name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${queryStr}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw parseDriveApiError(errText, `Failed to search for folder ${folderName}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Folder not found, create it (supports Shared Drives & My Drive)
  const createUrl = "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true";
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw parseDriveApiError(errText, `Failed to create Google Drive folder ${folderName}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

/**
 * Resolves the shared parent folder to use. If not set, creates the default "SMS_PO"
 * folder and persists it to Firestore.
 */
export async function resolveSharedParentFolder(token: string): Promise<DriveSettings> {
  const stored = await getSharedDriveSettings();
  if (stored && stored.folderId && stored.folderId.trim() !== "") {
    return stored;
  }

  // Fallback / default folder only if admin hasn't set one yet
  const folderName = stored?.folderName || "SMS_PO";
  const folderId = await findOrCreateFolderByName(token, folderName);
  const settings: DriveSettings = {
    folderName,
    folderId,
    driveType: "my_drive",
    allowAllTeams: stored?.allowAllTeams ?? true,
    allowedTeamIds: stored?.allowedTeamIds || [],
    adminAccessToken: stored?.adminAccessToken || token,
    tokenExpiry: stored?.tokenExpiry || (Date.now() + 3500 * 1000),
    uploadMode: "google_drive_oauth",
  };

  try {
    await saveSharedDriveSettings(settings);
  } catch (e) {
    console.error("Failed to save default Drive settings to Firestore:", e);
  }

  return settings;
}

/**
 * Allows the admin to update the shared Google Drive folder.
 */
export async function updateSharedParentFolder(token: string, newFolderName: string): Promise<DriveSettings> {
  if (!newFolderName || newFolderName.trim() === "") {
    throw new Error("Folder name cannot be empty.");
  }
  
  const currentSettings = await getSharedDriveSettings();
  const folderId = await findOrCreateFolderByName(token, newFolderName.trim());
  const settings: DriveSettings = { 
    folderName: newFolderName.trim(), 
    folderId,
    driveType: currentSettings?.driveType || "my_drive",
    allowAllTeams: currentSettings?.allowAllTeams ?? true,
    allowedTeamIds: currentSettings?.allowedTeamIds || [],
    adminAccessToken: token,
    tokenExpiry: Date.now() + 3500 * 1000, // 1 hour minus buffer
    uploadMode: "google_drive_oauth",
  };
  await saveSharedDriveSettings(settings);
  return settings;
}

/**
 * Finds or creates a subfolder inside a specific parent folder or Shared Drive.
 */
export async function findOrCreateSubfolder(token: string, parentId: string, folderName: string): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  const queryStr = encodeURIComponent(`name = '${cleanName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${queryStr}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw parseDriveApiError(errText, `Failed to search for subfolder ${folderName}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Subfolder not found, create it inside the parent (supports Shared Drives and regular folders)
  const createUrl = "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true";
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw parseDriveApiError(errText, `Failed to create subfolder ${folderName}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

export interface DriveTargetVerification {
  valid: boolean;
  id: string;
  name: string;
  type: "shared_drive" | "shared_folder" | "my_drive" | "unknown";
  description: string;
}

/**
 * Verifies if a given ID is a valid Folder (in My Drive or Shared Drive) or a Shared Drive Root.
 */
export async function verifyDriveFolderOrSharedDrive(
  token: string,
  targetInput: string
): Promise<DriveTargetVerification> {
  const cleanId = extractDriveFolderId(targetInput);
  if (!cleanId) {
    throw new Error("Please provide a valid Google Drive Folder ID or Shared Drive ID.");
  }

  let lastErrorDetail = "";

  // 1. Try checking as a Root Shared Drive (Team Drive) via drives.get
  try {
    const driveUrl = `https://www.googleapis.com/drive/v3/drives/${cleanId}`;
    const res = await fetch(driveUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const driveData = await res.json();
      return {
        valid: true,
        id: driveData.id,
        name: driveData.name,
        type: "shared_drive",
        description: `Google Shared Drive "${driveData.name}" (Root Team Drive)`,
      };
    } else {
      const errText = await res.text();
      if (res.status === 403 || res.status === 401) {
        lastErrorDetail = errText;
      }
    }
  } catch (e: any) {
    console.warn("drives.get check failed:", e);
  }

  // 2. Try checking via drives.list (in case direct get requires listing)
  try {
    const drivesListUrl = `https://www.googleapis.com/drive/v3/drives?pageSize=100`;
    const res = await fetch(drivesListUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const listData = await res.json();
      const matched = (listData.drives || []).find((d: any) => d.id === cleanId);
      if (matched) {
        return {
          valid: true,
          id: matched.id,
          name: matched.name,
          type: "shared_drive",
          description: `Google Shared Drive "${matched.name}" (Root Team Drive)`,
        };
      }
    }
  } catch (e) {
    console.warn("drives.list check failed:", e);
  }

  // 3. Try checking as a file/folder in My Drive or inside a Shared Drive via files.get
  try {
    const fileUrl = `https://www.googleapis.com/drive/v3/files/${cleanId}?supportsAllDrives=true&fields=id,name,mimeType,driveId,capabilities`;
    const res = await fetch(fileUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.mimeType === "application/vnd.google-apps.folder") {
        const isInsideSharedDrive = Boolean(data.driveId);
        return {
          valid: true,
          id: data.id,
          name: data.name,
          type: isInsideSharedDrive ? "shared_folder" : "my_drive",
          description: isInsideSharedDrive
            ? `Folder "${data.name}" inside Google Shared Drive`
            : `Folder "${data.name}" in My Drive`,
        };
      } else {
        return {
          valid: true,
          id: data.id,
          name: data.name,
          type: "unknown",
          description: `Target is file "${data.name}". It is recommended to specify a Folder or Shared Drive ID.`,
        };
      }
    } else {
      const errText = await res.text();
      if (!lastErrorDetail && (res.status === 403 || res.status === 401)) {
        lastErrorDetail = errText;
      }
    }
  } catch (e: any) {
    console.warn("files.get check failed:", e);
  }

  if (lastErrorDetail) {
    if (lastErrorDetail.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || lastErrorDetail.includes("insufficientPermissions") || lastErrorDetail.includes("Insufficient Permission")) {
      throw new Error(`Google Drive permission needs to be refreshed or granted for this folder.`);
    }
    if (isDriveApiDisabledError(lastErrorDetail)) {
      throw parseDriveApiError(lastErrorDetail, "Google Drive API verification failed");
    }
  }

  throw new Error(`Google Drive ID "${cleanId}" not found or unauthorized for this account. Ensure your Google account has access to this Shared Drive/Folder.`);
}

/**
 * Helper to get formatted YYYY-MM-DD date string
 */
export function getFormattedDateString(dateInput?: string | Date): string {
  if (dateInput) {
    if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      return dateInput.trim();
    }
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    if (typeof dateInput === "string" && dateInput.trim() !== "") {
      return dateInput.trim().replace(/[^a-zA-Z0-9_\-]/g, "-");
    }
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Tests connection to a Google Apps Script Web App URL.
 */
export async function testAppsScriptConnection(url: string): Promise<{ success: boolean; message: string }> {
  try {
    const trimmed = (url || "").trim();
    if (!trimmed.startsWith("https://script.google.com/macros/s/")) {
      return { success: false, message: "URL must begin with https://script.google.com/macros/s/.../exec" };
    }
    // Apps Script doGet test
    const res = await fetch(trimmed, { method: "GET" });
    if (!res.ok) {
      return { success: false, message: `Apps Script returned HTTP status ${res.status}: ${res.statusText}` };
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return { success: true, message: data.service || "Connected to Google Apps Script Web App successfully!" };
    } catch {
      return { success: true, message: "Connected to Google Apps Script Web App endpoint." };
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to reach Google Apps Script Web App." };
  }
}

/**
 * Uploads a file to Google Drive using a deployed Google Apps Script Web App URL.
 * Requires NO client-side OAuth popups or tokens!
 */
export async function uploadPOViaAppsScript(
  file: File,
  appsScriptUrl: string,
  clientName?: string,
  poNumber?: string,
  folderId?: string,
  folderName?: string
): Promise<{ id: string; name: string; webViewLink: string; url: string }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanPo = (poNumber && poNumber.trim() !== "") 
    ? poNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const currentDateStr = getFormattedDateString();
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `PO_${cleanPo}_${currentDateStr}_${cleanBaseName}${ext}`;

  // Read file as Base64 string
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  const payload = {
    action: "uploadFile",
    fileName: finalFileName,
    fileData: base64Data,
    mimeType: file.type || "application/pdf",
    clientName: clientName || "",
    poNumber: poNumber || "",
    folderId: folderId || "",
    folderName: folderName || "SMS_PO",
  };

  // Google Apps Script Web App handles POST cleanly with text/plain without CORS preflight block
  const response = await fetch(appsScriptUrl.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Apps Script responded with status ${response.status}: ${response.statusText}`);
  }

  const responseText = await response.text();
  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error(`Invalid response from Apps Script: ${responseText.slice(0, 150)}`);
  }

  if (result.success === false || result.error) {
    throw new Error(result.error || "Failed to upload file via Apps Script");
  }

  const link = result.webViewLink || result.url || result.downloadUrl || "";
  return {
    id: result.id || result.fileId || `gas-${Date.now()}`,
    name: result.name || result.fileName || finalFileName,
    webViewLink: link,
    url: link,
  };
}

/**
 * Uploads a file to Google Drive.
 * If an Apps Script deployed URL is configured, it auto-uploads via Google Apps Script (NO OAuth popup needed!).
 * Otherwise, falls back to direct Google Drive OAuth API v3.
 * Filename format: PO_{{Customer PO Number}}_{{Current Date}}_{{Original File Name}}.pdf
 */
export async function uploadPOToDrive(
  file: File, 
  clientName?: string, 
  poNumber?: string,
  customAppsScriptUrl?: string
): Promise<{ id: string; name: string; webViewLink: string; isLocalFallback?: boolean; fallbackReason?: string; isAppsScript?: boolean }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanPo = (poNumber && poNumber.trim() !== "") 
    ? poNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const currentDateStr = getFormattedDateString();
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `PO_${cleanPo}_${currentDateStr}_${cleanBaseName}${ext}`;

  // 1. Check if Apps Script Web App URL is available (either passed directly, in localStorage, or in DriveSettings)
  let targetGasUrl = (customAppsScriptUrl || "").trim();
  if (!targetGasUrl) {
    try {
      targetGasUrl = localStorage.getItem("sms_po_apps_script_url") || "";
    } catch {
      // localStorage may fail in some environments
    }
  }
  if (!targetGasUrl) {
    try {
      const settings = await getSharedDriveSettings();
      if (settings?.appsScriptUrl) {
        targetGasUrl = settings.appsScriptUrl.trim();
      }
    } catch {
      // ignore
    }
  }

  // If Apps Script URL is present, upload via Apps Script (NO OAuth required!)
  if (targetGasUrl) {
    try {
      const gasResult = await uploadPOViaAppsScript(file, targetGasUrl, clientName, poNumber);
      return {
        id: gasResult.id,
        name: gasResult.name,
        webViewLink: gasResult.webViewLink,
        isAppsScript: true,
      };
    } catch (gasErr: any) {
      console.warn("Apps Script upload failed, checking fallback:", gasErr);
      throw new Error(`Google Apps Script upload failed: ${gasErr.message || gasErr}`);
    }
  }

  // 2. Direct OAuth Flow (Fallback when Apps Script URL is not set)
  try {
    // Get access token
    let token = "";
    try {
      token = await ensureGoogleDriveAccess(false);
    } catch (tokenErr) {
      // If token not available silently, prompt user since this is a direct upload click action
      token = await ensureGoogleDriveAccess(true);
    }

    // Resolve the shared parent folder setting
    const parentFolder = await resolveSharedParentFolder(token);
    let targetFolderId = parentFolder.folderId;

    // Find or create a subfolder for the client/company name
    if (clientName && clientName.trim() !== "") {
      try {
        targetFolderId = await findOrCreateSubfolder(token, parentFolder.folderId, clientName.trim());
      } catch (e: any) {
        console.warn(`Could not organize in client subfolder "${clientName}", using parent folder:`, e.message || e);
      }
    }

    // Create multipart upload body
    const metadata = {
      name: finalFileName,
      parents: [targetFolderId],
    };

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    formData.append("file", file);

    // Perform upload with supportsAllDrives=true
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      // If token expired (401), try one force refresh
      if (uploadRes.status === 401) {
        const freshToken = await ensureGoogleDriveAccess(true);
        const retryRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${freshToken}` },
          body: formData,
        });
        if (retryRes.ok) {
          return await retryRes.json();
        }
      }
      throw parseDriveApiError(errText, "Failed to upload PO file to Google Drive");
    }

    return await uploadRes.json();
  } catch (err: any) {
    console.warn("Google Drive upload failed. Falling back to local Data URL attachment:", err);
    const dataUrl = await fileToDataUrl(file);
    const isApiDisabled = isDriveApiDisabledError(err);
    return {
      id: `local-${Date.now()}`,
      name: finalFileName,
      webViewLink: dataUrl,
      isLocalFallback: true,
      fallbackReason: isApiDisabled
        ? "Google Drive API is disabled on your Google Cloud Project."
        : (err.message || "Drive upload error"),
    };
  }
}

/**
 * Uploads an invoice file to Google Drive using a deployed Google Apps Script Web App URL.
 * Requires NO client-side OAuth popups or tokens!
 */
export async function uploadInvoiceViaAppsScript(
  file: File,
  appsScriptUrl: string,
  clientName?: string,
  invoiceNumber?: string,
  invoiceDate?: string,
  folderId?: string,
  folderName?: string
): Promise<{ id: string; name: string; webViewLink: string; url: string }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanInv = (invoiceNumber && invoiceNumber.trim() !== "") 
    ? invoiceNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const invDateStr = getFormattedDateString(invoiceDate);
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `INV_${cleanInv}_${invDateStr}_${cleanBaseName}${ext}`;

  // Read file as Base64 string
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  const payload = {
    action: "uploadFile",
    fileType: "invoice",
    fileName: finalFileName,
    fileData: base64Data,
    mimeType: file.type || "application/pdf",
    clientName: clientName || "",
    invoiceNumber: invoiceNumber || "",
    invoiceDate: invDateStr,
    folderId: folderId || "",
    folderName: folderName || "SMS_INVOICES",
  };

  // Google Apps Script Web App handles POST cleanly with text/plain without CORS preflight block
  const response = await fetch(appsScriptUrl.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Apps Script responded with status ${response.status}: ${response.statusText}`);
  }

  const responseText = await response.text();
  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error(`Invalid response from Apps Script: ${responseText.slice(0, 150)}`);
  }

  if (result.success === false || result.error) {
    throw new Error(result.error || "Failed to upload invoice file via Apps Script");
  }

  const link = result.webViewLink || result.url || result.downloadUrl || "";
  return {
    id: result.id || result.fileId || `gas-inv-${Date.now()}`,
    name: result.name || result.fileName || finalFileName,
    webViewLink: link,
    url: link,
  };
}

/**
 * Uploads an invoice file to Google Drive.
 * Uses the Google Apps Script Web App (configured by Admin in Dashboard Settings) for zero-auth upload.
 * Filename format: INV_{{Invoice Number}}_{{Invoice Date}}_{{Original File Name}}.pdf
 */
export async function uploadInvoiceToDrive(
  file: File, 
  clientName?: string, 
  invoiceNumber?: string,
  invoiceDate?: string,
  customAppsScriptUrl?: string
): Promise<{ id: string; name: string; webViewLink: string; url: string; isLocalFallback?: boolean; fallbackReason?: string; isAppsScript?: boolean }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanInv = (invoiceNumber && invoiceNumber.trim() !== "") 
    ? invoiceNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const invDateStr = getFormattedDateString(invoiceDate);
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `INV_${cleanInv}_${invDateStr}_${cleanBaseName}${ext}`;

  // 1. Resolve Apps Script Web App URL from parameter, localStorage, or Firestore shared settings
  let targetGasUrl = (customAppsScriptUrl || "").trim();
  if (!targetGasUrl) {
    try {
      targetGasUrl = localStorage.getItem("sms_invoice_apps_script_url") || localStorage.getItem("sms_po_apps_script_url") || "";
    } catch {
      // ignore
    }
  }

  let targetFolderId = "";
  let targetFolderName = "SMS_INVOICES";
  try {
    const settings = await getSharedDriveSettings();
    if (!targetGasUrl) {
      if (settings?.invoiceAppsScriptUrl && settings.invoiceAppsScriptUrl.trim() !== "") {
        targetGasUrl = settings.invoiceAppsScriptUrl.trim();
      } else if (settings?.appsScriptUrl && settings.appsScriptUrl.trim() !== "") {
        targetGasUrl = settings.appsScriptUrl.trim();
      }
    }
    if (settings?.invoiceFolderId && settings.invoiceFolderId.trim() !== "") {
      targetFolderId = settings.invoiceFolderId.trim();
    } else if (settings?.folderId && settings.folderId.trim() !== "") {
      targetFolderId = settings.folderId.trim();
    }
    if (settings?.invoiceFolderName && settings.invoiceFolderName.trim() !== "") {
      targetFolderName = settings.invoiceFolderName.trim();
    }
  } catch {
    // ignore
  }

  // 2. If Apps Script URL is configured, execute direct zero-auth upload via Apps Script
  if (targetGasUrl) {
    try {
      const gasResult = await uploadInvoiceViaAppsScript(
        file,
        targetGasUrl,
        clientName,
        invoiceNumber,
        invoiceDate,
        targetFolderId,
        targetFolderName
      );
      return {
        id: gasResult.id,
        name: gasResult.name,
        webViewLink: gasResult.webViewLink,
        url: gasResult.url,
        isAppsScript: true,
      };
    } catch (gasErr: any) {
      console.warn("Google Apps Script invoice upload error:", gasErr);
      throw new Error(`Google Drive Upload Error: ${gasErr.message || "Failed to upload invoice to Google Drive via Apps Script"}`);
    }
  }

  // 3. Fallback to local Data URL attachment if Apps Script URL is not yet configured by Admin
  console.warn("Google Apps Script URL is not configured for invoice upload. Falling back to local attachment.");
  const dataUrl = await fileToDataUrl(file);
  return {
    id: `local-${Date.now()}`,
    name: finalFileName,
    webViewLink: dataUrl,
    url: dataUrl,
    isLocalFallback: true,
    fallbackReason: "Google Apps Script Gateway URL is not yet configured in Dashboard Settings.",
  };
}

/**
 * Robustly opens or downloads a document URL.
 * Handles both standard links (like Google Drive) and base64 local fallbacks
 * while respecting iframe and top-level navigation constraints.
 */
export function openOrDownloadDocument(url: string | undefined, filename: string = "document.pdf") {
  if (!url) return;
  
  if (url.startsWith("data:")) {
    // Decode dataURL to a Blob to bypass iframe blocks and browser policies blocking direct data URI navigation
    try {
      const parts = url.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Delay releasing the object URL to allow download processing
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      console.error("Failed to decode and download data URL document, falling back to direct link download:", e);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } else {
    // Standard URL (e.g. Google Drive webViewLink)
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
