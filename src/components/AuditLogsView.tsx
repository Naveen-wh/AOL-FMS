/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ActionLog } from "../types";
import { History, Search, ShieldAlert } from "lucide-react";

interface AuditLogsViewProps {
  logs: ActionLog[];
  onClearLogs?: () => void;
  isAdmin: boolean;
  isAuditLogEnabled: boolean;
  onToggleAuditLog: (enabled: boolean) => void;
}

export default function AuditLogsView({ logs, onClearLogs, isAdmin, isAuditLogEnabled, onToggleAuditLog }: AuditLogsViewProps) {
  const [query, setQuery] = useState("");

  const filteredLogs = logs.filter((log) => {
    return (
      log.userName.toLowerCase().includes(query.toLowerCase()) ||
      log.actionType.toLowerCase().includes(query.toLowerCase()) ||
      log.targetName.toLowerCase().includes(query.toLowerCase()) ||
      log.details.toLowerCase().includes(query.toLowerCase())
    );
  });

  const getActionTypeColor = (type: ActionLog["actionType"]) => {
    if (type.includes("Create")) return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (type.includes("Edit")) return "bg-amber-50 text-amber-800 border-amber-200";
    if (type.includes("Delete")) return "bg-rose-50 text-rose-800 border-rose-200";
    return "bg-slate-50 text-slate-800 border-slate-200";
  };

  return (
    <div className="bg-white p-3 rounded-lg border border-slate-203 space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div>
          <h3 className="text-xs font-bold font-mono uppercase text-slate-900 flex items-center gap-1.5">
            <History className="text-slate-500" size={14} /> Transparent Log of Platform Activity
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
            Every creation, update, and deletion is recorded securely to audit hierarchical authorization compliance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => onToggleAuditLog(!isAuditLogEnabled)}
              className={`text-[9.5px] font-bold px-2 py-1 rounded transition-all leading-none shrink-0 ${
                isAuditLogEnabled ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-100"
              }`}
            >
              {isAuditLogEnabled ? "Stop Audit Trail" : "Start Audit Trail"}
            </button>
          )}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-[9.5px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 px-2 py-1 rounded transition-all leading-none shrink-0"
            >
              Clear Log Archive
            </button>
          )}
        </div>
      </div>

      <div className="flex max-w-xs relative">
        <Search className="absolute left-2.5 top-1.5 text-slate-400" size={12} />
        <input
          type="text"
          placeholder="Filter logs by user, action..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-7 pr-3 py-1 w-full text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
        />
      </div>

      {filteredLogs.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          <ShieldAlert size={28} className="mx-auto mb-1 text-slate-300" />
          <span className="font-bold text-slate-650 block text-xs">No Matching Audit Activities</span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Try searching for other criteria.</span>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {filteredLogs.map((log) => {
            const formattedTime = new Date(log.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return (
              <div
                key={log.id}
                className="p-2 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded flex items-start gap-2 transition-all"
              >
                <div className="shrink-0 mt-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block"></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1 leading-none">
                    <span className="font-bold text-[11px] text-slate-900 leading-none">
                      {log.userName}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 shrink-0 leading-none">
                      {formattedTime}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[10.5px] mt-1 font-medium italic leading-relaxed">
                    {log.details}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded border uppercase font-mono ${getActionTypeColor(log.actionType)}`}>
                      {log.actionType}
                    </span>
                    <span className="bg-slate-100 text-slate-500 text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded border border-slate-200">
                      ID: {log.targetId}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
