/**
 * Returns a human-readable date string for logging.
 * Example: "2024-03-15 14:32:00 UTC"
 */
export function getFormattedDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
