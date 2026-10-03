import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[migrate] applicata ${f}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Migrazione ${f} fallita: ${e.message}`);
    } finally {
      c.release();
    }
  }
  await seed();
}

async function seed() {
  if (config.seed.superadminEmail) {
    const ex = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [config.seed.superadminEmail]);
    if (!ex.rows.length) {
      if (!config.seed.superadminPassword || config.seed.superadminPassword.length < 12) {
        throw new Error('SEED_SUPERADMIN_PASSWORD obbligatoria (min 12 caratteri) per creare il super amministratore');
      }
      const hash = await bcrypt.hash(config.seed.superadminPassword, 12);
      await pool.query(
        `INSERT INTO users (email, full_name, role, auth_provider, password_hash, must_change_password)
         VALUES ($1,$2,'SUPERADMIN','BOTH',$3,TRUE)`,
        [config.seed.superadminEmail, config.seed.superadminName, hash],
      );
      console.log(`[seed] creato super amministratore ${config.seed.superadminEmail}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
