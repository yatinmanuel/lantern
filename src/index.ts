import { initDatabase, closeDatabase } from './database/index.js';
import { migrateDefaultMenu, migratePoweroffToShell } from './database/migration.js';
import { createServer } from './api/server.js';
import { natsManager } from './utils/nats-manager.js';
import { logger } from './utils/logger.js';
import { generateIpxeMenu } from './utils/ipxe.js';
import { startJobNotifications, stopJobNotifications } from './jobs/notifications.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    try {
      await migrateDefaultMenu();
    } catch (error) {
      logger.warn('Failed to migrate default menu:', error);
    }
    try {
      await migratePoweroffToShell();
    } catch (error) {
      logger.warn('Failed to migrate poweroff -> shell:', error);
    }

    try {
      await seedNetbootIfEmpty();
    } catch (error) {
      logger.warn('Failed to seed netboot sources:', error);
    }
    try {
      await fixArchBootArgsTemplate();
    } catch (error) {
      logger.warn('Failed to fix Arch boot args template:', error);
    }

    await startJobNotifications();

    try {
      await enqueueJob({
        type: 'netboot.refresh',
        category: 'netboot',
        message: 'Refresh netboot versions on startup',
        source: 'system',
        created_by: null,
        payload: {},
        target_type: 'netboot',
        target_id: 'startup',
      });
    } catch (error) {
      logger.warn('Failed to enqueue netboot refresh on startup:', error);
    }

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

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await stopJobNotifications();
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
