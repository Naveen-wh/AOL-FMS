import { User, WarehouseManagedBy } from "../types";

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
      { key: "{{assignedToPhone}}", label: "Assign To Sales Person Phone Number", description: "Direct mobile/phone number of the assigned Sales Person / Representative", sampleValue: "+91 9123456789" },
      { key: "{{assignedSalesPersonPhone}}", label: "Assigned Sales Person Phone (Alias)", description: "Alias for assigned sales person phone number", sampleValue: "+91 9123456789" },
      { key: "{{salesPersonPhone}}", label: "Sales Person Phone (Alias)", description: "Direct alias for sales person phone number", sampleValue: "+91 9123456789" },
      { key: "{{teamLeadEmail}}", label: "Team Lead Email", description: "Email of the Assigned User's Team Lead", sampleValue: "teamlead@aromaorganic.in" },
      { key: "{{managerEmail}}", label: "Manager Email", description: "Email of the Assigned User's Reporting Manager", sampleValue: "manager@aromaorganic.in" },
    ],
  },
  {
    id: "warehouse_management",
    name: "🏭 Warehouse Manager & Contacts",
    description: "Warehouse manager person email ID, phone number, and fulfillment warehouse details",
    forms: ["any", "create_order", "edit_order", "invoice_issuance"],
    variables: [
      { key: "{{warehouseManagedBy}}", label: "Warehouse Managed By / Location", description: "Warehouse location name or title", sampleValue: "Central Bhiwandi Warehouse" },
      { key: "{{warehouseManager}}", label: "Warehouse Manager Name", description: "Full name of the person managing the warehouse", sampleValue: "Vikram Singh" },
      { key: "{{warehouseManagedByEmail}}", label: "Warehouse Managed By Email ID", description: "Contact email ID of the person managing the warehouse", sampleValue: "warehouse@aromaorganic.in" },
      { key: "{{warehouseManagerEmail}}", label: "Warehouse Manager Email (Alias)", description: "Alias for warehouse manager email ID", sampleValue: "warehouse@aromaorganic.in" },
      { key: "{{warehouseManagedByPhone}}", label: "Warehouse Managed By Phone Number", description: "Direct phone/mobile number of the person managing the warehouse", sampleValue: "+91 9811223344" },
      { key: "{{warehouseManagerPhone}}", label: "Warehouse Manager Phone (Alias)", description: "Alias for warehouse manager phone number", sampleValue: "+91 9811223344" },
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
      { key: "{{assignedToPhone}}", label: "Assign To Sales Person Phone Number", description: "Direct phone number of the assigned Sales Person", sampleValue: "+91 9123456789" },
      { key: "{{salesPersonPhone}}", label: "Sales Person Phone (Alias)", description: "Direct alias for sales person phone number", sampleValue: "+91 9123456789" },
      { key: "{{billingAddress}}", label: "Client Billing Address", description: "Client billing address for invoicing", sampleValue: "Plot 42, Commercial Complex, Sector 5, Kolkata 700091" },
      { key: "{{billingGstin}}", label: "Billing GSTIN", description: "Billing GST Identification Number", sampleValue: "27AAAAA0000A1Z5" },
      { key: "{{clientBillingAddress}}", label: "Client Billing Address Alias", description: "Alias for client billing address", sampleValue: "Plot 42, Commercial Complex, Sector 5, Kolkata 700091" },
      { key: "{{status}}", label: "Pipeline Status", description: "Stage / Pipeline Status (e.g. New, Contacted, Closed Won)", sampleValue: "Closed Won" },
      { key: "{{grandTotalOrderAmount}}", label: "Grand Total Order Amount (₹)", description: "Grand total order amount (totalProductCost + totalGstAmount + freightChargedInBill)", sampleValue: "₹2,25,000" },
      { key: "{{totalProductCost}}", label: "Total Product Cost (₹)", description: "Total product rate*qty without GST", sampleValue: "₹1,90,000" },
      { key: "{{totalGstAmount}}", label: "Total GST Amount (₹)", description: "Total GST amount across items and freight", sampleValue: "₹35,000" },
      { key: "{{freightChargedInBill}}", label: "Freight Charged in Bill (₹)", description: "Freight amount charged in bill", sampleValue: "₹500" },
      { key: "{{totalValue}}", label: "Total Value / Grand Total (Alias)", description: "Grand total order amount", sampleValue: "₹2,25,000" },
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
    forms: ["any", "create_order", "edit_order", "invoice_issuance"],
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
      { key: "{{gstin}}", label: "GSTIN", description: "Customer GST Identification Number", sampleValue: "27AAAAA0000A1Z5" },
      { key: "{{dispatchDate}}", label: "Dispatch Date", description: "Target or actual date of dispatch", sampleValue: "2026-08-05" },
      { key: "{{dispatchLocation}}", label: "Dispatch Location", description: "Source factory/terminal dispatch point", sampleValue: "Kolkata Depot" },
      { key: "{{warehouseManagedBy}}", label: "Warehouse Managed By / Location", description: "Warehouse location name or title", sampleValue: "Central Chemical Hub" },
      { key: "{{warehouseManager}}", label: "Warehouse Manager Name", description: "Full name of the person managing the warehouse", sampleValue: "Vikram Singh" },
      { key: "{{warehouseManagedByEmail}}", label: "Warehouse Managed By Email ID", description: "Contact email ID of the person managing the warehouse", sampleValue: "warehouse@aromaorganic.in" },
      { key: "{{warehouseManagerEmail}}", label: "Warehouse Manager Email (Alias)", description: "Alias for warehouse manager email ID", sampleValue: "warehouse@aromaorganic.in" },
      { key: "{{warehouseManagedByPhone}}", label: "Warehouse Managed By Phone Number", description: "Direct phone/mobile number of the person managing the warehouse", sampleValue: "+91 9811223344" },
      { key: "{{warehouseManagerPhone}}", label: "Warehouse Manager Phone (Alias)", description: "Alias for warehouse manager phone number", sampleValue: "+91 9811223344" },
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
  billingGstin?: string;
  clientBillingAddress?: string;
  status?: string;
  grandTotalOrderAmount?: string | number;
  totalProductCost?: string | number;
  totalGstAmount?: string | number;
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
  gstin?: string;
  dispatchDate?: string;
  dispatchLocation?: string;

  // Warehouse Details & Manager Contacts
  warehouseManagedBy?: string;
  warehouseManager?: string;
  warehouseManagedByName?: string;
  warehouseManagedByEmail?: string;
  warehouseManagerEmail?: string;
  warehouseEmail?: string;
  warehouseManagedByPhone?: string;
  warehouseManagerPhone?: string;
  warehousePhone?: string;

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

  // Assigned info & Sales Person Contacts
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToPhone?: string;
  assignedSalesPersonPhone?: string;
  salesPersonPhone?: string;
  teamLeadEmail?: string;
  managerEmail?: string;
  currentUserEmail?: string;
  
  // HTML Tables
  itemsTable?: string;
  bankDetailsTable?: string;
}

/**
 * Generate rich sample context data for live template preview
 */
export function getSampleTemplateContext(assignedForm?: string): ReplaceVariablesContext {
  return {
    recordId: "ORD-2026-94812",
    creatorName: "Naveen Verma",
    creatorPhone: "+91 9876543210",
    creatorEmail: "naveen@chsurya.in",
    assignedToName: "Mohit Jain",
    assignedToEmail: "mohit@aromaorganic.in",
    assignedToPhone: "+91 9123456789",
    assignedSalesPersonPhone: "+91 9123456789",
    salesPersonPhone: "+91 9123456789",
    teamLeadEmail: "lead@aromaorganic.in",
    managerEmail: "manager@aromaorganic.in",
    currentUserEmail: "naveen@chsurya.in",
    clientName: "Demo Contact Person",
    companyName: "Demo Company Pvt Ltd",
    email: "demo@company.com",
    phone: "+91 9123456789",
    billingAddress: "E-211, 212 A, Tower 2, Seawoods Grand Central, Sector 40, Navi Mumbai 400706",
    billingGstin: "27AAAAA0000A1Z5",
    clientBillingAddress: "E-211, 212 A, Tower 2, Seawoods Grand Central, Sector 40, Navi Mumbai 400706",
    status: "Closed Won",
    totalValue: 118000,
    itemsList: "Product 1: ZINC STEARATE ZS- P: Qty 100 @ 1000 = ₹1,18,000 (Incl. 18% GST)",
    itemsTable: `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #cbd5e1; margin-top: 10px;">
        <thead style="background-color: #f8fafc; color: #334155;">
          <tr>
            <th style="border: 1px solid #cbd5e1; text-align: left; padding: 8px;">Product</th>
            <th style="border: 1px solid #cbd5e1; text-align: center; padding: 8px;">HSN</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Qty</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Rate (₹)</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Taxable (₹)</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Tax</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">ZINC STEARATE ZS- P</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">2915.70</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">100 Bags</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">1,000</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">1,00,000</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">18% GST</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-weight: bold;">1,18,000</td>
          </tr>
        </tbody>
      </table>
    `,
    payment: "100% advance against PI",
    paymentTermsOffer: "Within 30 days from date of Invoice",
    paymentCreditPeriod: "30 Days",
    delivery: "Door Delivery",
    otherTerms: "Standard quality inspection applicable.",
    notes: "Urgent dispatch requested by buyer.",
    customerPoNumber: "PO-2026-8891",
    poDate: "2026-08-15",
    freightTerm: "Paid by AOL",
    freightChargedInBill: "Included",
    freightCostToAol: "₹4,500",
    cartageLabourCharges: "₹1,500",
    transporterName: "VRL Logistics",
    deliveryTerm: "Door Delivery",
    destinationAddress: "E-211, 212 A, Tower 2, Seawoods Grand Central, Sector 40, Navi Mumbai 400706",
    gstin: "27AAAAA0000A1Z5",
    dispatchDate: "2026-08-20",
    dispatchLocation: "Kolkata Depot",
    warehouseManagedBy: "Central Chemical Hub",
    warehouseManager: "Vikram Singh",
    warehouseManagedByName: "Vikram Singh",
    warehouseManagedByEmail: "warehouse@aromaorganic.in",
    warehouseManagerEmail: "warehouse@aromaorganic.in",
    warehouseEmail: "warehouse@aromaorganic.in",
    warehouseManagedByPhone: "+91 9811223344",
    warehouseManagerPhone: "+91 9811223344",
    warehousePhone: "+91 9811223344",
    invoiceNumber: "INV-2026-0412",
    invoiceFileLink: "https://drive.google.com/file/d/sample-invoice/view",
    amountReceived: 50000,
    pendingAmount: 68000,
    paymentStatus: "Partial Paid",
    dueDate: "2026-09-15",
    totalPendingAmount: 245000,
    invoiceCount: 2,
    invoiceTable: `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #cbd5e1; margin-top: 10px;">
        <thead style="background-color: #f8fafc; color: #334155;">
          <tr>
            <th style="border: 1px solid #cbd5e1; text-align: left; padding: 8px;">Invoice #</th>
            <th style="border: 1px solid #cbd5e1; text-align: left; padding: 8px;">PO #</th>
            <th style="border: 1px solid #cbd5e1; text-align: center; padding: 8px;">Due Date</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Inv Amount (₹)</th>
            <th style="border: 1px solid #cbd5e1; text-align: right; padding: 8px;">Pending (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">INV-2026-0301</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;">PO-8812</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #dc2626; font-weight: bold;">2026-08-01 (Overdue)</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">1,27,000</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">1,27,000</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">INV-2026-0412</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;">PO-8891</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">2026-09-15</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">1,18,000</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-weight: bold;">1,18,000</td>
          </tr>
        </tbody>
      </table>
    `,
    todayDate: "2026-09-01",
    bankDetailsTable: `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #cbd5e1; background-color: #f8fafc; margin-top: 10px;">
        <tr><td style="padding: 6px; font-weight: bold; width: 35%;">Bank Name:</td><td style="padding: 6px;">HDFC Bank Ltd</td></tr>
        <tr><td style="padding: 6px; font-weight: bold;">Account Name:</td><td style="padding: 6px;">Aroma Organics Limited</td></tr>
        <tr><td style="padding: 6px; font-weight: bold;">Account Number:</td><td style="padding: 6px; font-family: monospace;">50200012345678</td></tr>
        <tr><td style="padding: 6px; font-weight: bold;">IFSC Code:</td><td style="padding: 6px; font-family: monospace;">HDFC0000123</td></tr>
        <tr><td style="padding: 6px; font-weight: bold;">Branch:</td><td style="padding: 6px;">Seawoods Grand Central, Navi Mumbai</td></tr>
      </table>
    `,
  };
}

/**
 * Replace template variables in any text string
 */
export function replaceTemplateVars(text: string, ctx: ReplaceVariablesContext): string {
  if (!text) return "";

  const recordIdVal = ctx.recordId || "";
  const grandTotalValFormatted = typeof ctx.grandTotalOrderAmount === "number"
    ? `₹${ctx.grandTotalOrderAmount.toLocaleString('en-IN')}`
    : (ctx.grandTotalOrderAmount || (typeof ctx.totalValue === "number" ? `₹${ctx.totalValue.toLocaleString('en-IN')}` : (ctx.totalValue || "")));
  const totalProductCostFormatted = typeof ctx.totalProductCost === "number"
    ? `₹${ctx.totalProductCost.toLocaleString('en-IN')}`
    : (ctx.totalProductCost || "");
  const totalGstAmountFormatted = typeof ctx.totalGstAmount === "number"
    ? `₹${ctx.totalGstAmount.toLocaleString('en-IN')}`
    : (ctx.totalGstAmount || "");
  const freightChargedFormatted = typeof ctx.freightChargedInBill === "number"
    ? `₹${ctx.freightChargedInBill.toLocaleString('en-IN')}`
    : (ctx.freightChargedInBill || "");
  const totalValFormatted = grandTotalValFormatted;
  const amountRecFormatted = typeof ctx.amountReceived === "number" ? `₹${ctx.amountReceived.toLocaleString('en-IN')}` : (ctx.amountReceived || "");
  const pendingAmtFormatted = typeof ctx.pendingAmount === "number" ? `₹${ctx.pendingAmount.toLocaleString('en-IN')}` : (ctx.pendingAmount || "");

  const salesPhone = ctx.assignedToPhone || ctx.assignedSalesPersonPhone || ctx.salesPersonPhone || "";
  const whMgrEmail = ctx.warehouseManagedByEmail || ctx.warehouseManagerEmail || ctx.warehouseEmail || "";
  const whMgrPhone = ctx.warehouseManagedByPhone || ctx.warehouseManagerPhone || ctx.warehousePhone || "";
  const whManager = ctx.warehouseManager || ctx.warehouseManagedByName || ctx.warehouseManagedBy || "";

  return text
    // Record Database ID
    .replace(/\{\{recordId\}\}|\{recordId\}/gi, recordIdVal)
    .replace(/\{\{id\}\}|\{id\}/gi, recordIdVal)

    // Creator details
    .replace(/\{\{creatorName\}\}|\{creatorName\}/gi, ctx.creatorName || "")
    .replace(/\{\{creatorPhone\}\}|\{creatorPhone\}/gi, ctx.creatorPhone || "")
    .replace(/\{\{creatorEmail\}\}|\{creatorEmail\}/gi, ctx.creatorEmail || "")

    // Assigned details & Hierarchy & Sales Person
    .replace(/\{\{assignedToName\}\}|\{assignedToName\}/gi, ctx.assignedToName || "")
    .replace(/\{\{assignedToEmail\}\}|\{assignedToEmail\}/gi, ctx.assignedToEmail || "")
    .replace(/\{\{assignedToPhone\}\}|\{assignedToPhone\}/gi, salesPhone)
    .replace(/\{\{assignedSalesPersonPhone\}\}|\{assignedSalesPersonPhone\}/gi, salesPhone)
    .replace(/\{\{salesPersonPhone\}\}|\{salesPersonPhone\}/gi, salesPhone)
    .replace(/\{\{salesPersonMobile\}\}|\{salesPersonMobile\}/gi, salesPhone)
    .replace(/\{\{assignedToMobile\}\}|\{assignedToMobile\}/gi, salesPhone)
    .replace(/\{\{teamLeadEmail\}\}|\{teamLeadEmail\}/gi, ctx.teamLeadEmail || "")
    .replace(/\{\{managerEmail\}\}|\{managerEmail\}/gi, ctx.managerEmail || "")
    .replace(/\{\{currentUserEmail\}\}|\{currentUserEmail\}/gi, ctx.currentUserEmail || ctx.creatorEmail || "")

    // Lead & Order details
    .replace(/\{\{clientName\}\}|\{clientName\}/gi, ctx.clientName || "")
    .replace(/\{\{companyName\}\}|\{companyName\}/gi, ctx.companyName || "")
    .replace(/\{\{email\}\}|\{email\}/gi, ctx.email || "")
    .replace(/\{\{phone\}\}|\{phone\}/gi, ctx.phone || "")
    .replace(/\{\{billingAddress\}\}|\{billingAddress\}/gi, ctx.billingAddress || ctx.clientBillingAddress || "")
    .replace(/\{\{billingGstin\}\}|\{billingGstin\}/gi, ctx.billingGstin || "")
    .replace(/\{\{clientBillingAddress\}\}|\{clientBillingAddress\}/gi, ctx.clientBillingAddress || ctx.billingAddress || "")
    .replace(/\{\{status\}\}|\{status\}/gi, ctx.status || "")
    .replace(/\{\{grandTotalOrderAmount\}\}|\{grandTotalOrderAmount\}/gi, grandTotalValFormatted)
    .replace(/\{\{totalProductCost\}\}|\{totalProductCost\}/gi, totalProductCostFormatted)
    .replace(/\{\{totalGstAmount\}\}|\{totalGstAmount\}/gi, totalGstAmountFormatted)
    .replace(/\{\{freightChargedInBill\}\}|\{freightChargedInBill\}/gi, freightChargedFormatted)
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

    // Dispatch & Closed Won & Warehouse Details
    .replace(/\{\{customerPoNumber\}\}|\{customerPoNumber\}/gi, ctx.customerPoNumber || "")
    .replace(/\{\{poDate\}\}|\{poDate\}/gi, ctx.poDate || "")
    .replace(/\{\{freightTerm\}\}|\{freightTerm\}/gi, ctx.freightTerm || "")
    .replace(/\{\{freightChargedInBill\}\}|\{freightChargedInBill\}/gi, String(ctx.freightChargedInBill || ""))
    .replace(/\{\{freightCostToAol\}\}|\{freightCostToAol\}/gi, String(ctx.freightCostToAol || ""))
    .replace(/\{\{cartageLabourCharges\}\}|\{cartageLabourCharges\}/gi, String(ctx.cartageLabourCharges || ""))
    .replace(/\{\{transporterName\}\}|\{transporterName\}/gi, ctx.transporterName || "")
    .replace(/\{\{deliveryTerm\}\}|\{deliveryTerm\}/gi, ctx.deliveryTerm || "")
    .replace(/\{\{destinationAddress\}\}|\{destinationAddress\}/gi, ctx.destinationAddress || "")
    .replace(/\{\{gstin\}\}|\{gstin\}/gi, ctx.gstin || "")
    .replace(/\{\{dispatchDate\}\}|\{dispatchDate\}/gi, ctx.dispatchDate || "")
    .replace(/\{\{dispatchLocation\}\}|\{dispatchLocation\}/gi, ctx.dispatchLocation || "")
    .replace(/\{\{warehouseManagedBy\}\}|\{warehouseManagedBy\}/gi, ctx.warehouseManagedBy || "")
    .replace(/\{\{warehouseManager\}\}|\{warehouseManager\}/gi, whManager)
    .replace(/\{\{warehouseManagedByName\}\}|\{warehouseManagedByName\}/gi, whManager)
    .replace(/\{\{warehouseManagedByEmail\}\}|\{warehouseManagedByEmail\}/gi, whMgrEmail)
    .replace(/\{\{warehouseManagerEmail\}\}|\{warehouseManagerEmail\}/gi, whMgrEmail)
    .replace(/\{\{warehouseEmail\}\}|\{warehouseEmail\}/gi, whMgrEmail)
    .replace(/\{\{warehouseManagedByPhone\}\}|\{warehouseManagedByPhone\}/gi, whMgrPhone)
    .replace(/\{\{warehouseManagerPhone\}\}|\{warehouseManagerPhone\}/gi, whMgrPhone)
    .replace(/\{\{warehousePhone\}\}|\{warehousePhone\}/gi, whMgrPhone)
    .replace(/\{\{warehouseMobile\}\}|\{warehouseMobile\}/gi, whMgrPhone)

    // Payment collection
    .replace(/\{\{amountReceived\}\}|\{amountReceived\}/gi, amountRecFormatted)
    .replace(/\{\{pendingAmount\}\}|\{pendingAmount\}/gi, pendingAmtFormatted)
    .replace(/\{\{paymentStatus\}\}|\{paymentStatus\}/gi, ctx.paymentStatus || "")
    .replace(/\{\{dueDate\}\}|\{dueDate\}/gi, ctx.dueDate || "")

    // Consolidated payment reminder
    .replace(/\{\{totalPendingAmount\}\}|\{totalPendingAmount\}/gi, typeof ctx.totalPendingAmount === "number" ? `₹${ctx.totalPendingAmount.toLocaleString('en-IN')}` : (ctx.totalPendingAmount || ""))
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
  const assignedToPhone = assignedUser?.phone || "";

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
    assignedToPhone,
    assignedSalesPersonPhone: assignedToPhone,
    salesPersonPhone: assignedToPhone,
    teamLeadEmail,
    managerEmail,
  };
}

