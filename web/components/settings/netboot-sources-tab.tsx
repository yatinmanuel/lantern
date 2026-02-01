'use client';

import { useEffect, useState, useCallback, Fragment, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Upload,
  Wifi,
  Loader2,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  netbootApi,
  type NetbootDistro,
  type NetbootMirror,
  type NetbootVersion,
} from '@/lib/netboot-api';
import { configApi, type PXEConfig } from '@/lib/config-api';
import {
  ColumnDef,
  ExpandedState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NETBOOT_CONFIG_KEYS = [
  { key: 'http_proxy', label: 'HTTP Proxy', placeholder: 'http://proxy:8080' },
  { key: 'https_proxy', label: 'HTTPS Proxy', placeholder: 'http://proxy:8080' },
  { key: 'no_proxy', label: 'No Proxy', placeholder: 'localhost,127.0.0.1' },
  {
    key: 'netboot_requests_per_minute_per_mirror',
    label: 'Requests per minute per mirror',
    placeholder: '6',
  },
  {
    key: 'netboot_max_concurrent_downloads',
    label: 'Max concurrent downloads per mirror',
    placeholder: '2',
  },
] as const;

export function NetbootSourcesTab() {
  const [distros, setDistros] = useState<NetbootDistro[]>([]);
  const [mirrorsByDistro, setMirrorsByDistro] = useState<Record<string, NetbootMirror[]>>({});
  const [versionsByMirror, setVersionsByMirror] = useState<Record<string, NetbootVersion[]>>({});
  const [loading, setLoading] = useState(true);
  const [netbootConfig, setNetbootConfig] = useState<Record<string, string>>({});
  const [netbootConfigSaving, setNetbootConfigSaving] = useState(false);
  const [refreshAllLoading, setRefreshAllLoading] = useState(false);
  const [refreshingMirror, setRefreshingMirror] = useState<string | null>(null);
  const [testingMirror, setTestingMirror] = useState<string | null>(null);
  const [addMirrorOpen, setAddMirrorOpen] = useState(false);
  const [addMirrorDistro, setAddMirrorDistro] = useState<NetbootDistro | null>(null);
  const [addMirrorName, setAddMirrorName] = useState('');
  const [addMirrorUrl, setAddMirrorUrl] = useState('');
  const [addMirrorPrimary, setAddMirrorPrimary] = useState(false);
  const [addMirrorSaving, setAddMirrorSaving] = useState(false);
  const [addMirrorTestStatus, setAddMirrorTestStatus] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importFileRef, setImportFileRef] = useState<HTMLInputElement | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [fixArchLoading, setFixArchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistroId, setSelectedDistroId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [enabledFilter, setEnabledFilter] = useState('all');
  const [officialFilter, setOfficialFilter] = useState('all');
  const [primaryFilter, setPrimaryFilter] = useState('all');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [editMirror, setEditMirror] = useState<NetbootMirror | null>(null);
  const [editMirrorName, setEditMirrorName] = useState('');
  const [editMirrorUrl, setEditMirrorUrl] = useState('');
  const [editMirrorPrimary, setEditMirrorPrimary] = useState(false);
  const [editMirrorEnabled, setEditMirrorEnabled] = useState(true);
  const [editMirrorSaving, setEditMirrorSaving] = useState(false);

  const loadDistrosAndMirrors = useCallback(async () => {
    try {
      setLoading(true);
      const [distrosData, mirrorsData] = await Promise.all([
        netbootApi.getDistros(),
        netbootApi.getMirrors(),
      ]);
      setDistros(distrosData);
      const byDistro: Record<string, NetbootMirror[]> = {};
      for (const m of mirrorsData) {
        if (!byDistro[m.distro_id]) byDistro[m.distro_id] = [];
        byDistro[m.distro_id].push(m);
      }
      setMirrorsByDistro(byDistro);
    } catch (e) {
      console.error('Failed to load netboot sources:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNetbootConfig = useCallback(async () => {
    try {
      const config = await configApi.getConfig();
      const form: Record<string, string> = {};
      NETBOOT_CONFIG_KEYS.forEach(({ key }) => {
        form[key] = config[key]?.value ?? '';
      });
      setNetbootConfig(form);
    } catch (e) {
      console.error('Failed to load netboot config:', e);
    }
  }, []);

  useEffect(() => {
    loadDistrosAndMirrors();
    loadNetbootConfig();
  }, [loadDistrosAndMirrors, loadNetbootConfig]);

  const loadVersionsForMirror = useCallback(async (mirrorId: string) => {
    try {
      const versions = await netbootApi.getVersions(mirrorId);
      setVersionsByMirror((prev) => ({ ...prev, [mirrorId]: versions }));
      return versions;
    } catch (e) {
      console.error('Failed to load versions:', e);
      return [];
    }
  }, []);

  async function handleSaveNetbootConfig() {
    try {
      setNetbootConfigSaving(true);
      const updates: PXEConfig = {};
      NETBOOT_CONFIG_KEYS.forEach(({ key }) => {
        updates[key] = { value: netbootConfig[key] ?? '', description: key };
      });
      await configApi.updateConfig(updates);
    } catch (e) {
      console.error('Failed to save netboot config:', e);
    } finally {
      setNetbootConfigSaving(false);
    }
  }

  const formatRelativeTime = useCallback((iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }, []);

  const formatTimestamp = useCallback((iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString();
  }, []);

  async function handleRefreshAll() {
    try {
      setRefreshAllLoading(true);
      await netbootApi.refreshAll();
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to refresh all:', e);
    } finally {
      setRefreshAllLoading(false);
    }
  }

  async function handleRefreshMirror(mirrorId: string) {
    try {
      setRefreshingMirror(mirrorId);
      await netbootApi.refreshMirror(mirrorId);
      await loadDistrosAndMirrors();
      await loadVersionsForMirror(mirrorId);
    } catch (e) {
      console.error('Failed to refresh mirror:', e);
    } finally {
      setRefreshingMirror(null);
    }
  }

  async function handleTestMirror(mirrorId: string) {
    try {
      setTestingMirror(mirrorId);
      const res = await netbootApi.testMirror(mirrorId);
      await loadDistrosAndMirrors();
      return res.success;
    } catch (e) {
      console.error('Failed to test mirror:', e);
      return false;
    } finally {
      setTestingMirror(null);
    }
  }

  async function handleSetPrimary(mirror: NetbootMirror, isPrimary: boolean) {
    if (!isPrimary) return;
    try {
      await netbootApi.updateMirror(mirror.id, { is_primary: true });
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to set primary:', e);
    }
  }

  async function handleToggleMirrorEnabled(mirror: NetbootMirror, enabled: boolean) {
    try {
      await netbootApi.updateMirror(mirror.id, { enabled });
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to toggle mirror:', e);
    }
  }

  async function handleDeleteMirror(mirror: NetbootMirror) {
    if (mirror.is_official) return;
    if (!confirm('Delete this mirror?')) return;
    try {
      await netbootApi.deleteMirror(mirror.id);
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to delete mirror:', e);
    }
  }

  async function handleAddMirror() {
    if (!addMirrorDistro || !addMirrorName.trim() || !addMirrorUrl.trim()) return;
    try {
      setAddMirrorSaving(true);
      await netbootApi.addMirror({
        distro_id: addMirrorDistro.id,
        name: addMirrorName.trim(),
        url: addMirrorUrl.trim(),
        is_primary: addMirrorPrimary,
      });
      setAddMirrorOpen(false);
      setAddMirrorDistro(null);
      setAddMirrorName('');
      setAddMirrorUrl('');
      setAddMirrorPrimary(false);
      setAddMirrorTestStatus(null);
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to add mirror:', e);
    } finally {
      setAddMirrorSaving(false);
    }
  }

  function openEditMirror(mirror: NetbootMirror) {
    setEditMirror(mirror);
    setEditMirrorName(mirror.name);
    setEditMirrorUrl(mirror.url);
    setEditMirrorPrimary(mirror.is_primary);
    setEditMirrorEnabled(mirror.enabled);
  }

  async function handleSaveMirrorEdits() {
    if (!editMirror) return;
    try {
      setEditMirrorSaving(true);
      await netbootApi.updateMirror(editMirror.id, {
        name: editMirrorName.trim(),
        url: editMirrorUrl.trim(),
        is_primary: editMirrorPrimary,
        enabled: editMirrorEnabled,
      });
      setEditMirror(null);
      await loadDistrosAndMirrors();
    } catch (e) {
      console.error('Failed to update mirror:', e);
    } finally {
      setEditMirrorSaving(false);
    }
  }

  async function handleTestAddMirrorUrl() {
    if (!addMirrorUrl.trim()) return;
    setAddMirrorTestStatus('Testing...');
    try {
      const testUrl = addMirrorUrl.trim();
      const res = await fetch(new URL('/api/netboot/mirrors/test', window.location.origin).toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl }),
      });
      const data = await res.json().catch(() => ({}));
      setAddMirrorTestStatus(data.success ? 'OK' : 'Failed');
    } catch {
      setAddMirrorTestStatus('Failed');
    }
  }

  async function handleExport(excludeOfficial: boolean) {
    try {
      const payload = await netbootApi.exportConfig(!excludeOfficial);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `netboot-sources-${excludeOfficial ? 'user' : 'all'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Failed to export:', e);
    }
  }

  async function handleImport(file: File) {
    try {
      const summary = await netbootApi.importConfig(file);
      setImportSummary(summary.message);
      await loadDistrosAndMirrors();
      if (importFileRef) importFileRef.value = '';
    } catch (e) {
      console.error('Failed to import:', e);
      setImportSummary('Import failed.');
    }
  }

  const distroById = useMemo(
    () => new Map(distros.map((d) => [d.id, d])),
    [distros]
  );
  const flatMirrors = useMemo(
    () => Object.values(mirrorsByDistro).flat(),
    [mirrorsByDistro]
  );

  const filteredMirrors = useMemo(() => {
    return flatMirrors.filter((mirror) => {
      const distro = distroById.get(mirror.distro_id);
      const haystack = [
        mirror.name,
        mirror.url,
        distro?.display_name,
        distro?.slug,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (selectedDistroId !== 'all' && mirror.distro_id !== selectedDistroId) {
        return false;
      }
      if (statusFilter !== 'all') {
        const status =
          mirror.last_test_success === true
            ? 'ok'
            : mirror.last_test_success === false
              ? 'failed'
              : 'untested';
        if (status !== statusFilter) return false;
      }
      if (enabledFilter !== 'all') {
        const enabled = mirror.enabled ? 'enabled' : 'disabled';
        if (enabled !== enabledFilter) return false;
      }
      if (officialFilter !== 'all') {
        const official = mirror.is_official ? 'official' : 'custom';
        if (official !== officialFilter) return false;
      }
      if (primaryFilter !== 'all') {
        const primary = mirror.is_primary ? 'primary' : 'secondary';
        if (primary !== primaryFilter) return false;
      }
      if (searchQuery.trim() && !haystack.includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [
    flatMirrors,
    distroById,
    selectedDistroId,
    statusFilter,
    enabledFilter,
    officialFilter,
    primaryFilter,
    searchQuery,
  ]);

  const ensureVersions = useCallback(
    (mirrorId: string) => {
      if (!versionsByMirror[mirrorId]) {
        void loadVersionsForMirror(mirrorId);
      }
    },
    [versionsByMirror, loadVersionsForMirror]
  );

  const columns = useMemo(() => [
    {
      id: 'expand',
      header: '',
      cell: ({ row }: any) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(event) => {
            event.stopPropagation();
            row.getToggleExpandedHandler()();
            ensureVersions(row.original.id);
          }}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {row.getIsExpanded() ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'mirror',
      header: 'Mirror',
      accessorFn: (row: NetbootMirror) => row.name,
          cell: ({ row }: any) => (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-medium">
                <span>{row.original.name}</span>
            {row.original.is_official && (
              <Badge variant="secondary" className="text-[10px]">Official</Badge>
            )}
            {row.original.is_primary && (
              <Badge variant="outline" className="text-[10px]">Primary</Badge>
            )}
            {!row.original.enabled && (
              <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {distroById.get(row.original.distro_id)?.display_name ?? 'Unknown distro'}
          </div>
        </div>
      ),
    },
    {
      id: 'url',
      header: 'URL',
      accessorFn: (row: NetbootMirror) => row.url,
          cell: ({ row }: any) => (
            <div className="max-w-[32rem] text-xs font-mono break-all text-muted-foreground">
              {row.original.url}
            </div>
          ),
        },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (row: NetbootMirror) => row.last_test_success ?? null,
          cell: ({ row }: any) => {
            const status =
              row.original.last_test_success === true
                ? 'OK'
                : row.original.last_test_success === false
                  ? 'Failed'
                  : '—';
            const variant =
              status === 'OK' ? 'default' : status === 'Failed' ? 'destructive' : 'secondary';
            return (
              <div className="space-y-1">
                <Badge variant={variant}>{status}</Badge>
                <div className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(row.original.last_tested_at)}
                </div>
              </div>
            );
          },
        },
    {
      id: 'versions',
      header: 'Versions',
      accessorFn: (row: NetbootMirror) => versionsByMirror[row.id]?.length ?? 0,
          cell: ({ row }: any) => {
            const count = versionsByMirror[row.original.id];
            return (
              <div className="text-sm">
                {count ? (
                  <span>{count.length}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'refreshed',
      header: 'Last refresh',
      accessorFn: (row: NetbootMirror) => row.last_refreshed_at ?? '',
          cell: ({ row }: any) => (
            <div className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.last_refreshed_at)}
            </div>
          ),
        },
    {
      id: 'enabled',
      header: 'Enabled',
      accessorFn: (row: NetbootMirror) => row.enabled,
          cell: ({ row }: any) => (
            <Switch
              checked={row.original.enabled}
              onCheckedChange={(v) => handleToggleMirrorEnabled(row.original, v)}
            />
          ),
        },
    {
      id: 'primary',
      header: 'Primary',
      accessorFn: (row: NetbootMirror) => row.is_primary,
          cell: ({ row }: any) => (
            <Switch
              checked={row.original.is_primary}
              onCheckedChange={(v) => handleSetPrimary(row.original, v)}
            />
          ),
        },
    {
      id: 'actions',
      header: '',
          cell: ({ row }: any) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRefreshMirror(row.original.id)}
                disabled={refreshingMirror === row.original.id}
                className="h-8 w-8"
                title="Refresh mirror"
              >
                {refreshingMirror === row.original.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleTestMirror(row.original.id)}
                disabled={testingMirror === row.original.id}
                className="h-8 w-8"
                title="Test mirror"
              >
                {testingMirror === row.original.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEditMirror(row.original)}
                className="h-8 w-8"
                title="Edit mirror"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {!row.original.is_official && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteMirror(row.original)}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Delete mirror"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
        },
  ] satisfies ColumnDef<NetbootMirror>[];
  ], [
    distroById,
    ensureVersions,
    formatRelativeTime,
    handleDeleteMirror,
    handleRefreshMirror,
    handleSetPrimary,
    handleTestMirror,
    handleToggleMirrorEnabled,
    openEditMirror,
    refreshingMirror,
    testingMirror,
    versionsByMirror,
  ]);

  const table = useReactTable({
    data: filteredMirrors,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      expanded,
      sorting,
      columnVisibility,
    },
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
  });

  return (
    <div className="space-y-6">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Netboot Sources</CardTitle>
              <CardDescription>
                Manage distros and mirrors for netboot installers. Refresh to discover versions.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                title="Fix Arch netboot 404: correct .../iso/latestarch/... to .../iso/latest/arch/..."
                onClick={async () => {
                  setFixArchLoading(true);
                  try {
                    await netbootApi.fixArchBootArgs();
                    await loadDistrosAndMirrors();
                  } catch (e) {
                    console.error('Fix Arch boot args failed:', e);
                  } finally {
                    setFixArchLoading(false);
                  }
                }}
                disabled={fixArchLoading}
              >
                {fixArchLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Fix Arch boot args
              </Button>
              <Button onClick={handleRefreshAll} disabled={refreshAllLoading}>
                {refreshAllLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Distros & mirrors - main section at top */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Mirrors</h4>
                <p className="text-xs text-muted-foreground">
                  Full visibility into mirror URLs, health, and versions. Expand a row for details.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedDistroId !== 'all') {
                    const distro = distros.find((d) => d.id === selectedDistroId) || null;
                    setAddMirrorDistro(distro);
                  } else {
                    setAddMirrorDistro(null);
                  }
                  setAddMirrorOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add mirror
              </Button>
            </div>

            {distros.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                <p className="text-sm">
                  No distros configured. Seed default distros (Debian, Ubuntu, Fedora, Rocky, Alma, etc.) or use Refresh All—it will seed automatically if the database is empty.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={async () => {
                      setSeedLoading(true);
                      try {
                        await netbootApi.seed();
                        await loadDistrosAndMirrors();
                      } catch (e) {
                        console.error('Seed failed:', e);
                      } finally {
                        setSeedLoading(false);
                      }
                    }}
                    disabled={seedLoading}
                  >
                    {seedLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Seed default distros
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setSeedLoading(true);
                      try {
                        await netbootApi.refreshAll();
                        await loadDistrosAndMirrors();
                      } catch (e) {
                        console.error('Refresh failed:', e);
                      } finally {
                        setSeedLoading(false);
                      }
                    }}
                    disabled={seedLoading}
                  >
                    {seedLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Refresh All (seeds if empty)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-background/60 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  <div className="min-w-[14rem] flex-1">
                    <Input
                      placeholder="Search mirrors, URLs, distros..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[12rem]">
                    <Select value={selectedDistroId} onValueChange={setSelectedDistroId}>
                      <SelectTrigger>
                        <SelectValue placeholder="All distros" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All distros</SelectItem>
                        {distros.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[10rem]">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All status</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="untested">Untested</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[10rem]">
                    <Select value={enabledFilter} onValueChange={setEnabledFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All enabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[10rem]">
                    <Select value={officialFilter} onValueChange={setOfficialFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Official" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="official">Official</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[10rem]">
                    <Select value={primaryFilter} onValueChange={setPrimaryFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Primary" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Columns
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
                          <Fragment key={row.id}>
                            <TableRow
                              key={row.id}
                              data-state={row.getIsExpanded() && 'selected'}
                              onClick={() => {
                                row.getToggleExpandedHandler()();
                                if (!versionsByMirror[row.original.id]) {
                                  void loadVersionsForMirror(row.original.id);
                                }
                              }}
                              className="cursor-pointer"
                            >
                              {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              ))}
                            </TableRow>
                            {row.getIsExpanded() && (
                              <TableRow key={`${row.id}-expanded`}>
                                <TableCell colSpan={columns.length} className="bg-muted/30">
                                  <div className="grid gap-4 p-4 md:grid-cols-2">
                                    <div className="space-y-3">
                                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Mirror details
                                      </div>
                                      <div className="space-y-2 text-sm">
                                        <div>
                                          <div className="text-xs text-muted-foreground">URL</div>
                                          <div className="font-mono text-xs break-all">{row.original.url}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <div className="text-xs text-muted-foreground">Last tested</div>
                                            <div>{formatTimestamp(row.original.last_tested_at)}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Last refresh</div>
                                            <div>{formatTimestamp(row.original.last_refreshed_at)}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Created</div>
                                            <div>{formatTimestamp(row.original.created_at)}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Primary</div>
                                            <div>{row.original.is_primary ? 'Yes' : 'No'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Versions
                                      </div>
                                      <div className="rounded-lg border bg-background">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b bg-muted/40 text-muted-foreground">
                                              <th className="p-2 text-left">Version</th>
                                              <th className="p-2 text-left">Display</th>
                                              <th className="p-2 text-left">Available</th>
                                              <th className="p-2 text-left">Last seen</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(versionsByMirror[row.original.id] ?? []).map((version) => (
                                              <tr key={version.id} className="border-b last:border-0">
                                                <td className="p-2 font-mono">{version.version}</td>
                                                <td className="p-2">{version.display_name}</td>
                                                <td className="p-2">
                                                  <Badge variant={version.is_available ? 'default' : 'secondary'}>
                                                    {version.is_available ? 'Yes' : 'No'}
                                                  </Badge>
                                                </td>
                                                <td className="p-2 text-muted-foreground">
                                                  {formatRelativeTime(version.last_seen_at)}
                                                </td>
                                              </tr>
                                            ))}
                                            {(versionsByMirror[row.original.id] ?? []).length === 0 && (
                                              <tr>
                                                <td
                                                  colSpan={4}
                                                  className="p-4 text-center text-muted-foreground"
                                                >
                                                  No versions discovered yet.
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                            No mirrors found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-4 py-3">
                  <DataTablePagination table={table} />
                </div>
              </div>
            )}
          </div>

          {/* Proxy & rate limit */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Proxy & rate limit</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {NETBOOT_CONFIG_KEYS.map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`netboot-${key}`}>{label}</Label>
                  <Input
                    id={`netboot-${key}`}
                    value={netbootConfig[key] ?? ''}
                    placeholder={placeholder}
                    onChange={(e) =>
                      setNetbootConfig((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <Button onClick={handleSaveNetbootConfig} disabled={netbootConfigSaving}>
              {netbootConfigSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>

          {/* Export / Import */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport(false)}>
              <Download className="h-4 w-4 mr-2" />
              Export all
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport(true)}>
              <Download className="h-4 w-4 mr-2" />
              Export user mirrors only
            </Button>
            <input
              ref={setImportFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => importFileRef?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            {importSummary && (
              <span className="text-sm text-muted-foreground">{importSummary}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Mirror Dialog */}
      <Dialog open={addMirrorOpen} onOpenChange={setAddMirrorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add mirror{addMirrorDistro ? ` for ${addMirrorDistro.display_name}` : ''}</DialogTitle>
            <DialogDescription>
              Enter mirror name and base URL. Test connection before adding.
            </DialogDescription>
          </DialogHeader>
          {(addMirrorDistro || distros.length > 0) && (
            <div className="space-y-4 py-4">
              {!addMirrorDistro && (
                <div className="space-y-2">
                  <Label>Distro</Label>
                  <Select
                    value={addMirrorDistro?.id ?? ''}
                    onValueChange={(value) => {
                      const distro = distros.find((d) => d.id === value) || null;
                      setAddMirrorDistro(distro);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select distro" />
                    </SelectTrigger>
                    <SelectContent>
                      {distros.map((distro) => (
                        <SelectItem key={distro.id} value={distro.id}>
                          {distro.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Mirror name</Label>
                <Input
                  value={addMirrorName}
                  onChange={(e) => setAddMirrorName(e.target.value)}
                  placeholder="e.g. MIT Mirror"
                />
              </div>
              <div className="space-y-2">
                <Label>Mirror URL</Label>
                <Input
                  value={addMirrorUrl}
                  onChange={(e) => setAddMirrorUrl(e.target.value)}
                  placeholder="https://mirrors.example.com/debian"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleTestAddMirrorUrl}>
                  <Wifi className="h-4 w-4 mr-1" />
                  Test connection
                </Button>
                {addMirrorTestStatus && (
                  <span className="text-sm text-muted-foreground">{addMirrorTestStatus}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={addMirrorPrimary}
                  onCheckedChange={setAddMirrorPrimary}
                />
                <Label>Set as primary mirror</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddMirrorOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddMirror}
                  disabled={!addMirrorName.trim() || !addMirrorUrl.trim() || addMirrorSaving || !addMirrorDistro}
                >
                  {addMirrorSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add mirror
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Mirror Dialog */}
      <Dialog open={!!editMirror} onOpenChange={(open) => !open && setEditMirror(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit mirror</DialogTitle>
            <DialogDescription>Update mirror name, URL, and status.</DialogDescription>
          </DialogHeader>
          {editMirror && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Mirror name</Label>
                <Input
                  value={editMirrorName}
                  onChange={(e) => setEditMirrorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Mirror URL</Label>
                <Input
                  value={editMirrorUrl}
                  onChange={(e) => setEditMirrorUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editMirrorPrimary}
                  onCheckedChange={setEditMirrorPrimary}
                />
                <Label>Primary mirror</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editMirrorEnabled}
                  onCheckedChange={setEditMirrorEnabled}
                />
                <Label>Enabled</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditMirror(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveMirrorEdits} disabled={editMirrorSaving}>
                  {editMirrorSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
