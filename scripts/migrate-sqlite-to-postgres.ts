import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Client } from 'pg';

const sqlitePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'pxe.db');
const postgresUrl = process.env.DATABASE_URL;

if (!postgresUrl) {
  console.error('DATABASE_URL is required to run migration.');
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite database not found at ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pg = new Client({ connectionString: postgresUrl });

const tableList = [
  'servers',
  'tasks',
  'installations',
  'pxe_config',
  'iso_entries',
  'users',
  'roles',
  'user_roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'sessions',
];

const jsonColumns: Record<string, string[]> = {
  servers: ['hardware_info'],
  iso_entries: ['initrd_items'],
};

const booleanColumns: Record<string, string[]> = {
  users: ['is_active', 'is_superuser'],
};

async function ensureSchema(): Promise<void> {
  await pg.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pg.query(`
    CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY,
      mac_address TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      hostname TEXT,
      status TEXT NOT NULL DEFAULT 'booting',
      hardware_info JSONB,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS installations (
      id SERIAL PRIMARY KEY,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      os_type TEXT NOT NULL,
      config_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      logs TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_servers_mac ON servers(mac_address);
    CREATE INDEX IF NOT EXISTS idx_tasks_server ON tasks(server_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_installations_server ON installations(server_id);
  `);

  await pg.query(`
    CREATE TABLE IF NOT EXISTS pxe_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pg.query(`
    CREATE TABLE IF NOT EXISTS iso_entries (
      id SERIAL PRIMARY KEY,
      iso_name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      os_type TEXT NOT NULL,
      kernel_path TEXT NOT NULL,
      initrd_items JSONB,
      boot_args TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pg.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      is_superuser BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  await pg.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 0,
      payload JSONB,
      result JSONB,
      error TEXT,
      message TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT,
      target_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      concurrency_key TEXT,
      concurrency_limit INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  `);

  await pg.query(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id SERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);
  `);
}

function normalizeValue(table: string, column: string, value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;

  if (jsonColumns[table]?.includes(column)) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  if (booleanColumns[table]?.includes(column)) {
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  }

  return value;
}

async function tableExists(table: string): Promise<boolean> {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
  return !!row;
}

async function migrateTable(table: string): Promise<void> {
  if (!(await tableExists(table))) {
    console.log(`Skipping ${table} (missing in SQLite).`);
    return;
  }

  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`Skipping ${table} (no rows).`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`;

  for (const row of rows) {
    const values = columns.map((column) => normalizeValue(table, column, row[column]));
    await pg.query(insertSql, values);
  }

  console.log(`Migrated ${rows.length} rows into ${table}.`);
}

async function updateSequences(): Promise<void> {
  const tablesWithSerial = ['servers', 'tasks', 'installations', 'iso_entries', 'users', 'roles', 'permissions'];
  for (const table of tablesWithSerial) {
    await pg.query(
      `SELECT setval(
        pg_get_serial_sequence($1, 'id'),
        GREATEST(COALESCE(MAX(id), 0), 1)
      ) FROM ${table}`,
      [table]
    );
  }
}

async function main(): Promise<void> {
  await pg.connect();
  try {
    await ensureSchema();
    for (const table of tableList) {
      await migrateTable(table);
    }
    await updateSequences();
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pg.end();
    sqlite.close();
  }
}

void main();
