import { User } from "../types";

export interface TemplateVariableGroup {
  id: string;
  name: string;
  description: string;
  forms: string[]; // e.g. ["any", "create_order", "edit_order", "invoice_issuance", "payment_reminder"]
  variables: {
    key: string;
    label: string;
    description: string;
    sampleValue: string;
  }[];
}

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    id: "record_id",
    name: "🔑 Record Database ID",
    description: "Database unique identifier for the record",
    forms: ["any", "create_order", "edit_order", "invoice_issuance", "payment_reminder"],
    variables: [
      { key: "{{recordId}}", label: "Record ID", description: "Database unique ID of the Lead/Order/Invoice", sampleValue: "ord-172839402" },
      { key: "{{id}}", label: "ID Alias", description: "Short alias for database record ID", sampleValue: "ord-172839402" },
    ],
  },
  {
    id: "creator",
    name: "👤 Creator & Logging User Details",
    description: "Information about the logged-in user who created or updated the record/action",
    forms: ["any", "create_order", "edit_order", "invoice_issuance", "payment_reminder"],
    variables: [
      { key: "{{creatorName}}", label: "Creator Name", description: "Full name of the logged-in user who performed the action", sampleValue: "Naveen Verma" },
      { key: "{{creatorPhone}}", label: "Creator Phone", description: "Phone number of the logged-in user", sampleValue: "+91 9876543210" },
      { key: "{{creatorEmail}}", label: "Creator Email", description: "Email address of the logged-in user", sampleValue: "naveen@aromaorganic.in" },
    ],
  },
  {
    id: "hierarchy",
    name: "👥 Assigned User & Reporting Hierarchy",
    description: "Information about the sales representative assigned and their supervisors",
    forms: ["any", "create_order", "edit_order", "invoice_issuance", "payment_reminder"],
    variables: [
      { key: "{{assignedToName}}", label: "Assigned User Name", description: "Name of the assigned Sales Representative", sampleValue: "Mohit Jain" },
      { key: "{{assignedToEmail}}", label: "Assigned User Email", description: "Email of the assigned Sales Representative", sampleValue: "mohit@aromaorganic.in" },
      { key: "{{teamLeadEmail}}", label: "Team Lead Email", description: "Email of the Assigned User's Team Lead", sampleValue: "teamlead@aromaorganic.in" },
      { key: "{{managerEmail}}", label: "Manager Email", description: "Email of the Assigned User's Reporting Manager", sampleValue: "manager@aromaorganic.in" },
    ],
  },
  {
    id: "lead_order",
    name: "📋 Deals, Leads & Orders Form / Event",
    description: "Core sales lead and order details (client, value, items, and commercial terms)",
    forms: ["any", "create_order", "edit_order"],
    variables: [
      { key: "{{clientName}}", label: "Client Contact Person", description: "Client contact person's name", sampleValue: "Saikat Chakraborty" },
      { key: "{{companyName}}", label: "Company Name", description: "Client company name", sampleValue: "Hindustan Coca-Cola Beverages" },
      { key: "{{email}}", label: "Client Email", description: "Primary client email address", sampleValue: "care@aromaorganic.in" },
      { key: "{{phone}}", label: "Client Phone", description: "Primary client phone number", sampleValue: "+91 9123456789" },
      { key: "{{billingAddress}}", label: "Client Billing Address", description: "Client billing address for invoicing", sampleValue: "Plot 42, Commercial Complex, Sector 5, Kolkata 700091" },
      { key: "{{clientBillingAddress}}", label: "Client Billing Address Alias", description: "Alias for client billing address", sampleValue: "Plot 42, Commercial Complex, Sector 5, Kolkata 700091" },
      { key: "{{status}}", label: "Pipeline Status", description: "Stage / Pipeline Status (e.g. New, Contacted, Closed Won)", sampleValue: "Closed Won" },
      { key: "{{totalValue}}", label: "Total Value ($)", description: "Total deal amount or order total", sampleValue: "$225,000" },
      { key: "{{itemsList}}", label: "Product Items Summary", description: "Formatted table or bulleted list of product line items", sampleValue: "1. Hydrogen Peroxide - 1,500 units @ $150" },
      { key: "{{itemsTable}}", label: "HTML Products Table", description: "A beautifully styled HTML table with Product, HSN Code, Quantity, Packing, Price, Taxes & Amount columns", sampleValue: "<table>...</table>" },
      { key: "{{payment}}", label: "Payment Terms", description: "Agreed payment terms", sampleValue: "100% advance against PI" },
      { key: "{{paymentTermsOffer}}", label: "Payment Terms (Offer)", description: "Payment terms proposed in the offer/quotation stage", sampleValue: "Within 30 days from date of Invoice" },
      { key: "{{paymentCreditPeriod}}", label: "Payment Credit Period", description: "Credit period in number of days", sampleValue: "30 Days" },
      { key: "{{delivery}}", label: "Delivery Terms", description: "Agreed delivery terms", sampleValue: "Ex-Works Factory" },
      { key: "{{otherTerms}}", label: "Other Terms", description: "Special conditions or clauses", sampleValue: "Inspection prior to loading" },
      { key: "{{notes}}", label: "Remarks & Notes", description: "Internal notes or remarks", sampleValue: "Urgent dispatch requested" },
    ],
  },
  {
    id: "dispatch_closed_won",
    name: "🚚 Dispatch & Indent Form / Event",
    description: "Logistics, PO, freight, transporter, and warehouse details",
    forms: ["any", "create_order", "edit_order"],
    variables: [
      { key: "{{customerPoNumber}}", label: "Customer PO Number", description: "Customer Purchase Order number", sampleValue: "PO-2026-8891" },
      { key: "{{poDate}}", label: "PO Date", description: "Date of Purchase Order", sampleValue: "2026-07-30" },
      { key: "{{freightTerm}}", label: "Freight Term", description: "Freight Payment Term (e.g., Paid, To Pay)", sampleValue: "Paid by AOL" },
      { key: "{{freightChargedInBill}}", label: "Freight Charged In Bill", description: "Freight amount billed to customer ($)", sampleValue: "$500" },
      { key: "{{freightCostToAol}}", label: "Freight Cost To AOL", description: "Actual freight expense incurred by AOL ($)", sampleValue: "$450" },
      { key: "{{cartageLabourCharges}}", label: "Cartage / Labour Charges", description: "Handling & labor charges ($)", sampleValue: "$150" },
      { key: "{{transporterName}}", label: "Transporter Name", description: "Logistics carrier name", sampleValue: "VRL Logistics" },
      { key: "{{deliveryTerm}}", label: "Delivery Term", description: "Dispatch delivery term", sampleValue: "Door Delivery" },
      { key: "{{destinationAddress}}", label: "Destination Address", description: "Factory or warehouse shipping address", sampleValue: "Plot 42, Raninagar Industrial Estate, WB" },
      { key: "{{dispatchDate}}", label: "Dispatch Date", description: "Target or actual date of dispatch", sampleValue: "2026-08-05" },
      { key: "{{dispatchLocation}}", label: "Dispatch Location", description: "Source factory/terminal dispatch point", sampleValue: "Kolkata Depot" },
      { key: "{{warehouseManagedBy}}", label: "Warehouse Managed By", description: "Warehouse location or manager", sampleValue: "Central Chemical Hub" },
    ],
  },
  {
    id: "invoice_issuance",
    name: "🧾 Invoice Issuance Form / Event",
    description: "Billing details and generated invoice links",
    forms: ["any", "invoice_issuance", "edit_order"],
    variables: [
      { key: "{{invoiceNumber}}", label: "Invoice Number", description: "Tax / Commercial Invoice Number", sampleValue: "INV-2026-0412" },
      { key: "{{invoiceFileLink}}", label: "Invoice Drive Link", description: "URL / Share link to invoice PDF file in Drive", sampleValue: "https://drive.google.com/file/d/sample/view" },
    ],
  },
  {
    id: "payment_collection",
    name: "💰 Payment & Collection Form / Event",
    description: "Payment tracking, balances, and due date reminders",
    forms: ["any", "payment_reminder", "invoice_issuance", "create_order", "edit_order"],
    variables: [
      { key: "{{amountReceived}}", label: "Amount Received ($)", description: "Total payments collected to date", sampleValue: "$150,000" },
      { key: "{{pendingAmount}}", label: "Pending Amount ($)", description: "Outstanding unpaid balance", sampleValue: "$75,000" },
      { key: "{{paymentStatus}}", label: "Payment Status", description: "Status (Unpaid, Partial paid, Fully paid)", sampleValue: "Partial paid" },
      { key: "{{dueDate}}", label: "Payment Due Date", description: "Scheduled payment due date", sampleValue: "2026-08-15" },
      { key: "{{bankDetailsTable}}", label: "HTML Bank Details Table", description: "A beautifully formatted HTML table containing details of the selected Payment Bank (Bank Name, Account No, IFSC, etc.)", sampleValue: "<table>...</table>" },
    ],
  },
  {
    id: "consolidated_payment_reminder",
    name: "📊 Consolidated Payment Reminder (Party Wise)",
    description: "Consolidated outstanding payment details across all pending invoices for a single party",
    forms: ["any", "payment_reminder_consolidated"],
    variables: [
      { key: "{{companyName}}", label: "Party / Company Name", description: "Consolidated client company name", sampleValue: "Hindustan Coca-Cola Beverages" },
      { key: "{{clientName}}", label: "Client Contact Person", description: "Primary contact person name", sampleValue: "Saikat Chakraborty" },
      { key: "{{email}}", label: "Client Email", description: "Primary email address for party", sampleValue: "accounts@company.com" },
      { key: "{{phone}}", label: "Client Phone", description: "Primary phone number for party", sampleValue: "+91 9876543210" },
      { key: "{{totalPendingAmount}}", label: "Total Pending Amount", description: "Consolidated sum of all pending amounts for this party", sampleValue: "₹3,45,000" },
      { key: "{{invoiceCount}}", label: "Total Pending Invoices", description: "Count of pending invoices for this party", sampleValue: "4" },
      { key: "{{invoiceTable}}", label: "Invoice Wise Payment Table", description: "Formatted HTML table containing invoice number, PO, due date, invoice amount & pending amount for all unpaid invoices", sampleValue: "<table border='1'>...</table>" },
      { key: "{{todayDate}}", label: "Today's Date", description: "Current date of sending the email", sampleValue: "2026-08-05" },
    ],
  },
];

