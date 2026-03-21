import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  RAG_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  SERVICE_TIMEOUT: z.string().default('60000'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default(String(50 * 1024 * 1024)),
  CHUNK_SIZE: z.string().default('400'),
  CHUNK_OVERLAP: z.string().default('50'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration: ${missing}`)
  }
  return result.data
}

const env = parseEnv()

const cfg = Object.freeze({
  port: parseInt(env.PORT, 10),
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  redisTlsEnabled: env.REDIS_URL.startsWith('rediss://'),
  jwtSecret: env.JWT_SECRET,
  jwtAccessExpiry: env.JWT_ACCESS_EXPIRY,
  jwtRefreshExpiry: env.JWT_REFRESH_EXPIRY,
  ragServiceUrl: env.RAG_SERVICE_URL,
  agentServiceUrl: env.AGENT_SERVICE_URL,
  serviceTimeout: parseInt(env.SERVICE_TIMEOUT, 10),
  uploadDir: env.UPLOAD_DIR,
  maxFileSize: parseInt(env.MAX_FILE_SIZE, 10),
  chunkSize: parseInt(env.CHUNK_SIZE, 10),
  chunkOverlap: parseInt(env.CHUNK_OVERLAP, 10),
  allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  logLevel: env.LOG_LEVEL,
})

export default cfg
