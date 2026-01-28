import { Response } from 'express';
import { logger } from './logger.js';
import { ServerModel } from '../database/models.js';

/**
 * Manages Server-Sent Events (SSE) connections for real-time task delivery
 * No extra packages needed - uses standard HTTP streaming
 */
export class SSEManager {
  private connections: Map<string, Response> = new Map();

  /**
   * Register a new SSE connection for a MAC address
   */
  connect(macAddress: string, res: Response): void {
    // Remove any existing connection for this MAC
    this.disconnect(macAddress);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(': connected\n\n');
    res.flushHeaders?.();

    // Store connection
    this.connections.set(macAddress, res);
    logger.info(`SSE connection established for ${macAddress}`);

    // Handle client disconnect
    res.on('close', () => {
      logger.info(`SSE connection closed for ${macAddress}`);
      this.connections.delete(macAddress);
    });

    // Send periodic heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (this.connections.has(macAddress)) {
        try {
          res.write(': heartbeat\n\n');
          // Update last_seen timestamp to prevent stale server cleanup
          void ServerModel.updateLastSeenByMac(macAddress).catch((error) => {
            logger.warn(`Failed to update last_seen for ${macAddress}:`, error);
          });
        } catch (error) {
          logger.warn(`Failed to send heartbeat to ${macAddress}:`, error);
          clearInterval(heartbeat);
          this.connections.delete(macAddress);
        }
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Send a task to a connected client
   */
  sendTask(macAddress: string, task: any): boolean {
    const res = this.connections.get(macAddress);
    if (!res) {
      return false; // Client not connected
    }

    try {
      const data = JSON.stringify(task);
      res.write(`data: ${data}\n\n`);
      logger.info(`Sent task ${task.id} to ${macAddress} via SSE`);
      return true;
    } catch (error) {
      logger.error(`Failed to send task to ${macAddress}:`, error);
      this.connections.delete(macAddress);
      return false;
    }
  }

  /**
   * Send multiple tasks to a connected client
   */
  sendTasks(macAddress: string, tasks: any[]): boolean {
    const res = this.connections.get(macAddress);
    if (!res) {
      return false; // Client not connected
    }

    try {
      for (const task of tasks) {
        const data = JSON.stringify(task);
        res.write(`data: ${data}\n\n`);
      }
      logger.info(`Sent ${tasks.length} task(s) to ${macAddress} via SSE`);
      return true;
    } catch (error) {
      logger.error(`Failed to send tasks to ${macAddress}:`, error);
      this.connections.delete(macAddress);
      return false;
    }
  }

  /**
   * Disconnect a client
   */
  disconnect(macAddress: string): void {
    const res = this.connections.get(macAddress);
    if (res) {
      try {
        res.end();
      } catch (error) {
        // Ignore errors on disconnect
      }
      this.connections.delete(macAddress);
      logger.info(`SSE connection disconnected for ${macAddress}`);
    }
  }

  /**
   * Check if a client is connected
   */
  isConnected(macAddress: string): boolean {
    return this.connections.has(macAddress);
  }

  /**
   * Get all connected MAC addresses
   */
  getConnectedClients(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): void {
    for (const macAddress of this.connections.keys()) {
      this.disconnect(macAddress);
    }
  }
}

// Singleton instance
export const sseManager = new SSEManager();