/**
 * Resolve warehouse details including warehouse manager, contact email, and mobile/phone number
 */
export function resolveWarehouseInfo(warehouseNameOrManager: string | undefined, warehouses: WarehouseManagedBy[] = []) {
  if (!warehouseNameOrManager) {
    return {
      warehouseManagedBy: "",
      warehouseManager: "",
      warehouseManagedByName: "",
      warehouseManagedByEmail: "",
      warehouseManagerEmail: "",
      warehouseEmail: "",
      warehouseManagedByPhone: "",
      warehouseManagerPhone: "",
      warehousePhone: "",
    };
  }

  const query = warehouseNameOrManager.trim().toLowerCase();
  const matchedWh = warehouses.find((w) => {
    const nameMatch = w.name && w.name.trim().toLowerCase() === query;
    const whNameMatch = w.warehouseName && w.warehouseName.trim().toLowerCase() === query;
    const mgrMatch = w.warehouseManager && w.warehouseManager.trim().toLowerCase() === query;
    const combinedMatch = (w.warehouseManager && w.warehouseName) && 
      `${w.warehouseManager.trim().toLowerCase()} (${w.warehouseName.trim().toLowerCase()})` === query;
    return nameMatch || whNameMatch || mgrMatch || combinedMatch;
  }) || warehouses.find((w) => {
    return (w.name && query.includes(w.name.trim().toLowerCase())) ||
      (w.warehouseName && query.includes(w.warehouseName.trim().toLowerCase())) ||
      (w.warehouseManager && query.includes(w.warehouseManager.trim().toLowerCase()));
  });

  const email = matchedWh?.emailId?.trim() || "";
  const phone = matchedWh?.mobileNo?.trim() || "";
  const managerName = matchedWh?.warehouseManager?.trim() || matchedWh?.name?.trim() || "";
  const displayName = matchedWh?.warehouseName?.trim() || matchedWh?.name?.trim() || warehouseNameOrManager;

  return {
    warehouseManagedBy: displayName,
    warehouseManager: managerName,
    warehouseManagedByName: managerName,
    warehouseManagedByEmail: email,
    warehouseManagerEmail: email,
    warehouseEmail: email,
    warehouseManagedByPhone: phone,
    warehouseManagerPhone: phone,
    warehousePhone: phone,
  };
}

