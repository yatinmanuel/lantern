import { initDatabase, closeDatabase } from './database/index.js';
import { createServer } from './api/server.js';
import { ServerCleanupService } from './utils/cleanup.js';
import { natsManager } from './utils/nats-manager.js';
import { logger } from './utils/logger.js';
import { generateIpxeMenu } from './utils/ipxe.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;
const CLEANUP_TIMEOUT_SECONDS = parseInt(process.env.CLEANUP_TIMEOUT_SECONDS || '1800', 10); // 30 minutes
const CLEANUP_CHECK_INTERVAL_SECONDS = parseInt(process.env.CLEANUP_CHECK_INTERVAL_SECONDS || '30', 10);

let cleanupService: ServerCleanupService | null = null;

async function main() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Generate iPXE menu on startup
    try {
      await generateIpxeMenu();
    } catch (error) {
      logger.warn('Failed to generate iPXE menu on startup:', error);
    }

    // Connect to NATS
    const natsDisabled = process.env.NATS_DISABLED === 'true';
    if (natsDisabled) {
      logger.info('NATS disabled via NATS_DISABLED=true');
    } else {
      try {
        await natsManager.connect();
        logger.info('NATS connected');
      } catch (error) {
        logger.warn('Failed to connect to NATS, continuing without it:', error);
        logger.warn('Task delivery will fall back to HTTP polling');
      }
    }

    // Create and start Express server
    const app = await createServer();
    const server = app.listen(PORT, () => {
      logger.info(`PXE Server listening on port ${PORT}`);
    });

    // Start cleanup service
    cleanupService = new ServerCleanupService(
      CLEANUP_TIMEOUT_SECONDS,
      CLEANUP_CHECK_INTERVAL_SECONDS
    );
    cleanupService.start();

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      if (cleanupService) {
        cleanupService.stop();
      }
      await natsManager.disconnect();
      server.close(() => {
        closeDatabase();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
