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
