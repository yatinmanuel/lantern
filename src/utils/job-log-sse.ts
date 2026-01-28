import type { Response } from 'express';

type JobLogClient = Response;

type JobLogEventName = 'job-log' | 'ping';

class JobLogSseManager {
  private clients = new Map<string, Set<JobLogClient>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  connect(jobId: string, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ ok: true, jobId })}\n\n`);

    const set = this.clients.get(jobId) ?? new Set<JobLogClient>();
    set.add(res);
    this.clients.set(jobId, set);

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.broadcastAll('ping', { ts: Date.now() });
      }, 15000);
    }

    res.on('close', () => {
      const jobClients = this.clients.get(jobId);
      if (jobClients) {
        jobClients.delete(res);
        if (jobClients.size === 0) {
          this.clients.delete(jobId);
        }
      }
      if (this.clients.size === 0 && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    });
  }

  broadcast(jobId: string, event: JobLogEventName, payload: any): void {
    const jobClients = this.clients.get(jobId);
    if (!jobClients || jobClients.size === 0) return;
    const data = `event: ${event}\n` + `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of jobClients) {
      client.write(data);
    }
  }

  private broadcastAll(event: JobLogEventName, payload: any): void {
    for (const [jobId] of this.clients) {
      this.broadcast(jobId, event, payload);
    }
  }
}

export const jobLogSseManager = new JobLogSseManager();
