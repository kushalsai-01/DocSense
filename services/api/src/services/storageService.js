import fs from 'node:fs/promises'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import cfg from '../config.js'

/**
 * Save an uploaded file buffer to workspace-scoped local storage.
 *
 * @param {string} workspaceId
 * @param {string} safeFilename
 * @param {Buffer} buffer
 * @returns {Promise<{ path: string, filename: string }>} 
 */
export async function saveUploadedFile(workspaceId, safeFilename, buffer) {
  const folder = path.join(cfg.uploadDir, workspaceId)
  await fs.mkdir(folder, { recursive: true })

  const storedName = `${uuidv4()}_${safeFilename}`
  const filePath = path.join(folder, storedName)
  await fs.writeFile(filePath, buffer)

  return { path: filePath, filename: storedName }
}

/**
 * Delete a stored file if it exists.
 *
 * @param {string | null | undefined} filePath
 * @returns {Promise<void>}
 */
export async function deleteStoredFile(filePath) {
  if (!filePath) return
  try {
    await fs.unlink(filePath)
  } catch {
    // Ignore if already removed.
  }
}
