import React, { useState, useMemo } from "react";
import {
  FAQItem,
  BugRequest,
  BugType,
  BugPriority,
  BugStatus,
  User,
  Role,
} from "../types";
import {
  HelpCircle,
  Bug,
  Plus,
  Search,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Upload,
  X,
  Trash2,
  Edit,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  User as UserIcon,
  Eye,
  Download,
  Tag,
  MessageSquare,
  Send,
  Loader2,
  Shield,
  Layers,
} from "lucide-react";

// Built-in comprehensive navigation FAQs (5+ per tab & sub-tab)
export const BUILTIN_FAQS: FAQItem[] = [
  // --- DASHBOARD (5 FAQs) ---
  {
    id: "faq-dash-1",
    question: "How do I navigate the Main Dashboard and read Key Metrics?",
    answer: "Click the 'Dashboard' tab in the left navigation menu. The top summary cards highlight total active leads, converted deal values, pending sales tasks, and win rates. Charts automatically summarize your pipeline distribution.",
    category: "Dashboard",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-dash-2",
    question: "What information is shown in the Sales Pipeline breakdown on Dashboard?",
    answer: "The Sales Pipeline card breaks down active deals across stages (New, Qualified, Proposal, Negotiation, Won, Lost). Clicking any stage card immediately filters your leads list accordingly.",
    category: "Dashboard",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-dash-3",
    question: "How do I view and complete my assigned Sales Tasks on Dashboard?",
    answer: "Scroll down to the 'Pending Tasks' panel on the Dashboard. Each task displays priority, due date, and linked customer name. Click the task status box to mark it as completed.",
    category: "Dashboard",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-dash-4",
    question: "How do I quickly create a new deal directly from the Dashboard?",
    answer: "Click the 'Quick Actions' button at the top-right of the Dashboard header and select 'Add New Lead'. This opens the creation modal without leaving the dashboard.",
    category: "Dashboard",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-dash-5",
    question: "Why do KPI metrics differ between team members on Dashboard?",
    answer: "Metrics are dynamically calculated based on your assigned Team Access Level (Own Leads vs. Team Leads vs. All Leads). System Administrators see global numbers across all teams.",
    category: "Dashboard",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- DEALS & LEADS (5 FAQs) ---
  {
    id: "faq-lead-1",
    question: "How do I switch between Kanban Board and Table View in Deals & Leads?",
    answer: "Navigate to 'Deals & Leads' and use the view toggle buttons at the top right ('Kanban Board' vs. 'Data Table'). Kanban displays cards organized by stage columns, while Table view offers tabular sorting and CSV exports.",
    category: "Deals & Leads",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-lead-2",
    question: "How do I move a lead from one stage to another?",
    answer: "In Kanban view, drag and drop the lead card into the target stage column. Alternatively, click the lead to open details, change the 'Stage' dropdown, and save.",
    category: "Deals & Leads",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-lead-3",
    question: "How do I search, filter, and export my sales leads?",
    answer: "Use the search bar at the top of Deals & Leads to search by client name or contact. Apply filters for Stage, Priority, or Owner, then click 'Export CSV' to download the dataset.",
    category: "Deals & Leads",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-lead-4",
    question: "How do I log interaction notes or follow-up tasks for a lead?",
    answer: "Click on any lead to open its detail drawer. Under 'Activity Log & Tasks', type meeting notes, record call logs, or set follow-up reminders assigned to team members.",
    category: "Deals & Leads",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-lead-5",
    question: "Who can edit or delete a lead in my organization?",
    answer: "Lead editing is enabled for Editors, Managers, and Admins. Lead deletion is restricted to Team Managers and System Administrators to protect organizational data.",
    category: "Deals & Leads",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- ORDERS & OFFERS (5 FAQs) ---
  {
    id: "faq-ord-1",
    question: "How do I create a new Order or Quotation Offer?",
    answer: "Go to 'Orders & Offers' tab and click '+ New Order Offer'. Select the target client, add products with quantities/prices, choose payment terms, and save.",
    category: "Orders & Offers",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ord-2",
    question: "How do I generate and download an official PDF quotation?",
    answer: "Select the target Order/Offer item from the list and click 'Download PDF' or 'Preview Offer'. The portal formats unit prices, tax calculations, payment terms, and branding into a clean PDF document.",
    category: "Orders & Offers",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ord-3",
    question: "How do I track Order Statuses from Draft to Accepted or Rejected?",
    answer: "Use the status filter tabs ('All', 'Draft', 'Sent to Client', 'Accepted', 'Rejected'). Authorized team members can update status via the action dropdown on each order card.",
    category: "Orders & Offers",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ord-4",
    question: "How do I attach customer Purchase Orders (PO) or Invoices to an order?",
    answer: "In the Orders list, click 'Upload Document' on the target order row. Upload your PDF or image document (up to 10MB) to link it directly to the record.",
    category: "Orders & Offers",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ord-5",
    question: "Can an accepted Sales Offer be converted directly into an Indent?",
    answer: "Yes! Once an offer is updated to 'Accepted', click 'Convert to Indent' on the order row. Line items, client info, and prices will transfer into the Indent dispatch pipeline.",
    category: "Orders & Offers",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- INDENT (5 FAQs) ---
  {
    id: "faq-ind-1",
    question: "What is the Indent tab used for and how do I navigate dispatch workflows?",
    answer: "The Indent tab manages warehouse dispatch processing, logistics allocation, and delivery tracking. Filter indents by sub-status ('Pending Approval', 'Dispatched', 'Delivered') to track order progress.",
    category: "Indent",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ind-2",
    question: "How do I assign Warehouse, Transporter, and Dispatch Location to an Indent?",
    answer: "Edit the Indent row, select the originating 'Dispatch Location', assign 'Warehouse Managed By' (e.g. In-House / Third Party), and choose the registered 'Transporter Name'.",
    category: "Indent",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ind-3",
    question: "How do I upload Lorry Receipts (LR) or E-Way Bill dispatch documents?",
    answer: "Click 'Upload Dispatch Proof' on the Indent row. Upload your scanned LR receipt, E-Way Bill PDF, or invoice image to make it immediately viewable by logistics and sales managers.",
    category: "Indent",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ind-4",
    question: "Who approves an Indent before physical goods are dispatched?",
    answer: "Logistics Managers and System Administrators review pending indents. Clicking 'Approve Indent' locks product quantities and notifies warehouse dispatch personnel.",
    category: "Indent",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-ind-5",
    question: "How do I filter Indents by Freight Terms or Transporter?",
    answer: "Click the 'Filter' dropdown on the Indent page to filter records by Freight Terms (FOB, CIF, EXW, DDP) or specific logistics carrier names.",
    category: "Indent",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- PAYMENT LIST (5 FAQs) ---
  {
    id: "faq-pay-1",
    question: "How do I navigate the Payment List tab and track pending customer invoices?",
    answer: "Open 'Payment List' to view client invoices, due dates, outstanding balances, and payment statuses ('Unpaid', 'Partially Paid', 'Paid Overdue').",
    category: "Payment List",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-pay-2",
    question: "How do I record a received customer payment against an invoice?",
    answer: "Click 'Record Payment' on the target invoice row, select the receiving Bank Account, enter the payment amount and bank UTR transaction reference, then save.",
    category: "Payment List",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-pay-3",
    question: "How do I configure Payment Terms and Credit Periods?",
    answer: "On the Payment List tab, switch to the 'Payment Terms & Credit' sub-panel (Admin access required). Define standard terms like '30 Days Net', '50% Advance', or 'L/C at Sight'.",
    category: "Payment List",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-pay-4",
    question: "How do I attach payment receipt proofs or bank deposit slips?",
    answer: "When recording or editing a payment entry, click 'Attach Receipt Proof' to upload your bank deposit receipt image or transfer confirmation screenshot.",
    category: "Payment List",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-pay-5",
    question: "How are company Bank Accounts managed for invoice payment advice?",
    answer: "Go to the 'Bank Accounts' sub-tab within Payment List or List Management. Registered company bank details automatically populate on generated customer invoices and payment instructions.",
    category: "Payment List",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- LIST MANAGEMENT (MASTER DATA) (5 FAQs) ---
  {
    id: "faq-list-1",
    question: "What sub-tabs exist in List Management and how do I navigate them?",
    answer: "List Management includes sub-tabs for Products, Categories, Product Groups, Manufacturers, Freight Terms, Transporters, Warehouses, and Dispatch Locations. Click any sub-tab pill to manage master items.",
    category: "List Management",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-list-2",
    question: "How do I add a new Product or Product Category to the master catalog?",
    answer: "Open 'List Management' -> 'Products' or 'Product Categories' sub-tab. Click '+ Add New', enter product code, item name, unit pricing, and description, then click Save.",
    category: "List Management",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-list-3",
    question: "How do I manage logistics dropdown options like Transporters and Freight Terms?",
    answer: "Select the 'Transporters' or 'Freight Terms' sub-tab under List Management. Add new carrier partners or freight conditions which will immediately populate order selection dropdowns.",
    category: "List Management",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-list-4",
    question: "What happens when master data is modified or deleted?",
    answer: "Updating master data updates selection lists for all future deals and orders. Items currently referenced in historical transactions are protected against accidental deletion.",
    category: "List Management",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-list-5",
    question: "Who has permission to edit Master Data lists?",
    answer: "Only System Administrators and authorized Operations Managers have write and edit access to Master Data lists. Other team members can view items for selection.",
    category: "List Management",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- HIERARCHY & TEAM (5 FAQs) ---
  {
    id: "faq-team-1",
    question: "How do I view team hierarchy, member roles, and department assignments?",
    answer: "Open the 'Hierarchy & Team' tab. The main directory displays all team members, assigned teams (e.g. Sales North, Accounts, Logistics), email addresses, and roles (Admin vs. User).",
    category: "Hierarchy & Team",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-team-2",
    question: "How do Administrators add or onboard a new user to the portal?",
    answer: "System Admins click '+ Add Team Member' in Hierarchy & Team, enter the user's email address, select their Team and Role, and save. The user gains access as soon as they log in with Google.",
    category: "Hierarchy & Team",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-team-3",
    question: "How do I configure Tab Permissions and visibility for specific Teams?",
    answer: "Go to 'Hierarchy & Team' -> 'Team Permissions Settings' sub-tab. Admins can toggle view/edit access for individual tabs (e.g., hiding Payment List or Email Templates from specific teams).",
    category: "Hierarchy & Team",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-team-4",
    question: "What is the difference between Admin and User roles?",
    answer: "Admins have full global control over all tabs, user onboarding, permission toggles, and master data. Users are governed by their team's tab visibility rules and access levels.",
    category: "Hierarchy & Team",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-team-5",
    question: "How do I assign Team Leaders or Managers to a department?",
    answer: "In the Team Directory, edit a team member's profile and set 'Access Level' to 'Manager' or 'Team Lead'. This elevates their visibility over team-wide deals, indents, and tasks.",
    category: "Hierarchy & Team",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- AUDIT LOG TRIAL (5 FAQs) ---
  {
    id: "faq-log-1",
    question: "What activity logs are recorded in the Audit Log Trial tab?",
    answer: "The Audit Log captures system events including user sign-ins, lead stage movements, order updates, master data edits, and payment records with exact timestamps and user details.",
    category: "Audit Log Trial",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-log-2",
    question: "How do I search or filter historical audit logs?",
    answer: "Use the top search box in the Audit Log Trial tab to filter entries by user email, action type (CREATE, UPDATE, DELETE), or target module name.",
    category: "Audit Log Trial",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-log-3",
    question: "Can Administrators toggle system audit trail logging on or off?",
    answer: "Yes. Admins can use the 'Audit Trail Logging Enabled' toggle at the top-right of the Audit Log tab to pause or resume real-time event recording.",
    category: "Audit Log Trial",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-log-4",
    question: "Who can access and review Audit Log Trial records?",
    answer: "System Administrators and designated compliance managers have access to view audit logs to ensure security, compliance, and operational transparency.",
    category: "Audit Log Trial",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-log-5",
    question: "Can audit logs be edited or deleted by users?",
    answer: "No. Audit logs are immutable, append-only historical audit records and cannot be altered or erased by standard users or managers.",
    category: "Audit Log Trial",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- EMAIL TEMPLATES (5 FAQs) ---
  {
    id: "faq-email-1",
    question: "How do I create and customize automated Email Templates?",
    answer: "Open 'Email Templates' tab and click '+ New Template'. Enter a template title, email subject line, and body content incorporating dynamic variables like {client_name} or {deal_value}.",
    category: "Email Templates",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-email-2",
    question: "How do dynamic placeholders work in email templates?",
    answer: "Placeholders like {client_name}, {contact_person}, or {total_amount} automatically pull real data from the selected lead or order when sending emails to clients.",
    category: "Email Templates",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-email-3",
    question: "How do I configure Stage-based Auto-Selection rules for email templates?",
    answer: "In the Email Templates tab, switch to 'Auto-Select Settings'. Map specific templates to pipeline stages (e.g., auto-select 'Proposal Followup' when stage changes to 'Proposal').",
    category: "Email Templates",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-email-4",
    question: "How do I configure default sender email addresses and SMTP settings?",
    answer: "Navigate to the 'Email Configuration' sub-panel in Email Templates to set default From Email, Sender Name, and Reply-To addresses for outgoing communications.",
    category: "Email Templates",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-email-5",
    question: "Can I preview rendered email templates with sample data before saving?",
    answer: "Yes! In the template editor, click 'Preview Template' to view live HTML output populated with realistic sample client and deal details.",
    category: "Email Templates",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },

  // --- ABOUT ME & SUPPORT HUB (5 FAQs) ---
  {
    id: "faq-about-1",
    question: "What sub-tabs are available under About Me & Support Hub?",
    answer: "About Me includes two sub-tabs: 'FAQ' (frequently asked navigation and system guides) and 'Bug / Enhancement' (for submitting issue reports and feature requests).",
    category: "About Me",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-about-2",
    question: "How do I filter FAQ questions by tab or sub-tab categories?",
    answer: "Click any category button at the top of the FAQ screen (e.g., 'Dashboard', 'Deals & Leads', 'Orders & Offers', 'Indent', 'Payment List', 'List Management', 'Hierarchy & Team') or search by keyword.",
    category: "About Me",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-about-3",
    question: "How do I submit a Bug Report or Feature Enhancement request?",
    answer: "Go to 'About Me' -> 'Bug / Enhancement' sub-tab and click 'Submit Bug / Feature Request'. Fill in the title, description, priority, and attach a mandatory screenshot.",
    category: "About Me",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-about-4",
    question: "Why is a screenshot mandatory when submitting a bug or feature request?",
    answer: "Attaching a screenshot ensures the admin and development team can instantly see the exact error or layout area, eliminating follow-up delays!",
    category: "About Me",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  },
  {
    id: "faq-about-5",
    question: "How do I track completion status of my submitted bug or feature requests?",
    answer: "In the Bug / Enhancement sub-tab, every request displays a status badge ('Pending', 'In Progress', 'Completed'). You can also click the status checkbox on your request once verified!",
    category: "About Me",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdByUserName: "System Admin"
  }
];

interface AboutMeViewProps {
  activeUserId: string;
  users: User[];
  faqs: FAQItem[];
  bugRequests: BugRequest[];
  onSaveFAQ: (faq: FAQItem) => Promise<void>;
  onDeleteFAQ: (id: string) => Promise<void>;
  onSaveBugRequest: (bug: BugRequest) => Promise<void>;
  onDeleteBugRequest: (id: string) => Promise<void>;
  visibleSubTabs?: { [key: string]: string[] };
}

export default function AboutMeView({
  activeUserId,
  users,
  faqs,
  bugRequests,
  onSaveFAQ,
  onDeleteFAQ,
  onSaveBugRequest,
  onDeleteBugRequest,
  visibleSubTabs,
}: AboutMeViewProps) {
  const allSubTabs = useMemo(() => [
    { id: "faq" as const, label: "FAQ" },
    { id: "bugs" as const, label: "Bug / Enhancement" }
  ], []);

  const visibleAboutMeSubTabs = visibleSubTabs?.["about_me"];
  const filteredSubTabs = useMemo(() => {
    if (!visibleAboutMeSubTabs) return allSubTabs;
    return allSubTabs.filter(st => visibleAboutMeSubTabs.includes(st.id));
  }, [JSON.stringify(visibleAboutMeSubTabs)]);

  const [activeSubTab, setActiveSubTab] = useState<"faq" | "bugs">(
    filteredSubTabs[0]?.id || "faq"
  );

  React.useEffect(() => {
    if (filteredSubTabs.length > 0 && !filteredSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(filteredSubTabs[0].id);
    }
  }, [filteredSubTabs, activeSubTab]);

  // Current active user object
  const activeUser = users.find((u) => u.id === activeUserId) || {
    id: activeUserId,
    name: "User",
    email: activeUserId,
    role: Role.User,
  };
  const isAdmin = activeUser.role === Role.Admin;

  // --- FAQ STATE ---
  const [faqSearch, setFaqSearch] = useState("");
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>("All");
  const [expandedFaqIds, setExpandedFaqIds] = useState<Record<string, boolean>>({});
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqCategory, setFaqCategory] = useState("General");
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);

  // --- BUG / ENHANCEMENT STATE ---
  const [bugSearch, setBugSearch] = useState("");
  const [bugStatusFilter, setBugStatusFilter] = useState<string>("All");
  const [bugTypeFilter, setBugTypeFilter] = useState<string>("All");
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDescription, setBugDescription] = useState("");
  const [bugType, setBugType] = useState<BugType>("Bug / Error");
  const [bugPriority, setBugPriority] = useState<BugPriority>("Medium");
  const [bugScreenshotUrl, setBugScreenshotUrl] = useState<string>("");
  const [bugScreenshotName, setBugScreenshotName] = useState<string>("");
  const [isSavingBug, setIsSavingBug] = useState(false);
  const [deletingBugId, setDeletingBugId] = useState<string | null>(null);

  // Lightbox for full screenshot view
  const [activeLightboxImage, setActiveLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Status update modal for Admin notes
  const [editingBugStatusItem, setEditingBugStatusItem] = useState<BugRequest | null>(null);
  const [statusAdminNote, setStatusAdminNote] = useState("");
  const [statusTarget, setStatusTarget] = useState<BugStatus>("Completed");

  // Combined FAQs (Built-in navigation FAQs + custom Firestore FAQs)
  const combinedFaqs = useMemo(() => {
    const map = new Map<string, FAQItem>();
    BUILTIN_FAQS.forEach((f) => map.set(f.id, f));
    faqs.forEach((f) => map.set(f.id, f));
    return Array.from(map.values());
  }, [faqs]);

  // Categories list covering all tabs & sub-tabs
  const faqCategories = useMemo(() => {
    const defaultCats = [
      "All",
      "Dashboard",
      "Deals & Leads",
      "Orders & Offers",
      "Indent",
      "Payment List",
      "List Management",
      "Hierarchy & Team",
      "Audit Log Trial",
      "Email Templates",
      "About Me",
      "General",
      "User Access"
    ];
    const set = new Set<string>(defaultCats);
    combinedFaqs.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set);
  }, [combinedFaqs]);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    return combinedFaqs.filter((faq) => {
      const matchesSearch =
        faq.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
        faq.answer.toLowerCase().includes(faqSearch.toLowerCase()) ||
        (faq.category && faq.category.toLowerCase().includes(faqSearch.toLowerCase()));

      const matchesCategory =
        selectedFaqCategory === "All" || faq.category === selectedFaqCategory;

      return matchesSearch && matchesCategory;
    });
  }, [combinedFaqs, faqSearch, selectedFaqCategory]);

  // Filtered Bugs
  const filteredBugs = useMemo(() => {
    return bugRequests.filter((bug) => {
      const matchesSearch =
        bug.title.toLowerCase().includes(bugSearch.toLowerCase()) ||
        bug.description.toLowerCase().includes(bugSearch.toLowerCase()) ||
        bug.createdByUserName.toLowerCase().includes(bugSearch.toLowerCase()) ||
        (bug.createdByEmail && bug.createdByEmail.toLowerCase().includes(bugSearch.toLowerCase()));

      const matchesStatus =
        bugStatusFilter === "All"
          ? true
          : bugStatusFilter === "Completed"
          ? bug.isCompleted
          : bugStatusFilter === "Pending"
          ? !bug.isCompleted && bug.status !== "In Progress"
          : bug.status === bugStatusFilter;

      const matchesType = bugTypeFilter === "All" || bug.type === bugTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [bugRequests, bugSearch, bugStatusFilter, bugTypeFilter]);

  // Statistics for Bugs
  const bugStats = useMemo(() => {
    const total = bugRequests.length;
    const completed = bugRequests.filter((b) => b.isCompleted || b.status === "Completed").length;
    const inProgress = bugRequests.filter((b) => b.status === "In Progress" && !b.isCompleted).length;
    const pending = total - completed - inProgress;
    return { total, completed, inProgress, pending };
  }, [bugRequests]);

  // Handle FAQ Accordion Toggle
  const toggleFaqExpand = (id: string) => {
    setExpandedFaqIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Open FAQ Modal for Create / Edit
  const handleOpenFaqModal = (faq?: FAQItem) => {
    if (faq) {
      setEditingFaq(faq);
      setFaqQuestion(faq.question);
      setFaqAnswer(faq.answer);
      setFaqCategory(faq.category || "General");
    } else {
      setEditingFaq(null);
      setFaqQuestion("");
      setFaqAnswer("");
      setFaqCategory("General");
    }
    setIsFaqModalOpen(true);
  };

  // Submit FAQ
  const handleSaveFAQSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      alert("Please enter both question and answer.");
      return;
    }

    setIsSavingFaq(true);
    try {
      const newFaq: FAQItem = {
        id: editingFaq ? editingFaq.id : `faq-${Date.now()}`,
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
        category: faqCategory.trim() || "General",
        createdAt: editingFaq ? editingFaq.createdAt : new Date().toISOString(),
        createdByUserId: activeUser.id,
        createdByUserName: activeUser.name,
      };

      await onSaveFAQ(newFaq);
      setIsFaqModalOpen(false);
      setEditingFaq(null);
      setFaqQuestion("");
      setFaqAnswer("");
    } catch (err) {
      console.error("Failed to save FAQ:", err);
      alert("Failed to save FAQ. Please try again.");
    } finally {
      setIsSavingFaq(false);
    }
  };

  // Delete FAQ
  const handleDeleteFAQConfirm = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this FAQ question?")) return;
    setDeletingFaqId(id);
    try {
      await onDeleteFAQ(id);
    } catch (err) {
      console.error("Failed to delete FAQ:", err);
    } finally {
      setDeletingFaqId(null);
    }
  };

  // Screenshot File Selection Handler
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Screenshot file size should be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setBugScreenshotUrl(event.target?.result as string);
      setBugScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  };

  // Submit Bug Request
  const handleSaveBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim() || !bugDescription.trim()) {
      alert("Please provide both title and description for your request.");
      return;
    }

    if (!bugScreenshotUrl) {
      alert("Please attach a screenshot before submitting your request.");
      return;
    }

    setIsSavingBug(true);
    try {
      const newBug: BugRequest = {
        id: `bug-${Date.now()}`,
        title: bugTitle.trim(),
        description: bugDescription.trim(),
        type: bugType,
        priority: bugPriority,
        status: "Pending",
        isCompleted: false,
        screenshotUrl: bugScreenshotUrl || undefined,
        screenshotName: bugScreenshotName || undefined,
        createdByUserId: activeUser.id,
        createdByUserName: activeUser.name,
        createdByEmail: activeUser.email,
        createdAt: new Date().toISOString(),
      };

      await onSaveBugRequest(newBug);
      setIsBugModalOpen(false);
      // Reset form
      setBugTitle("");
      setBugDescription("");
      setBugType("Bug / Error");
      setBugPriority("Medium");
      setBugScreenshotUrl("");
      setBugScreenshotName("");
    } catch (err) {
      console.error("Failed to submit request:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSavingBug(false);
    }
  };

  // Toggle Checkbox for Request Completion
  const handleToggleBugCompletion = async (bug: BugRequest) => {
    const newIsCompleted = !bug.isCompleted;
    const newStatus: BugStatus = newIsCompleted ? "Completed" : "Pending";

    const updatedBug: BugRequest = {
      ...bug,
      isCompleted: newIsCompleted,
      status: newStatus,
      updatedAt: new Date().toISOString(),
      resolvedAt: newIsCompleted ? new Date().toISOString() : undefined,
      resolvedByUserName: newIsCompleted ? activeUser.name : undefined,
    };

    try {
      await onSaveBugRequest(updatedBug);
    } catch (err) {
      console.error("Error updating completion status:", err);
    }
  };

  // Admin Change Status / Add Admin Notes
  const handleSaveStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBugStatusItem) return;

    const isDone = statusTarget === "Completed";
    const updatedBug: BugRequest = {
      ...editingBugStatusItem,
      status: statusTarget,
      isCompleted: isDone,
      adminNotes: statusAdminNote.trim() || undefined,
      updatedAt: new Date().toISOString(),
      resolvedAt: isDone ? new Date().toISOString() : editingBugStatusItem.resolvedAt,
      resolvedByUserName: isDone ? activeUser.name : editingBugStatusItem.resolvedByUserName,
    };

    try {
      await onSaveBugRequest(updatedBug);
      setEditingBugStatusItem(null);
      setStatusAdminNote("");
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  // Delete Bug Request
  const handleDeleteBugConfirm = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    setDeletingBugId(id);
    try {
      await onDeleteBugRequest(id);
    } catch (err) {
      console.error("Failed to delete bug request:", err);
    } finally {
      setDeletingBugId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-mono font-bold uppercase tracking-wider">
              <Sparkles size={13} />
              <span>Portal Help & System Feedback</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">About Me & Support Hub</h1>
            <p className="text-xs text-slate-300 max-w-xl font-medium leading-relaxed">
              Find instant answers to common platform questions in FAQs or submit bug reports, system errors, and new feature suggestions directly to the admin team.
            </p>
          </div>

          {/* Sub-Tabs Pill Navigation */}
          <div className="flex items-center bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 shrink-0">
            {filteredSubTabs.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setActiveSubTab(st.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  activeSubTab === st.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                {st.id === "faq" ? <HelpCircle size={15} /> : <Bug size={15} />}
                <span>{st.label}</span>
                {st.id === "bugs" && bugStats.pending > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-slate-950 font-extrabold rounded-full">
                    {bugStats.pending}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: FAQ */}
      {activeSubTab === "faq" && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="bg-white p-4 border border-slate-200/90 rounded-2xl shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search FAQ questions, keywords, or guides..."
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* Admin Add Question Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleOpenFaqModal()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition-all shadow-xs shrink-0 cursor-pointer"
              >
                <Plus size={15} />
                <span>Add FAQ Question</span>
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase mr-1 flex items-center gap-1 shrink-0">
              <Tag size={12} /> Category:
            </span>
            {faqCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedFaqCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all shrink-0 cursor-pointer ${
                  selectedFaqCategory === cat
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ Accordion List */}
          {filteredFaqs.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <HelpCircle size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No FAQ Questions Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {faqSearch || selectedFaqCategory !== "All"
                  ? "No FAQ matched your search criteria. Try resetting filters."
                  : "No FAQ questions have been added yet."}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleOpenFaqModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold font-mono cursor-pointer hover:bg-emerald-700"
                >
                  <Plus size={14} /> Add First FAQ
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqIds[faq.id] ?? true; // Default open
                return (
                  <div
                    key={faq.id}
                    className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden transition-all hover:border-slate-300"
                  >
                    {/* Header Question Bar */}
                    <div
                      onClick={() => toggleFaqExpand(faq.id)}
                      className="p-4 flex items-start justify-between gap-3 cursor-pointer select-none bg-slate-50/40 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60 shrink-0 mt-0.5">
                          <HelpCircle size={16} />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-mono font-bold">
                              {faq.category || "General"}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {faq.question}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Admin Action Buttons */}
                        {isAdmin && (
                          <div
                            className="flex items-center gap-1 mr-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenFaqModal(faq)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                              title="Edit FAQ"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFAQConfirm(faq.id)}
                              disabled={deletingFaqId === faq.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Delete FAQ"
                            >
                              {deletingFaqId === faq.id ? (
                                <Loader2 size={14} className="animate-spin text-rose-600" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        )}

                        <div className="p-1 text-slate-400 rounded-lg">
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                    </div>

                    {/* Answer Expand Area */}
                    {isExpanded && (
                      <div className="p-4 pt-2 border-t border-slate-100 bg-white text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 text-slate-800 space-y-2">
                          <p>{faq.answer}</p>
                        </div>
                        {faq.createdByUserName && (
                          <div className="mt-2 text-[10px] font-mono text-slate-400 text-right">
                            Added by {faq.createdByUserName} • {new Date(faq.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: BUG / ENHANCEMENT */}
      {activeSubTab === "bugs" && (
        <div className="space-y-5">
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 border border-slate-200/90 rounded-2xl shadow-2xs space-y-1">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">Total Requests</div>
              <div className="text-xl font-black text-slate-900">{bugStats.total}</div>
            </div>
            <div className="bg-white p-3.5 border border-amber-200/90 rounded-2xl shadow-2xs space-y-1 bg-amber-50/30">
              <div className="text-[10px] font-mono font-bold text-amber-700 uppercase">Pending</div>
              <div className="text-xl font-black text-amber-900">{bugStats.pending}</div>
            </div>
            <div className="bg-white p-3.5 border border-blue-200/90 rounded-2xl shadow-2xs space-y-1 bg-blue-50/30">
              <div className="text-[10px] font-mono font-bold text-blue-700 uppercase">In Progress</div>
              <div className="text-xl font-black text-blue-900">{bugStats.inProgress}</div>
            </div>
            <div className="bg-white p-3.5 border border-emerald-200/90 rounded-2xl shadow-2xs space-y-1 bg-emerald-50/30">
              <div className="text-[10px] font-mono font-bold text-emerald-700 uppercase">Completed</div>
              <div className="text-xl font-black text-emerald-900">{bugStats.completed}</div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white p-4 border border-slate-200/90 rounded-2xl shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search requests by title, description, or submitter..."
                value={bugSearch}
                onChange={(e) => setBugSearch(e.target.value)}
                className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* Filter selectors */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={bugStatusFilter}
                onChange={(e) => setBugStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700 rounded-xl px-3 py-2 outline-none cursor-pointer"
              >
                <option value="All">Status: All</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed / Resolved</option>
              </select>

              <select
                value={bugTypeFilter}
                onChange={(e) => setBugTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700 rounded-xl px-3 py-2 outline-none cursor-pointer"
              >
                <option value="All">Type: All</option>
                <option value="Bug / Error">Bug / Error</option>
                <option value="Enhancement / New Feature">Enhancement / New Feature</option>
                <option value="Improvement">Improvement</option>
              </select>

              {/* Submit Button for EVERYONE */}
              <button
                type="button"
                onClick={() => setIsBugModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition-all shadow-xs cursor-pointer"
              >
                <Plus size={15} />
                <span>Submit Bug / Feature Request</span>
              </button>
            </div>
          </div>

          {/* Requests List */}
          {filteredBugs.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <Bug size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Requests Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {bugSearch || bugStatusFilter !== "All" || bugTypeFilter !== "All"
                  ? "No requests matched your filter criteria."
                  : "No bug reports or feature requests have been submitted yet. Click below to add one!"}
              </p>
              <button
                type="button"
                onClick={() => setIsBugModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold font-mono cursor-pointer hover:bg-emerald-700"
              >
                <Plus size={14} /> Submit New Request
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBugs.map((bug) => {
                const isOwner = bug.createdByUserId === activeUser.id;
                const canManage = isAdmin || isOwner;

                return (
                  <div
                    key={bug.id}
                    className={`bg-white border rounded-2xl p-5 shadow-2xs space-y-4 transition-all ${
                      bug.isCompleted
                        ? "border-emerald-200/80 bg-emerald-50/10"
                        : bug.status === "In Progress"
                        ? "border-blue-200/80 bg-blue-50/10"
                        : "border-slate-200/90"
                    }`}
                  >
                    {/* Card Top Row */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Interactive Completion Checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleBugCompletion(bug)}
                          disabled={!canManage}
                          className={`mt-0.5 transition-transform cursor-pointer ${
                            canManage ? "hover:scale-110" : "opacity-80 cursor-default"
                          }`}
                          title={
                            canManage
                              ? bug.isCompleted
                                ? "Click to mark as Pending"
                                : "Click to mark as Completed"
                              : "Completion status"
                          }
                        >
                          {bug.isCompleted ? (
                            <CheckSquare size={20} className="text-emerald-600" />
                          ) : (
                            <Square size={20} className="text-slate-300 hover:text-emerald-500" />
                          )}
                        </button>

                        <div className="space-y-1 min-w-0">
                          {/* Badges Row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Type Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                                bug.type === "Bug / Error"
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : bug.type === "Enhancement / New Feature"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}
                            >
                              {bug.type}
                            </span>

                            {/* Priority Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                bug.priority === "Critical"
                                  ? "bg-rose-600 text-white"
                                  : bug.priority === "High"
                                  ? "bg-amber-500 text-slate-950 font-extrabold"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {bug.priority} Priority
                            </span>

                            {/* Status Badge */}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                                bug.isCompleted || bug.status === "Completed"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : bug.status === "In Progress"
                                  ? "bg-blue-100 text-blue-800 border border-blue-300"
                                  : bug.status === "Rejected"
                                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                                  : "bg-amber-100 text-amber-800 border border-amber-300"
                              }`}
                            >
                              {bug.isCompleted || bug.status === "Completed" ? (
                                <>
                                  <CheckCircle2 size={11} /> Completed
                                </>
                              ) : bug.status === "In Progress" ? (
                                <>
                                  <Clock size={11} /> In Progress
                                </>
                              ) : (
                                <>
                                  <AlertCircle size={11} /> Pending
                                </>
                              )}
                            </span>
                          </div>

                          {/* Title */}
                          <h3
                            className={`text-sm font-bold text-slate-900 ${
                              bug.isCompleted ? "line-through text-slate-500" : ""
                            }`}
                          >
                            {bug.title}
                          </h3>
                        </div>
                      </div>

                      {/* Top Action Menu */}
                      <div className="flex items-center gap-1 shrink-0 self-start">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBugStatusItem(bug);
                              setStatusTarget(bug.status);
                              setStatusAdminNote(bug.adminNotes || "");
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
                          >
                            Update Status
                          </button>
                        )}

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleDeleteBugConfirm(bug.id)}
                            disabled={deletingBugId === bug.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Delete Request"
                          >
                            {deletingBugId === bug.id ? (
                              <Loader2 size={14} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Description Text */}
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap pl-8">
                      {bug.description}
                    </p>

                    {/* Screenshot Attachment Card (if present) */}
                    {bug.screenshotUrl && (
                      <div className="pl-8 pt-1">
                        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                          <ImageIcon size={12} /> Screenshot Attachment:
                        </div>
                        <div className="inline-block relative group border border-slate-200 rounded-xl overflow-hidden bg-slate-900 shadow-2xs max-w-sm">
                          <img
                            src={bug.screenshotUrl}
                            alt={bug.screenshotName || "Request Screenshot"}
                            className="max-h-48 object-cover rounded-xl transition-opacity group-hover:opacity-90 cursor-pointer"
                            onClick={() =>
                              setActiveLightboxImage({
                                url: bug.screenshotUrl!,
                                title: bug.title,
                              })
                            }
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveLightboxImage({
                                  url: bug.screenshotUrl!,
                                  title: bug.title,
                                })
                              }
                              className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold font-mono shadow-md pointer-events-auto flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={14} /> View Enlarged
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Admin Notes Section (if added) */}
                    {bug.adminNotes && (
                      <div className="pl-8">
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-[11px] font-mono text-amber-800">
                            <Shield size={13} /> Admin Update / Notes:
                          </div>
                          <p className="text-slate-700">{bug.adminNotes}</p>
                        </div>
                      </div>
                    )}

                    {/* Footer Info */}
                    <div className="pl-8 pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-slate-400 gap-1">
                      <div>
                        Submitted by <strong className="text-slate-700">{bug.createdByUserName}</strong> ({bug.createdByEmail || "Portal User"})
                      </div>
                      <div>
                        {new Date(bug.createdAt).toLocaleDateString()} at {new Date(bug.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT FAQ */}
      {isFaqModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle size={18} className="text-emerald-600" />
                <span>{editingFaq ? "Edit FAQ Question" : "Add New FAQ Question"}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveFAQSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Category Tag <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. General, Orders & Offers, Payment List, User Access..."
                  value={faqCategory}
                  onChange={(e) => setFaqCategory(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Question <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter the question (e.g. How do I map invoices to payment details?)"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Answer <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="Provide detailed answer and instructions..."
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-sans"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFaqModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold font-mono hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFaq}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isSavingFaq ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingFaq ? "Update FAQ" : "Save FAQ"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SUBMIT BUG / ENHANCEMENT REQUEST */}
      {isBugModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Bug size={18} className="text-emerald-600" />
                <span>Submit Bug Report or Feature Request</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsBugModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBugSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Request Type</label>
                  <select
                    value={bugType}
                    onChange={(e) => setBugType(e.target.value as BugType)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                  >
                    <option value="Bug / Error">Bug / Error</option>
                    <option value="Enhancement / New Feature">Enhancement / New Feature</option>
                    <option value="Improvement">Improvement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Priority</label>
                  <select
                    value={bugPriority}
                    onChange={(e) => setBugPriority(e.target.value as BugPriority)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Title / Short Summary <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Indent view billing upload error or add export button..."
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Description / Details <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe what happened, steps to reproduce, or details of the feature requested..."
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-sans"
                  required
                />
              </div>

              {/* Screenshot Upload Option */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Attach Screenshot <span className="text-rose-500">* (Mandatory)</span>
                </label>
                {bugScreenshotUrl ? (
                  <div className="relative bg-emerald-50/50 border border-emerald-300 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={bugScreenshotUrl}
                        alt="Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-slate-200"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold font-mono text-slate-800 truncate">
                          {bugScreenshotName || "Screenshot attached"}
                        </div>
                        <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} /> Image Attached & Ready
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBugScreenshotUrl("");
                        setBugScreenshotName("");
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-rose-200 hover:border-emerald-500 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-rose-50/20 hover:bg-emerald-50/20 group">
                    <Upload size={20} className="text-rose-400 group-hover:text-emerald-600 mb-1" />
                    <span className="text-xs font-bold text-slate-800">Click to upload mandatory screenshot</span>
                    <span className="text-[10px] text-rose-500 font-medium">PNG, JPG, WebP up to 5MB (Required)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotChange}
                      className="hidden"
                      required
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBugModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold font-mono hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBug}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isSavingBug ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Request</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADMIN UPDATE BUG STATUS & NOTES */}
      {editingBugStatusItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-emerald-600" />
                <span>Update Request Status</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingBugStatusItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStatusUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Status</label>
                <select
                  value={statusTarget}
                  onChange={(e) => setStatusTarget(e.target.value as BugStatus)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed / Resolved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Admin Resolution / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add resolution notes or comments for the submitter..."
                  value={statusAdminNote}
                  onChange={(e) => setStatusAdminNote(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBugStatusItem(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold font-mono hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-mono cursor-pointer"
                >
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR SCREENSHOTS */}
      {activeLightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div className="relative max-w-4xl w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold truncate">{activeLightboxImage.title}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={activeLightboxImage.url}
                  download="screenshot.png"
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Download size={14} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setActiveLightboxImage(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-2">
              <img
                src={activeLightboxImage.url}
                alt="Enlarged Screenshot"
                className="max-h-[80vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
