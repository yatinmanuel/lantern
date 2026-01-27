import { Router, Response } from 'express';
import { UserModel, SessionModel } from '../../database/user-models.js';
import { AuthRequest, requireAuth } from '../../utils/auth.js';
import { logger } from '../../utils/logger.js';

export const authRoutes = Router();

// Login
authRoutes.post('/login', async (req, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = UserModel.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    const isValid = await UserModel.verifyPassword(user, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    const session = SessionModel.create(user.id, 24 * 7); // 7 days

    // Update last login
    await UserModel.updateLastLogin(user.id);

    // Set cookie
    // Browsers reject SameSite=None without Secure. In dev (http), use Lax.
    // The frontend uses X-Session-Id as a fallback for cross-origin auth.
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info(`User logged in: ${username}`, { userId: user.id });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        is_superuser: user.is_superuser,
      },
      session_id: session.id,
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// Register (only if no users exist, or require admin permission)
authRoutes.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, full_name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if any users exist
    const allUsers = UserModel.findAll();
    const requiresAuth = allUsers.length > 0;

    if (requiresAuth) {
      // Require authentication and user management permission
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      // This will be checked by middleware in production
    }

    // Check if username already exists
    if (UserModel.findByUsername(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    if (email && UserModel.findByEmail(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Create user
    const user = await UserModel.create({
      username,
      email,
      password,
      full_name,
      is_active: true,
      is_superuser: false,
    });

    logger.info(`User registered: ${username}`, { userId: user.id });

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

// Get current user
authRoutes.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      is_superuser: user.is_superuser,
      is_active: user.is_active,
      last_login: user.last_login,
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    return res.status(500).json({ error: 'Failed to get user' });
  }
});

// Logout
authRoutes.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Check cookie first, then header (for cross-origin fallback), then Authorization header
    const sessionId = req.cookies?.session_id 
      || (req.headers['x-session-id'] as string)
      || req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionId) {
      SessionModel.delete(sessionId);
    }

    res.clearCookie('session_id');
    logger.info(`User logged out: ${req.user?.username}`);

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({ error: 'Failed to logout' });
  }
});
