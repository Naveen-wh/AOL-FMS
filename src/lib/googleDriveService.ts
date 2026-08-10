/**
 * Google Drive integration service using Google Drive API v3.
 */

import { auth, getGoogleProvider, signInWithPopup, db, doc, getDoc, setDoc } from "../firebase";
import { GoogleAuthProvider } from "firebase/auth";

let cachedAccessToken: string | null = null;

export interface DriveSettings {
  folderName: string;
  folderId: string;
  adminAccessToken?: string;
  tokenExpiry?: number;
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
 * Ensures we have a valid Google Drive access token.
 * If not cached, prompts the user via pop-up to authorize/sign in.
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

  // 3. Prompt if required
  try {
    // Triggers signInWithPopup. Since user is already authenticated in Firebase,
    // this will request/verify permissions and retrieve a fresh credential.
    const result = await signInWithPopup(auth, getGoogleProvider());
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error("No access token returned from Google Auth.");
    }

    cachedAccessToken = token;

    // Save the new token to Firestore!
    try {
      const currentSettings = await getSharedDriveSettings();
      const folderName = currentSettings?.folderName || "SMS_PO";
      const folderId = currentSettings?.folderId || "";
      const updatedSettings: DriveSettings = {
        folderName,
        folderId,
        adminAccessToken: token,
        tokenExpiry: Date.now() + 3500 * 1000 // expires in 1 hour minus buffer
      };
      await saveSharedDriveSettings(updatedSettings);
    } catch (e) {
      console.error("Failed to save retrieved token to Firestore:", e);
    }

    return token;
  } catch (error) {
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
 * Finds or creates a folder with the given name in Google Drive.
 */
export async function findOrCreateFolderByName(token: string, folderName: string): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  const queryStr = encodeURIComponent(`name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${queryStr}&fields=files(id,name)`;
  
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

  // Folder not found, create it
  const createUrl = "https://www.googleapis.com/drive/v3/files";
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
  if (stored && stored.folderId) {
    return stored;
  }

  // Fallback / default folder
  const folderName = "SMS_PO";
  const folderId = await findOrCreateFolderByName(token, folderName);
  const settings = { folderName, folderId };

  try {
    await saveSharedDriveSettings(settings);
  } catch (e) {
    console.error("Failed to save default Drive settings to Firestore:", e);
  }

  return settings;
}

/**
 * Allows the developer/admin to update the shared Google Drive folder.
 */
export async function updateSharedParentFolder(token: string, newFolderName: string): Promise<DriveSettings> {
  if (!newFolderName || newFolderName.trim() === "") {
    throw new Error("Folder name cannot be empty.");
  }
  
  const folderId = await findOrCreateFolderByName(token, newFolderName.trim());
  const settings: DriveSettings = { 
    folderName: newFolderName.trim(), 
    folderId,
    adminAccessToken: token,
    tokenExpiry: Date.now() + 3500 * 1000 // 1 hour minus buffer
  };
  await saveSharedDriveSettings(settings);
  return settings;
}

/**
 * Finds or creates a subfolder inside a specific parent folder.
 */
export async function findOrCreateSubfolder(token: string, parentId: string, folderName: string): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  const queryStr = encodeURIComponent(`name = '${cleanName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${queryStr}&fields=files(id,name)`;
  
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

  // Subfolder not found, create it inside the parent
  const createUrl = "https://www.googleapis.com/drive/v3/files";
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

/**
 * Uploads a file to the shared Google Drive parent folder, organized inside a client-specific subfolder.
 * Filename is organized as: PO_[PONumber]_[Filename]
 */
export async function uploadPOToDrive(
  file: File, 
  clientName?: string, 
  poNumber?: string
): Promise<{ id: string; name: string; webViewLink: string; isLocalFallback?: boolean; fallbackReason?: string }> {
  let finalFileName = file.name;
  if (poNumber && poNumber.trim() !== "") {
    const cleanPo = poNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
    finalFileName = `PO_${cleanPo}_${file.name}`;
  }

  try {
    // 1. Get access token
    const token = await ensureGoogleDriveAccess();

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

    // 5. Create multipart upload body
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

    // 6. Perform upload
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
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
 * Uploads an invoice file to the shared Google Drive parent folder, organized inside a client-specific subfolder.
 * Filename is organized as: INV_[InvoiceNumber]_[Filename]
 */
export async function uploadInvoiceToDrive(
  file: File, 
  clientName?: string, 
  invoiceNumber?: string
): Promise<{ id: string; name: string; webViewLink: string; isLocalFallback?: boolean; fallbackReason?: string }> {
  let finalFileName = file.name;
  if (invoiceNumber && invoiceNumber.trim() !== "") {
    const cleanInv = invoiceNumber.trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
    finalFileName = `INV_${cleanInv}_${file.name}`;
  }

  try {
    // 1. Get access token
    const token = await ensureGoogleDriveAccess();

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

    // 5. Create multipart upload body
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

    // 6. Perform upload
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw parseDriveApiError(errText, "Failed to upload Invoice file to Google Drive");
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


