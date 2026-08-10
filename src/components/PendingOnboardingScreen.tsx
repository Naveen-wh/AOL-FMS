import React, { useState } from "react";
import { UserX, ShieldAlert, RefreshCw, LogOut, Copy, Check, Mail, UserPlus, HelpCircle } from "lucide-react";

interface PendingOnboardingScreenProps {
  email: string;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export default function PendingOnboardingScreen({
  email,
  onRefresh,
  onSignOut,
}: PendingOnboardingScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleCopyEmail = () => {
    if (email) {
      navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setCheckMessage(null);
    try {
      await onRefresh();
    } catch (err) {
      console.error("Error re-checking onboarding status:", err);
      setCheckMessage("User record not found yet. Please ensure Admin has added your email in User Management.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOutClick = async () => {
    setIsSigningOut(true);
    try {
      await onSignOut();
    } catch (err) {
      console.error("Error signing out:", err);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full bg-white border border-slate-200/90 shadow-lg rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
        {/* Top Decorative Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

        {/* Icon & Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 shadow-xs mb-1">
            <ShieldAlert size={32} className="stroke-[2.2]" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100/80 text-amber-800 border border-amber-300/60 mb-2">
              <UserX size={12} />
              Pending Admin Onboarding
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Account Not Registered
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Your details were not found in the database.
            </p>
          </div>
        </div>

        {/* User Email Card */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500">
              <Mail size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">Authenticated Email</div>
              <div className="text-xs font-bold font-mono text-slate-800 truncate">{email || "No email available"}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyEmail}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all cursor-pointer shrink-0"
            title="Copy email to share with Admin"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-600" />
                <span className="text-emerald-600 font-bold text-[11px]">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Instructions Box */}
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <UserPlus size={16} className="text-amber-600 shrink-0" />
            <span>How to get access to the Sales Portal:</span>
          </div>

          <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed font-medium pl-1">
            <li>
              Contact your <strong>System Administrator</strong>.
            </li>
            <li>
              Share your authenticated email (<span className="font-mono font-semibold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">{email}</span>).
            </li>
            <li>
              Ask them to add your email in the <strong>User & Role Management</strong> console with your assigned Role & Team Access.
            </li>
            <li>
              Once your administrator adds you, click <strong>"Re-check Onboarding Status"</strong> below to enter automatically.
            </li>
          </ol>
        </div>

        {checkMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-fadeIn">
            <HelpCircle size={15} className="shrink-0 text-rose-500" />
            <span>{checkMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold font-mono transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>{isRefreshing ? "Checking User Database..." : "Re-check Onboarding Status"}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOutClick}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer"
          >
            <LogOut size={14} className="text-slate-400" />
            <span>{isSigningOut ? "Signing Out..." : "Sign Out & Try Another Account"}</span>
          </button>
        </div>

        {/* Help Footer */}
        <div className="text-center pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-mono">
          Need urgent help? Contact System Admin at <strong className="text-slate-600">care@aromaorganic.in</strong>
        </div>
      </div>
    </div>
  );
}
