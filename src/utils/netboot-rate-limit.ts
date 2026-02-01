import { PXEConfigModel } from '../database/models.js';
import { logger } from './logger.js';

type LimitType = 'discovery' | 'download';

interface WindowEntry {
  timestamps: number[];
  inFlight: number;
}

const windows = new Map<string, Map<LimitType, WindowEntry>>();
const WINDOW_MS = 60 * 1000; // 1 minute

function getKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function getWindow(key: string, type: LimitType): WindowEntry {
  let byKey = windows.get(key);
  if (!byKey) {
    byKey = new Map<LimitType, WindowEntry>();
    windows.set(key, byKey);
  }
  let entry = byKey.get(type);
  if (!entry) {
    entry = { timestamps: [], inFlight: 0 };
    byKey.set(type, entry);
  }
  return entry;
}

function pruneOld(entry: WindowEntry, windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
}

/**
 * Get rate limit config from database. Returns defaults if not set.
 */
async function getLimits(): Promise<{ requestsPerMinute: number; maxConcurrentDownloads: number }> {
  const rpm = await PXEConfigModel.get('netboot_requests_per_minute_per_mirror');
  const maxConcurrent = await PXEConfigModel.get('netboot_max_concurrent_downloads');
  return {
    requestsPerMinute: Math.max(1, parseInt(rpm || '6', 10) || 6),
    maxConcurrentDownloads: Math.max(1, parseInt(maxConcurrent || '2', 10) || 2),
  };
}

/**
 * Acquire permission for a discovery request. Blocks (waits) until under the per-mirror limit.
 * Rate limiter is in-memory per process; multiple backend instances do not share limits.
 */
export async function acquireDiscovery(mirrorUrl: string): Promise<void> {
  const key = getKey(mirrorUrl);
  const entry = getWindow(key, 'discovery');
  const { requestsPerMinute } = await getLimits();

  const maxWait = 120000; // 2 minutes max wait
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    pruneOld(entry, WINDOW_MS);
    if (entry.timestamps.length < requestsPerMinute) {
      entry.timestamps.push(Date.now());
      return;
    }
    const oldest = entry.timestamps[0];
    const waitMs = Math.min(WINDOW_MS - (Date.now() - oldest) + 100, 5000);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  logger.warn('Rate limit acquireDiscovery timed out', { mirrorUrl });
  entry.timestamps.push(Date.now());
}

/**
 * Acquire permission for a download (concurrent downloads per mirror).
 * Blocks until under the per-mirror concurrent limit.
 */
export async function acquireDownload(mirrorUrl: string): Promise<() => void> {
  const key = getKey(mirrorUrl);
  const entry = getWindow(key, 'download');
  const { maxConcurrentDownloads } = await getLimits();

  const maxWait = 300000; // 5 minutes max wait
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (entry.inFlight < maxConcurrentDownloads) {
      entry.inFlight += 1;
      return () => {
        entry.inFlight = Math.max(0, entry.inFlight - 1);
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  logger.warn('Rate limit acquireDownload timed out', { mirrorUrl });
  entry.inFlight += 1;
  return () => {
    entry.inFlight = Math.max(0, entry.inFlight - 1);
  };
}