export interface ReplaceVariablesContext {
  recordId?: string;
  clientName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  clientBillingAddress?: string;
  status?: string;
  totalValue?: string | number;
  itemsList?: string;
  payment?: string;
  paymentTermsOffer?: string;
  paymentCreditPeriod?: string;
  delivery?: string;
  otherTerms?: string;
  notes?: string;
  invoiceNumber?: string;
  invoiceFileLink?: string;
  customerPoNumber?: string;
  poDate?: string;
  freightTerm?: string;
  freightChargedInBill?: string | number;
  freightCostToAol?: string | number;
  cartageLabourCharges?: string | number;
  transporterName?: string;
  deliveryTerm?: string;
  destinationAddress?: string;
  dispatchDate?: string;
  dispatchLocation?: string;
  warehouseManagedBy?: string;
  amountReceived?: string | number;
  pendingAmount?: string | number;
  paymentStatus?: string;
  dueDate?: string;
  
  // Consolidated payment fields
  totalPendingAmount?: string | number;
  invoiceCount?: string | number;
  invoiceTable?: string;
  todayDate?: string;
  
  // Creator info
  creatorName?: string;
  creatorPhone?: string;
  creatorEmail?: string;

  // Assigned info
  assignedToName?: string;
  assignedToEmail?: string;
  teamLeadEmail?: string;
  managerEmail?: string;
  currentUserEmail?: string;
  
