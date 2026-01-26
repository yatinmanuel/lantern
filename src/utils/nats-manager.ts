import { connect, NatsConnection, JSONCodec, JetStreamClient, JetStreamManager, RetentionPolicy, StorageType, AckPolicy } from 'nats';
import { logger } from './logger.js';

/**
 * NATS Manager for high-concurrency task delivery
 * Handles 100+ clients efficiently with message queuing
 */
export class NATSManager {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private jsonCodec = JSONCodec();
  private connected = false;

  /**
   * Connect to NATS server
   */
  async connect(natsUrl?: string): Promise<void> {
    if (this.connected && this.nc) {
      logger.info('NATS already connected');
      return;
    }

    const url = natsUrl || process.env.NATS_URL || 'nats://localhost:4222';
    const tlsOptions = this.buildTlsOptions(url);
    logger.info(`Connecting to NATS at ${url}...`);

    try {
      this.nc = await connect({
        servers: [url],
        reconnect: true,
        maxReconnectAttempts: -1, // Infinite reconnects
        ...(tlsOptions ? { tls: tlsOptions } : {}),
      });

      this.nc.closed().then(() => {
        logger.warn('NATS connection closed');
        this.connected = false;
      });

      // Initialize JetStream for message persistence
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();

      // Create stream for task delivery (if it doesn't exist)
      await this.ensureStream();

      this.connected = true;
      logger.info('NATS connected successfully');
    } catch (error) {
      logger.error('Failed to connect to NATS:', error);
      throw error;
    }
  }

  /**
   * Ensure the tasks stream exists
   */
  private async ensureStream(): Promise<void> {
    if (!this.jsm) {
      throw new Error('JetStream manager not initialized');
    }

    try {
      // Check if stream exists
      await this.jsm.streams.info('PXE_TASKS');
      logger.info('NATS stream PXE_TASKS already exists');
    } catch (error: any) {
      // Stream doesn't exist, create it
      if (error.code === '404' || error.message?.includes('not found')) {
        logger.info('Creating NATS stream PXE_TASKS...');
        await this.jsm.streams.add({
          name: 'PXE_TASKS',
          subjects: ['pxe.tasks.>'], // Wildcard for all task subjects
          retention: RetentionPolicy.Limits, // Keep messages until consumed
          max_age: 3600000000000, // 1 hour TTL in nanoseconds (3600 seconds * 1e9)
          storage: StorageType.File,
          max_msgs: 10000, // Max 10k messages per subject
        });
        logger.info('NATS stream PXE_TASKS created');
      } else {
        throw error;
      }
    }
  }

  /**
   * Subscribe to tasks for a specific MAC address
   * Note: This is for server-side subscriptions. Clients use the Go binary.
   */
  async subscribeToTasks(macAddress: string, callback: (task: any) => void): Promise<void> {
    if (!this.js) {
      throw new Error('NATS not connected. Call connect() first.');
    }

    const subject = `pxe.tasks.${macAddress}`;
    logger.info(`Subscribing to tasks for ${macAddress} on subject ${subject}`);

    // Create consumer with durable name (survives reconnects)
    const consumerName = `pxe-agent-${macAddress}`;

    // Create or get consumer using JetStreamManager
    if (!this.jsm) {
      throw new Error('JetStream manager not initialized');
    }

    try {
      await this.jsm.consumers.info('PXE_TASKS', consumerName);
      logger.info(`Using existing consumer ${consumerName}`);
    } catch (error: any) {
      if (error.code === '404' || error.message?.includes('not found')) {
        // Create new consumer
        logger.info(`Creating consumer ${consumerName}`);
        await this.jsm.consumers.add('PXE_TASKS', {
          durable_name: consumerName,
          filter_subject: subject,
          ack_policy: AckPolicy.Explicit, // Require explicit ack
          max_deliver: 3, // Retry up to 3 times
        });
      } else {
        throw error;
      }
    }

    // Subscribe using pull consumer
    const consumer = await this.js.consumers.get('PXE_TASKS', consumerName);
    
    // Process messages in a loop using consume()
    const messages = await consumer.consume();
    (async () => {
      for await (const msg of messages) {
        try {
          const task = this.jsonCodec.decode(msg.data) as any;
          logger.info(`Received task ${task.id} for ${macAddress} via NATS`);
          
          // Call the callback
          await callback(task);
          
          // Acknowledge the message
          msg.ack();
        } catch (error) {
          logger.error(`Error processing task for ${macAddress}:`, error);
          // Don't ack, let it retry
        }
      }
    })().catch((error) => {
      logger.error(`Error in consumer loop for ${macAddress}:`, error);
    });

    logger.info(`Subscribed to tasks for ${macAddress}`);
  }

  /**
   * Publish a task to a specific MAC address
   */
  async publishTask(macAddress: string, task: any): Promise<boolean> {
    if (!this.js) {
      logger.error('NATS not connected');
      return false;
    }

    const subject = `pxe.tasks.${macAddress}`;
    
    try {
      const data = this.jsonCodec.encode(task);
      await this.js.publish(subject, data);
      logger.info(`Published task ${task.id} to ${macAddress} via NATS`);
      return true;
    } catch (error) {
      logger.error(`Failed to publish task to ${macAddress}:`, error);
      return false;
    }
  }

  /**
   * Check if NATS is connected
   */
  isConnected(): boolean {
    return this.connected && this.nc !== null && !this.nc.isClosed();
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.js = null;
      this.jsm = null;
      this.connected = false;
      logger.info('NATS disconnected');
    }
  }

  /**
   * Get connection status info
   */
  getStatus(): { connected: boolean; server?: string } {
    return {
      connected: this.isConnected(),
      server: this.nc?.getServer() || undefined,
    };
  }

  private buildTlsOptions(url: string): {
    caFile?: string;
    certFile?: string;
    keyFile?: string;
    handshakeFirst?: boolean;
  } | undefined {
    const caFile = process.env.NATS_TLS_CA;
    const certFile = process.env.NATS_TLS_CERT;
    const keyFile = process.env.NATS_TLS_KEY;
    const handshakeFirst = process.env.NATS_TLS_HANDSHAKE_FIRST === 'true';

    const useTls =
      url.startsWith('tls://') ||
      Boolean(caFile || certFile || keyFile || handshakeFirst);

    if (!useTls) {
      return undefined;
    }

    const tlsOptions: {
      caFile?: string;
      certFile?: string;
      keyFile?: string;
      handshakeFirst?: boolean;
    } = {};

    if (caFile) tlsOptions.caFile = caFile;
    if (certFile) tlsOptions.certFile = certFile;
    if (keyFile) tlsOptions.keyFile = keyFile;
    if (handshakeFirst) tlsOptions.handshakeFirst = true;

    return Object.keys(tlsOptions).length ? tlsOptions : {};
  }
}

// Singleton instance
export const natsManager = new NATSManager();
