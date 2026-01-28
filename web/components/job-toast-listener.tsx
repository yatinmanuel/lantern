'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { jobsApi, Job } from '@/lib/jobs-api';
import { useAuth } from '@/contexts/auth-context';

const TOAST_CATEGORIES = new Set(['images', 'clients', 'config']);

function formatJobTitle(job: Job): string {
  if (job.category === 'images') return 'Image job started';
  if (job.category === 'clients') return 'Client job started';
  if (job.category === 'config') return 'Config job started';
  return 'Job started';
}

export function JobToastListener() {
  const { user } = useAuth();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const source = jobsApi.stream((job) => {
      if (!TOAST_CATEGORIES.has(job.category)) return;
      if (job.source === 'system') return;
      if (job.status !== 'queued' && job.status !== 'running') return;
      if (seen.current.has(job.id)) return;
      seen.current.add(job.id);

      toast(formatJobTitle(job), {
        description: job.message || job.type,
      });
    });

    return () => {
      source.close();
    };
  }, [user]);

  return null;
}
