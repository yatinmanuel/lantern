import type { Response } from 'express';

type JobSseClient = Response;

type JobEventName = 'job' | 'ping';

class JobSseManager {
  private clients = new Set<JobSseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  connect(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);

    this.clients.add(res);

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.broadcast('ping', { ts: Date.now() });
      }, 15000);
    }

    res.on('close', () => {
      this.clients.delete(res);
      if (this.clients.size === 0 && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    });
  }

  broadcast(event: JobEventName, payload: any): void {
    const data = `event: ${event}\n` + `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      client.write(data);
    }
  }
}

export const jobSseManager = new JobSseManager();
