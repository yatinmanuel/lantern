import type { PoolClient, Notification } from 'pg';
import { getPool } from '../database/index.js';
import { JobModel, JobLogModel } from '../database/job-models.js';
import { jobSseManager } from '../utils/job-sse.js';
import { jobLogSseManager } from '../utils/job-log-sse.js';
import { logger } from '../utils/logger.js';

let listenerClient: PoolClient | null = null;
let listening = false;

export async function notifyJobEvent(jobId: string, event: string): Promise<void> {
  const payload = JSON.stringify({ jobId, event });
  const db = getPool();
  await db.query('SELECT pg_notify($1, $2)', ['job_events', payload]);
}

export async function startJobNotifications(): Promise<void> {
  if (listening) return;
  const pool = getPool();
  listenerClient = await pool.connect();
  listening = true;

  listenerClient.on('notification', async (msg: Notification) => {
    if (!msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload) as { jobId?: string; event?: string; logId?: number };
      if (msg.channel === 'job_events') {
        if (!payload.jobId) return;
        const job = await JobModel.findById(payload.jobId);
        if (job) {
          jobSseManager.broadcast('job', job);
        }
        return;
      }

      if (msg.channel === 'job_log_events') {
        if (!payload.logId || !payload.jobId) return;
        const log = await JobLogModel.findById(payload.logId);
        if (log) {
          jobLogSseManager.broadcast(payload.jobId, 'job-log', log);
        }
      }
    } catch (error) {
      logger.warn('Failed to process job notification:', error);
    }
  });

  listenerClient.on('error', (error: Error) => {
    logger.error('Job notification listener error:', error);
  });

  await listenerClient.query('LISTEN job_events');
  await listenerClient.query('LISTEN job_log_events');
  logger.info('Job notification listener started');
}

export async function stopJobNotifications(): Promise<void> {
  if (!listenerClient) return;
  try {
    await listenerClient.query('UNLISTEN job_events');
    await listenerClient.query('UNLISTEN job_log_events');
    listenerClient.release();
  } catch (error) {
    logger.warn('Failed to stop job notifications:', error);
  } finally {
    listenerClient = null;
    listening = false;
  }
}
