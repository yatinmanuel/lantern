import { initDatabase, closeDatabase } from '../database/index.js';
import { claimJob, markJobCompleted, markJobFailed, requeueJob, shouldRetry, computeNextRun, appendJobLog } from './service.js';
import type { Job } from '../database/job-models.js';
import { runJobHandler } from './handlers.js';
import { natsManager } from '../utils/nats-manager.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = parseInt(process.env.JOB_POLL_INTERVAL_MS || '1000', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.JOB_WORKER_CONCURRENCY || '2', 10));

let shuttingDown = false;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleJob(job: Job): Promise<void> {
  try {
    await appendJobLog(job.id, `Started ${job.type}`);
    const result = await runJobHandler(job);
    await markJobCompleted(job.id, result ?? null, 'Completed');
    await appendJobLog(job.id, `Completed ${job.type}`);
    logger.info('Job completed', { jobId: job.id, type: job.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Job failed', { jobId: job.id, type: job.type, error: message });
    if (shouldRetry(job, error instanceof Error ? error : new Error(message))) {
      const nextRunAt = computeNextRun(job.attempts);
      await appendJobLog(job.id, `Retry scheduled: ${message}`, 'warn');
      await requeueJob(job.id, nextRunAt, message, 'Retry scheduled');
    } else {
      await appendJobLog(job.id, `Failed: ${message}`, 'error');
      await markJobFailed(job.id, message);
    }
  }
}

async function runLoop(): Promise<void> {
  const running = new Set<Promise<void>>();

  while (!shuttingDown) {
    while (running.size < CONCURRENCY) {
      const job = await claimJob();
      if (!job) break;
      const jobPromise = handleJob(job).finally(() => {
        running.delete(jobPromise);
      });
      running.add(jobPromise);
    }

    if (running.size === 0) {
      await sleep(POLL_INTERVAL_MS);
    } else {
      await Promise.race([sleep(POLL_INTERVAL_MS), ...running]);
    }
  }

  await Promise.allSettled([...running]);
}

async function main(): Promise<void> {
  try {
    await initDatabase();
    logger.info('Worker database initialized');

    const natsDisabled = process.env.NATS_DISABLED === 'true';
    if (!natsDisabled) {
      try {
        await natsManager.connect();
        logger.info('Worker connected to NATS');
      } catch (error) {
        logger.warn('Worker failed to connect to NATS, continuing without it:', error);
      }
    }

    await runLoop();
  } catch (error) {
    logger.error('Worker failed to start:', error);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Worker shutting down...');
  try {
    await natsManager.disconnect();
  } catch {
    // ignore
  }
  await closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main();
