/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ActionLog } from "../types";
import { History, Search, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";

interface AuditLogsViewProps {
  logs: ActionLog[];
  onClearLogs?: () => void;
  isAdmin: boolean;
  isAuditLogEnabled: boolean;
  onToggleAuditLog: (enabled: boolean) => void;
}

export default function AuditLogsView({ logs, onClearLogs, isAdmin, isAuditLogEnabled, onToggleAuditLog }: AuditLogsViewProps) {
  const [query, setQuery] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    return (
      log.userName.toLowerCase().includes(query.toLowerCase()) ||
      log.actionType.toLowerCase().includes(query.toLowerCase()) ||
      log.targetName.toLowerCase().includes(query.toLowerCase()) ||
      log.details.toLowerCase().includes(query.toLowerCase())
    );
  });

  const getActionTypeColor = (type: ActionLog["actionType"]) => {
    if (type.includes("Create") || type.includes("Add") || type.includes("Map") || type.includes("Bulk")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (type.includes("Edit") || type.includes("Update")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (type.includes("Delete") || type.includes("Remove")) {
      return "bg-rose-50 text-rose-800 border-rose-200";
    }
    return "bg-slate-50 text-slate-800 border-slate-200";
  };

  const getDetailedDiff = (past: any, current: any) => {
    if (!past || !current) return null;
    const diffs: { field: string; from: any; to: any }[] = [];
    
    // Flattened key-value mapping of properties
    const allKeys = Array.from(new Set([...Object.keys(past), ...Object.keys(current)]));
    const ignoredKeys = ["id", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId", "updatedByUserName"];
    
    for (const key of allKeys) {
      if (ignoredKeys.includes(key)) continue;
      
      const valPast = past[key];
      const valCurrent = current[key];
      
      if (JSON.stringify(valPast) !== JSON.stringify(valCurrent)) {
        diffs.push({
          field: key,
          from: valPast,
          to: valCurrent
        });
      }
    }
    return diffs;
  };

  const formatValue = (val: any): string => {
    if (val === undefined || val === null) return "-";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "object") {
      try {
        if (Array.isArray(val)) {
          if (val.length === 0) return "[]";
          return val.map(item => {
            if (typeof item === 'object') {
              return Object.entries(item)
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(", ");
            }
            return String(item);
          }).join(" | ");
        }
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(", ");
      } catch {
        return String(val);
      }
    }
    return String(val);
  };

  const capitalizeField = (str: string) => {
    return str
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  };

  const renderLogDetails = (log: ActionLog) => {
    const isCreate = log.actionType.includes("Create") || log.actionType.includes("Add") || log.actionType.includes("Map") || log.actionType.includes("Bulk") || (log.newData && !log.pastData);
    const isDelete = log.actionType.includes("Delete") || log.actionType.includes("Remove") || !!log.deletedData;
    const isEdit = log.actionType.includes("Edit") || log.actionType.includes("Update") || (!!log.pastData && !!log.newData);

    if (isCreate && log.newData) {
      const keys = Object.keys(log.newData).filter(
        (k) => !["id", "createdAt", "updatedAt"].includes(k) && log.newData[k] !== undefined && log.newData[k] !== ""
      );
      return (
        <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-left mt-1">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 font-mono mb-2">
            ✙ Created Record Snapshots:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
            {keys.map((key) => (
              <div key={key} className="flex flex-col border-b border-emerald-100/40 pb-1">
                <span className="text-slate-500 font-medium text-[9.5px] uppercase tracking-wide font-mono">
                  {capitalizeField(key)}
                </span>
                <span className="text-emerald-900 font-semibold break-words whitespace-pre-wrap">
                  {formatValue(log.newData[key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (isDelete && log.deletedData) {
      const keys = Object.keys(log.deletedData).filter(
        (k) => log.deletedData[k] !== undefined && log.deletedData[k] !== ""
      );
      return (
        <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100 text-left mt-1">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-rose-800 font-mono mb-2">
            🗑 Deleted Record Archive:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
            {keys.map((key) => (
              <div key={key} className="flex flex-col border-b border-rose-100/40 pb-1">
                <span className="text-slate-500 font-medium text-[9.5px] uppercase tracking-wide font-mono">
                  {capitalizeField(key)}
                </span>
                <span className="text-rose-900 font-semibold break-words whitespace-pre-wrap">
                  {formatValue(log.deletedData[key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (isEdit && log.pastData && log.newData) {
      const diffs = getDetailedDiff(log.pastData, log.newData);
      if (!diffs || diffs.length === 0) {
        return (
          <div className="bg-amber-50/40 p-2.5 rounded-lg border border-amber-100 text-[10.5px] text-amber-800 text-left mt-1 italic font-medium">
            Property update logged without structural state modifications. Action Description: {log.details}
          </div>
        );
      }
      return (
        <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 text-left mt-1">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-800 font-mono mb-2">
            ⚙ Property Modification Difference (Before vs After):
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-amber-200 text-[9.5px] font-mono text-amber-700 uppercase">
                  <th className="py-1 pr-4">Property Key</th>
                  <th className="py-1 pr-4">Past State (Before)</th>
                  <th className="py-1">Now State (After)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/40">
                {diffs.map((diff) => (
                  <tr key={diff.field} className="hover:bg-amber-100/20">
                    <td className="py-1.5 pr-4 font-semibold text-slate-700 font-mono uppercase text-[10px] whitespace-nowrap">
                      {capitalizeField(diff.field)}
                    </td>
                    <td className="py-1.5 pr-4 text-rose-700 font-medium bg-rose-50/50 px-2 rounded break-all max-w-[220px] line-through decoration-rose-300">
                      {formatValue(diff.from)}
                    </td>
                    <td className="py-1.5 text-emerald-800 font-bold bg-emerald-50/50 px-2 rounded break-all max-w-[220px]">
                      {formatValue(diff.to)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[10.5px] text-slate-500 text-left mt-1 italic">
        Sequential log sequence. Detailed state snapshots are only captured for major DB records (leads, products, tasks, orders, payment configurations).
      </div>
    );
  };

  const toggleLog = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-bold font-mono uppercase text-slate-900 flex items-center gap-1.5">
            <History className="text-slate-500" size={14} /> Transparent Log of Platform Activity
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
            Every creation, update, and deletion records full property changes to audit hierarchical compliance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => onToggleAuditLog(!isAuditLogEnabled)}
              className={`text-[9.5px] font-bold px-2 py-1.5 rounded-lg transition-all leading-none shrink-0 border cursor-pointer ${
                isAuditLogEnabled 
                  ? "text-rose-600 border-rose-200 hover:bg-rose-50" 
                  : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              {isAuditLogEnabled ? "Stop Audit Trail" : "Start Audit Trail"}
            </button>
          )}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-[9.5px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-100 px-2 py-1.5 rounded-lg transition-all leading-none shrink-0 cursor-pointer"
            >
              Clear Log Archive
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex w-full max-w-sm relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          type="text"
          placeholder="Filter logs by user, action..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 pr-3 py-1.5 w-full text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 font-medium"
        />
      </div>

      {filteredLogs.length === 0 ? (
        <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <ShieldAlert size={32} className="mx-auto mb-2 text-slate-300" />
          <span className="font-bold text-slate-700 block text-xs">No Matching Audit Activities</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Try searching for other criteria or verify the filter is clear.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden border border-slate-200 rounded-xl">
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono sticky top-0 z-10">
                    <th className="py-2.5 px-4 w-[120px]">Time</th>
                    <th className="py-2.5 px-4 w-[140px]">Operator</th>
                    <th className="py-2.5 px-4 w-[160px]">Action Type</th>
                    <th className="py-2.5 px-4">Activity Description</th>
                    <th className="py-2.5 px-4 w-[110px] text-right">Target ID</th>
                    <th className="py-2.5 px-4 w-[90px] text-center">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLogs.map((log) => {
                    const formattedTime = new Date(log.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    const formattedDate = new Date(log.timestamp).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <React.Fragment key={log.id}>
                        <tr 
                          onClick={() => toggleLog(log.id)}
                          className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                            {formattedDate}, {formattedTime}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 truncate max-w-[140px]">
                            {log.userName}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase font-mono inline-block ${getActionTypeColor(log.actionType)}`}>
                              {log.actionType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 font-medium leading-normal italic pr-8">
                            {log.details}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-200 inline-block">
                              {log.targetId}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded transition-all cursor-pointer inline-flex items-center gap-1">
                              {expandedLogId === log.id ? "Hide" : "Inspect"}
                              {expandedLogId === log.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                          </td>
                        </tr>
                        {expandedLogId === log.id && (
                          <tr className="bg-slate-50/40">
                            <td colSpan={6} className="py-3 px-6 border-b border-slate-100">
                              {renderLogDetails(log)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {filteredLogs.map((log) => {
              const formattedTime = new Date(log.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              const formattedDate = new Date(log.timestamp).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              });

              return (
                <div
                  key={log.id}
                  onClick={() => toggleLog(log.id)}
                  className="p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-2 transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 w-full">
                    <div className="shrink-0 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1 leading-none">
                        <span className="font-bold text-[11px] text-slate-900 leading-none">
                          {log.userName}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 shrink-0 leading-none">
                          {formattedDate}, {formattedTime}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[10.5px] mt-1.5 font-medium italic leading-relaxed">
                        {log.details}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2 justify-between items-center">
                        <div className="flex gap-1.5">
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded border uppercase font-mono ${getActionTypeColor(log.actionType)}`}>
                            {log.actionType}
                          </span>
                          <span className="bg-slate-100 text-slate-500 text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded border border-slate-200">
                            ID: {log.targetId}
                          </span>
                        </div>
                        <span className="text-[9.5px] font-bold text-emerald-600 font-mono">
                          {expandedLogId === log.id ? "Hide ▴" : "Inspect ▾"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expandedLogId === log.id && (
                    <div className="mt-2 border-t border-slate-200/60 pt-2" onClick={(e) => e.stopPropagation()}>
                      {renderLogDetails(log)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
