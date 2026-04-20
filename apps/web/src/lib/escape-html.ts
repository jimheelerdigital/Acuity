/**
 * Minimal HTML-entity escaper for interpolating user-supplied values
 * into HTML email / page templates. SECURITY_AUDIT.md §S8.
 *
 * Covers the five characters that matter for attribute and text
 * contexts. Not a full sanitizer — use DOMPurify if you ever need
 * to permit some HTML from user input. For our case (emails + a
 * handful of UI strings) we never want any HTML from user input.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
