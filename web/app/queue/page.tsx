'use client';

import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { Job, jobsApi } from '@/lib/jobs-api';
import { useRouter } from 'next/navigation';

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

export default function QueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const mergeJobs = (incoming: Job[]) => {
      setJobs((prev) => {
        const map = new Map(prev.map((job) => [job.id, job]));
        for (const job of incoming) {
          map.set(job.id, job);
        }
        return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
    };

    const load = async (opts?: { initial?: boolean }) => {
      try {
        if (opts?.initial) {
          setLoading(true);
        }
        const data = await jobsApi.list({ limit: 300 });
        if (mounted) mergeJobs(data);
      } catch (error) {
        console.error('Failed to load jobs:', error);
      } finally {
        if (mounted && opts?.initial) setLoading(false);
      }
    };

    load({ initial: true });

    const source = jobsApi.stream((job) => {
      mergeJobs([job]);
    });

    const refresh = setInterval(() => load({ initial: false }), 15000);

    return () => {
      mounted = false;
      source.close();
      clearInterval(refresh);
    };
  }, []);

  const columns: ColumnDef<Job>[] = useMemo(() => [
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />,
      cell: ({ row }) => (
        <div className="font-medium">{row.original.type}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant="outline" className={statusStyles[status] || ''}>
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'target_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Target" />,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.target_type || '-'}{row.original.target_id ? `: ${row.original.target_id}` : ''}
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <div className="text-sm">{row.original.category}</div>,
    },
    {
      accessorKey: 'source',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.source}{row.original.created_by ? ` - #${row.original.created_by}` : ''}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => <div className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</div>,
    },
  ], []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue</CardTitle>
        <CardDescription>Track all background jobs and system actions in real time.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="text-center py-4 text-muted-foreground">Loading jobs...</div>
        )}
        <DataTable
          columns={columns}
          data={jobs}
          searchKey="type"
          searchPlaceholder="Search by job type..."
          onRowClick={(job) => router.push(`/queue/${job.id}`)}
          rowClassName={() => 'cursor-pointer hover:bg-muted/40'}
        />
      </CardContent>
    </Card>
  );
}
