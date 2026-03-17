/**
 * Generate a random display ID with a given prefix.
 * Format: PREFIX + 8 random digits  (e.g. CUST83749261, STR52918304)
 */
export function generateDisplayId(prefix: string): string {
  return `${prefix}${Math.floor(10000000 + Math.random() * 90000000)}`;
}
