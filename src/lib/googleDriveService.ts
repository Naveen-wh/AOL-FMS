/**
 * Google Drive integration service using Google Drive API v3.
 * Handles direct Google Drive OAuth authentication, folder/Shared Drive resolution,
 * client subfolder organization, and multipart file uploads.
 */

import { auth, getGoogleProvider, signInWithPopup, db, doc, getDoc, setDoc } from "../firebase";
import { GoogleAuthProvider } from "firebase/auth";

let cachedAccessToken: string | null = null;

export interface DriveSettings {
  folderName: string;
  folderId: string;
  driveType?: "shared_drive" | "shared_folder" | "my_drive";
  adminAccessToken?: string;
  tokenExpiry?: number;
  allowAllTeams?: boolean;
  allowedTeamIds?: string[];
  uploadMode?: "google_drive_oauth";
}

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
 * Uploads a file to Google Drive via direct Google Drive OAuth API v3,
 * organized inside the configured folder/Shared Drive and a client-specific subfolder.
 * Filename format: PO_{{Customer PO Number}}_{{Current Date}}_{{Original File Name}}.pdf
 */
export async function uploadPOToDrive(
  file: File, 
  clientName?: string, 
  poNumber?: string
): Promise<{ id: string; name: string; webViewLink: string; isLocalFallback?: boolean; fallbackReason?: string }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanPo = (poNumber && poNumber.trim() !== "") 
    ? poNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const currentDateStr = getFormattedDateString();
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `PO_${cleanPo}_${currentDateStr}_${cleanBaseName}${ext}`;

  try {
    // 1. Get access token
    let token = "";
    try {
      token = await ensureGoogleDriveAccess(false);
    } catch (tokenErr) {
      // If token not available silently, prompt user since this is a direct upload click action
      token = await ensureGoogleDriveAccess(true);
    }

    // 2. Resolve the shared parent folder setting
    const parentFolder = await resolveSharedParentFolder(token);
    let targetFolderId = parentFolder.folderId;

    // 3. Find or create a subfolder for the client/company name
    if (clientName && clientName.trim() !== "") {
      try {
        targetFolderId = await findOrCreateSubfolder(token, parentFolder.folderId, clientName.trim());
      } catch (e: any) {
        console.warn(`Could not organize in client subfolder "${clientName}", using parent folder:`, e.message || e);
      }
    }

    // 4. Create multipart upload body
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

    // 5. Perform upload with supportsAllDrives=true
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
 * Uploads an invoice file to Google Drive via direct Google Drive OAuth API v3,
 * organized inside the configured folder/Shared Drive and a client-specific subfolder.
 * Filename format: PO_{{Invoice Number}}_{{Invoice Date}}_{{Original File Name}}.pdf
 */
export async function uploadInvoiceToDrive(
  file: File, 
  clientName?: string, 
  invoiceNumber?: string,
  invoiceDate?: string
): Promise<{ id: string; name: string; webViewLink: string; isLocalFallback?: boolean; fallbackReason?: string }> {
  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".pdf";
  const cleanInv = (invoiceNumber && invoiceNumber.trim() !== "") 
    ? invoiceNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_") 
    : "NA";
  const invDateStr = getFormattedDateString(invoiceDate);
  const rawBaseName = file.name.includes(".") ? file.name.substring(0, file.name.lastIndexOf(".")) : file.name;
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `PO_${cleanInv}_${invDateStr}_${cleanBaseName}${ext}`;

  try {
    // 1. Get access token
    let token = "";
    try {
      token = await ensureGoogleDriveAccess(false);
    } catch (tokenErr) {
      // If token not available silently, prompt user
      token = await ensureGoogleDriveAccess(true);
    }

    // 2. Resolve the shared parent folder setting
    const parentFolder = await resolveSharedParentFolder(token);
    let targetFolderId = parentFolder.folderId;

    // 3. Find or create a subfolder for the client/company name
    if (clientName && clientName.trim() !== "") {
      try {
        targetFolderId = await findOrCreateSubfolder(token, parentFolder.folderId, clientName.trim());
      } catch (e: any) {
        console.warn(`Could not organize in client subfolder "${clientName}", using parent folder:`, e.message || e);
      }
    }

    // 4. Create multipart upload body
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

    // 5. Perform upload with supportsAllDrives=true
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
      throw parseDriveApiError(errText, "Failed to upload invoice file to Google Drive");
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
