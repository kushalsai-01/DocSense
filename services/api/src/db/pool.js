/**
 * PostgreSQL connection pool.
 *
 * WHY a shared pool instead of per-request connections?
 * Opening a new TCP + TLS connection per query takes ~50ms.  A pool keeps
 * N connections warm and hands them out instantly.  node-postgres (`pg`)
 * handles idle timeout, reconnection, and queueing transparently.
 *
 * @module db/pool
 */

import pg from 'pg'
import cfg from '../config.js'

const { Pool } = pg

export const pool = new Pool({
  ...(cfg.databaseUrl
    ? {
        connectionString: cfg.databaseUrl,
        ssl:
          cfg.databaseUrl.includes('supabase.co') || process.env.PGSSLMODE === 'require'
            ? { rejectUnauthorized: false }
            : undefined,
      }
    : {
        host: cfg.dbHost,
        port: cfg.dbPort,
        user: cfg.dbUser,
        password: cfg.dbPassword,
        database: cfg.dbName,
      }),
  min: cfg.dbPoolMin,
  max: cfg.dbPoolMax,
  // WHY idle timeout?  Connections sitting idle for >30s get closed so they
  // don't consume server-side resources (each PG connection uses ~10MB RAM).
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

// Log once on first connect
pool.on('connect', () => {
  console.log('📦 Postgres pool: new connection established')
})

pool.on('error', (err) => {
  console.error('📦 Postgres pool: unexpected error', err.message)
})
