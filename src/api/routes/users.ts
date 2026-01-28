import { Router, Response } from 'express';
import { UserModel, RoleModel, PermissionModel } from '../../database/user-models.js';
import { AuthRequest, requireAuth, requirePermission } from '../../utils/auth.js';
import { parseParamInt } from '../../utils/params.js';
import { logger } from '../../utils/logger.js';
import { enqueueJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';

export const userRoutes = Router();

// Roles & permissions (order matters to avoid :id conflicts)
userRoutes.get('/roles/all', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const roles = await RoleModel.findAll();
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role) => {
        const permissions = await RoleModel.getRolePermissions(role.id);
        return {
          ...role,
          permissions: permissions.map((p) => ({ id: p.id, name: p.name })),
        };
      })
    );
    return res.json(rolesWithPermissions);
  } catch (error) {
    logger.error('Error fetching roles:', error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

userRoutes.get('/permissions/all', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const permissions = await PermissionModel.findAll();
    return res.json(permissions);
  } catch (error) {
    logger.error('Error fetching permissions:', error);
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

userRoutes.post('/roles', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, permission_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'roles.create',
      category: 'roles',
      message: `Create role ${name}`,
      source,
      created_by,
      payload: { name, description, permission_ids, meta },
      target_type: 'role',
      target_id: name,
    });

    logger.info(`Role queued: ${name}`, { jobId: job.id, createdBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error creating role:', error);
    return res.status(500).json({ error: 'Failed to create role' });
  }
});

userRoutes.patch('/roles/:id', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid role id' });
    }

    const role = await RoleModel.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const { name, description, permission_ids } = req.body;
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'roles.update',
      category: 'roles',
      message: `Update role ${role.name}`,
      source,
      created_by,
      payload: { id, name, description, permission_ids, meta },
      target_type: 'role',
      target_id: String(id),
    });

    logger.info(`Role update queued: ${role.name}`, { jobId: job.id, updatedBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating role:', error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

userRoutes.delete('/roles/:id', requireAuth, requirePermission('users.manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid role id' });
    }

    const role = await RoleModel.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'roles.delete',
      category: 'roles',
      message: `Delete role ${role.name}`,
      source,
      created_by,
      payload: { id, meta },
      target_type: 'role',
      target_id: String(id),
    });

    logger.info(`Role delete queued: ${role.name}`, { jobId: job.id, deletedBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error deleting role:', error);
    return res.status(500).json({ error: 'Failed to delete role' });
  }
});

userRoutes.post('/permissions', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, resource, action, description } = req.body;

    if (!name || !resource || !action) {
      return res.status(400).json({ error: 'Name, resource, and action are required' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'permissions.create',
      category: 'permissions',
      message: `Create permission ${name}`,
      source,
      created_by,
      payload: { name, resource, action, description, meta },
      target_type: 'permission',
      target_id: name,
    });

    logger.info(`Permission queued: ${name}`, { jobId: job.id, createdBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error creating permission:', error);
    return res.status(500).json({ error: 'Failed to create permission' });
  }
});

userRoutes.patch('/permissions/:id', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid permission id' });
    }

    const permission = await PermissionModel.findById(id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    const { name, resource, action, description } = req.body;
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'permissions.update',
      category: 'permissions',
      message: `Update permission ${permission.name}`,
      source,
      created_by,
      payload: { id, name, resource, action, description, meta },
      target_type: 'permission',
      target_id: String(id),
    });

    logger.info(`Permission update queued: ${permission.name}`, { jobId: job.id, updatedBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating permission:', error);
    return res.status(500).json({ error: 'Failed to update permission' });
  }
});

userRoutes.delete('/permissions/:id', requireAuth, requirePermission('users.manage_permissions'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid permission id' });
    }

    const permission = await PermissionModel.findById(id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'permissions.delete',
      category: 'permissions',
      message: `Delete permission ${permission.name}`,
      source,
      created_by,
      payload: { id, meta },
      target_type: 'permission',
      target_id: String(id),
    });

    logger.info(`Permission delete queued: ${permission.name}`, { jobId: job.id, deletedBy: req.user?.id });
    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error deleting permission:', error);
    return res.status(500).json({ error: 'Failed to delete permission' });
  }
});

// Users
userRoutes.get('/', requireAuth, requirePermission('users.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const users = await UserModel.findAll();
    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roles = await RoleModel.getUserRoles(user.id);
        return {
          ...user,
          roles: roles.map((r) => ({ id: r.id, name: r.name })),
        };
      })
    );
    return res.json(usersWithRoles);
  } catch (error) {
    logger.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

userRoutes.get('/:id', requireAuth, requirePermission('users.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const roles = await RoleModel.getUserRoles(user.id);
    const permissions = await PermissionModel.getUserPermissions(user.id);
    const allPermissions = await PermissionModel.findAll();

    return res.json({
      ...user,
      roles: roles.map((r) => ({ id: r.id, name: r.name, description: r.description })),
      permissions: permissions.map((p) => ({ id: p.id, name: p.name, resource: p.resource, action: p.action })),
      allPermissions: allPermissions.map((p) => ({
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

userRoutes.post('/', requireAuth, requirePermission('users.create'), async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, full_name, role_ids, permission_ids } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'users.create',
      category: 'users',
      message: `Create user ${username}`,
      source,
      created_by,
      payload: { username, email, password, full_name, role_ids, permission_ids, meta },
      target_type: 'user',
      target_id: username,
    });

    logger.info(`User create queued: ${username}`, { jobId: job.id, createdBy: req.user?.id });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error creating user:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

userRoutes.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isSelf = req.user?.id === id;
    if (!isSelf && !(await PermissionModel.hasPermission(req.user!.id, 'users.edit'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { email, password, full_name, is_active, is_superuser, role_ids, permission_ids } = req.body;

    const updates: any = {};
    if (email !== undefined) updates.email = email;
    if (password) updates.password = password;
    if (full_name !== undefined) updates.full_name = full_name;

    if (req.user?.is_superuser || (await PermissionModel.hasPermission(req.user!.id, 'users.edit'))) {
      if (is_active !== undefined) updates.is_active = is_active;
      if (is_superuser !== undefined) updates.is_superuser = is_superuser;
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'users.update',
      category: 'users',
      message: `Update user ${user.username}`,
      source,
      created_by,
      payload: { id, ...updates, role_ids, permission_ids, meta },
      target_type: 'user',
      target_id: String(id),
    });

    logger.info(`User update queued: ${user.username}`, { jobId: job.id, updatedBy: req.user?.id });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating user:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

userRoutes.delete('/:id', requireAuth, requirePermission('users.delete'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseParamInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (req.user?.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'users.delete',
      category: 'users',
      message: `Delete user ${user.username}`,
      source,
      created_by,
      payload: { id, meta },
      target_type: 'user',
      target_id: String(id),
    });

    logger.info(`User delete queued: ${user.username}`, { jobId: job.id, deletedBy: req.user?.id });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});
