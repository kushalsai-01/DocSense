import path from 'node:path'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * Sanitize a user-provided filename for safe local storage.
 *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename) {
  const ext = path.extname(filename).toLowerCase()
  const base = path.basename(filename, ext)
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 120)
  return `${safeBase || 'file'}${ext}`
}

/**
 * Check magic bytes for common file signatures.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {boolean}
 */
export function hasValidMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 4) return false

  if (mimeType === 'application/pdf') {
    return buffer.slice(0, 4).toString('utf8') === '%PDF'
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return true
  }

  return false
}

/**
 * Validate upload type and content signatures.
 *
 * @param {{ originalname: string, mimetype: string, size: number, buffer: Buffer }} file
 * @returns {{ safeFilename: string }}
 */
export function validateFile(file) {
  if (!file) {
    throw new Error('No file uploaded')
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new Error('Unsupported file type. Allowed: pdf, txt, md, docx')
  }

  if (!hasValidMagicBytes(file.buffer, file.mimetype)) {
    throw new Error('File signature does not match declared file type')
  }

  return { safeFilename: sanitizeFilename(file.originalname) }
}
