/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { PoAttachment } from "../types";
import {
  uploadPOToDrive,
  openOrDownloadDocument,
} from "../lib/googleDriveService";
import {
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  Zap,
  Link as LinkIcon,
  X,
} from "lucide-react";

interface POAttachmentsSectionProps {
  attachments: PoAttachment[];
  onAttachmentsChange: (attachments: PoAttachment[]) => void;
  appsScriptUrl?: string;
  onSaveAppsScriptUrl?: (url: string) => Promise<void>;
  clientName?: string;
  poNumber?: string;
  accentColor?: "indigo" | "amber";
  disabled?: boolean;
}

export const POAttachmentsSection: React.FC<POAttachmentsSectionProps> = ({
  attachments,
  onAttachmentsChange,
  appsScriptUrl = "",
  clientName,
  poNumber,
  accentColor = "indigo",
  disabled = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual link entry
  const [showManualLink, setShowManualLink] = useState(false);
  const [manualLinkUrl, setManualLinkUrl] = useState("");
  const [manualLinkName, setManualLinkName] = useState("");

  const isAmber = accentColor === "amber";
  const ringColor = isAmber ? "focus:ring-amber-500" : "focus:ring-indigo-500";
  const btnColor = isAmber
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : "bg-indigo-600 hover:bg-indigo-700 text-white";

  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    const remainingSlots = 5 - attachments.length;
    if (attachments.length >= 5) {
      setUploadError("Maximum limit of 5 PO files reached. Remove an existing file to attach a new one.");
      return;
    }

    if (fileList.length > remainingSlots) {
      setUploadError(`You can only upload up to ${remainingSlots} more file(s). Maximum 5 PO files total.`);
      return;
    }

    const nonPdf = fileList.some((f) => !f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf");
    if (nonPdf) {
      setUploadError("Only PDF files are allowed to be uploaded.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    setUploadProgressText(
      fileList.length === 1
        ? `Uploading ${fileList[0].name} to Google Drive...`
        : `Uploading ${fileList.length} PO documents to Google Drive...`
    );

    try {
      const clientNameArg = clientName || "General Clients";
      const poNumArg = poNumber || "";
      const uploadedList: PoAttachment[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (fileList.length > 1) {
          setUploadProgressText(`Uploading ${i + 1} of ${fileList.length}: ${file.name}...`);
        }
        const result = await uploadPOToDrive(file, clientNameArg, poNumArg, appsScriptUrl);
        uploadedList.push({
          id: result.id,
          name: result.name || file.name,
          url: result.webViewLink,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }

      const updated = [...attachments, ...uploadedList].slice(0, 5);
      onAttachmentsChange(updated);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to upload PO document.");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(updated);
  };

  const handleAddManualLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLinkUrl.trim()) return;

    if (attachments.length >= 5) {
      setUploadError("Maximum limit of 5 PO files reached.");
      return;
    }

    const newAttachment: PoAttachment = {
      id: `link-${Date.now()}`,
      name: manualLinkName.trim() || (poNumber ? `PO_${poNumber}_Link.pdf` : "Customer_PO_Document.pdf"),
      url: manualLinkUrl.trim(),
      uploadedAt: new Date().toISOString(),
    };

    onAttachmentsChange([...attachments, newAttachment].slice(0, 5));
    setManualLinkUrl("");
    setManualLinkName("");
    setShowManualLink(false);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-150 pb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-slate-600 uppercase font-mono tracking-tight">
              Attach PO Document(s)
            </label>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {attachments.length}/5 files
            </span>
            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Zap size={10} className="text-emerald-600 fill-emerald-600" />
              <span>Google Drive Auto-Upload</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Uploaded files are stored permanently in Google Drive with accessible hyperlinks
          </p>
        </div>
      </div>

      {/* Attached files list with prominent Hyperlink, View & Remove */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att, idx) => (
            <div
              key={att.id || idx}
              className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-slate-200 hover:border-indigo-300 p-3 rounded-xl shadow-2xs gap-2.5 transition-all"
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[280px]" title={att.name}>
                      {att.name || `Purchase Order Doc ${idx + 1}`}
                    </p>
                    {att.size && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({formatFileSize(att.size)})
                      </span>
                    )}
                  </div>

                  {/* Clickable Hyperlink to Drive or document */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <ExternalLink size={12} className="text-indigo-600 shrink-0" />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline truncate max-w-[340px] inline-block"
                      title={att.url}
                    >
                      {att.url.startsWith("http") ? att.url : `Document Link (${att.name})`}
                    </a>
                  </div>
                </div>
              </div>

              {/* Action Buttons: View & Remove */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => openOrDownloadDocument(att.url, att.name || `PO_Document_${idx + 1}.pdf`)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  title="View / Download PO Document"
                >
                  <ExternalLink size={12} />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(idx)}
                  disabled={disabled}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Remove this PO document"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dropzone / Button */}
      {attachments.length < 5 && (
        <div className="space-y-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (disabled || isUploading) return;
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFilesUpload(e.dataTransfer.files);
              }
            }}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all bg-slate-50/50 hover:bg-slate-50 border-slate-200 hover:border-slate-300 ${
              disabled || isUploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            }`}
            onClick={() => {
              if (disabled || isUploading) return;
              const input = document.getElementById("po-file-upload-input") as HTMLInputElement;
              if (input) input.click();
            }}
          >
            <input
              type="file"
              id="po-file-upload-input"
              className="hidden"
              accept=".pdf,application/pdf"
              multiple
              disabled={disabled || isUploading}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            <div className="flex flex-col items-center justify-center gap-1.5">
              {isUploading ? (
                <>
                  <Loader2 size={24} className="animate-spin text-indigo-600 mb-1" />
                  <p className="text-xs font-bold text-slate-700">{uploadProgressText || "Uploading to Google Drive..."}</p>
                  <p className="text-[10px] text-slate-400">Please wait while the file is processed...</p>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-0.5">
                    <Upload size={16} />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    <span className={isAmber ? "text-amber-600 underline" : "text-indigo-600 underline"}>
                      Click to upload
                    </span>{" "}
                    or drag and drop PO documents
                  </p>
                  <p className="text-[10px] text-slate-400">
                    PDF files only · Up to {5 - attachments.length} more file(s) (Max 5 total)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Quick Manual Link Toggle */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowManualLink(!showManualLink)}
              disabled={disabled || isUploading}
              className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer font-medium"
            >
              <LinkIcon size={11} />
              <span>{showManualLink ? "Hide manual URL input" : "Or paste direct Google Drive URL"}</span>
            </button>
          </div>

          {/* Manual Link Input Form */}
          {showManualLink && (
            <form onSubmit={handleAddManualLink} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-700 text-[11px]">Attach PO Document by URL</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="url"
                  value={manualLinkUrl}
                  onChange={(e) => setManualLinkUrl(e.target.value)}
                  placeholder="Paste Google Drive / Web URL (https://...)"
                  className={`w-full p-2 text-xs border border-slate-300 rounded-lg bg-white outline-none ${ringColor}`}
                  required
                />
                <input
                  type="text"
                  value={manualLinkName}
                  onChange={(e) => setManualLinkName(e.target.value)}
                  placeholder="Document Name (e.g. PO_12345.pdf)"
                  className={`w-full p-2 text-xs border border-slate-300 rounded-lg bg-white outline-none ${ringColor}`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualLink(false)}
                  className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${btnColor}`}
                >
                  Attach Link
                </button>
              </div>
            </form>
          )}

          {uploadError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
