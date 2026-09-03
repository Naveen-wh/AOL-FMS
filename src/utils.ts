/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderOffer, OrderItem } from "./types";

/**
 * Formats a date into "dd-MMM-yy" format (e.g., "01-Aug-26")
 */
export function formatDate(dateInput?: string | Date | null, fallback = "N/A"): string {
  if (!dateInput) return fallback;
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(dateInput);
  }
}

/**
 * Formats a number into Indian numbering format with commas (e.g., 1,00,000 or 1,23,45,678).
 */
export function formatIndianNumber(
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-IN", options);
}

/**
 * Formats a currency amount into Indian Rupee format with commas (e.g., ₹1,00,000).
 */
export function formatIndianCurrency(
  value: number | string | null | undefined,
  includeSymbol = true
): string {
  const formatted = formatIndianNumber(value);
  return includeSymbol ? `₹${formatted}` : formatted;
}

/**
 * Formats a currency number in compact Indian numbering format.
 * - If >= 1 Crore (1,00,00,000) -> "₹##.## Cr" (e.g., ₹1.25 Cr)
 * - If >= 1 Lakh (1,00,000) -> "₹##.## L" (e.g., ₹12.50 L)
 * - Else -> "₹X,XXX" (e.g., ₹45,000)
 */
export function formatCompactRupees(value: number | null | undefined, includeSymbol = true): string {
  if (value === null || value === undefined || isNaN(value)) {
    return includeSymbol ? "₹0" : "0";
  }
  const prefix = includeSymbol ? "₹" : "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 10000000) {
    const inCr = (abs / 10000000).toFixed(2);
    return `${sign}${prefix}${inCr} Cr`;
  } else if (abs >= 100000) {
    const inL = (abs / 100000).toFixed(2);
    return `${sign}${prefix}${inL} L`;
  } else {
    return `${sign}${prefix}${Math.round(abs).toLocaleString('en-IN')}`;
  }
}

/**
 * Formats a quantity in Kg as Metric Tonnes (MT), where 1000 Kg = 1 MT.
 * E.g., 1000 Kg -> "1 MT", 2500 Kg -> "2.5 MT", 12500 Kg -> "12.5 MT"
 */
