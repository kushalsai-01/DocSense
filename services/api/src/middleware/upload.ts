import multer from 'multer'
import cfg from '../lib/config'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF, TXT, and DOCX files are allowed'))
    }
  },
})
