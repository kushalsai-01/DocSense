import fs from 'fs/promises'
import path from 'path'
import cfg from '../lib/config'

export interface ExtractResult {
  text: string
  pageCount: number | null
}

export interface Chunk {
  chunkIndex: number
  text: string
  charStart: number
  charEnd: number
  tokenCount: number
}

export async function extractText(
  filePath: string,
  mimeType: string
): Promise<ExtractResult> {
  if (mimeType === 'application/pdf') {
    const pdfParse = await import('pdf-parse')
    const buffer = await fs.readFile(filePath)
    const result = await pdfParse.default(buffer)
    return { text: result.text, pageCount: result.numpages }
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return { text: result.value, pageCount: null }
  }

  const text = await fs.readFile(filePath, 'utf8')
  return { text, pageCount: null }
}

export function chunkText(
  text: string,
  chunkSize = cfg.chunkSize,
  chunkOverlap = cfg.chunkOverlap
): Chunk[] {
  const words = text.split(/\s+/)
  const chunks: Chunk[] = []
  let charOffset = 0

  for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
    const slice = words.slice(i, i + chunkSize)
    const chunkText = slice.join(' ')
    const charStart = text.indexOf(chunkText, charOffset)
    const charEnd = charStart + chunkText.length

    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      charStart: charStart >= 0 ? charStart : charOffset,
      charEnd: charEnd >= 0 ? charEnd : charOffset + chunkText.length,
      tokenCount: slice.length,
    })

    if (charStart >= 0) charOffset = charStart
    if (slice.length < chunkSize) break
  }

  return chunks
}

export async function saveUploadedFile(
  workspaceId: string,
  filename: string,
  buffer: Buffer
): Promise<{ path: string; filename: string }> {
  const dir = path.join(cfg.uploadDir, workspaceId)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, buffer)
  return { path: filePath, filename }
}

export async function deleteStoredFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch {
    // File may not exist — ignore
  }
}

export function validateFile(file: Express.Multer.File | undefined): {
  safeFilename: string
} {
  if (!file) throw Object.assign(new Error('No file provided'), { statusCode: 400 })

  const allowed = [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  if (!allowed.includes(file.mimetype)) {
    throw Object.assign(new Error('Only PDF, TXT, and DOCX files are allowed'), {
      statusCode: 400,
    })
  }

  if (file.size > cfg.maxFileSize) {
    throw Object.assign(
      new Error(`File too large. Maximum size is ${cfg.maxFileSize / 1024 / 1024}MB`),
      { statusCode: 400 }
    )
  }

  const ext = path.extname(file.originalname).toLowerCase()
  const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  return { safeFilename: safe }
}
