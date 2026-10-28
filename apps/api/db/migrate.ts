import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { loadEnv } from './env';
import '../src/db/pg-types';

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env');
  process.exit(1);
}

const pool = new Pool({ connectionString, options: '-c timezone=UTC' });
const dir = join(__dirname, 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE id = $1',
      [file],
    );
    if (applied.rowCount) {
      console.log(`skip ${file}`);
      continue;
    }

    if (file === '001_init.sql') {
      const existing = await pool.query(
        `SELECT to_regclass('public.users') AS name`,
      );
      if (existing.rows[0]?.name) {
        await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        console.log(`skip ${file} (tables already exist)`);
        continue;
      }
    }

    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => pool.end());
