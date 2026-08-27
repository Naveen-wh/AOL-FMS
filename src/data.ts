/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Role, AccessLevel, SalesLead, ProjectWorkflow, SalesTask, ActionLog, Client, Product, OrderOffer, OrderItem, TaxRate } from "./types";

export const INITIAL_TAX_RATES: TaxRate[] = [
  { id: "tax-0", name: "0%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-3", name: "3%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-5", name: "5%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-12", name: "12%", createdAt: "2026-06-01T00:00:00-07:00" },
  { id: "tax-18", name: "18%", createdAt: "2026-06-01T00:00:00-07:00" },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "proj-1",
    name: "Cloud Migration Suite",
    category: "Cloud Services",
    group: "Infrastructure",
    manufacturer: "Apex Systems",
    teamName: "SME West Coast",
    createdAt: "2026-06-01T00:00:00-07:00"
  },
  {
    id: "proj-2",
    name: "SaaS Enterprise Licensing",
    category: "Software",
    group: "Applications",
    manufacturer: "Apex Systems",
    teamName: "Enterprise Sales",
    createdAt: "2026-06-01T00:00:00-07:00"
  },
  {
    id: "proj-3",
    name: "AI Copilot Integration Pro",
    category: "AI Solutions",
    group: "Analytics",
    manufacturer: "Apex AI Labs",
    teamName: "Executive",
    createdAt: "2026-06-01T00:00:00-07:00"
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: "admin-gcp",
    name: "AOL GCP",
    role: Role.Admin,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "gcp@aromaorganic.in",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  },
  {
    id: "admin-velu",
    name: "Velu Admin",
    role: Role.Admin,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "velu@aromaorganic.in",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  },
  {
    id: "admin-1",
    name: "Robert Sterling",
    role: Role.Admin,
    accessLevel: AccessLevel.Manager,
    teamName: "Executive",
    email: "robert.sterling@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=120",
    targetQuota: 250000,
  },
  {
    id: "sr-mgr-1",
    name: "Sarah Jenkins",
    role: Role.SeniorManager,
    accessLevel: AccessLevel.Contributor,
    reportsTo: "admin-1",
    teamName: "Enterprise Sales",
    email: "sarah.jenkins@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=120",
    targetQuota: 180000,
  },
  {
    id: "mgr-1",
    name: "Michael Chang",
    role: Role.Manager,
    accessLevel: AccessLevel.Contributor,
    reportsTo: "sr-mgr-1",
    teamName: "Mid-Market Team A",
    email: "michael.chang@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120",
    targetQuota: 100000,
  },
  {
    id: "mgr-2",
    name: "Elena Rostova",
    role: Role.Manager,
    accessLevel: AccessLevel.Contributor,
    reportsTo: "sr-mgr-1",
    teamName: "Mid-Market Team B",
    email: "elena.rostova@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=120",
    targetQuota: 95000,
  },
  {
    id: "tl-1",
    name: "Tina Lopez",
    role: Role.TeamLead,
    accessLevel: AccessLevel.Contributor,
    reportsTo: "mgr-1",
    teamName: "SME West Coast",
    email: "tina.lopez@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120",
    targetQuota: 60000,
  },
  {
    id: "tl-2",
    name: "Tom Harris",
    role: Role.TeamLead,
    accessLevel: AccessLevel.Contributor,
    reportsTo: "mgr-2",
    teamName: "SME East Coast",
    email: "tom.harris@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120",
    targetQuota: 55000,
  },
  {
    id: "user-1",
    name: "John Doe",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    reportsTo: "tl-1",
    teamName: "SME West Coast",
    email: "john.doe@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=120",
    targetQuota: 30000,
  },
  {
    id: "user-2",
    name: "Jane Smith",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    reportsTo: "tl-1",
    teamName: "SME West Coast",
    email: "jane.smith@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120",
    targetQuota: 30000,
  },
  {
    id: "user-3",
    name: "Jack Wilson",
    role: Role.User,
    accessLevel: AccessLevel.Editor,
    reportsTo: "tl-2",
    teamName: "SME East Coast",
    email: "jack.wilson@apex.com",
    avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=120",
    targetQuota: 28000,
  }
];

