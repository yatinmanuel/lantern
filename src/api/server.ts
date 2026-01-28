import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { serverRoutes } from './routes/servers.js';
import { taskRoutes } from './routes/tasks.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createServer(): Promise<express.Application> {
  const app = express();

  // CORS configuration - must be before other middleware
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost:3001',
        'http://localhost:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3000',
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins in dev, restrict in production
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Session-Id'],
    exposedHeaders: ['Set-Cookie'],
  }));

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Request logging (skip static assets)
  app.use((req, _res, next) => {
    if (!req.path.startsWith('/_next') && !req.path.startsWith('/static') && !req.path.startsWith('/api')) {
      logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    }
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve agent scripts
  const agentsPath = path.join(__dirname, '../agents');
  app.use('/agents', express.static(agentsPath));
  app.use('/api/agents', express.static(agentsPath));

  // Handle trailing slashes for API routes (redirect /path/ to /path) - must be before route registration
  app.use('/api', (req, res, next) => {
    if (req.path.endsWith('/') && req.path.length > 1) {
      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      return res.redirect(301, req.path.slice(0, -1) + queryString);
    }
    next();
  });

  // API routes (must be before static file serving)
  // Import auth routes (dynamic import)
  const authModule = await import('./routes/auth.js');
  app.use('/api/auth', authModule.authRoutes);
  
  // Import user management routes (dynamic import)
  const usersModule = await import('./routes/users.js');
  app.use('/api/users', usersModule.userRoutes);
  
  app.use('/api/servers', serverRoutes);
  app.use('/api/tasks', taskRoutes);
  
  // Import config routes (dynamic import)
  const configModule = await import('./routes/config.js');
  app.use('/api/config', configModule.configRoutes);

  // Import ISO routes (dynamic import)
  const isoModule = await import('./routes/isos.js');
  app.use('/api/isos', isoModule.isoRoutes);

  // Import job routes (dynamic import)
  const jobsModule = await import('./routes/jobs.js');
  app.use('/api/jobs', jobsModule.jobRoutes);

  const webRoot = process.env.WEB_ROOT || '/var/www/html';
  const ipxePath = process.env.IPXE_ROOT || path.join(webRoot, 'ipxe');
  const isoPath = process.env.ISO_DIR || path.join(webRoot, 'iso');

  if (!fs.existsSync(ipxePath)) {
    fs.mkdirSync(ipxePath, { recursive: true });
  }
  if (!fs.existsSync(isoPath)) {
    fs.mkdirSync(isoPath, { recursive: true });
  }

  // Serve iPXE files
  app.use('/ipxe', express.static(ipxePath, {
    maxAge: '1y',
    etag: false,
    dotfiles: 'allow',
  }));

  // Serve ISO files
  app.use('/iso', express.static(isoPath, {
    maxAge: '1h',
    etag: true,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    },
  }));

  const isProduction = process.env.NODE_ENV === 'production';
  const webOutPath = path.join(__dirname, '../../web/out');

  if (isProduction && fs.existsSync(webOutPath)) {
    // Serve Next.js static export
    app.use(express.static(webOutPath, {
      maxAge: '1y',
      etag: false,
    }));

    // Handle Next.js client-side routing - serve index.html for all non-API routes
    // Express 5 (path-to-regexp) does not accept bare '*' patterns; use regex.
    app.get(/.*/, (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api')) {
        return next();
      }

      // Skip health check
      if (req.path === '/health') {
        return next();
      }

      // Try to serve the requested file
      let filePath: string;
      if (req.path === '/') {
        filePath = path.join(webOutPath, 'index.html');
      } else if (req.path.endsWith('.html')) {
        filePath = path.join(webOutPath, req.path);
      } else {
        // For routes like /servers, try /servers/index.html
        filePath = path.join(webOutPath, req.path, 'index.html');
      }

      res.sendFile(filePath, (err) => {
        if (err) {
          // Fallback to root index.html for client-side routing
          res.sendFile(path.join(webOutPath, 'index.html'), (err2) => {
            if (err2) {
              logger.error('Failed to serve dashboard:', err2);
              res.status(404).json({ error: 'Not found' });
            }
          });
        }
      });
    });
  } else if (!isProduction) {
    logger.info('Skipping dashboard static serving in development mode');
  } else {
    logger.warn(`Dashboard build not found at ${webOutPath}; skipping static serving`);
  }

  // Error handling
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
