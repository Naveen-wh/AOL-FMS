/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  auth, 
  getGoogleProvider, 
  signInWithPopup 
} from "../firebase";
import { syncUserProfile } from "../lib/firebaseService";
import { Shield, AlertTriangle, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import config from "../../firebase-applet-config.json";
import { AolLogo } from "./AolLogo";

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [errorMsg, setErrorMsg] = useState("");
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentHostname = typeof window !== "undefined" ? window.location.hostname : "";

  const handleCopyDomain = () => {
    if (currentHostname) {
      navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setUnauthorizedDomain(null);
    setIsNetworkError(false);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, getGoogleProvider());
      if (result.user && result.user.email) {
        await syncUserProfile(
          result.user.email,
          result.user.displayName || "",
          result.user.photoURL || undefined
        );
        onAuthSuccess();
      }
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
        setUnauthorizedDomain(currentHostname);
        setErrorMsg("This domain is not authorized in your Firebase console.");
      } else if (err.code === "auth/network-request-failed" || err.message?.includes("network-request-failed")) {
        setIsNetworkError(true);
        setErrorMsg("Network request failed while connecting to Firebase Authentication.");
      } else if (err.code === "auth/popup-blocked") {
        setErrorMsg("The Google sign-in popup was blocked by your browser. Please allow popups or open in a new tab.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setErrorMsg("Sign-in popup was closed before completing auth. Please try again.");
      } else if (err.code === "auth/operation-not-allowed") {
        setErrorMsg("Google Sign-In is not enabled in your Firebase console under Authentication -> Sign-in method.");
      } else {
        setErrorMsg(err.message || "Failed to sign in with Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto bg-white border border-slate-200 shadow-sm rounded-xl p-6 sm:p-8 space-y-6">
        
        {/* Header Title */}
        <div className="text-center flex flex-col items-center">
          <div className="mb-4 flex justify-center">
            <AolLogo size="xl" className="h-12 sm:h-14" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
            AOL FMS
          </h2>
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mt-1">
            Sales Management Portal
          </p>
        </div>

        {unauthorizedDomain && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg space-y-2 text-amber-900 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle className="text-amber-600 shrink-0" size={16} />
              <span>Firebase Domain Authorization Required</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Your Firebase project (<strong>{config.projectId}</strong>) requires this domain to be authorized for authentication:
            </p>
            <div className="flex items-center justify-between gap-2 bg-amber-100/80 border border-amber-200 rounded px-2.5 py-1.5 font-mono text-[11px]">
              <span className="truncate select-all text-amber-950 font-semibold">{currentHostname}</span>
              <button
                type="button"
                onClick={handleCopyDomain}
                className="shrink-0 flex items-center gap-1 bg-white hover:bg-amber-50 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-sans font-medium text-amber-900 transition"
              >
                {copiedDomain ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                {copiedDomain ? "Copied!" : "Copy Domain"}
              </button>
            </div>
            <div className="text-[10px] text-amber-800 space-y-1 pt-1 border-t border-amber-200/60">
              <p className="font-semibold">How to fix in Firebase Console:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-amber-800">
                <li>Go to <a href={`https://console.firebase.google.com/project/${config.projectId}/authentication/settings`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-950 inline-flex items-center gap-0.5">Firebase Console &gt; Authentication &gt; Settings <ExternalLink size={10} /></a></li>
                <li>Click <strong>Authorized Domains</strong> &gt; <strong>Add domain</strong></li>
                <li>Paste <code className="bg-amber-100 px-1 py-0.2 rounded font-mono text-[10px]">{currentHostname}</code> and save</li>
              </ol>
            </div>
          </div>
        )}

        {isNetworkError && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg space-y-2 text-rose-900 text-xs">
            <div className="flex items-center gap-2 font-bold text-rose-900">
              <AlertTriangle className="text-rose-600 shrink-0" size={16} />
              <span>Firebase Network Connection Error</span>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              Firebase was unable to complete the network request to Google Authentication services (<code>auth/network-request-failed</code>).
            </p>
            <div className="text-[10px] text-rose-800 space-y-1.5 pt-1.5 border-t border-rose-200">
              <p className="font-semibold text-rose-900">Recommended solutions:</p>
              <ul className="list-disc list-inside space-y-1 text-rose-800">
                <li>
                  If running in an embedded preview frame, click <strong>Open App in New Tab</strong> (top right icon) to bypass iframe cross-origin restrictions.
                </li>
                <li>
                  Disable any active adblocker or privacy extension blocking <code>identitytoolkit.googleapis.com</code>.
                </li>
              </ul>
            </div>
          </div>
        )}

        {errorMsg && !unauthorizedDomain && !isNetworkError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded font-medium flex items-start gap-2">
            <Shield className="shrink-0 mt-0.5 text-rose-500" size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Google SSO Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 py-3 px-4 rounded-xl text-xs font-bold text-slate-800 shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{loading ? "Signing in..." : "Sign in with Google Single Sign-On"}</span>
          </button>

          <p className="text-[10.5px] text-slate-400 text-center leading-relaxed font-sans px-2">
            Access is strictly restricted to authorized Google accounts. Use your organization Google account to log in.
          </p>
        </div>

      </div>
    </div>
  );
}
