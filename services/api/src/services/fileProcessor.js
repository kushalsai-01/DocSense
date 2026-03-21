import fs from 'node:fs/promises'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

/**
 * Extract plain text from supported file types.
 *
 * @param {string} filePath
 * @param {string} mimeType
 * @returns {Promise<{ text: string, pageCount: number | null }>}
 */
export async function extractText(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    const buffer = await fs.readFile(filePath)
    const data = await pdfParse(buffer)
    return { text: data.text || '', pageCount: data.numpages || null }
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const buffer = await fs.readFile(filePath)
    const result = await mammoth.extractRawText({ buffer })
    return { text: result.value || '', pageCount: null }
  }

  const text = await fs.readFile(filePath, 'utf8')
  return { text, pageCount: null }
}

/**
 * Estimate token count from words for chunk sizing.
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.ceil(words * 1.3)
}

/**
 * Build overlapping chunks while preserving sentence boundaries.
 *
 * @param {string} text
 * @param {number} [chunkSize=400]
 * @param {number} [overlap=50]
 * @returns {Array<{ text: string, chunkIndex: number, charStart: number, charEnd: number, tokenCount: number }>}
 */
export function chunkText(text, chunkSize = 400, overlap = 50) {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const sentenceRegex = /[^.!?\n]+[.!?]?/g
  const sentenceMatches = [...normalized.matchAll(sentenceRegex)]

  const sentences = sentenceMatches
    .map((m) => ({ sentence: m[0].trim(), start: m.index || 0 }))
    .filter((item) => item.sentence.length > 0)

  const chunks = []
  let currentSentences = []
  let currentStart = 0
  let index = 0

  /**
   * Flush currently accumulated sentence group into output chunks.
   *
   * @returns {void}
   */
  const flushChunk = () => {
    if (!currentSentences.length) return

    const chunkStr = currentSentences.map((s) => s.sentence).join(' ').trim()
    const charStart = currentStart
    const charEnd = charStart + chunkStr.length

    chunks.push({
      text: chunkStr,
      chunkIndex: index,
      charStart,
      charEnd,
      tokenCount: estimateTokens(chunkStr),
    })

    index += 1

    const overlapWords = []
    for (let i = currentSentences.length - 1; i >= 0; i -= 1) {
      const words = currentSentences[i].sentence.split(/\s+/)
      overlapWords.unshift(...words)
      if (overlapWords.length >= overlap) break
    }

    const overlapText = overlapWords.slice(-overlap).join(' ').trim()
    currentSentences = overlapText
      ? [{ sentence: overlapText, start: currentSentences[currentSentences.length - 1].start }]
      : []

    currentStart = currentSentences[0]?.start ?? 0
  }

  for (const sentence of sentences) {
    if (!currentSentences.length) {
      currentStart = sentence.start
    }

    const trial = [...currentSentences.map((s) => s.sentence), sentence.sentence].join(' ')
    if (estimateTokens(trial) > chunkSize && currentSentences.length) {
      flushChunk()
      if (!currentSentences.length) {
        currentStart = sentence.start
      }
    }

    currentSentences.push(sentence)
  }

  flushChunk()
  return chunks
}
