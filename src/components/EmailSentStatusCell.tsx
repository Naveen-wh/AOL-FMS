import React, { useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Mail, Clock, ShieldAlert, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { EmailSentStatusSummary, EmailDeliveryStatus } from "../types";

interface EmailSentStatusCellProps {
  statusSummary?: EmailSentStatusSummary | null;
  onResend?: () => Promise<void> | void;
  isResending?: boolean;
  canResend?: boolean;
  tableType?: "order" | "invoice" | "payment";
}

export const EmailSentStatusCell: React.FC<EmailSentStatusCellProps> = ({
  statusSummary,
  onResend,
  isResending = false,
  canResend = true,
  tableType = "order",
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const copyToClipboard = (text: string, fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (status?: EmailDeliveryStatus) => {
    switch (status) {
      case "Sent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            Sent
          </span>
        );
      case "Simulated":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700/60">
            <Mail className="w-3 h-3 text-sky-600 dark:text-sky-400" />
            Simulated
          </span>
        );
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700/60">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            Failed
          </span>
        );
      case "Pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
            Sending...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <Mail className="w-3 h-3 opacity-60" />
            Not Sent
          </span>
        );
    }
  };

  const hasStatus = !!statusSummary && !!statusSummary.timestamp;

  return (
    <div className="flex flex-col gap-1.5 min-w-[210px] max-w-[280px] text-xs font-sans">
      {/* Top row: Status badge + Resend button (if applicable) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {getStatusBadge(statusSummary?.status)}
          {hasStatus && (statusSummary?.cc || statusSummary?.bcc || statusSummary?.error) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(!showDetails);
              }}
              title="Toggle CC/BCC/Error Details"
              className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>


      </div>

      {/* Recipient info */}
      {hasStatus && (
        <div className="space-y-0.5 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded border border-slate-100 dark:border-slate-800 text-[11px]">
          {/* Sent To */}
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 group">
            <span className="font-medium text-slate-500 dark:text-slate-400 truncate max-w-[45px]">To:</span>
            <div className="flex items-center gap-1 truncate font-mono text-[10.5px]">
              <span className="truncate max-w-[135px]" title={statusSummary.to}>
                {statusSummary.to}
              </span>
              <button
                type="button"
                onClick={(e) => copyToClipboard(statusSummary.to, "to", e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Copy email"
              >
                {copiedField === "to" ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            </div>
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-200/60 dark:border-slate-800">
            <Clock className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{formatTime(statusSummary.timestamp)}</span>
          </div>

          {/* Expandable CC, BCC, Error details */}
          {showDetails && (
            <div className="mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-800 space-y-0.5 text-[10px]">
              {statusSummary.cc && (
                <div className="flex items-start justify-between text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">CC:</span>
                  <span className="font-mono truncate max-w-[140px]" title={statusSummary.cc}>
                    {statusSummary.cc}
                  </span>
                </div>
              )}
              {statusSummary.bcc && (
                <div className="flex items-start justify-between text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">BCC:</span>
                  <span className="font-mono truncate max-w-[140px]" title={statusSummary.bcc}>
                    {statusSummary.bcc}
                  </span>
                </div>
              )}
              {statusSummary.sentByUserName && (
                <div className="text-slate-500 dark:text-slate-400 text-[9.5px]">
                  By: {statusSummary.sentByUserName}
                </div>
              )}
              {statusSummary.error && (
                <div className="flex items-start gap-1 text-rose-600 dark:text-rose-400 mt-1 bg-rose-50 dark:bg-rose-950/40 p-1 rounded">
                  <ShieldAlert className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span className="break-all">{statusSummary.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* If not sent yet but can resend/send */}
      {!hasStatus && (
        <div className="text-[10px] text-slate-400 dark:text-slate-500 italic">
          No email sent record
        </div>
      )}
    </div>
  );
};

export default EmailSentStatusCell;
