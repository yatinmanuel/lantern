import { Router, Response } from 'express';
import { UserModel, RoleModel, PermissionModel, Permission } from '../../database/user-models.js';
import { getDatabase } from '../../database/index.js';
import { AuthRequest, requireAuth, requirePermission } from '../../utils/auth.js';
import { parseParamInt } from '../../utils/params.js';
import { logger } from '../../utils/logger.js';

export const userRoutes = Router();

// Get all users (requires users.view permission)
userRoutes.get('/', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const users = UserModel.findAll();
    const usersWithRoles = users.map(user => {
      const roles = RoleModel.getUserRoles(user.id);
      return {
        ...user,
        roles: roles.map(r => ({ id: r.id, name: r.name })),
      };
    });
    return res.json(usersWithRoles);
  } catch (error) {
    logger.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID
userRoutes.get('/:id', requireAuth, requirePermission('users.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const user = UserModel.findById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const roles = RoleModel.getUserRoles(user.id);
    const permissions = PermissionModel.getUserPermissions(user.id);
    const allPermissions = PermissionModel.findAll();

    return res.json({
      ...user,
      roles: roles.map(r => ({ id: r.id, name: r.name, description: r.description })),
      permissions: permissions.map(p => ({ id: p.id, name: p.name, resource: p.resource, action: p.action })),
      allPermissions: allPermissions.map(p => ({
        id: p.id,
        name: p.name,
        resource: p.resource,
        action: p.action,
        description: p.description,
      })),
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user
userRoutes.post('/', requireAuth, requirePermission('users.create'), async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, full_name, role_ids, permission_ids } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (UserModel.findByUsername(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    if (email && UserModel.findByEmail(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const user = await UserModel.create({
      username,
      email,
      password,
      full_name,
      is_active: true,
      is_superuser: false,
    });

    // Assign roles
    if (role_ids && Array.isArray(role_ids)) {
      RoleModel.setUserRoles(user.id, role_ids);
    }

    // Assign permissions
    if (permission_ids && Array.isArray(permission_ids)) {
      PermissionModel.setUserPermissions(user.id, permission_ids);
    }

    logger.info(`User created: ${username}`, { userId: user.id, createdBy: req.user?.id });

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
userRoutes.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const user = UserModel.findById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Users can update their own profile, but need permission for others
    const isSelf = req.user?.id === id;
    if (!isSelf && !PermissionModel.hasPermission(req.user!.id, 'users.edit')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { email, password, full_name, is_active, is_superuser, role_ids, permission_ids } = req.body;
    
    const updates: any = {};
    if (email !== undefined) updates.email = email;
    if (password) updates.password = password;
    if (full_name !== undefined) updates.full_name = full_name;
    
    // Only admins can change is_active and is_superuser
    if (req.user?.is_superuser || PermissionModel.hasPermission(req.user!.id, 'users.edit')) {
      if (is_active !== undefined) updates.is_active = is_active;
      if (is_superuser !== undefined) updates.is_superuser = is_superuser;
    }

    const updatedUser = await UserModel.update(id, updates);

    // Update roles if provided and user has permission
    if (role_ids !== undefined && (req.user?.is_superuser || PermissionModel.hasPermission(req.user!.id, 'users.manage_roles'))) {
      RoleModel.setUserRoles(id, role_ids);
    }

    // Update permissions if provided and user has permission
    if (permission_ids !== undefined && (req.user?.is_superuser || PermissionModel.hasPermission(req.user!.id, 'users.manage_permissions'))) {
      PermissionModel.setUserPermissions(id, permission_ids);
    }

    logger.info(`User updated: ${user.username}`, { userId: id, updatedBy: req.user?.id });

    return res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      is_active: updatedUser.is_active,
      is_superuser: updatedUser.is_superuser,
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
userRoutes.delete('/:id', requireAuth, requirePermission('users.delete'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    
    // Prevent self-deletion
    if (req.user?.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    UserModel.delete(id);
    logger.info(`User deleted: ${user.username}`, { userId: id, deletedBy: req.user?.id });

    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get all roles
userRoutes.get('/roles/all', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const roles = RoleModel.findAll();
    const rolesWithPermissions = roles.map(role => {
      const permissions = PermissionModel.getRolePermissions(role.id);
      return {
        ...role,
        permissions: permissions.map(p => ({ id: p.id, name: p.name })),
      };
    });
    return res.json(rolesWithPermissions);
  } catch (error) {
    logger.error('Error fetching roles:', error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get all permissions
userRoutes.get('/permissions/all', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const permissions = PermissionModel.findAll();
    return res.json(permissions);
  } catch (error) {
    logger.error('Error fetching permissions:', error);
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Create role
userRoutes.post('/roles', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, permission_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    if (RoleModel.findByName(name)) {
      return res.status(400).json({ error: 'Role name already exists' });
    }

    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result = db.prepare('INSERT INTO roles (name, description, created_at) VALUES (?, ?, ?)').run(name, description || null, now);
    const roleId = result.lastInsertRowid as number;

    // Assign permissions if provided
    if (permission_ids && Array.isArray(permission_ids)) {
      const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      for (const permId of permission_ids) {
        insert.run(roleId, permId);
      }
    }

    const role = RoleModel.findById(roleId);
    const rolePermissions = PermissionModel.getRolePermissions(roleId);
    
    logger.info(`Role created: ${name}`, { roleId, createdBy: req.user?.id });
    return res.status(201).json({
      ...role,
      permissions: rolePermissions.map(p => ({ id: p.id, name: p.name })),
    });
  } catch (error) {
    logger.error('Error creating role:', error);
    return res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update role
userRoutes.patch('/roles/:id', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const role = RoleModel.findById(id);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const { name, description, permission_ids } = req.body;
    const db = getDatabase();
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined && name !== role.name) {
      if (RoleModel.findByName(name) && name !== role.name) {
        return res.status(400).json({ error: 'Role name already exists' });
      }
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    // Update permissions if provided
    if (permission_ids !== undefined && Array.isArray(permission_ids)) {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
      const insert = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      for (const permId of permission_ids) {
        insert.run(id, permId);
      }
    }

    const updatedRole = RoleModel.findById(id);
    const rolePermissions = PermissionModel.getRolePermissions(id);
    
    logger.info(`Role updated: ${updatedRole?.name}`, { roleId: id, updatedBy: req.user?.id });
    return res.json({
      ...updatedRole,
      permissions: rolePermissions.map(p => ({ id: p.id, name: p.name })),
    });
  } catch (error) {
    logger.error('Error updating role:', error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
userRoutes.delete('/roles/:id', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const role = RoleModel.findById(id);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const db = getDatabase();
    // Delete role permissions first
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
    // Delete user roles
    db.prepare('DELETE FROM user_roles WHERE role_id = ?').run(id);
    // Delete role
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);
    
    logger.info(`Role deleted: ${role.name}`, { roleId: id, deletedBy: req.user?.id });
    return res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    logger.error('Error deleting role:', error);
    return res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Create permission
userRoutes.post('/permissions', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, resource, action, description } = req.body;

    if (!name || !resource || !action) {
      return res.status(400).json({ error: 'Name, resource, and action are required' });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM permissions WHERE name = ?').get(name) as Permission | null;
    if (existing) {
      return res.status(400).json({ error: 'Permission name already exists' });
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result = db.prepare('INSERT INTO permissions (name, resource, action, description, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, resource, action, description || null, now);
    
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(result.lastInsertRowid) as Permission;
    
    logger.info(`Permission created: ${name}`, { permissionId: permission.id, createdBy: req.user?.id });
    return res.status(201).json(permission);
  } catch (error) {
    logger.error('Error creating permission:', error);
    return res.status(500).json({ error: 'Failed to create permission' });
  }
});

// Update permission
userRoutes.patch('/permissions/:id', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const db = getDatabase();
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id) as Permission | null;
    
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    const { name, resource, action, description } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined && name !== permission.name) {
      const existing = db.prepare('SELECT * FROM permissions WHERE name = ? AND id != ?').get(name, id) as Permission | null;
      if (existing) {
        return res.status(400).json({ error: 'Permission name already exists' });
      }
      updates.push('name = ?');
      values.push(name);
    }
    if (resource !== undefined) {
      updates.push('resource = ?');
      values.push(resource);
    }
    if (action !== undefined) {
      updates.push('action = ?');
      values.push(action);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE permissions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id) as Permission;
    
    logger.info(`Permission updated: ${updated.name}`, { permissionId: id, updatedBy: req.user?.id });
    return res.json(updated);
  } catch (error) {
    logger.error('Error updating permission:', error);
    return res.status(500).json({ error: 'Failed to update permission' });
  }
});

// Delete permission
userRoutes.delete('/permissions/:id', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    const db = getDatabase();
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id) as Permission | null;
    
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    // Delete from role_permissions and user_permissions first
    db.prepare('DELETE FROM role_permissions WHERE permission_id = ?').run(id);
    db.prepare('DELETE FROM user_permissions WHERE permission_id = ?').run(id);
    // Delete permission
    db.prepare('DELETE FROM permissions WHERE id = ?').run(id);
    
    logger.info(`Permission deleted: ${permission.name}`, { permissionId: id, deletedBy: req.user?.id });
    return res.json({ message: 'Permission deleted successfully' });
  } catch (error) {
    logger.error('Error deleting permission:', error);
    return res.status(500).json({ error: 'Failed to delete permission' });
  }
});
