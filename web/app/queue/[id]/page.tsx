'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Job, JobLog, jobsApi } from '@/lib/jobs-api';

const statusStyles: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function QueueJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params?.id === 'string' ? params.id : '';
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    setLoading(true);
    jobsApi.getJob(jobId)
      .then((data) => {
        if (mounted) setJob(data);
      })
      .catch((error) => {
        console.error('Failed to load job:', error);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const jobStream = jobsApi.stream((incoming) => {
      if (incoming.id === jobId) {
        setJob(incoming);
      }
    });

    return () => {
      mounted = false;
      jobStream.close();
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    setLogsLoading(true);
    jobsApi.listLogs(jobId)
      .then((data) => {
        if (mounted) setLogs(data);
      })
      .catch((error) => {
        console.error('Failed to load logs:', error);
      })
      .finally(() => {
        if (mounted) setLogsLoading(false);
      });

    const logStream = jobsApi.streamLogs(jobId, (log) => {
      setLogs((prev) => {
        if (prev.some((item) => item.id === log.id)) return prev;
        return [...prev, log];
      });
    });

    return () => {
      mounted = false;
      logStream.close();
    };
  }, [jobId]);

  useEffect(() => {
    if (!logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Job Details</h2>
          <p className="text-sm text-muted-foreground">Live status and output for this job.</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/queue')}>
          Back to Queue
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{job?.type || 'Loading job...'}</CardTitle>
          <CardDescription>{job?.message || 'Job message will appear here.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-muted-foreground">Loading job...</div>
          ) : job ? (
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={statusStyles[job.status] || ''}>
                  {job.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{job.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target</span>
                <span>{job.target_type || '-'}{job.target_id ? `: ${job.target_id}` : ''}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{job.source}{job.created_by ? ` - #${job.created_by}` : ''}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(job.created_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(job.updated_at)}</span>
              </div>
              {job.error && (
                <div className="col-span-full text-red-500">{job.error}</div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">Job not found.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Job Output</CardTitle>
          <CardDescription>Streaming logs in real time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-black/90 text-green-200 font-mono text-xs">
            <div className="border-b border-white/10 px-3 py-2 text-green-100">Job output</div>
            <div ref={logContainerRef} className="h-80 overflow-y-auto px-3 py-2 space-y-1">
              {logsLoading && logs.length === 0 && (
                <div className="text-green-300/70">Loading logs...</div>
              )}
              {!logsLoading && logs.length === 0 && (
                <div className="text-green-300/70">No logs yet.</div>
              )}
              {logs.map((log) => (
                <div key={log.id}>
                  <span className="text-green-400">{formatDate(log.created_at)}</span>{' '}
                  <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : ''}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
