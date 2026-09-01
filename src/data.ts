/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Role, AccessLevel, ProjectWorkflow, SalesTask, ActionLog, Client, Product, OrderOffer, OrderItem, TaxRate } from "./types";

export const INITIAL_TAX_RATES: TaxRate[] = [
  { id: "tax-0", name: "0%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-3", name: "3%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-5", name: "5%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-12", name: "12%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-18", name: "18%", createdAt: "2026-06-01T00:00:00-07:00" },
];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_USERS: User[] = [
  {
    id: "gcp@aromaorganic.in",
    name: "AOL GCP",
    role: Role.Admin,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "gcp@aromaorganic.in",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  },
  {
    id: "naveen@chsurya.in",
    name: "Naveen",
    role: Role.Admin,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "naveen@chsurya.in",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  },
  {
    id: "velu@aromaorganic.in",
    name: "Velu Admin",
    role: Role.User,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "velu@aromaorganic.in",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  }
];

export const INITIAL_WORKFLOWS: ProjectWorkflow[] = [];


/**
 * Calculates all team members under a user recursively.
 */
export function getReportingTreeUsers(userId: string, users: User[] = INITIAL_USERS): string[] {
  const directReports = users.filter((u) => u.reportsTo === userId);
  let treeIds = directReports.map((u) => u.id);
  for (const report of directReports) {
    const subTree = getReportingTreeUsers(report.id, users);
    treeIds = [...treeIds, ...subTree];
  }
  return treeIds;
}

// Helper to check access levels based on permissions:
// - Editor: Add, View, Edit (Only self created)
// - Contributor: Add, View, Edit (self and its team)
// - Manager: View, Edit, Delete (for all)

// Similar wrappers for Tasks
export function canViewTask(userId: string, task: SalesTask, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  if (activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }

  if (task.createdByUserId === userId || task.assignedToUserId === userId) {
    return true;
  }

  if (activeUser.accessLevel === AccessLevel.Contributor) {
    const reportingTree = getReportingTreeUsers(userId, users);
    return (
      reportingTree.includes(task.createdByUserId) ||
      reportingTree.includes(task.assignedToUserId)
    );
  }

  return false;
}

export function canEditTask(userId: string, task: SalesTask, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  if (activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }

  if (activeUser.accessLevel === AccessLevel.Editor) {
    return task.createdByUserId === userId;
  }

  if (activeUser.accessLevel === AccessLevel.Contributor) {
    if (task.createdByUserId === userId) return true;
    const reportingTree = getReportingTreeUsers(userId, users);
    return reportingTree.includes(task.createdByUserId);
  }

  return false;
}

export function canDeleteTask(userId: string, task: SalesTask, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  if (activeUser.role === Role.SeniorManager || activeUser.role === Role.Manager || activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }
  return task.createdByUserId === userId || task.assignedToUserId === userId;
}

export function canViewClient(userId: string, client: Client, users: User[] = INITIAL_USERS, levelFilterEnabled: boolean = false): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  // If level-wise filtering is not enabled, they can view everything
  if (!levelFilterEnabled) {
    return true;
  }

  // Self created or self assigned is always visible
  if (client.createdByUserId === userId || client.assignedToUserId === userId) {
    return true;
  }

  const reportingTree = getReportingTreeUsers(userId, users);
  return (
    (client.createdByUserId && reportingTree.includes(client.createdByUserId)) ||
    (client.assignedToUserId && reportingTree.includes(client.assignedToUserId)) ||
    false
  );
}

export function canEditClient(userId: string, client: Client, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  // Must be able to view the client to edit them
  if (!canViewClient(userId, client, users)) {
    return false;
  }

  return true;
}

export function canDeleteClient(userId: string, client: Client, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  if (activeUser.role === Role.SeniorManager || activeUser.role === Role.Manager || activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }
  return client.createdByUserId === userId;
}

export const INITIAL_ORDERS: OrderOffer[] = [];

export function canViewOrderOffer(userId: string, order: OrderOffer, users: User[] = INITIAL_USERS, levelFilterEnabled: boolean = false): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;

  // If level-wise filtering is not enabled, they can view everything
  if (!levelFilterEnabled) {
    return true;
  }

  if (activeUser.role === Role.Admin) {
    return true;
  }

  if (order.createdByUserId === userId || order.assignedToUserId === userId) {
    return true;
  }

  const reportingTree = getReportingTreeUsers(userId, users);
  return (
    reportingTree.includes(order.createdByUserId) ||
    reportingTree.includes(order.assignedToUserId)
  );
}

export function canEditOrderOffer(userId: string, order: OrderOffer, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;

  if (activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }

  if (order.assignedToUserId === userId) {
    return true;
  }

  if (activeUser.accessLevel === AccessLevel.Editor) {
    return order.createdByUserId === userId;
  }

  if (activeUser.accessLevel === AccessLevel.Contributor) {
    if (order.createdByUserId === userId) return true;
    const reportingTree = getReportingTreeUsers(userId, users);
    return reportingTree.includes(order.createdByUserId);
  }

  return false;
}

export function canDeleteOrderOffer(userId: string, order: OrderOffer, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;

  if (activeUser.role === Role.Admin || activeUser.role === Role.SeniorManager || activeUser.role === Role.Manager || activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }
  return order.createdByUserId === userId || order.assignedToUserId === userId;
}

export function canEditProduct(userId: string, product: Product, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;

  // Manager/Admin can edit any product
  if (activeUser.accessLevel === AccessLevel.Manager || activeUser.role === Role.Admin) {
    return true;
  }

  // Contributor can edit if product is self-created or in the user's team
  if (activeUser.accessLevel === AccessLevel.Contributor) {
    return (
      product.createdByUserId === userId ||
      (!!product.teamName && product.teamName.toLowerCase() === activeUser.teamName.toLowerCase())
    );
  }

  // Editor can only edit self-created products
  if (activeUser.accessLevel === AccessLevel.Editor) {
    return product.createdByUserId === userId;
  }

  return false;
}

export function canDeleteProduct(userId: string, product: Product, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;

  if (activeUser.role === Role.Admin || activeUser.role === Role.SeniorManager || activeUser.role === Role.Manager || activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }
  return product.createdByUserId === userId;
}

