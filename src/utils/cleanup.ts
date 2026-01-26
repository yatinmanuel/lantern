import { ServerModel } from '../database/models.js';
import { logger } from './logger.js';

export class ServerCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private timeoutSeconds: number;
  private checkIntervalSeconds: number;

  constructor(
    timeoutSeconds: number = 60,
    checkIntervalSeconds: number = 30
  ) {
    this.timeoutSeconds = timeoutSeconds;
    this.checkIntervalSeconds = checkIntervalSeconds;
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Cleanup service is already running');
      return;
    }
    logger.info(`Starting server cleanup service (timeout: ${this.timeoutSeconds}s, check interval: ${this.checkIntervalSeconds}s)`);
    this.cleanup();
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.checkIntervalSeconds * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Server cleanup service stopped');
    }
  }

  cleanup(): void {
    try {
      const staleServers = ServerModel.findStaleServers(this.timeoutSeconds);
      if (staleServers.length === 0) {
        return;
      }
      logger.info(`Found ${staleServers.length} stale server(s) to remove`);
      for (const server of staleServers) {
        const deleted = ServerModel.delete(server.id);
        if (deleted) {
          logger.info(`Removed stale server: ${server.mac_address} (last seen: ${server.last_seen})`);
        } else {
          logger.warn(`Failed to remove stale server: ${server.mac_address}`);
        }
      }
    } catch (error) {
      logger.error('Error during server cleanup:', error);
    }
  }
}
