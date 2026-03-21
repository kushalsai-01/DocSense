/**
 * Environment configuration — single source of truth for all settings.
 *
 * WHY centralise config?
 * Scattered process.env reads make it impossible to know which variables
 * the app actually needs.  This module reads them once at startup, applies
 * defaults, and exports a frozen object.  Every other module imports `cfg`
 * instead of touching process.env directly.
 *
 * @module config
 */

const cfg = Object.freeze({
  // ── Server ──────────────────────────────────────────────────
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],

  // ── Database (Postgres) ─────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '5432', 10),
  dbUser: process.env.DB_USER || 'docsense',
  dbPassword: process.env.DB_PASSWORD || 'docsense_dev_password',
  dbName: process.env.DB_NAME || 'docsense',
  dbPoolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),

  // ── Redis ───────────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisTlsEnabled: (process.env.REDIS_URL || '').startsWith('rediss://'),

  // ── JWT ─────────────────────────────────────────────────────
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

  // ── Python services ─────────────────────────────────────────
  ragServiceUrl: process.env.RAG_SERVICE_URL || 'http://localhost:8000',
  agentServiceUrl: process.env.AGENT_SERVICE_URL || 'http://localhost:8100',
  serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT || '60000', 10),

  // ── File uploads ────────────────────────────────────────────
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(50 * 1024 * 1024), 10), // 50MB

  // ── Chunking ────────────────────────────────────────────────
  chunkSize: parseInt(process.env.CHUNK_SIZE || '400', 10),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50', 10),
})

export default cfg
