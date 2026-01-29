import { Pool } from 'pg';
import path from 'path';
import { logger } from '../utils/logger.js';

let pool: Pool | null = null;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for Postgres');
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function initDatabase(): Promise<void> {
  if (!pool) {
    pool = new Pool({ connectionString: getConnectionString() });
  }

  const db = getPool();

  await db.query('SELECT 1');

  await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await db.query(`
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS pxe_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
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

    CREATE TABLE IF NOT EXISTS boot_menus (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content JSONB NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE servers 
      ADD COLUMN IF NOT EXISTS boot_menu_id INTEGER REFERENCES boot_menus(id) ON DELETE SET NULL;
  `);

  await db.query(`
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

  await db.query(`
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

  await db.query(`
    ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS concurrency_key TEXT,
      ADD COLUMN IF NOT EXISTS concurrency_limit INTEGER;
  `);

  await db.query(`
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

  const webRootValue = process.env.WEB_ROOT || '/var/www/html';
  const defaultConfig = [
    {
      key: 'pxe_server_ip',
      value: process.env.PXE_SERVER_IP || '192.168.1.10',
      description: 'PXE Server IP Address',
    },
    {
      key: 'pxe_server_port',
      value: process.env.PXE_SERVER_PORT || process.env.PORT || '3000',
      description: 'PXE Server Port',
    },
    {
      key: 'dhcp_interface',
      value: process.env.DHCP_INTERFACE || 'eth0',
      description: 'Network interface for DHCP',
    },
    {
      key: 'dhcp_range',
      value: process.env.DHCP_RANGE || '192.168.1.100,192.168.1.200,12h',
      description: 'DHCP IP Range',
    },
    {
      key: 'alpine_version',
      value: process.env.ALPINE_VERSION || 'latest-stable',
      description: 'Alpine Linux Version',
    },
    {
      key: 'alpine_mirror',
      value: process.env.ALPINE_MIRROR || 'https://dl-cdn.alpinelinux.org/alpine',
      description: 'Alpine Mirror URL',
    },
    {
      key: 'web_root',
      value: webRootValue,
      description: 'Web root directory',
    },
    {
      key: 'iso_dir',
      value: process.env.ISO_DIR || path.join(webRootValue, 'iso'),
      description: 'ISO storage directory',
    },
    {
      key: 'ipxe_menu_path',
      value: process.env.IPXE_MENU_PATH || '/var/www/html/ipxe/menu.ipxe',
      description: 'iPXE Menu Path',
    },
  ];

  for (const item of defaultConfig) {
    await db.query(
      `INSERT INTO pxe_config (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [item.key, item.value, item.description]
    );
  }

  await db.query(
    `INSERT INTO roles (id, name, description)
     VALUES (1, 'admin', 'Full system administrator with all permissions'),
            (2, 'operator', 'Can manage servers and execute tasks'),
            (3, 'viewer', 'Read-only access to system information')
     ON CONFLICT (id) DO NOTHING`
  );

  const permissions = [
    { resource: 'servers', action: 'view', description: 'View servers list' },
    { resource: 'servers', action: 'create', description: 'Register new servers' },
    { resource: 'servers', action: 'edit', description: 'Edit server information' },
    { resource: 'servers', action: 'delete', description: 'Delete servers' },
    { resource: 'servers', action: 'reboot', description: 'Reboot servers' },
    { resource: 'servers', action: 'shutdown', description: 'Shutdown servers' },

    { resource: 'tasks', action: 'view', description: 'View tasks' },
    { resource: 'tasks', action: 'create', description: 'Create tasks' },
    { resource: 'tasks', action: 'execute', description: 'Execute tasks' },
    { resource: 'tasks', action: 'cancel', description: 'Cancel tasks' },

    { resource: 'installations', action: 'view', description: 'View installations' },
    { resource: 'installations', action: 'create', description: 'Create installations' },
    { resource: 'installations', action: 'manage', description: 'Manage installations' },

    { resource: 'users', action: 'view', description: 'View users' },
    { resource: 'users', action: 'create', description: 'Create users' },
    { resource: 'users', action: 'edit', description: 'Edit users' },
    { resource: 'users', action: 'delete', description: 'Delete users' },
    { resource: 'users', action: 'manage_roles', description: 'Manage user roles' },
    { resource: 'users', action: 'manage_permissions', description: 'Manage user permissions' },

    { resource: 'config', action: 'view', description: 'View configuration' },
    { resource: 'config', action: 'edit', description: 'Edit configuration' },
    { resource: 'config', action: 'manage_services', description: 'Manage system services' },

    { resource: 'jobs', action: 'view', description: 'View job queue' },
    { resource: 'jobs', action: 'manage', description: 'Manage job queue' },
  ];

  for (const perm of permissions) {
    const name = `${perm.resource}.${perm.action}`;
    await db.query(
      `INSERT INTO permissions (name, resource, action, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [name, perm.resource, perm.action, perm.description]
    );
  }

  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT 1, id FROM permissions
     ON CONFLICT DO NOTHING`
  );

  const operatorPerms = [
    'servers.view', 'servers.create', 'servers.edit', 'servers.reboot', 'servers.shutdown',
    'tasks.view', 'tasks.create', 'tasks.execute',
    'installations.view', 'installations.create', 'installations.manage',
    'config.view',
    'jobs.view'
  ];
  for (const permName of operatorPerms) {
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT 2, id FROM permissions WHERE name = $1
       ON CONFLICT DO NOTHING`,
      [permName]
    );
  }

  const viewerPerms = ['servers.view', 'tasks.view', 'installations.view', 'config.view', 'jobs.view'];
  for (const permName of viewerPerms) {
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT 3, id FROM permissions WHERE name = $1
       ON CONFLICT DO NOTHING`,
      [permName]
    );
  }

  const userCountResult = await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM users');
  const userCount = Number(userCountResult.rows[0]?.count || 0);
  if (userCount === 0) {
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.hash('admin123', 10);
    const result = await db.query<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, full_name, is_active, is_superuser)
       VALUES ($1, $2, $3, $4, true, true)
       RETURNING id`,
      ['admin', 'admin@lanternpxe.local', defaultPassword, 'Administrator']
    );
    const adminId = result.rows[0]?.id;
    if (adminId) {
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, 1) ON CONFLICT DO NOTHING', [adminId]);
    }
    logger.info('Created default admin user (username: admin, password: admin123)');
  }

  logger.info('Database tables created');
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