export function formatQuantityMT(qtyKg: number | null | undefined, includeUnit = true): string {
  if (qtyKg === null || qtyKg === undefined || isNaN(qtyKg)) {
    return includeUnit ? "0 MT" : "0";
  }
  const mt = qtyKg / 1000;
  const abs = Math.abs(mt);
  const sign = mt < 0 ? "-" : "";
  const unit = includeUnit ? " MT" : "";

  // Format with up to 2 decimal places, removing unnecessary trailing zeros (e.g. 1.00 -> 1, 1.50 -> 1.5)
  const formatted = parseFloat(abs.toFixed(2)).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${sign}${formatted}${unit}`;
}

/**
 * Parses numeric tax percentage from string (e.g., "18%", "18% GST", "12", "5.0%", "Exempt", "0%")
 */
export function parseTaxPercent(taxStr?: string, defaultRate = 18): number {
  if (!taxStr) return defaultRate;
  const str = String(taxStr).trim();
  if (str.toLowerCase().includes("exempt") || str.toLowerCase() === "nil" || str === "0") {
    return 0;
  }
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (!match) return defaultRate;
  const num = parseFloat(match[1]);
  return isNaN(num) ? defaultRate : num;
}

/**
 * Parses numeric freight amount from string or number (e.g., "₹5,000", "5000", "Included", "No", "N/A")
 */
export function parseFreightAmount(freightVal?: string | number): number {
  if (freightVal === null || freightVal === undefined || freightVal === "") return 0;
  if (typeof freightVal === "number") return isNaN(freightVal) ? 0 : freightVal;
  const str = String(freightVal).trim();
  const lower = str.toLowerCase();
  if (lower === "included" || lower === "no" || lower === "n/a" || lower === "none" || lower === "nil" || lower === "paid by aol" || lower === "to pay") {
    return 0;
  }
  const cleaned = str.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!cleaned) return 0;
  const num = parseFloat(cleaned[0]);
  return isNaN(num) ? 0 : num;
}

/**
 * Finds the maximum GST rate among the product items in an order
 */
export function getMaxProductGstRate(
  items?: Array<Partial<OrderItem> | { taxes?: string; rate?: number | string; quantity?: number | string }>,
  defaultRate = 18
): number {
  if (!items || items.length === 0) return defaultRate;
  const rates = items.map((it) => parseTaxPercent(it.taxes, defaultRate));
  return rates.length > 0 ? Math.max(...rates) : defaultRate;
}

/**
 * Calculates item base, respective GST amount, and total with GST for a single line item
 */
export function calculateItemAmounts(
  item: { quantity?: number | string; rate?: number | string; taxes?: string },
  defaultRate = 18
): {
  quantity: number;
  rate: number;
  baseAmount: number;
  taxPercent: number;
  gstAmount: number;
  totalWithGst: number;
} {
  const quantity = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  const baseAmount = quantity * rate;
  const taxPercent = parseTaxPercent(item.taxes, defaultRate);
  const gstAmount = baseAmount * (taxPercent / 100);
  const totalWithGst = baseAmount + gstAmount;

  return {
    quantity,
    rate,
    baseAmount,
    taxPercent,
    gstAmount,
    totalWithGst,
  };
}

export interface GstRateBucket {
  rate: number;
  productBase: number;
  productGst: number;
}

export interface OrderTotalInvoiceBreakdown {
  productsBaseTotal: number;
  productsGstTotal: number;
  productsTotalWithGst: number;
  gstBuckets: GstRateBucket[];
  maxGstPercent: number;
  freightBase: number;
  freightGst: number;
  freightTotalWithGst: number;
  totalInvoiceAmount: number;
  itemBreakdowns: Array<{
    item: Partial<OrderItem>;
    quantity: number;
    rate: number;
    baseAmount: number;
    taxPercent: number;
    gstAmount: number;
    totalWithGst: number;
  }>;
}

/**
 * Comprehensive Order Total Invoice Calculation:
 * Total Invoice Amount = Total Product Cost with Respective GST + Freight Charged in Bill with Max GST in the rate
 */
export function calculateOrderTotalInvoiceBreakdown(order?: Partial<OrderOffer> | null): OrderTotalInvoiceBreakdown {
  if (order?.isBadDebtor) {
    const total = order.badDebtorRecord?.invoiceAmount || Number(order.totalValue) || 0;
    return {
      productsBaseTotal: total,
      productsGstTotal: 0,
      productsTotalWithGst: total,
      gstBuckets: [{ rate: 0, productBase: total, productGst: 0 }],
      maxGstPercent: 0,
      freightBase: 0,
      freightGst: 0,
      freightTotalWithGst: 0,
      totalInvoiceAmount: total,
      itemBreakdowns: [],
    };
  }

  const items = order?.items || [];
  const maxGstPercent = getMaxProductGstRate(items, 18);

  const itemBreakdowns = items.map((item) => {
    const calc = calculateItemAmounts(item, 18);
    return {
      item,
      ...calc,
    };
  });

  const bucketMap = new Map<number, { productBase: number; productGst: number }>();
  itemBreakdowns.forEach((ib) => {
    const rate = ib.taxPercent;
    const existing = bucketMap.get(rate) || { productBase: 0, productGst: 0 };
    bucketMap.set(rate, {
      productBase: existing.productBase + ib.baseAmount,
      productGst: existing.productGst + ib.gstAmount,
    });
  });

  const gstBuckets: GstRateBucket[] = Array.from(bucketMap.entries())
    .map(([rate, vals]) => ({
      rate,
      productBase: vals.productBase,
      productGst: vals.productGst,
    }))
    .sort((a, b) => a.rate - b.rate);

  const productsBaseTotal = itemBreakdowns.reduce((sum, ib) => sum + ib.baseAmount, 0);
  const productsGstTotal = itemBreakdowns.reduce((sum, ib) => sum + ib.gstAmount, 0);
  const productsTotalWithGst = productsBaseTotal + productsGstTotal;

  const freightChargedRaw = order?.closedWonDetails?.freightChargedInBill;
  const freightBase = parseFreightAmount(freightChargedRaw);
  const freightGst = freightBase * (maxGstPercent / 100);
  const freightTotalWithGst = freightBase + freightGst;

  const totalInvoiceAmount = productsTotalWithGst + freightTotalWithGst;

  return {
    productsBaseTotal,
    productsGstTotal,
    productsTotalWithGst,
    gstBuckets,
    maxGstPercent,
    freightBase,
    freightGst,
    freightTotalWithGst,
    totalInvoiceAmount,
    itemBreakdowns,
  };
}

/**
 * Gets the total invoice amount for an order.
 * If items are present, calculates: Total Product Cost with Respective GST + Freight Charged in Bill with Max GST in rate.
 * If no items exist, safely falls back to `order.totalValue || 0`.
 */
export function getOrderTotalInvoiceAmount(order?: Partial<OrderOffer> | null): number {
  if (!order) return 0;
  if (order.isBadDebtor) {
    return order.badDebtorRecord?.invoiceAmount || Number(order.totalValue) || 0;
  }
  if (order.items && order.items.length > 0) {
    const breakdown = calculateOrderTotalInvoiceBreakdown(order);
    return breakdown.totalInvoiceAmount;
  }
  if (order.grandTotalOrderAmount !== undefined && order.grandTotalOrderAmount !== null) {
    return Number(order.grandTotalOrderAmount) || 0;
  }
  return Number(order.totalValue) || 0;
}

