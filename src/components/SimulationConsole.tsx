/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { User, Role, AccessLevel } from "../types";
import { Shield, Users, UserCheck, ChevronRight, HelpCircle } from "lucide-react";
import { getReportingTreeUsers } from "../data";

interface SimulationConsoleProps {
  users: User[];
  activeUserId: string;
  onUserChange: (userId: string) => void;
}

export default function SimulationConsole({
  users,
  activeUserId,
  onUserChange,
}: SimulationConsoleProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];
  const reportingTeamIds = getReportingTreeUsers(activeUserId, users);
  const reportingTeamNames = users
    .filter((u) => reportingTeamIds.includes(u.id))
    .map((u) => u.name);

  return (
    <div className="bg-gradient-to-r from-slate-950 to-slate-900 text-white rounded-lg p-3 mb-4 shadow-sm border border-slate-800">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Active Simulation Description */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="bg-emerald-500 text-emerald-950 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
              Role Simulator
            </span>
            <span className="text-slate-400 text-[10px] flex items-center gap-0.5 font-mono">
              <HelpCircle size={10} /> Choose profile below to switch authorization rules
            </span>
          </div>
          <h2 className="text-sm font-bold tracking-tight mb-1.5 flex items-center gap-1.5">
            <Shield className="text-emerald-400" size={16} />
            Simulating User: <span className="text-emerald-300 font-extrabold">{activeUser.name}</span>
          </h2>
          
          {/* Active User Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
            <div className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="text-slate-500 text-[9px] uppercase font-mono">Role:</span>
              <span className="font-bold text-slate-200">{activeUser.role}</span>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="text-slate-500 text-[9px] uppercase font-mono">Access:</span>
              <span className="font-bold text-emerald-400">{activeUser.accessLevel}</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="text-slate-500 text-[9px] uppercase font-mono">Team:</span>
              <span className="font-bold text-slate-300">{activeUser.teamName}</span>
            </div>
          </div>

          {/* Hierarchy Scope */}
          <div className="mt-2.5 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="font-bold text-slate-400 font-mono text-[10px] block mb-0.5 uppercase tracking-wider">Hierarchical Reach:</span>
                {reportingTeamNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {reportingTeamNames.map((name) => (
                      <span key={name} className="bg-slate-900 text-slate-300 text-[9.5px] px-1.5 py-0.5 rounded border border-slate-800">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500 text-[10px] italic">No reporting team (Editor access role)</span>
                )}
              </div>
              <div>
                <span className="font-bold text-slate-400 font-mono text-[10px] block mb-0.5 uppercase tracking-wider">Authorized Permission Actions:</span>
                <p className="text-slate-400 text-[10px] leading-tight font-mono">
                  {activeUser.accessLevel === AccessLevel.Editor && "• ADD new leads • VIEW self leads • EDIT only self-created leads • DELETE is forbidden"}
                  {activeUser.accessLevel === AccessLevel.Contributor && "• ADD new leads • VIEW self + team leads • EDIT self + team leads • DELETE is forbidden"}
                  {activeUser.accessLevel === AccessLevel.Manager && "• VIEW ALL leads • EDIT ALL leads • DELETE ALL leads • ADD new leads"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* User Selector Pill Cards (Grid or Row) */}
        <div className="lg:w-[42%] flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">Simulator Switchboard:</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-1 max-h-[140px] overflow-y-auto pr-1">
            {users.map((u) => {
              const worksAs = u.id === activeUserId;
              return (
                <button
                  key={u.id}
                  id={`btn-switcher-${u.id}`}
                  onClick={() => onUserChange(u.id)}
                  className={`flex items-center gap-1.5 p-1 rounded text-left transition-all ${
                    worksAs
                      ? "bg-emerald-600 text-white shadow-xs font-semibold ring-1 ring-emerald-400"
                      : "bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300"
                  }`}
                >
                  <img
                    src={u.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=60"}
                    alt={u.name}
                    className="w-6 h-6 rounded border border-slate-700/40 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold truncate leading-none">{u.name}</p>
                    <p className={`text-[8.5px] font-mono mt-0.5 truncate leading-none ${worksAs ? "text-emerald-100" : "text-slate-500"}`}>
                      {u.role}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
