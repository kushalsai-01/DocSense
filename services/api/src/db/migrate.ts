import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    for (const file of files) {
      const { rows } = await client.query('SELECT id FROM migrations WHERE filename = $1', [file])
      if (rows[0]) {
        console.log(`[skip] ${file}`)
        continue
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await client.query(sql)
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file])
      console.log(`[done] ${file}`)
    }

    console.log('All migrations applied.')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