export const INITIAL_WORKFLOWS: ProjectWorkflow[] = [
  {
    id: "proj-1",
    name: "Cloud Migration Pipeline",
    description: "Migration of legacy on-premises databases to secure cloud infrastructure for healthcare clients.",
    status: "Active",
    clientName: "Sovereign Health Inc.",
    leadsCount: 3
  },
  {
    id: "proj-2",
    name: "SaaS Enterprise Deal Flow",
    description: "Multi-year seat licensing workflow for financial analytics tools.",
    status: "Active",
    clientName: "Apex Capital S.A.",
    leadsCount: 2
  },
  {
    id: "proj-3",
    name: "AI Copilot Integration Projects",
    description: "PoC and pilots of customizable generative AI assistant solutions for operations.",
    status: "Planning",
    clientName: "Beacon Logistics Ltd.",
    leadsCount: 1
  }
];

export const INITIAL_LEADS: SalesLead[] = [
  // West Coast SME - Tina (TL), John (User), Jane (User)
  {
    id: "lead-1",
    clientName: "Amanda Ramirez",
    companyName: "Vanguard Tech Solutions",
    email: "amanda@vanguardtech.com",
    phone: "+1 (555) 234-5678",
    status: "Negotiation",
    value: 45000,
    quantity: 1,
    rate: 45000,
    amount: 45000,
    assignedToUserId: "user-1", // John Doe
    createdByUserId: "user-1", // John Doe created
    projectId: "proj-1",
    notes: "Client requested an additional 10% discount on support SLA. Discussing with Michael (Manager).",
    createdAt: "2026-06-10T14:30:00-07:00"
  },
  {
    id: "lead-2",
    clientName: "Marcus Sterling",
    companyName: "Horizon Digital",
    email: "msterling@horizondigital.org",
    phone: "+1 (555) 876-5432",
    status: "Proposal",
    value: 25000,
    quantity: 1,
    rate: 25000,
    amount: 25000,
    assignedToUserId: "user-1", // John Doe
    createdByUserId: "tl-1", // Team Lead created and assigned to John
    projectId: "proj-1",
    notes: "John to schedule follow-up presentation of the technical architecture dashboard.",
    createdAt: "2026-06-12T09:15:00-07:00"
  },
  {
    id: "lead-3",
    clientName: "Sarah Peterson",
    companyName: "BioMedical Systems Corp",
    email: "speterson@biomedicalsys.com",
    phone: "+1 (555) 432-1098",
    status: "Contacted",
    value: 18000,
    quantity: 1,
    rate: 18000,
    amount: 18000,
    assignedToUserId: "user-2", // Jane Smith
    createdByUserId: "user-2", // Jane Smith created
    projectId: "proj-1",
    notes: "First discovery call completed. High interest in encrypted database migrations.",
    createdAt: "2026-06-14T11:00:00-07:00"
  },
  {
    id: "lead-4",
    clientName: "Derek Vance",
    companyName: "Silicon Hills Ventures",
    email: "vance@siliconhills.vc",
    phone: "+1 (555) 901-2345",
    status: "New",
    value: 65000,
    quantity: 1,
    rate: 65000,
    amount: 65000,
    assignedToUserId: "tl-1", // Tina Lopez (TL) self-assigned
    createdByUserId: "tl-1", // Tina created
    projectId: "proj-2",
    notes: "Inbound inquiry on venture partnership licenses. High priority deal.",
    createdAt: "2026-06-18T16:45:00-07:00"
  },

  // East Coast SME - Tom (TL), Jack (User)
  {
    id: "lead-5",
    clientName: "Brooke Harmon",
    companyName: "Manhattan Brokerage Inc.",
    email: "b.harmon@manhattanbroker.com",
    phone: "+1 (212) 555-0199",
    status: "Closed Won",
    value: 52000,
    quantity: 1,
    rate: 52000,
    amount: 52000,
    assignedToUserId: "user-3", // Jack Wilson
    createdByUserId: "user-3", // Jack Wilson created
    projectId: "proj-2",
    notes: "Contract signed! Provisioning SaaS workspaces next Monday.",
    createdAt: "2026-06-15T10:30:00-07:00"
  },
  {
    id: "lead-6",
    clientName: "Gregory Peck",
    companyName: "Empire Logistics Group",
    email: "gregory@empirelogistics.co",
    phone: "+1 (212) 555-8833",
    status: "Proposal",
    value: 38000,
    quantity: 1,
    rate: 38000,
    amount: 38000,
    assignedToUserId: "tl-2", // Tom Harris (TL) self-assigned
    createdByUserId: "tl-2",
    projectId: "proj-3",
    notes: "Pilot draft shared. Elena (Manager) reviewed pricing matrix.",
    createdAt: "2026-06-19T13:20:00-07:00"
  },

  // High Enterprise Sales - Sarah (Sr Manager) or Michael (Manager)
  {
    id: "lead-7",
    clientName: "Victoria Thorne",
    companyName: "Global Wealth Partners",
    email: "vthorne@globalwealth.com",
    phone: "+1 (800) 555-0144",
    status: "Negotiation",
    value: 175000,
    quantity: 1,
    rate: 175000,
    amount: 175000,
    assignedToUserId: "sr-mgr-1", // Sarah Jenkins
    createdByUserId: "sr-mgr-1", // Sarah Jenkins created
    projectId: "proj-2",
    notes: "Reviewing proposal with Robert Sterling (Admin). Board meeting next Tuesday.",
    createdAt: "2026-06-05T08:00:00-07:00"
  },
  {
    id: "lead-8",
    clientName: "Winston Smith",
    companyName: "Truth Media Conglomerate",
    email: "wsmith@truthmedia.org",
    phone: "+1 (415) 333-2211",
    status: "Closed Lost",
    value: 120000,
    quantity: 1,
    rate: 120000,
    amount: 120000,
    assignedToUserId: "mgr-1", // Michael Chang
    createdByUserId: "mgr-1", // Michael Chang created
    projectId: "proj-3",
    notes: "Competitor undercut us by 20%. Archiving the deal for next quarter.",
    createdAt: "2026-05-20T17:00:00-07:00"
  }
];

