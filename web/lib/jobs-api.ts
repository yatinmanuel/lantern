const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'pending';

export type Job = {
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
};

export type JobLog = {
  id: number;
  job_id: string;
  level: string;
  message: string;
  created_at: string;
};
export type JobResponse = {
  jobId: string;
  job: Job;
  success?: boolean;
  message?: string;
};

export const jobsApi = {
  async list(params?: { status?: string | string[]; category?: string; type?: string; search?: string; limit?: number; offset?: number }): Promise<Job[]> {
    const search = new URLSearchParams();
    if (params?.status) {
      if (Array.isArray(params.status)) {
        params.status.forEach((value) => search.append('status', value));
      } else {
        search.set('status', params.status);
      }
    }
    if (params?.category) search.set('category', params.category);
    if (params?.type) search.set('type', params.type);
    if (params?.search) search.set('search', params.search);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.offset !== undefined) search.set('offset', String(params.offset));

    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const headers: HeadersInit = {};
    if (sessionId) headers['X-Session-Id'] = sessionId;

    const res = await fetch(`${API_BASE_URL}/api/jobs?${search.toString()}`, { credentials: 'include', headers });
    if (!res.ok) {
      throw new Error('Failed to fetch jobs');
    }
    return res.json();
  },

  stream(onJob: (job: Job) => void): EventSource {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const search = new URLSearchParams();
    if (sessionId) search.set('session_id', sessionId);
    const url = search.toString()
      ? `${API_BASE_URL}/api/jobs/stream?${search.toString()}`
      : `${API_BASE_URL}/api/jobs/stream`;
    const source = new EventSource(url, { withCredentials: true });
    source.addEventListener('job', (event) => {
      try {
        const job = JSON.parse((event as MessageEvent).data) as Job;
        onJob(job);
      } catch {
        // ignore malformed events
      }
    });
    return source;
  },

  async getJob(id: string): Promise<Job> {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const headers: HeadersInit = {};
    if (sessionId) headers['X-Session-Id'] = sessionId;
    const res = await fetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(id)}`, { credentials: 'include', headers });
    if (!res.ok) {
      throw new Error('Failed to fetch job');
    }
    return res.json();
  },

  async listLogs(jobId: string, limit = 500): Promise<JobLog[]> {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const headers: HeadersInit = {};
    if (sessionId) headers['X-Session-Id'] = sessionId;
    const search = new URLSearchParams();
    search.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/logs?${search.toString()}`, { credentials: 'include', headers });
    if (!res.ok) {
      throw new Error('Failed to fetch job logs');
    }
    return res.json();
  },

  streamLogs(jobId: string, onLog: (log: JobLog) => void): EventSource {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const search = new URLSearchParams();
    if (sessionId) search.set('session_id', sessionId);
    const url = search.toString()
      ? `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/logs/stream?${search.toString()}`
      : `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/logs/stream`;
    const source = new EventSource(url, { withCredentials: true });
    source.addEventListener('job-log', (event) => {
      try {
        const log = JSON.parse((event as MessageEvent).data) as JobLog;
        onLog(log);
      } catch {
        // ignore
      }
    });
    return source;
  },
};
