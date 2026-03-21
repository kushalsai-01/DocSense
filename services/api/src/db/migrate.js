import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pool } from './pool.js'

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename VARCHAR PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const dir = path.join(import.meta.dirname, 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM migrations WHERE filename = $1',
      [file]
    )

    if (rows.length > 0) {
      console.log(`Skipping ${file} - already run`)
      continue
    }

    const sql = await readFile(path.join(dir, file), 'utf-8')
    await pool.query(sql)
    await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file])
    console.log(`Ran migration: ${file}`)
  }

  await pool.end()
  console.log('All migrations complete')
}

runMigrations().catch((err) => {
  console.error(err)
  process.exit(1)
})
