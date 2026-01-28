import { getPool } from './index.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
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

function mapUser(row: any): User {
  return {
    ...row,
    is_active: row.is_active === true,
    is_superuser: row.is_superuser === true,
  } as User;
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
    const db = getPool();
    const passwordHash = await bcrypt.hash(user.password, 10);
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, is_active, is_superuser)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        user.username,
        user.email || null,
        passwordHash,
        user.full_name || null,
        user.is_active !== false,
        !!user.is_superuser,
      ]
    );
    return mapUser(result.rows[0]);
  },

  async findById(id: number): Promise<User | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapUser(result.rows[0]);
  },

  async findByUsername(username: string): Promise<User | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return null;
    return mapUser(result.rows[0]);
  },

  async findByEmail(email: string): Promise<User | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return null;
    return mapUser(result.rows[0]);
  },

  async findAll(): Promise<User[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map(mapUser);
  },

  async update(id: number, updates: {
    email?: string;
    password?: string;
    full_name?: string;
    is_active?: boolean;
    is_superuser?: boolean;
  }): Promise<User> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(updates.email);
    }
    if (updates.password) {
      const passwordHash = await bcrypt.hash(updates.password, 10);
      fields.push(`password_hash = $${idx++}`);
      values.push(passwordHash);
    }
    if (updates.full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(updates.full_name);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(!!updates.is_active);
    }
    if (updates.is_superuser !== undefined) {
      fields.push(`is_superuser = $${idx++}`);
      values.push(!!updates.is_superuser);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return mapUser(result.rows[0]);
  },

  async updateLastLogin(id: number): Promise<void> {
    const db = getPool();
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]);
  },

  async delete(id: number): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password_hash);
  },
};

export const RoleModel = {
  async findAll(): Promise<Role[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM roles ORDER BY name');
    return result.rows as Role[];
  },

  async findById(id: number): Promise<Role | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM roles WHERE id = $1', [id]);
    return (result.rows[0] as Role) || null;
  },

  async findByName(name: string): Promise<Role | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM roles WHERE name = $1', [name]);
    return (result.rows[0] as Role) || null;
  },

  async create(name: string, description?: string | null): Promise<Role> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO roles (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [name, description || null]
    );
    return result.rows[0] as Role;
  },

  async update(id: number, updates: { name?: string; description?: string | null }): Promise<Role | null> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await db.query(
      `UPDATE roles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return (result.rows[0] as Role) || null;
  },

  async delete(id: number): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM roles WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async getUserRoles(userId: number): Promise<Role[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.name`,
      [userId]
    );
    return result.rows as Role[];
  },

  async getRolePermissions(roleId: number): Promise<Permission[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT p.* FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.resource, p.action`,
      [roleId]
    );
    return result.rows as Permission[];
  },

  async addUserRole(userId: number, roleId: number): Promise<void> {
    const db = getPool();
    await db.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, roleId]
    );
  },

  async removeUserRole(userId: number, roleId: number): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [userId, roleId]);
  },

  async setUserRoles(userId: number, roleIds: number[]): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    for (const roleId of roleIds) {
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
    }
  },

  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const permissionId of permissionIds) {
      await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [roleId, permissionId]);
    }
  },
};

export const PermissionModel = {
  async findAll(): Promise<Permission[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM permissions ORDER BY resource, action');
    return result.rows as Permission[];
  },

  async findByResource(resource: string): Promise<Permission[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM permissions WHERE resource = $1 ORDER BY action', [resource]);
    return result.rows as Permission[];
  },

  async findById(id: number): Promise<Permission | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM permissions WHERE id = $1', [id]);
    return (result.rows[0] as Permission) || null;
  },

  async findByName(name: string): Promise<Permission | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM permissions WHERE name = $1', [name]);
    return (result.rows[0] as Permission) || null;
  },

  async create(input: { name: string; resource: string; action: string; description?: string | null }): Promise<Permission> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO permissions (name, resource, action, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.resource, input.action, input.description || null]
    );
    return result.rows[0] as Permission;
  },

  async update(id: number, updates: { name?: string; resource?: string; action?: string; description?: string | null }): Promise<Permission | null> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.resource !== undefined) {
      fields.push(`resource = $${idx++}`);
      values.push(updates.resource);
    }
    if (updates.action !== undefined) {
      fields.push(`action = $${idx++}`);
      values.push(updates.action);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await db.query(
      `UPDATE permissions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return (result.rows[0] as Permission) || null;
  },

  async delete(id: number): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM permissions WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async getUserPermissions(userId: number): Promise<Permission[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT DISTINCT p.* FROM permissions p
       LEFT JOIN user_permissions up ON p.id = up.permission_id
       LEFT JOIN user_roles ur ON ur.user_id = $1
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       WHERE up.user_id = $1 OR rp.permission_id = p.id
       ORDER BY p.resource, p.action`,
      [userId]
    );
    return result.rows as Permission[];
  },

  async hasPermission(userId: number, permissionName: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query(
      `SELECT 1 FROM permissions p
       LEFT JOIN user_permissions up ON p.id = up.permission_id
       LEFT JOIN user_roles ur ON ur.user_id = $1
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       WHERE p.name = $2 AND (up.user_id = $1 OR rp.permission_id = p.id)
       LIMIT 1`,
      [userId, permissionName]
    );
    return result.rows.length > 0;
  },

  async addUserPermission(userId: number, permissionId: number): Promise<void> {
    const db = getPool();
    await db.query(
      'INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, permissionId]
    );
  },

  async removeUserPermission(userId: number, permissionId: number): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2', [userId, permissionId]);
  },

  async setUserPermissions(userId: number, permissionIds: number[]): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
    for (const permissionId of permissionIds) {
      await db.query('INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2)', [userId, permissionId]);
    }
  },
};

export const SessionModel = {
  async create(userId: number, ttlSeconds: number = 86400): Promise<Session> {
    const db = getPool();
    const sessionId = randomBytes(32).toString('hex');
    const result = await db.query(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)
       RETURNING *`,
      [sessionId, userId, ttlSeconds]
    );
    return result.rows[0] as Session;
  },

  async findById(id: string): Promise<Session | null> {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [id]
    );
    return (result.rows[0] as Session) || null;
  },

  async findByUser(userId: number): Promise<Session[]> {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC',
      [userId]
    );
    return result.rows as Session[];
  },

  async delete(id: string): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM sessions WHERE id = $1', [id]);
  },

  async deleteByUser(userId: number): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  },

  async cleanupExpired(): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  },
};
