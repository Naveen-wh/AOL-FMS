/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User, SalesLead, ProjectWorkflow, SalesTask, Client } from "../types";
import {
  canEditTask,
  canDeleteTask,
  canViewTask,
  canViewLead,
  getReportingTreeUsers,
} from "../data";
import {
  Plus,
  CheckSquare,
  Square,
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Tag,
  Kanban,
  ListTodo,
  X,
  Search,
  Building2,
  Mail,
  Phone,
  MapPin,
  Landmark,
  FileText,
  DollarSign,
  TrendingUp,
  User as UserIcon,
  Briefcase,
  Layers,
  Sparkles,
} from "lucide-react";
import InlineDeleteConfirm from "./InlineDeleteConfirm";

interface WorkflowsViewProps {
  activeUserId: string;
  users: User[];
  leads: SalesLead[];
  workflows: ProjectWorkflow[];
  tasks: SalesTask[];
  onAddTask: (task: Omit<SalesTask, "id">) => void;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  clients?: Client[];
}

export default function WorkflowsView({
  activeUserId,
  users,
  leads = [],
  workflows = [],
  tasks = [],
  onAddTask,
  onToggleTaskComplete,
  onDeleteTask,
  clients = [],
}: WorkflowsViewProps) {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];

  // Search & Selected States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Add Task modal states
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("2026-06-30");
  const [newTaskPriority, setNewTaskPriority] = useState<SalesTask["priority"]>("Medium");
  const [newTaskLeadId, setNewTaskLeadId] = useState("");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState(activeUserId);

  // ----------------------------------------------------
  // WORKFLOW FILTERING & SELECTION
  // ----------------------------------------------------
  const filteredWorkflows = workflows.filter((w) => {
    // Search query filter
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      w.name.toLowerCase().includes(term) ||
      w.description.toLowerCase().includes(term) ||
      w.clientName.toLowerCase().includes(term);

    // Status filter
    const matchesStatus = statusFilter === "All" || w.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Default selection to the first workflow in the list
  const activeWorkflow =
    filteredWorkflows.find((w) => w.id === selectedProjectId) ||
    filteredWorkflows[0];

  // ----------------------------------------------------
  // ASSOCIATED LEADS & TASKS
  // ----------------------------------------------------
  const associatedLeads = activeWorkflow
    ? leads.filter(
        (lead) => lead.projectId === activeWorkflow.id && canViewLead(activeUserId, lead, users)
      )
    : [];

  const associatedTasks = activeWorkflow
    ? tasks.filter(
        (task) => task.projectId === activeWorkflow.id && canViewTask(activeUserId, task, users)
      )
    : [];

  const completedTasksCount = associatedTasks.filter((t) => t.status === "Completed").length;
  const totalTasksCount = associatedTasks.length;
  const taskProgressPct = totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0;

  // Helpers
  const getAssignee = (userId: string) => {
    return (
      users.find((u) => u.id === userId) || {
        name: "Unassigned",
        role: "N/A",
        teamName: "General",
      }
    );
  };

  const reportingIds = getReportingTreeUsers(activeUserId, users);
  const assignableUsers = [
    activeUser,
    ...users.filter((u) => reportingIds.includes(u.id)),
  ];

  const handleOpenAddTask = () => {
    if (!activeWorkflow) return;
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskDueDate("2026-06-30");
    setNewTaskPriority("Medium");
    // Pre-select first lead associated if any
    setNewTaskLeadId(associatedLeads[0]?.id || "");
    setNewTaskAssignedTo(activeUserId);
    setIsAddTaskOpen(true);
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !activeWorkflow) return;

    onAddTask({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      status: "To Do",
      projectId: activeWorkflow.id,
      leadId: newTaskLeadId || undefined,
      assignedToUserId: newTaskAssignedTo,
      createdByUserId: activeUserId,
    });

    setIsAddTaskOpen(false);
  };

  const statusColors = {
    Planning: "bg-blue-50 text-blue-700 border-blue-200",
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Completed: "bg-purple-50 text-purple-700 border-purple-200",
    "On Hold": "bg-amber-50 text-amber-700 border-amber-200",
  };

  const priorityColors = {
    High: "bg-rose-50 text-rose-700 border-rose-100",
    Medium: "bg-amber-50 text-amber-700 border-amber-100",
    Low: "bg-blue-50 text-blue-700 border-blue-100",
  };

  return (
    <div className="space-y-4">
      {/* ----------------------------------------------------
          TOP HEADER
         ---------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
        <div>
          <h2 className="text-xs font-bold font-mono uppercase text-slate-900 flex items-center gap-1.5">
            <Layers className="text-indigo-600" size={14} /> Project Workflows Base
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Track operational pipeline workflows, milestones, and task deliverables for enterprise and cloud accounts.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-lg shrink-0">
          {["All", "Planning", "Active", "Completed", "On Hold"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === status
                  ? "bg-white text-indigo-700 border border-slate-200/60 shadow-3xs"
                  : "text-slate-500 hover:text-slate-850"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------
          GRID LAYOUT
         ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* ==========================================
            LEFT PANEL: Project Workflows
           ========================================== */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-3xs flex flex-col overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div>
              <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                <Kanban size={13} className="text-indigo-600" />
                Workspace Project Workflows
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                Select a workflow node to analyze associated metrics and tasks
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-52 shrink-0">
              <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search workflows..."
                className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium placeholder-slate-400"
              />
            </div>
          </div>

          {/* Workflow Table */}
          <div className="overflow-x-auto flex-1 min-h-[280px] max-h-[350px]">
            {filteredWorkflows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Layers size={28} className="text-slate-300 mb-2" />
                <span className="font-bold text-xs text-slate-600 block">No Workflows Found</span>
                <span className="text-[10.5px] text-slate-450 block mt-0.5">
                  No active projects match your search parameters.
                </span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/40 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-100 font-mono">
                    <th className="py-2.5 px-3 pl-4 font-bold">Project Name</th>
                    <th className="py-2.5 px-2 font-bold">Client Name</th>
                    <th className="py-2.5 px-2 font-bold">Status Badge</th>
                    <th className="py-2.5 px-2 font-bold text-center">Leads Count</th>
                    <th className="py-2.5 px-3 pr-4 text-center font-bold">Focus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredWorkflows.map((w) => {
                    const isSelected = activeWorkflow?.id === w.id;
                    return (
                      <tr
                        key={w.id}
                        onClick={() => setSelectedProjectId(w.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-indigo-50/50 hover:bg-indigo-50" : "hover:bg-slate-50/50"
                        }`}
                      >
                        <td className="py-3 px-3 pl-4">
                          <span className="text-slate-900 font-extrabold block text-[11px] leading-tight">
                            {w.name}
                          </span>
                          <span className="text-[9.5px] text-slate-400 block mt-0.5 max-w-[280px] truncate">
                            {w.description}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-medium text-slate-700">
                          {w.clientName}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${statusColors[w.status]}`}>
                            {w.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-slate-600">
                          {w.leadsCount || 0}
                        </td>
                        <td className="py-3 px-3 pr-4 text-center">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              isSelected ? "bg-indigo-600 animate-pulse" : "bg-slate-300"
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-slate-50/50 px-3.5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-mono">Project Workflow Tracker Node</span>
            <span>Total: {workflows.length} | Shown: {filteredWorkflows.length}</span>
          </div>
        </div>

        {/* ==========================================
            RIGHT PANEL: Selected Workflow Details
           ========================================== */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-3xs flex flex-col overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Building2 size={13} className="text-emerald-600" />
              Workflow Detailed Profile
            </h2>
            <p className="text-[10px] text-slate-500 font-medium">
              Comprehensive context overview of the active workflow node
            </p>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-4 overflow-y-auto max-h-[350px]">
            {!activeWorkflow ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-6">
                <Briefcase size={32} className="text-slate-300 mb-2" />
                <span className="font-bold text-xs text-slate-500 block">Select a Workflow</span>
                <p className="text-[10px] text-slate-400 max-w-xs mt-1">
                  Click on any workflow pipeline to evaluate deliverables, tasks, and sales tracking metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className={`inline-block text-[8.5px] font-bold font-mono px-2 py-0.5 rounded border uppercase tracking-wider mb-2 ${statusColors[activeWorkflow.status]}`}>
                    {activeWorkflow.status} Workflow
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 leading-tight">
                    {activeWorkflow.name}
                  </h3>
                  <p className="text-[10.5px] text-slate-500 font-medium block mt-1.5 leading-relaxed">
                    {activeWorkflow.description}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-150 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Client Partner:</span>
                    <span className="font-bold text-slate-800">{activeWorkflow.clientName}</span>
                  </div>

                  {/* Task Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500 font-semibold font-mono uppercase">Tasks Completed</span>
                      <span className="font-bold text-indigo-700 font-mono">
                        {completedTasksCount}/{totalTasksCount} ({Math.round(taskProgressPct)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden border border-slate-300/40">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{ width: `${taskProgressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[8px] font-bold font-mono text-slate-400 block uppercase">Associated Leads</span>
                    <span className="text-md font-bold text-indigo-600 block mt-0.5">{associatedLeads.length}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[8px] font-bold font-mono text-slate-400 block uppercase">Operational Tasks</span>
                    <span className="text-md font-bold text-slate-800 block mt-0.5">{totalTasksCount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-50/50 px-3.5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-mono">Workflow ID: {activeWorkflow?.id}</span>
            <span className="font-mono text-indigo-600 font-bold uppercase tracking-wider">Ready for Execution</span>
          </div>
        </div>
      </div>

      {/* ==========================================
          BOTTOM PANEL: Project Tasks & Leads Pipeline
         ========================================== */}
      {activeWorkflow && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-50 text-indigo-700 p-1.5 rounded-md">
                <ListTodo size={13} />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider">
                  Project Task Pipeline ({associatedTasks.length} Tasks)
                </h2>
                <p className="text-[9.5px] text-indigo-600 font-mono leading-none mt-0.5 uppercase tracking-wider font-bold">
                  Track and add active tasks associated with {activeWorkflow.name}
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenAddTask}
              className="text-[10px] font-mono font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 leading-none transition-all cursor-pointer shadow-3xs"
            >
              <Plus size={10} />
              Add Project Task
            </button>
          </div>

          {associatedTasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ListTodo size={32} className="mx-auto text-slate-300 mb-1.5" />
              <span className="font-bold text-xs text-slate-600 block">No Tasks Registered</span>
              <p className="text-[10.5px] text-slate-450 max-w-sm mx-auto mt-1 leading-normal">
                There are currently no tasks associated with this project. Click "Add Project Task" to assign one.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {associatedTasks.map((task) => {
                const isEditable = canEditTask(activeUserId, task, users);
                const isDeletable = canDeleteTask(activeUserId, task, users);
                const assignee = getAssignee(task.assignedToUserId);

                return (
                  <div
                    key={task.id}
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        disabled={!isEditable}
                        onClick={() => onToggleTaskComplete(task.id)}
                        className={`shrink-0 mt-0.5 rounded cursor-pointer ${
                          isEditable ? "hover:scale-105" : "cursor-not-allowed opacity-55"
                        }`}
                      >
                        {task.status === "Completed" ? (
                          <CheckSquare className="text-emerald-600" size={15} />
                        ) : (
                          <Square className="text-slate-400" size={15} />
                        )}
                      </button>

                      <div className="min-w-0">
                        <span
                          className={`font-bold text-xs text-slate-800 leading-tight block truncate ${
                            task.status === "Completed" && "line-through text-slate-400"
                          }`}
                        >
                          {task.title}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                          {task.description || "No task description added."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {/* Related Lead tag if any */}
                      {task.leadId && (
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase font-mono">
                          Lead: {leads.find((l) => l.id === task.leadId)?.clientName || "Related"}
                        </span>
                      )}

                      {/* Due date */}
                      <span className="text-[10px] text-slate-500 font-mono font-medium flex items-center gap-1">
                        <Calendar size={11} className="text-slate-400" />
                        {task.dueDate}
                      </span>

                      {/* Priority badge */}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>

                      {/* Assignee */}
                      <div className="text-right">
                        <span className="text-[8.5px] uppercase font-mono text-slate-400 block leading-none">Assignee</span>
                        <span className="text-[10.5px] font-bold text-slate-700 mt-0.5 block">{assignee.name}</span>
                      </div>

                      {/* Delete with inline confirmation */}
                      <InlineDeleteConfirm
                        id={`delete-task-${task.id}`}
                        disabled={!isDeletable}
                        disabledTitle="Only Owner or Manager can delete tasks"
                        onConfirm={() => onDeleteTask(task.id)}
                        title="Delete task"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------
          ADD TASK MODAL (SPECIFIC TO SELECTED WORKFLOW)
         ---------------------------------------------------- */}
      {isAddTaskOpen && activeWorkflow && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={14} className="text-indigo-400" />
                  Add Project Task
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Workflow: {activeWorkflow.name}
                </p>
              </div>
              <button
                onClick={() => setIsAddTaskOpen(false)}
                className="text-slate-400 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTaskSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule meeting with CEO"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                  Task Description
                </label>
                <textarea
                  placeholder="Insert checklist elements, objectives or schedules..."
                  rows={2}
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as SalesTask["priority"])}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-bold"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Workflow Project
                  </label>
                  <input
                    type="text"
                    disabled
                    value={activeWorkflow.name}
                    className="w-full text-xs border border-slate-200 bg-slate-100 px-3 py-2 rounded-lg text-slate-700 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono">
                    Related Sales Lead
                  </label>
                  <select
                    value={newTaskLeadId}
                    onChange={(e) => setNewTaskLeadId(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-semibold"
                  >
                    <option value="">-- No Related Lead --</option>
                    {associatedLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.clientName} ({l.companyName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase font-mono flex items-center justify-between">
                  <span>Assign Task To</span>
                  <span className="text-[8px] text-slate-400 capitalize">
                    reports tree limits
                  </span>
                </label>
                <select
                  value={newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  className="w-full text-xs border border-slate-200 bg-slate-50 px-3 py-2 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                >
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddTaskOpen(false)}
                  className="px-3.5 py-1.5 text-slate-500 hover:bg-slate-50 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-750 hover:bg-indigo-800 text-white text-xs font-extrabold rounded-lg shadow uppercase font-mono tracking-wider"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