export const INITIAL_TASKS: SalesTask[] = [
  {
    id: "task-1",
    title: "Draft Discount SLA Proposal",
    description: "Write custom SLA clauses adapting requested 10% discount framework for approval.",
    dueDate: "2026-06-25",
    priority: "High",
    status: "In Progress",
    assignedToUserId: "user-1", // John Doe
    createdByUserId: "user-1",
    projectId: "proj-1",
    leadId: "lead-1"
  },
  {
    id: "task-2",
    title: "Prepare Cloud Architecture Slides",
    description: "Build 5-slide architectural deck illustrating data security measures during cloud migration.",
    dueDate: "2026-06-28",
    priority: "High",
    status: "To Do",
    assignedToUserId: "user-1", // John Doe
    createdByUserId: "tl-1", // Tina created & assigned
    projectId: "proj-1",
    leadId: "lead-2"
  },
  {
    id: "task-3",
    title: "Conduct Security Questionnaire Review",
    description: "Approve answers for BioMedical HIPAA requirements.",
    dueDate: "2026-06-24",
    priority: "Medium",
    status: "Review",
    assignedToUserId: "user-2", // Jane Smith
    createdByUserId: "user-2",
    projectId: "proj-1",
    leadId: "lead-3"
  },
  {
    id: "task-4",
    title: "Draft Venture Licenses Contract",
    description: "Liaise with legal team to prepare custom venture scope rider.",
    dueDate: "2026-06-29",
    priority: "High",
    status: "To Do",
    assignedToUserId: "tl-1", // Tina Lopez
    createdByUserId: "tl-1",
    projectId: "proj-2",
    leadId: "lead-4"
  },
  {
    id: "task-5",
    title: "Approve High Value Enterprise Draft",
    description: "Review Global Wealth proposal before Sarah presents to the advisory board.",
    dueDate: "2026-06-23",
    priority: "High",
    status: "In Progress",
    assignedToUserId: "admin-1", // Admin Robert
    createdByUserId: "sr-mgr-1", // Sarah requested
    projectId: "proj-2",
    leadId: "lead-7"
  }
];

export const INITIAL_LOGS: ActionLog[] = [
  {
    id: "log-1",
    timestamp: "2026-06-18T16:45:00-07:00",
    userId: "tl-1",
    userName: "Tina Lopez",
    actionType: "Create Lead",
    targetType: "Lead",
    targetId: "lead-4",
    targetName: "Silicon Hills Ventures",
    details: "Created high priority lead under SaaS Enterprise Deal Flow."
  },
  {
    id: "log-2",
    timestamp: "2026-06-19T13:20:00-07:00",
    userId: "tl-2",
    userName: "Tom Harris",
    actionType: "Create Lead",
    targetType: "Lead",
    targetId: "lead-6",
    targetName: "Empire Logistics Group",
    details: "Created proposal trial pipeline lead for East Coast."
  },
  {
    id: "log-3",
    timestamp: "2026-06-20T10:00:00-07:00",
    userId: "user-1",
    userName: "John Doe",
    actionType: "Edit Lead",
    targetType: "Lead",
    targetId: "lead-1",
    targetName: "Vanguard Tech Solutions",
    details: "Modified notes about discount discussions."
  }
];

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

