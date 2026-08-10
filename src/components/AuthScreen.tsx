/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  auth, 
  getGoogleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "../firebase";
import { syncUserProfile } from "../lib/firebaseService";
import { Shield, Key, Mail, User as UserIcon, Briefcase, Award, AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";
import config from "../../firebase-applet-config.json";

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setUnauthorizedDomain(null);
    setIsNetworkError(false);
    setLoading(true);

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      setLoading(false);
      return;
    }

    if (isRegister && !name) {
      setErrorMsg("Please enter your name.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        // Register standard email password
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (credential.user) {
          await syncUserProfile(email, name);
        }
      } else {
        // Sign in standard email password
        await signInWithEmailAndPassword(auth, email, password);
      }
      onAuthSuccess();
    } catch (err: any) {
      console.error("Submit Auth Error:", err);
      if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
        setUnauthorizedDomain(currentHostname);
        setErrorMsg("This domain is not authorized in your Firebase console.");
      } else if (err.code === "auth/network-request-failed" || err.message?.includes("network-request-failed")) {
        setIsNetworkError(true);
        setErrorMsg("Network request failed while connecting to Firebase Authentication.");
      } else if (err.code === "auth/operation-not-allowed") {
        setErrorMsg("Email/Password authentication is disabled in your Firebase console under Authentication -> Sign-in method.");
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setErrorMsg("Invalid email address or incorrect password.");
      } else if (err.code === "auth/email-already-in-use") {
        setErrorMsg("This email address is already in use.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg("The password must be at least 6 characters.");
      } else {
        setErrorMsg(err.message || "Authentication failed. Please check details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto bg-white border border-slate-200 shadow-sm rounded-xl p-6 sm:p-8 space-y-6">
        
        {/* Header Title */}
        <div className="text-center">
          <div className="inline-flex bg-emerald-600 text-white p-2.5 rounded-lg shadow-sm mb-3">
            <Briefcase size={22} className="stroke-[2.5]" />
          </div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
            Sales Management Portal
          </h2>
          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mt-1">
            Hierarchical Authorization Entry
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
                  If running in an embedded preview frame, click <strong>Open App in New Tab</strong> (top right icon) to bypass iframe cross-origin restriction.
                </li>
                <li>
                  Disable any active adblocker or privacy extension blocking <code>identitytoolkit.googleapis.com</code>.
                </li>
                <li>
                  Try signing in or registering with standard <strong>Email & Password</strong> below.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 pr-3 py-1.5 w-full text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">
              Work Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 pr-3 py-1.5 w-full text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                Secure Password
              </label>
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-3 py-1.5 w-full text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs tracking-wider uppercase py-2.5 rounded-lg transition-colors cursor-pointer border border-emerald-700/10 shadow-xs flex items-center justify-center gap-1.5"
          >
            {loading ? "Processing..." : isRegister ? "Create Credentials" : "Sign In Securely"}
          </button>
        </form>

        <div className="relative py-2.5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-[9px] font-mono font-bold uppercase">
            <span className="bg-white px-2.5 text-slate-400 leading-none">Or link credential provider</span>
          </div>
        </div>

        {/* Google SSO Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-250 p-2.5 rounded-lg text-xs font-bold text-slate-700 transition"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.281 1.051 15.441 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.401-.191-1.925H12.24z"
            />
          </svg>
          Google Single Sign-On (SSO)
        </button>

        {/* Toggle Mode Link */}
        <div className="text-center pt-2">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMsg("");
            }}
            className="text-[10px] font-mono font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wide underline decoration-dotted underline-offset-4"
          >
            {isRegister
              ? "Already mapped? Log back in here"
              : "Register your email"}
          </button>
        </div>


      </div>
    </div>
  );
}