  // HTML Tables
  itemsTable?: string;
  bankDetailsTable?: string;
}

/**
 * Replace template variables in any text string
 */
export function replaceTemplateVars(text: string, ctx: ReplaceVariablesContext): string {
  if (!text) return "";

  const recordIdVal = ctx.recordId || "";
  const totalValFormatted = typeof ctx.totalValue === "number" ? `$${ctx.totalValue.toLocaleString()}` : (ctx.totalValue || "");
  const amountRecFormatted = typeof ctx.amountReceived === "number" ? `$${ctx.amountReceived.toLocaleString()}` : (ctx.amountReceived || "");
  const pendingAmtFormatted = typeof ctx.pendingAmount === "number" ? `$${ctx.pendingAmount.toLocaleString()}` : (ctx.pendingAmount || "");

  return text
    // Record Database ID
    .replace(/\{\{recordId\}\}|\{recordId\}/gi, recordIdVal)
    .replace(/\{\{id\}\}|\{id\}/gi, recordIdVal)

    // Creator details
    .replace(/\{\{creatorName\}\}|\{creatorName\}/gi, ctx.creatorName || "")
    .replace(/\{\{creatorPhone\}\}|\{creatorPhone\}/gi, ctx.creatorPhone || "")
    .replace(/\{\{creatorEmail\}\}|\{creatorEmail\}/gi, ctx.creatorEmail || "")

    // Assigned details & Hierarchy
    .replace(/\{\{assignedToName\}\}|\{assignedToName\}/gi, ctx.assignedToName || "")
    .replace(/\{\{assignedToEmail\}\}|\{assignedToEmail\}/gi, ctx.assignedToEmail || "")
    .replace(/\{\{teamLeadEmail\}\}|\{teamLeadEmail\}/gi, ctx.teamLeadEmail || "")
    .replace(/\{\{managerEmail\}\}|\{managerEmail\}/gi, ctx.managerEmail || "")
    .replace(/\{\{currentUserEmail\}\}|\{currentUserEmail\}/gi, ctx.currentUserEmail || ctx.creatorEmail || "")

    // Lead & Order details
    .replace(/\{\{clientName\}\}|\{clientName\}/gi, ctx.clientName || "")
    .replace(/\{\{companyName\}\}|\{companyName\}/gi, ctx.companyName || "")
    .replace(/\{\{email\}\}|\{email\}/gi, ctx.email || "")
    .replace(/\{\{phone\}\}|\{phone\}/gi, ctx.phone || "")
    .replace(/\{\{billingAddress\}\}|\{billingAddress\}/gi, ctx.billingAddress || ctx.clientBillingAddress || "")
    .replace(/\{\{clientBillingAddress\}\}|\{clientBillingAddress\}/gi, ctx.clientBillingAddress || ctx.billingAddress || "")
    .replace(/\{\{status\}\}|\{status\}/gi, ctx.status || "")
    .replace(/\{\{totalValue\}\}|\{totalValue\}/gi, totalValFormatted)
    .replace(/\{\{itemsList\}\}|\{itemsList\}/gi, ctx.itemsList || "")
    .replace(/\{\{itemsTable\}\}|\{itemsTable\}/gi, ctx.itemsTable || "")
    .replace(/\{\{bankDetailsTable\}\}|\{bankDetailsTable\}/gi, ctx.bankDetailsTable || "")
    .replace(/\{\{payment\}\}|\{payment\}/gi, ctx.payment || "")
    .replace(/\{\{paymentTermsOffer\}\}|\{paymentTermsOffer\}/gi, ctx.paymentTermsOffer || "")
    .replace(/\{\{paymentCreditPeriod\}\}|\{paymentCreditPeriod\}/gi, ctx.paymentCreditPeriod || "")
    .replace(/\{\{delivery\}\}|\{delivery\}/gi, ctx.delivery || "")
    .replace(/\{\{otherTerms\}\}|\{otherTerms\}/gi, ctx.otherTerms || "")
    .replace(/\{\{notes\}\}|\{notes\}/gi, ctx.notes || "")

    // Invoice
    .replace(/\{\{invoiceNumber\}\}|\{invoiceNumber\}/gi, ctx.invoiceNumber || "")
    .replace(/\{\{invoiceFileLink\}\}|\{invoiceFileLink\}/gi, ctx.invoiceFileLink || "")

    // Dispatch & Closed Won
    .replace(/\{\{customerPoNumber\}\}|\{customerPoNumber\}/gi, ctx.customerPoNumber || "")
    .replace(/\{\{poDate\}\}|\{poDate\}/gi, ctx.poDate || "")
    .replace(/\{\{freightTerm\}\}|\{freightTerm\}/gi, ctx.freightTerm || "")
    .replace(/\{\{freightChargedInBill\}\}|\{freightChargedInBill\}/gi, String(ctx.freightChargedInBill || ""))
    .replace(/\{\{freightCostToAol\}\}|\{freightCostToAol\}/gi, String(ctx.freightCostToAol || ""))
    .replace(/\{\{cartageLabourCharges\}\}|\{cartageLabourCharges\}/gi, String(ctx.cartageLabourCharges || ""))
    .replace(/\{\{transporterName\}\}|\{transporterName\}/gi, ctx.transporterName || "")
    .replace(/\{\{deliveryTerm\}\}|\{deliveryTerm\}/gi, ctx.deliveryTerm || "")
    .replace(/\{\{destinationAddress\}\}|\{destinationAddress\}/gi, ctx.destinationAddress || "")
    .replace(/\{\{dispatchDate\}\}|\{dispatchDate\}/gi, ctx.dispatchDate || "")
    .replace(/\{\{dispatchLocation\}\}|\{dispatchLocation\}/gi, ctx.dispatchLocation || "")
    .replace(/\{\{warehouseManagedBy\}\}|\{warehouseManagedBy\}/gi, ctx.warehouseManagedBy || "")

    // Payment collection
    .replace(/\{\{amountReceived\}\}|\{amountReceived\}/gi, amountRecFormatted)
    .replace(/\{\{pendingAmount\}\}|\{pendingAmount\}/gi, pendingAmtFormatted)
    .replace(/\{\{paymentStatus\}\}|\{paymentStatus\}/gi, ctx.paymentStatus || "")
    .replace(/\{\{dueDate\}\}|\{dueDate\}/gi, ctx.dueDate || "")

    // Consolidated payment reminder
    .replace(/\{\{totalPendingAmount\}\}|\{totalPendingAmount\}/gi, typeof ctx.totalPendingAmount === "number" ? `₹${ctx.totalPendingAmount.toLocaleString()}` : (ctx.totalPendingAmount || ""))
    .replace(/\{\{invoiceCount\}\}|\{invoiceCount\}/gi, String(ctx.invoiceCount || ""))
    .replace(/\{\{invoiceTable\}\}|\{invoiceTable\}/gi, ctx.invoiceTable || "")
    .replace(/\{\{todayDate\}\}|\{todayDate\}/gi, ctx.todayDate || new Date().toISOString().split("T")[0]);
}

