import { JobModel, JobCreateInput, JobUpdateInput, Job, JobStatus, JobLogModel } from '../database/job-models.js';
import { notifyJobEvent } from './notifications.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MAX_ATTEMPTS = parseInt(process.env.JOB_DEFAULT_MAX_ATTEMPTS || '1', 10);
const IMAGE_CONCURRENCY_LIMIT = parseInt(process.env.JOB_IMAGES_CONCURRENCY || '1', 10);

const MAX_ATTEMPTS_BY_TYPE: Record<string, number> = {
  'images.import': 2,
  'images.extract': 2,
  'images.add': 2,
  'images.build': 2,
  'iso.extract': 2,
  'images.download': 3,
  'images.manual': 2,
  'images.attach': 2,
  'images.remote': 3,
  'images.scan': 1,
  'images.delete': 2,
};

function applyJobDefaults(input: JobCreateInput): JobCreateInput {
  const maxAttempts = input.max_attempts ?? MAX_ATTEMPTS_BY_TYPE[input.type] ?? DEFAULT_MAX_ATTEMPTS;
  let concurrencyKey = input.concurrency_key ?? null;
  let concurrencyLimit = input.concurrency_limit ?? null;

  if (!concurrencyKey && input.category === 'images') {
    concurrencyKey = 'images';
  }

  if (concurrencyKey && concurrencyLimit === null) {
    concurrencyLimit = IMAGE_CONCURRENCY_LIMIT;
  }

  return {
    ...input,
    max_attempts: maxAttempts,
    concurrency_key: concurrencyKey,
    concurrency_limit: concurrencyLimit,
  };
}

export async function enqueueJob(input: JobCreateInput): Promise<Job> {
  const job = await JobModel.create(applyJobDefaults({
    ...input,
    status: input.status || 'queued',
  }));
  await notifyJobEvent(job.id, 'created');
  logger.info('Job queued', { jobId: job.id, type: job.type, category: job.category });
  return job;
}

export async function recordJob(input: JobCreateInput): Promise<Job> {
  const job = await JobModel.create(applyJobDefaults({
    ...input,
    status: input.status || 'completed',
  }));
  await notifyJobEvent(job.id, 'recorded');
  logger.info('Job recorded', { jobId: job.id, type: job.type, category: job.category, status: job.status });
  return job;
}

export async function updateJob(id: string, updates: JobUpdateInput, event: string): Promise<Job | null> {
  const job = await JobModel.update(id, updates);
  if (job) {
    await notifyJobEvent(job.id, event);
  }
  return job;
}

export async function appendJobLog(jobId: string, message: string, level = 'info'): Promise<void> {
  await JobLogModel.create(jobId, level, message);
}

export async function claimJob(): Promise<Job | null> {
  const job = await JobModel.claimNext();
  if (job) {
    await notifyJobEvent(job.id, 'started');
  }
  return job;
}

export async function markJobCompleted(id: string, result?: Record<string, any>, message?: string): Promise<Job | null> {
  return updateJob(id, {
    status: 'completed',
    result: result ?? null,
    message: message ?? null,
    error: null,
    completed_at: new Date().toISOString(),
  }, 'completed');
}

export async function markJobFailed(id: string, error: string, message?: string): Promise<Job | null> {
  return updateJob(id, {
    status: 'failed',
    error,
    message: message ?? null,
    completed_at: new Date().toISOString(),
  }, 'failed');
}

export async function requeueJob(id: string, nextRunAt: string, error?: string, message?: string): Promise<Job | null> {
  return updateJob(id, {
    status: 'queued',
    next_run_at: nextRunAt,
    error: error ?? null,
    message: message ?? null,
  }, 'requeued');
}

export function computeNextRun(attempts: number): string {
  const baseSeconds = Math.min(60, 5 * Math.pow(2, Math.max(0, attempts - 1)));
  return new Date(Date.now() + baseSeconds * 1000).toISOString();
}

function isRetryableError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  const lowered = message.toLowerCase();
  if (lowered.includes('image already exists')) return false;
  if (lowered.includes('unsupported iso layout')) return false;
  if (lowered.includes('invalid iso')) return false;
  return true;
}

export function shouldRetry(job: Job, error: Error | string): boolean {
  if (job.max_attempts <= 0) return false;
  if (!isRetryableError(error)) return false;
  return job.attempts < job.max_attempts;
}

export function normalizeSource(source?: string, hasUser?: boolean): string {
  if (source) return source;
  return hasUser ? 'user' : 'api';
}

export function normalizeStatus(value?: string): JobStatus | undefined {
  if (!value) return undefined;
  if (['queued', 'running', 'completed', 'failed', 'pending'].includes(value)) {
    return value as JobStatus;
  }
  return undefined;
}