/**
 * Helper to check access levels based on permissions:
 * - Editor: Add, View, Edit (Only self created)
 * - Contributor: Add, View, Edit (self and its team)
 * - Manager: View, Edit, Delete (for all)
 */

export function canViewLead(userId: string, lead: SalesLead, users: User[] = INITIAL_USERS, levelFilterEnabled: boolean = false): boolean {
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
  if (lead.createdByUserId === userId || lead.assignedToUserId === userId) {
    return true;
  }

  // Contributor or strict level-wise hierarchy restriction: self and its reporting team
  const reportingTree = getReportingTreeUsers(userId, users);
  return (
    reportingTree.includes(lead.createdByUserId) ||
    reportingTree.includes(lead.assignedToUserId)
  );
}

export function canEditLead(userId: string, lead: SalesLead, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  // Manager: View, Edit, Delete (for all)
  if (activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }

  // Self assigned leads are editable
  if (lead.assignedToUserId === userId) {
    return true;
  }

  // Editor: Add, View, Edit (Only self created)
  if (activeUser.accessLevel === AccessLevel.Editor) {
    return lead.createdByUserId === userId;
  }

  // Contributor: Add, View, Edit (self and its team)
  if (activeUser.accessLevel === AccessLevel.Contributor) {
    if (lead.createdByUserId === userId) return true;
    const reportingTree = getReportingTreeUsers(userId, users);
    return reportingTree.includes(lead.createdByUserId);
  }

  return false;
}

export function canDeleteLead(userId: string, lead: SalesLead, users: User[] = INITIAL_USERS): boolean {
  const activeUser = users.find((u) => u.id === userId);
  if (!activeUser) return false;
  if (activeUser.role === Role.Admin || activeUser.email === "gcp@aromaorganic.in" || activeUser.email === "naveen@chsurya.in") {
    return true;
  }

  if (activeUser.role === Role.SeniorManager || activeUser.role === Role.Manager || activeUser.accessLevel === AccessLevel.Manager) {
    return true;
  }
  return lead.createdByUserId === userId || lead.assignedToUserId === userId;
}

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

export const INITIAL_ORDERS: OrderOffer[] = [
  {
    id: "order-1",
    clientName: "Amanda Ramirez",
    companyName: "Vanguard Tech Solutions",
    email: "amanda@vanguardtech.com",
    phone: "+1 (555) 234-5678",
    status: "Negotiation",
    totalValue: 70000,
    items: [
      {
        productId: "proj-1",
        productName: "Cloud Migration Suite",
        quantity: 1,
        rate: 45000,
        amount: 45000,
      },
      {
        productId: "proj-2",
        productName: "SaaS Enterprise Licensing",
        quantity: 1,
        rate: 25000,
        amount: 25000,
      }
    ],
    assignedToUserId: "user-1", // John Doe
    createdByUserId: "user-1",
    notes: "Negotiating standard bundle discount with the IT lead.",
    createdAt: "2026-06-20T10:00:00-07:00",
    payment: "Net 30",
    delivery: "Standard",
    otherTerms: "None"
  },
  {
    id: "order-2",
    clientName: "Elena Rostova",
    companyName: "Apex Capital S.A.",
    email: "elena.rostova@apex.com",
    phone: "+1 (555) 901-2345",
    status: "Closed Won",
    totalValue: 90000,
    items: [
      {
        productId: "proj-3",
        productName: "AI Copilot Integration Pro",
        quantity: 3,
        rate: 30000,
        amount: 90000,
      }
    ],
    assignedToUserId: "tl-1", // Tina Lopez
    createdByUserId: "tl-1",
    notes: "Customer ordered 3 enterprise licenses for their AI integration division.",
    createdAt: "2026-06-22T14:30:00-07:00",
    payment: "Net 15",
    delivery: "Express",
    otherTerms: "None"
  }
];

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

