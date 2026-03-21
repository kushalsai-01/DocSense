import winston from 'winston'

const { combine, timestamp, json, errors } = winston.format

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'docsense-api' },
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
})

export function requestLogger(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  requestId: string,
  userId?: string
) {
  logger.info('http_request', {
    method,
    path,
    statusCode,
    durationMs,
    requestId,
    userId,
  })
}
