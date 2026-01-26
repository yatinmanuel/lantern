import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'pxe.db');
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac_address TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      hostname TEXT,
      status TEXT NOT NULL DEFAULT 'booting',
      hardware_info TEXT,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    );

    CREATE TABLE IF NOT EXISTS installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      os_type TEXT NOT NULL,
      config_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      logs TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_servers_mac ON servers(mac_address);
    CREATE INDEX IF NOT EXISTS idx_tasks_server ON tasks(server_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_installations_server ON installations(server_id);
  `);

  // Create PXE configuration table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pxe_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Initialize default configuration
  const initConfig = db.prepare(`
    INSERT OR IGNORE INTO pxe_config (key, value, description) VALUES
    ('pxe_server_ip', '192.168.1.10', 'PXE Server IP Address'),
    ('pxe_server_port', '3000', 'PXE Server Port'),
    ('dhcp_interface', 'eth0', 'Network interface for DHCP'),
    ('dhcp_range', '192.168.1.100,192.168.1.200,12h', 'DHCP IP Range'),
    ('alpine_version', 'latest-stable', 'Alpine Linux Version'),
    ('alpine_mirror', 'https://dl-cdn.alpinelinux.org/alpine', 'Alpine Mirror URL'),
    ('web_root', '/var/www/html', 'Web root directory'),
    ('ipxe_menu_path', '/var/www/html/ipxe/menu.ipxe', 'iPXE Menu Path')
  `);
  initConfig.run();

  // Add last_seen column to existing servers table if it doesn't exist (migration)
  try {
    // Check if column exists first
    const tableInfo = db.prepare("PRAGMA table_info(servers)").all() as any[];
    const hasLastSeen = tableInfo.some((col: any) => col.name === 'last_seen');
    
    if (!hasLastSeen) {
      // SQLite doesn't allow CURRENT_TIMESTAMP in ALTER TABLE, so add without default
      db.exec(`ALTER TABLE servers ADD COLUMN last_seen DATETIME`);
      logger.info('Added last_seen column to servers table');
      
      // Update existing rows to set last_seen to created_at
      const updateStmt = db.prepare(`UPDATE servers SET last_seen = created_at WHERE last_seen IS NULL`);
      updateStmt.run();
    } else {
      logger.info('last_seen column already exists in servers table');
      // Update any NULL values to created_at
      const updateStmt = db.prepare(`UPDATE servers SET last_seen = created_at WHERE last_seen IS NULL`);
      updateStmt.run();
    }
  } catch (error: any) {
    logger.error('Error during last_seen migration:', error);
    // Don't throw - allow server to start even if migration fails
  }

  // Create authentication and authorization tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      is_active INTEGER DEFAULT 1,
      is_superuser INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, permission_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // Initialize default roles and permissions
  const initRoles = db.prepare(`
    INSERT OR IGNORE INTO roles (id, name, description) VALUES
    (1, 'admin', 'Full system administrator with all permissions'),
    (2, 'operator', 'Can manage servers and execute tasks'),
    (3, 'viewer', 'Read-only access to system information')
  `);
  initRoles.run();

  // Define all permissions
  const permissions = [
    // Server management
    { resource: 'servers', action: 'view', description: 'View servers list' },
    { resource: 'servers', action: 'create', description: 'Register new servers' },
    { resource: 'servers', action: 'edit', description: 'Edit server information' },
    { resource: 'servers', action: 'delete', description: 'Delete servers' },
    { resource: 'servers', action: 'reboot', description: 'Reboot servers' },
    { resource: 'servers', action: 'shutdown', description: 'Shutdown servers' },
    
    // Task management
    { resource: 'tasks', action: 'view', description: 'View tasks' },
    { resource: 'tasks', action: 'create', description: 'Create tasks' },
    { resource: 'tasks', action: 'execute', description: 'Execute tasks' },
    { resource: 'tasks', action: 'cancel', description: 'Cancel tasks' },
    
    // Installation management
    { resource: 'installations', action: 'view', description: 'View installations' },
    { resource: 'installations', action: 'create', description: 'Create installations' },
    { resource: 'installations', action: 'manage', description: 'Manage installations' },
    
    // User management
    { resource: 'users', action: 'view', description: 'View users' },
    { resource: 'users', action: 'create', description: 'Create users' },
    { resource: 'users', action: 'edit', description: 'Edit users' },
    { resource: 'users', action: 'delete', description: 'Delete users' },
    { resource: 'users', action: 'manage_roles', description: 'Manage user roles' },
    { resource: 'users', action: 'manage_permissions', description: 'Manage user permissions' },
    
    // System configuration
    { resource: 'config', action: 'view', description: 'View configuration' },
    { resource: 'config', action: 'edit', description: 'Edit configuration' },
    { resource: 'config', action: 'manage_services', description: 'Manage system services' },
    
  ];

  const insertPermission = db.prepare(`
    INSERT OR IGNORE INTO permissions (name, resource, action, description)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const perm of permissions) {
    const name = `${perm.resource}.${perm.action}`;
    insertPermission.run(name, perm.resource, perm.action, perm.description);
  }

  // Assign all permissions to admin role
  const assignAdminPerms = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT 1, id FROM permissions
  `);
  assignAdminPerms.run();

  // Assign basic permissions to operator role
  const operatorPerms = [
    'servers.view', 'servers.create', 'servers.edit', 'servers.reboot', 'servers.shutdown',
    'tasks.view', 'tasks.create', 'tasks.execute',
    'installations.view', 'installations.create', 'installations.manage',
    'config.view'
  ];
  const assignOperatorPerms = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT 2, id FROM permissions WHERE name = ?
  `);
  for (const permName of operatorPerms) {
    assignOperatorPerms.run(permName);
  }

  // Assign view-only permissions to viewer role
  const viewerPerms = ['servers.view', 'tasks.view', 'installations.view', 'config.view'];
  const assignViewerPerms = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT 3, id FROM permissions WHERE name = ?
  `);
  for (const permName of viewerPerms) {
    assignViewerPerms.run(permName);
  }

  // Create default admin user if no users exist (password: admin123 - should be changed!)
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.hash('admin123', 10);
    const createAdmin = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, is_active, is_superuser)
      VALUES (?, ?, ?, ?, 1, 1)
    `);
    createAdmin.run('admin', 'admin@lanternpxe.local', defaultPassword, 'Administrator');
    
    // Assign admin role
    const assignRole = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (1, 1)');
    assignRole.run();
    
    logger.info('Created default admin user (username: admin, password: admin123)');
  }

  logger.info('Database tables created');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
