import { getPool } from './index.js';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'pending';

export interface Job {
  id: string;
  type: string;
  category: string;
  status: JobStatus;
  priority: number;
  payload: Record<string, any> | null;
  result: Record<string, any> | null;
  error: string | null;
  message: string | null;
  source: string;
  created_by: number | null;
  target_type: string | null;
  target_id: string | null;
  attempts: number;
  max_attempts: number;
  concurrency_key: string | null;
  concurrency_limit: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_run_at: string;
}

export interface JobFilters {
  status?: JobStatus | JobStatus[];
  category?: string;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface JobCreateInput {
  type: string;
  category: string;
  status?: JobStatus;
  priority?: number;
  payload?: Record<string, any> | null;
  result?: Record<string, any> | null;
  error?: string | null;
  message?: string | null;
  source?: string;
  created_by?: number | null;
  target_type?: string | null;
  target_id?: string | null;
  attempts?: number;
  max_attempts?: number;
  concurrency_key?: string | null;
  concurrency_limit?: number | null;
  next_run_at?: string;
}

export interface JobUpdateInput {
  status?: JobStatus;
  priority?: number;
  payload?: Record<string, any> | null;
  result?: Record<string, any> | null;
  error?: string | null;
  message?: string | null;
  source?: string;
  created_by?: number | null;
  target_type?: string | null;
  target_id?: string | null;
  attempts?: number;
  max_attempts?: number;
  concurrency_key?: string | null;
  concurrency_limit?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  next_run_at?: string;
}

export interface JobLog {
  id: number;
  job_id: string;
  level: string;
  message: string;
  created_at: string;
}

export const JobModel = {
  async create(input: JobCreateInput): Promise<Job> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO jobs (
        type,
        category,
        status,
        priority,
        payload,
        result,
        error,
        message,
        source,
        created_by,
        target_type,
        target_id,
        attempts,
        max_attempts,
        concurrency_key,
        concurrency_limit,
        next_run_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      RETURNING *`,
      [
        input.type,
        input.category,
        input.status || 'queued',
        input.priority ?? 0,
        input.payload ?? null,
        input.result ?? null,
        input.error ?? null,
        input.message ?? null,
        input.source || 'system',
        input.created_by ?? null,
        input.target_type ?? null,
        input.target_id ?? null,
        input.attempts ?? 0,
        input.max_attempts ?? 1,
        input.concurrency_key ?? null,
        input.concurrency_limit ?? null,
        input.next_run_at ?? new Date().toISOString(),
      ]
    );
    return result.rows[0] as Job;
  },

  async findById(id: string): Promise<Job | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return (result.rows[0] as Job) || null;
  },

  async list(filters: JobFilters = {}): Promise<Job[]> {
    const db = getPool();
    const clauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        clauses.push(`status = ANY($${idx++})`);
        values.push(filters.status);
      } else {
        clauses.push(`status = $${idx++}`);
        values.push(filters.status);
      }
    }

    if (filters.category) {
      clauses.push(`category = $${idx++}`);
      values.push(filters.category);
    }

    if (filters.type) {
      clauses.push(`type = $${idx++}`);
      values.push(filters.type);
    }

    if (filters.search) {
      clauses.push(`(type ILIKE $${idx} OR category ILIKE $${idx} OR message ILIKE $${idx} OR target_id ILIKE $${idx})`);
      values.push(`%${filters.search}%`);
      idx += 1;
    }

    const limit = Math.min(filters.limit ?? 200, 1000);
    const offset = filters.offset ?? 0;

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );
    return result.rows as Job[];
  },

  async update(id: string, updates: JobUpdateInput): Promise<Job | null> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const setField = (key: string, value: any) => {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    };

    if (updates.status !== undefined) setField('status', updates.status);
    if (updates.priority !== undefined) setField('priority', updates.priority);
    if (updates.payload !== undefined) setField('payload', updates.payload);
    if (updates.result !== undefined) setField('result', updates.result);
    if (updates.error !== undefined) setField('error', updates.error);
    if (updates.message !== undefined) setField('message', updates.message);
    if (updates.source !== undefined) setField('source', updates.source);
    if (updates.created_by !== undefined) setField('created_by', updates.created_by);
    if (updates.target_type !== undefined) setField('target_type', updates.target_type);
    if (updates.target_id !== undefined) setField('target_id', updates.target_id);
    if (updates.attempts !== undefined) setField('attempts', updates.attempts);
    if (updates.max_attempts !== undefined) setField('max_attempts', updates.max_attempts);
    if (updates.concurrency_key !== undefined) setField('concurrency_key', updates.concurrency_key);
    if (updates.concurrency_limit !== undefined) setField('concurrency_limit', updates.concurrency_limit);
    if (updates.started_at !== undefined) setField('started_at', updates.started_at);
    if (updates.completed_at !== undefined) setField('completed_at', updates.completed_at);
    if (updates.next_run_at !== undefined) setField('next_run_at', updates.next_run_at);

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return (result.rows[0] as Job) || null;
  },

  async claimNext(): Promise<Job | null> {
    const db = getPool();
    const result = await db.query(
      `WITH candidate AS (
        SELECT id
        FROM jobs
        WHERE status IN ('queued', 'pending')
          AND next_run_at <= NOW()
          AND (
            concurrency_key IS NULL
            OR concurrency_limit IS NULL
            OR concurrency_limit <= 0
            OR (
              SELECT COUNT(*) FROM jobs j2
              WHERE j2.status = 'running'
                AND j2.concurrency_key = jobs.concurrency_key
            ) < concurrency_limit
          )
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE jobs
      SET status = 'running',
          attempts = attempts + 1,
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
      WHERE id IN (SELECT id FROM candidate)
      RETURNING *;`
    );
    return (result.rows[0] as Job) || null;
  },
};

export const JobLogModel = {
  async create(jobId: string, level: string, message: string): Promise<JobLog> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO job_logs (job_id, level, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [jobId, level, message]
    );
    const log = result.rows[0] as JobLog;
    await db.query('SELECT pg_notify($1, $2)', ['job_log_events', JSON.stringify({ jobId, logId: log.id })]);
    return log;
  },

  async findById(id: number): Promise<JobLog | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM job_logs WHERE id = $1', [id]);
    return (result.rows[0] as JobLog) || null;
  },

  async listByJob(jobId: string, limit = 500, offset = 0): Promise<JobLog[]> {
    const db = getPool();
    const cappedLimit = Math.min(limit, 2000);
    const result = await db.query(
      `SELECT * FROM job_logs
       WHERE job_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [jobId, cappedLimit, offset]
    );
    return result.rows as JobLog[];
  },
};