/**
 * Clean & format raw template body into HTML & plain text on client-side
 * Ensures email rendering works without needing any custom backend code updates.
 */
export function formatEmailBodyForSending(rawBody: string): { html: string; text: string } {
  if (!rawBody) return { html: "", text: "" };

  // 1. Un-escape escaped HTML tags like &lt;b&gt; -> <b>, &lt;table&gt; -> <table>
  let clean = rawBody
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const hasHtml = /<[a-z][\s\S]*>/i.test(clean);
  let htmlResult = "";

  if (!hasHtml) {
    htmlResult = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">${clean.replace(/\n/g, "<br/>")}</div>`;
  } else {
    // Preserve <table> blocks cleanly without injecting <br/> tags into table structures
    const tableRegex = /(<table[\s\S]*?<\/table>)/gi;
    const parts = clean.split(tableRegex);
    const formattedParts = parts.map((part) => {
      if (part.toLowerCase().startsWith("<table")) {
        return part.replace(/<br\s*\/?>/gi, "").replace(/\s*\n\s*/g, " ");
      } else {
        if (/<(br|p|div|h[1-6]|ul|ol|li)\b[^>]*>/i.test(part)) {
          return part;
        }
        return part.replace(/\n/g, "<br/>");
      }
    });
    htmlResult = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">${formattedParts.join("")}</div>`;
  }

  // Clean plain text fallback
  const textResult = htmlResult
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  return {
    html: htmlResult,
    text: textResult,
  };
}
