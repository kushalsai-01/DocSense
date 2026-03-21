import { Pool, PoolClient } from 'pg'
import cfg from '../lib/config'
import { logger } from '../lib/logger'

export const pool = new Pool({
  connectionString: cfg.databaseUrl,
  ssl: cfg.databaseUrl.includes('sslmode=require') || cfg.databaseUrl.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
  min: 2,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  logger.error('pg_pool_error', { error: err.message })
})

export async function isDbHealthy(): Promise<boolean> {
  let client: PoolClient | null = null
  try {
    client = await pool.connect()
    await client.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    client?.release()
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
