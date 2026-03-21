/**
 * Create a URL-safe slug from a workspace name.
 *
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
