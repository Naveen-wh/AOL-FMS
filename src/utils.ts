/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * Formats a currency number in compact Indian numbering format.
 * If >= 1 Crore -> "₹##.## Cr"
 * If >= 1 Lakh -> "₹##.## L"
 * Else -> "₹X,XXX"
 */
export function formatCompactRupees(value: number | null | undefined, includeSymbol = true): string {
  if (value === null || value === undefined || isNaN(value)) {
    return includeSymbol ? "₹0" : "0";
  }
  const prefix = includeSymbol ? "₹" : "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 9995000) {
    const inCr = (abs / 10000000).toFixed(2);
    return `${sign}${prefix}${inCr} Cr`;
  } else if (abs >= 99950) {
    const inL = (abs / 100000).toFixed(2);
    return `${sign}${prefix}${inL} L`;
  } else {
    return `${sign}${prefix}${abs.toLocaleString('en-IN')}`;
  }
}

/**
 * Formats a quantity in Kg as Metric Tonnes (MT), where 1000 Kg = 1 MT.
 * E.g., 1000 Kg -> "1 MT", 12500 Kg -> "12.5 MT"
 */
export function formatQuantityMT(qtyKg: number | null | undefined, includeUnit = true): string {
  if (qtyKg === null || qtyKg === undefined || isNaN(qtyKg)) {
    return includeUnit ? "0 MT" : "0";
  }
  const mt = qtyKg / 1000;
  const abs = Math.abs(mt);
  const sign = mt < 0 ? "-" : "";
  const unit = includeUnit ? " MT" : "";

  const formatted = Number(abs.toFixed(2)).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${sign}${formatted}${unit}`;
}
