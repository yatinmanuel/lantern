import { AuthRequest } from '../utils/auth.js';
import { normalizeSource } from './service.js';

export function buildJobMeta(req: AuthRequest): { source: string; created_by: number | null; meta: Record<string, any> } {
  const source = normalizeSource(undefined, !!req.user);
  const created_by = req.user?.id ?? null;
  const meta = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'],
  };
  return { source, created_by, meta };
}
