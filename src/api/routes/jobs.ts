import { Router, Response } from 'express';
import { JobModel, JobLogModel, JobStatus } from '../../database/job-models.js';
import { AuthRequest, requireAuth, requirePermission } from '../../utils/auth.js';
import { jobSseManager } from '../../utils/job-sse.js';
import { getParamValue } from '../../utils/params.js';
import { normalizeStatus } from '../../jobs/service.js';
import { jobLogSseManager } from '../../utils/job-log-sse.js';

export const jobRoutes = Router();

jobRoutes.get('/stream', requireAuth, requirePermission('jobs.view'), (_req: AuthRequest, res: Response) => {
  jobSseManager.connect(res);
});

jobRoutes.get('/', requireAuth, requirePermission('jobs.view'), async (req: AuthRequest, res: Response) => {
  try {
    const statusParam = req.query.status;
    const normalizedStatuses = Array.isArray(statusParam)
      ? statusParam.map((value) => normalizeStatus(String(value))).filter(Boolean) as JobStatus[]
      : null;
    const status = normalizedStatuses && normalizedStatuses.length > 0
      ? normalizedStatuses
      : normalizeStatus(typeof statusParam === 'string' ? statusParam : undefined);

    const filters = {
      status,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      offset: req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
    };

    const jobs = await JobModel.list(filters);
    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

jobRoutes.get('/:id', requireAuth, requirePermission('jobs.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamValue(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Job id is required' });
    }
    const job = await JobModel.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(job);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch job' });
  }
});

jobRoutes.get('/:id/logs/stream', requireAuth, requirePermission('jobs.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamValue(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Job id is required' });
    }
    const job = await JobModel.findById(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    jobLogSseManager.connect(id, res);
    return res;
  } catch {
    return res.status(500).json({ error: 'Failed to stream logs' });
  }
});

jobRoutes.get('/:id/logs', requireAuth, requirePermission('jobs.view'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamValue(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Job id is required' });
    }
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 500;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const logs = await JobLogModel.listByJob(id, Number.isFinite(limit) ? limit : 500, Number.isFinite(offset) ? offset : 0);
    return res.json(logs);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});
