import { getDatabase } from './index.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  full_name: string | null;
  is_active: number; // SQLite uses INTEGER for boolean
  is_superuser: number;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Permission {
  id: number;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export const UserModel = {
  async create(user: {
    username: string;
    email?: string;
    password: string;
    full_name?: string;
    is_active?: boolean;
    is_superuser?: boolean;
  }): Promise<User> {
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(user.password, 10);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, is_active, is_superuser, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      user.username,
      user.email || null,
      passwordHash,
      user.full_name || null,
      user.is_active !== false ? 1 : 0,
      user.is_superuser ? 1 : 0,
      now,
      now
    );
    
    return this.findById(result.lastInsertRowid as number)!;
  },

  findById(id: number): User | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      is_active: row.is_active === 1,
      is_superuser: row.is_superuser === 1,
    } as User;
  },

  findByUsername(username: string): User | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!row) return null;
    return {
      ...row,
      is_active: row.is_active === 1,
      is_superuser: row.is_superuser === 1,
    } as User;
  },

  findByEmail(email: string): User | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!row) return null;
    return {
      ...row,
      is_active: row.is_active === 1,
      is_superuser: row.is_superuser === 1,
    } as User;
  },

  findAll(): User[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
    return rows.map(row => ({
      ...row,
      is_active: row.is_active === 1,
      is_superuser: row.is_superuser === 1,
    })) as User[];
  },

  async update(id: number, updates: {
    email?: string;
    password?: string;
    full_name?: string;
    is_active?: boolean;
    is_superuser?: boolean;
  }): Promise<User> {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.password) {
      const passwordHash = await bcrypt.hash(updates.password, 10);
      fields.push('password_hash = ?');
      values.push(passwordHash);
    }
    if (updates.full_name !== undefined) {
      fields.push('full_name = ?');
      values.push(updates.full_name);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.is_superuser !== undefined) {
      fields.push('is_superuser = ?');
      values.push(updates.is_superuser ? 1 : 0);
    }

    if (fields.length === 0) {
      return this.findById(id)!;
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
    values.push(id);

    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id)!;
  },

  async updateLastLogin(id: number): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, id);
  },

  delete(id: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password_hash);
  },
};

export const RoleModel = {
  findAll(): Role[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM roles ORDER BY name').all() as Role[];
  },

  findById(id: number): Role | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as Role | null;
  },

  findByName(name: string): Role | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM roles WHERE name = ?').get(name) as Role | null;
  },

  getUserRoles(userId: number): Role[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT r.* FROM roles r
      INNER JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `).all(userId) as Role[];
  },

  assignRole(userId: number, roleId: number): void {
    const db = getDatabase();
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId);
  },

  removeRole(userId: number, roleId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?').run(userId, roleId);
  },

  setUserRoles(userId: number, roleIds: number[]): void {
    const db = getDatabase();
    const remove = db.prepare('DELETE FROM user_roles WHERE user_id = ?');
    remove.run(userId);
    
    const insert = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
    for (const roleId of roleIds) {
      insert.run(userId, roleId);
    }
  },
};

export const PermissionModel = {
  findAll(): Permission[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM permissions ORDER BY resource, action').all() as Permission[];
  },

  findByResource(resource: string): Permission[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM permissions WHERE resource = ? ORDER BY action').all(resource) as Permission[];
  },

  getUserPermissions(userId: number): Permission[] {
    const db = getDatabase();
    // Get permissions from roles and direct user permissions
    return db.prepare(`
      SELECT DISTINCT p.* FROM permissions p
      WHERE p.id IN (
        SELECT permission_id FROM role_permissions rp
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
        UNION
        SELECT permission_id FROM user_permissions WHERE user_id = ?
      )
    `).all(userId, userId) as Permission[];
  },

  hasPermission(userId: number, permissionName: string): boolean {
    const db = getDatabase();
    const user = UserModel.findById(userId);
    if (!user) return false;
    if (user.is_superuser) return true; // Superusers have all permissions
    
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM permissions p
      WHERE p.name = ? AND p.id IN (
        SELECT permission_id FROM role_permissions rp
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
        UNION
        SELECT permission_id FROM user_permissions WHERE user_id = ?
      )
    `).get(permissionName, userId, userId) as { count: number };
    
    return result.count > 0;
  },

  assignPermission(userId: number, permissionId: number): void {
    const db = getDatabase();
    db.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission_id) VALUES (?, ?)').run(userId, permissionId);
  },

  removePermission(userId: number, permissionId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission_id = ?').run(userId, permissionId);
  },

  setUserPermissions(userId: number, permissionIds: number[]): void {
    const db = getDatabase();
    const remove = db.prepare('DELETE FROM user_permissions WHERE user_id = ?');
    remove.run(userId);
    
    const insert = db.prepare('INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)');
    for (const permId of permissionIds) {
      insert.run(userId, permId);
    }
  },

  getRolePermissions(roleId: number): Permission[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT p.* FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(roleId) as Permission[];
  },
};

export const SessionModel = {
  create(userId: number, expiresInHours: number = 24): Session {
    const db = getDatabase();
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    const expiresAtStr = expiresAt.toISOString().replace('T', ' ').slice(0, 19);
    
    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(sessionId, userId, expiresAtStr);
    
    return this.findById(sessionId)!;
  },

  findById(id: string): Session | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime(\'now\')').get(id) as Session | null;
  },

  findByUserId(userId: number): Session[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > datetime(\'now\') ORDER BY created_at DESC').all(userId) as Session[];
  },

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  deleteByUserId(userId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  cleanupExpired(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')').run();
  },
};
