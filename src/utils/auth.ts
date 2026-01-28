import { Request, Response, NextFunction } from 'express';
import { UserModel, SessionModel, PermissionModel } from '../database/user-models.js';

export type AuthRequest = Request;

/**
 * Middleware to require authentication
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // Check cookie first, then header (for cross-origin fallback), then Authorization header, then query param (SSE)
  const querySession = typeof req.query?.session_id === 'string' ? req.query.session_id : undefined;
  const sessionId = req.cookies?.session_id 
    || (req.headers['x-session-id'] as string)
    || req.headers.authorization?.replace('Bearer ', '')
    || querySession;
  
  // Log for debugging (remove in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Auth] requireAuth:', {
      hasCookie: !!req.cookies?.session_id,
      hasHeader: !!req.headers['x-session-id'],
      hasAuth: !!req.headers.authorization,
      sessionId: sessionId ? sessionId.substring(0, 10) + '...' : null,
    });
  }
  
  if (!sessionId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = await SessionModel.findById(sessionId);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const user = await UserModel.findById(session.user_id);
  if (!user || !user.is_active) {
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    is_active: user.is_active,
    is_superuser: user.is_superuser,
  };
  req.authSession = session;

  next();
}

/**
 * Middleware to require a specific permission
 */
export function requirePermission(permissionName: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Superusers bypass permission checks
    if (req.user.is_superuser) {
      next();
      return;
    }

    if (!(await PermissionModel.hasPermission(req.user.id, permissionName))) {
      res.status(403).json({ error: `Permission denied: ${permissionName}` });
      return;
    }

    next();
  };
}

/**
 * Middleware to require any of the specified permissions
 */
export function requireAnyPermission(...permissionNames: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Superusers bypass permission checks
    if (req.user.is_superuser) {
      next();
      return;
    }

    for (const perm of permissionNames) {
      if (await PermissionModel.hasPermission(req.user!.id, perm)) {
        next();
        return;
      }
    }

    res.status(403).json({ error: `Permission denied: requires one of ${permissionNames.join(', ')}` });
  };
}

/**
 * Get current user from request (optional, doesn't fail if not authenticated)
 */
export async function getCurrentUser(req: AuthRequest): Promise<typeof req.user> {
  // Check cookie first, then header (for cross-origin fallback), then Authorization header, then query param (SSE)
  const querySession = typeof req.query?.session_id === 'string' ? req.query.session_id : undefined;
  const sessionId = req.cookies?.session_id 
    || (req.headers['x-session-id'] as string)
    || req.headers.authorization?.replace('Bearer ', '')
    || querySession;
  if (!sessionId) return undefined;

  const session = await SessionModel.findById(sessionId);
  if (!session) return undefined;

  const user = await UserModel.findById(session.user_id);
  if (!user || !user.is_active) return undefined;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    is_active: user.is_active,
    is_superuser: user.is_superuser,
  };
}