/**
 * Resolve full user info and hierarchy for replacements
 */
export function resolveUserHierarchyInfo(creatorUserId: string, assignedToUserId: string, users: User[]) {
  const creatorUser = users.find(u => u.id === creatorUserId);
  const creatorName = creatorUser?.name || "";
  const creatorPhone = creatorUser?.phone || "";
  const creatorEmail = creatorUser?.email || "";

  const assignedUser = users.find(u => u.id === assignedToUserId);
  const assignedToName = assignedUser?.name || "";
  const assignedToEmail = assignedUser?.email || "";

  let teamLeadEmail = "";
  let managerEmail = "";

  if (assignedUser) {
    let current = assignedUser;
    const visited = new Set<string>();
    while (current && current.reportsTo && !visited.has(current.id)) {
      visited.add(current.id);
      const supervisor = users.find(u => u.id === current.reportsTo);
      if (!supervisor) break;

      if (supervisor.role === "TeamLead" as any) {
        if (!teamLeadEmail) teamLeadEmail = supervisor.email;
      } else if (
        supervisor.role === "Manager" as any ||
        supervisor.role === "SeniorManager" as any ||
        supervisor.role === "Admin" as any
      ) {
        if (!managerEmail) managerEmail = supervisor.email;
      }

      current = supervisor;
    }
  }

  return {
    creatorName,
    creatorPhone,
    creatorEmail,
    assignedToName,
    assignedToEmail,
    teamLeadEmail,
    managerEmail,
  };
}
