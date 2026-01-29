'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Folder, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { isoApi, IsoFile, RemoteImageMeta, ExtractedFile } from '@/lib/iso-api';
import { Job, jobsApi } from '@/lib/jobs-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

type UploadMode = 'iso' | 'manual' | 'url';
type ManualMode = 'upload' | 'extracted';
type TabMode = 'images' | 'isos';
type IsoDisplay = IsoFile & { pending?: boolean; jobId?: string };

export function IsoManager() {
  const [isoFiles, setIsoFiles] = useState<IsoDisplay[]>([]);
  const [isoLoading, setIsoLoading] = useState(true);
  const [isoUploading, setIsoUploading] = useState(false);
  const [isoFile, setIsoFile] = useState<File | null>(null);
  const [isoMessage, setIsoMessage] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(true);
  const [autoLabel, setAutoLabel] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabMode>('images');
  const [manageOpen, setManageOpen] = useState(false);
  const [manageItem, setManageItem] = useState<IsoDisplay | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [manualInputKey, setManualInputKey] = useState(0);
  const [uploadMode, setUploadMode] = useState<UploadMode>('iso');
  const [manualLabel, setManualLabel] = useState('');
  const [manualKernel, setManualKernel] = useState<File | null>(null);
  const [manualInitrd, setManualInitrd] = useState<File | null>(null);
  const [manualArgs, setManualArgs] = useState('');
  const [manualMode, setManualMode] = useState<ManualMode>('upload');
  const [extractedIsoName, setExtractedIsoName] = useState('');
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [extractedKernelPath, setExtractedKernelPath] = useState('');
  const [extractedInitrdPath, setExtractedInitrdPath] = useState('');
  const [extractedLoading, setExtractedLoading] = useState(false);
  const [extractedFilter, setExtractedFilter] = useState('');
  const [extractedDir, setExtractedDir] = useState('');
  const [extractedBrowserOpen, setExtractedBrowserOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteMeta, setRemoteMeta] = useState<RemoteImageMeta | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteAutoExtract, setRemoteAutoExtract] = useState(true);
  const [remoteLabel, setRemoteLabel] = useState('');
  const [remoteFileName, setRemoteFileName] = useState('');
  const [remoteFileNameEdited, setRemoteFileNameEdited] = useState(false);

  useEffect(() => {
    loadIsos();
    const interval = setInterval(() => {
      loadIsos({ showLoading: false, silent: true });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadIsos(options?: { showLoading?: boolean; silent?: boolean }) {
    const { showLoading = true, silent = false } = options ?? {};
    try {
      if (showLoading) {
        setIsoLoading(true);
      }
      const files = await isoApi.list();
      setIsoFiles((prev) => {
        const pendingMap = new Map(prev.filter((file) => file.pending).map((file) => [file.id, file]));
        const merged = files.map((file) => {
          const pending = pendingMap.get(file.id);
          return pending
            ? { ...file, pending: true, jobId: pending.jobId }
            : { ...file, pending: false };
        });
        const stillPending = Array.from(pendingMap.values()).filter(
          (pending) => !files.some((file) => file.id === pending.id)
        );
        return [...merged, ...stillPending].sort((a, b) => b.modified_at.localeCompare(a.modified_at));
      });
      if (!silent) {
        setIsoMessage(null);
      }
    } catch (error) {
      console.error('Failed to load images:', error);
      if (!silent) {
        setIsoMessage('Failed to load image list.');
      }
    } finally {
      if (showLoading) {
        setIsoLoading(false);
      }
    }
  }

  function resetUploadForm() {
    setIsoFile(null);
    setManualKernel(null);
    setManualInitrd(null);
    setManualLabel('');
    setManualArgs('');
    setManualMode('upload');
    setExtractedIsoName('');
    setExtractedFiles([]);
    setExtractedKernelPath('');
    setExtractedInitrdPath('');
    setExtractedFilter('');
    setExtractedDir('');
    setAutoExtract(true);
    setAutoLabel('');
    setRemoteUrl('');
    setRemoteMeta(null);
    setRemoteAutoExtract(true);
    setRemoteLabel('');
    setRemoteFileName('');
    setRemoteFileNameEdited(false);
    setUploadInputKey((key) => key + 1);
    setManualInputKey((key) => key + 1);
    setUploadMode('iso');
  }

  function addPendingFromJob(job: Job) {
    if (job.category !== 'images') return;
    const id = job.target_id || `pending:${job.id}`;
    const label =
      (job.payload && typeof job.payload.label === 'string' && job.payload.label) ||
      (job.payload && typeof job.payload.fileName === 'string' && job.payload.fileName) ||
      (job.payload && typeof job.payload.safeName === 'string' && job.payload.safeName) ||
      job.target_id ||
      job.message ||
      'Pending image';
    setIsoFiles((prev) => {
      if (prev.some((file) => file.id === id)) {
        return prev.map((file) => file.id === id ? { ...file, pending: true, jobId: job.id } : file);
      }
      return [
        {
          id,
          name: label,
          size: 0,
          modified_at: new Date().toISOString(),
          url: null,
          entry: null,
          pending: true,
          jobId: job.id,
        },
        ...prev,
      ];
    });
  }

  async function handleUploadIso() {
    if (!isoFile) {
      setIsoMessage('Select a file first.');
      return;
    }
    try {
      setIsoUploading(true);
      const response = await isoApi.upload(isoFile, {
        autoExtract,
        label: autoExtract && autoLabel.trim() ? autoLabel.trim() : undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoFile(null);
      setIsoMessage(autoExtract ? 'Image queued for import.' : 'ISO uploaded.');
      setUploadOpen(false);
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to upload image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to upload image.');
    } finally {
      setIsoUploading(false);
    }
  }

  async function handleManualUpload() {
    if (!manualLabel.trim()) {
      setIsoMessage('Add a label for this image.');
      return;
    }
    if (!manualKernel || !manualInitrd) {
      setIsoMessage('Select both vmlinuz and initramfs files.');
      return;
    }
    try {
      setIsoUploading(true);
      const response = await isoApi.uploadManual({
        label: manualLabel.trim(),
        kernel: manualKernel,
        initrd: manualInitrd,
        bootArgs: manualArgs.trim() || undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage('Image queued for import.');
      setUploadOpen(false);
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to add image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to add image.');
    } finally {
      setIsoUploading(false);
    }
  }

  async function handleAttachExtracted() {
    if (!extractedIsoName.trim()) {
      setIsoMessage('Select an extracted ISO first.');
      return;
    }
    if (!manualLabel.trim()) {
      setIsoMessage('Add a label for this image.');
      return;
    }
    if (!extractedKernelPath.trim() || !extractedInitrdPath.trim()) {
      setIsoMessage('Select both kernel and initramfs paths.');
      return;
    }
    try {
      setIsoUploading(true);
      const response = await isoApi.attachFromExtracted({
        isoName: extractedIsoName.trim(),
        label: manualLabel.trim(),
        kernelPath: extractedKernelPath.trim(),
        initrdPaths: [extractedInitrdPath.trim()],
        bootArgs: manualArgs.trim() || undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage('Boot files queued for attach.');
      setUploadOpen(false);
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to attach boot files:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to attach boot files.');
    } finally {
      setIsoUploading(false);
    }
  }

  async function handleUrlDownload() {
    if (!remoteUrl.trim()) {
      setIsoMessage('Enter a download URL first.');
      return;
    }
    if (!remoteFileName.trim()) {
      setIsoMessage('Enter a filename for the download.');
      return;
    }
    try {
      setIsoUploading(true);
      const response = await isoApi.downloadFromUrl(remoteUrl.trim(), {
        autoExtract: remoteAutoExtract,
        fileName: remoteFileName.trim(),
        label: remoteAutoExtract && remoteLabel.trim() ? remoteLabel.trim() : undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage(remoteAutoExtract ? 'Image download queued.' : 'ISO download queued.');
      setUploadOpen(false);
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to download image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to download image.');
    } finally {
      setIsoUploading(false);
    }
  }

  async function handleQueryRemoteMeta() {
    if (!remoteUrl.trim()) {
      setIsoMessage('Enter a URL first.');
      return;
    }
    try {
      setRemoteLoading(true);
      const meta = await isoApi.queryRemoteMeta(remoteUrl.trim());
      setRemoteMeta(meta);
      if (!remoteFileNameEdited) {
        setRemoteFileName(meta.fileName || '');
      }
      if (!meta.isIso) {
        setIsoMessage('URL does not appear to be an ISO file.');
      } else {
        setIsoMessage(null);
      }
    } catch (error) {
      console.error('Failed to query URL:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to query URL.');
    } finally {
      setRemoteLoading(false);
    }
  }

  async function handleSubmitUpload() {
    if (uploadMode === 'iso') {
      await handleUploadIso();
      return;
    }
    if (uploadMode === 'manual') {
      if (manualMode === 'upload') {
        await handleManualUpload();
      } else {
        await handleAttachExtracted();
      }
      return;
    }
    await handleUrlDownload();
  }

  async function handleDeleteIso(id: string, displayName: string) {
    if (!confirm(`Delete image ${displayName}?`)) return;
    try {
      await isoApi.remove(id);
      setIsoMessage('Image delete queued.');
      if (manageItem?.id === id) {
        setManageOpen(false);
        setManageItem(null);
      }
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to delete image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to delete image.');
    }
  }

  function openManage(item: IsoDisplay) {
    setManageItem(item);
    setManageOpen(true);
  }

  function openAttachFor(item: IsoDisplay) {
    setUploadMode('manual');
    setManualMode('extracted');
    setExtractedIsoName(item.id);
    if (!manualLabel.trim()) {
      setManualLabel(item.entry?.label || item.name.replace(/\.iso$/i, ''));
    }
    setUploadOpen(true);
    setManageOpen(false);
  }

  function openExtractedBrowser() {
    if (!extractedIsoName) {
      setIsoMessage('Select an extracted ISO first.');
      return;
    }
    setExtractedBrowserOpen(true);
  }

  const columns: ColumnDef<IsoDisplay>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Image Name" />
        ),
        cell: ({ row }) => {
          const file = row.original;
          const displayName = file.entry?.label || file.name;
          return (
            <div className="space-y-1">
              <div className="font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">
                Updated {new Date(file.modified_at).toLocaleString()}
              </div>
            </div>
          );
        },
      },
      {
        id: 'entry',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="PXE Entry" />
        ),
        cell: ({ row }) => {
          const entry = row.original.entry;
          if (row.original.pending) {
            return <Badge variant="secondary">Processing</Badge>;
          }
          return entry ? (
            <div className="space-y-1">
              <div className="font-medium">{entry.label}</div>
              <Badge variant="secondary">{entry.os_type}</Badge>
            </div>
          ) : (
            <Badge variant="outline">Not imported</Badge>
          );
        },
      },
      {
        accessorKey: 'size',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Size" />
        ),
        cell: ({ row }) => (
          <div className="text-sm">{formatBytes(row.original.size)}</div>
        ),
      },
      {
        accessorKey: 'modified_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Updated" />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.modified_at).toLocaleString()}
          </div>
        ),
        sortingFn: (rowA, rowB) => {
          return (
            new Date(rowA.original.modified_at).getTime() -
            new Date(rowB.original.modified_at).getTime()
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const file = row.original;
          const displayName = file.entry?.label || file.name;
          return (
            <div className="flex items-center justify-end gap-2">
              {file.url ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={file.url} download onClick={(event) => event.stopPropagation()}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              )}
                <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDeleteIso(file.id, displayName);
                }}
                className="text-destructive hover:text-destructive"
                title="Delete image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
        enableHiding: false,
      },
    ],
    [handleDeleteIso]
  );

  const extractedKernelOptions = useMemo(() => {
    return extractedFiles
      .map((file) => file.path)
      .filter((path) => {
        const name = path.toLowerCase();
        return name.includes('vmlinuz') || name.includes('bzimage') || name.endsWith('/linux') || name.endsWith('/vmlinux');
      });
  }, [extractedFiles]);

  const extractedInitrdOptions = useMemo(() => {
    return extractedFiles
      .map((file) => file.path)
      .filter((path) => {
        const name = path.toLowerCase();
        return name.includes('initrd') || name.includes('initramfs') || name.endsWith('.img');
      });
  }, [extractedFiles]);

  const extractedRoot = useMemo(() => {
    if (!extractedIsoName) return '';
    const baseName = extractedIsoName.replace(/\.iso$/i, '');
    return `/iso/${encodeURIComponent(baseName)}`;
  }, [extractedIsoName]);

  const extractedBrowserEntries = useMemo(() => {
    if (!extractedRoot) return [];
    const currentSegments = extractedDir.split('/').filter(Boolean);
    const currentPrefix = currentSegments.length > 0 ? `${currentSegments.join('/')}/` : '';
    const dirs = new Set<string>();
    const files = new Map<string, number>();

    for (const file of extractedFiles) {
      if (!file.path.startsWith(`${extractedRoot}/`)) continue;
      const relative = file.path.slice(extractedRoot.length + 1);
      if (!relative) continue;
      if (currentPrefix && !relative.startsWith(currentPrefix)) continue;
      const remainder = relative.slice(currentPrefix.length);
      const [first, ...rest] = remainder.split('/');
      if (!first) continue;
      if (rest.length === 0) {
        files.set(first, file.size);
      } else {
        dirs.add(first);
      }
    }

    let entries = [
      ...Array.from(dirs).sort().map((name) => ({
        type: 'dir' as const,
        name,
        path: currentPrefix ? `${currentPrefix}${name}` : name,
      })),
      ...Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, size]) => ({
        type: 'file' as const,
        name,
        size,
        path: currentPrefix ? `${currentPrefix}${name}` : name,
      })),
    ];

    const query = extractedFilter.trim().toLowerCase();
    if (query) {
      entries = entries.filter((entry) => entry.name.toLowerCase().includes(query));
    }

    return entries;
  }, [extractedFiles, extractedFilter, extractedRoot, extractedDir]);

  const imageItems = useMemo(() => {
    return isoFiles.filter((file) => file.pending || !!file.entry || file.id.startsWith('manual:'));
  }, [isoFiles]);

  const isoItems = useMemo(() => {
    return isoFiles.filter((file) => file.id.toLowerCase().endsWith('.iso'));
  }, [isoFiles]);

  useEffect(() => {
    if (!extractedIsoName) {
      setExtractedFiles([]);
      setExtractedKernelPath('');
      setExtractedInitrdPath('');
      setExtractedFilter('');
      setExtractedDir('');
      return;
    }

    let mounted = true;
    setExtractedLoading(true);
    isoApi.listExtractedFiles(extractedIsoName)
      .then((files) => {
        if (!mounted) return;
        setExtractedFiles(files);
        setExtractedKernelPath('');
        setExtractedInitrdPath('');
        setExtractedFilter('');
        setExtractedDir('');
      })
      .catch((error) => {
        console.error('Failed to load extracted files:', error);
        if (mounted) setIsoMessage('Failed to load extracted files.');
      })
      .finally(() => {
        if (mounted) setExtractedLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [extractedIsoName]);

  useEffect(() => {
    const source = jobsApi.stream((job) => {
      if (job.category !== 'images') return;
      if (job.status === 'queued' || job.status === 'running') {
        addPendingFromJob(job);
        return;
      }
      if (job.status === 'completed' || job.status === 'failed') {
        const targetId = job.target_id;
        const keepPendingForDownload =
          job.type === 'images.download' &&
          job.status === 'completed' &&
          job.result &&
          typeof job.result.extractJobId === 'string';

        if (targetId && !keepPendingForDownload) {
          if (job.status === 'failed') {
            setIsoFiles((prev) => prev.filter((file) => file.id !== targetId));
          } else {
            setIsoFiles((prev) => prev.map((file) => file.id === targetId ? { ...file, pending: false } : file));
          }
        }
        loadIsos({ showLoading: false, silent: true });
      }
    });
    return () => source.close();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabMode)} className="w-auto">
          <TabsList>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="isos">ISOs</TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog
          open={uploadOpen}
          onOpenChange={(open) => {
            setUploadOpen(open);
            if (!open) {
              resetUploadForm();
              setIsoUploading(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Image
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-0 overflow-hidden">
            <div className="border-b bg-muted/30 px-6 py-5">
              <DialogHeader>
                <DialogTitle>Add Image</DialogTitle>
                <DialogDescription>
                  Choose how you want to add a boot image, then fill in the details.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="px-6 py-5">
              <Tabs
                value={uploadMode}
                onValueChange={(value) => setUploadMode(value as UploadMode)}
                className="flex flex-col gap-5"
              >
                <TabsList className="grid w-full grid-cols-3 gap-3 bg-transparent p-0">
                  <TabsTrigger
                    value="iso"
                    className="h-auto flex-col items-start gap-1 rounded-xl border bg-muted/20 px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow"
                  >
                    <span className="text-sm font-semibold">ISO Upload</span>
                    <span className="text-xs text-muted-foreground">Upload an ISO from your machine.</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="manual"
                    className="h-auto flex-col items-start gap-1 rounded-xl border bg-muted/20 px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow"
                  >
                    <span className="text-sm font-semibold">Boot Files</span>
                    <span className="text-xs text-muted-foreground">Provide kernel + initrd manually.</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="url"
                    className="h-auto flex-col items-start gap-1 rounded-xl border bg-muted/20 px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow"
                  >
                    <span className="text-sm font-semibold">Direct URL</span>
                    <span className="text-xs text-muted-foreground">Download an ISO from a URL.</span>
                  </TabsTrigger>
                </TabsList>
                <div className="min-h-[300px] max-h-[55vh] overflow-y-auto pr-1">
                  <TabsContent value="iso" className="mt-0 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-5">
                      <div className="lg:col-span-3 space-y-3 rounded-xl border bg-muted/10 p-4">
                        <div className="space-y-2">
                          <Label htmlFor="iso-upload">ISO File</Label>
                          <Input
                            key={uploadInputKey}
                            id="iso-upload"
                            type="file"
                            accept=".iso"
                            onChange={(e) => setIsoFile(e.target.files?.[0] || null)}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Only .iso files are accepted.
                        </div>
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm">
                          {isoFile ? (
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{isoFile.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {(isoFile.size / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No file selected yet.</span>
                          )}
                        </div>
                      </div>
                      <div className="lg:col-span-2 space-y-3 rounded-xl border bg-muted/10 p-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="auto-extract"
                            checked={autoExtract}
                            onCheckedChange={(value) => setAutoExtract(value === true)}
                          />
                          <Label htmlFor="auto-extract" className="text-sm">
                            Auto extract and generate iPXE entry
                          </Label>
                        </div>
                        {autoExtract && (
                          <div className="space-y-2">
                            <Label htmlFor="auto-label">Image Name (optional)</Label>
                            <Input
                              id="auto-label"
                              placeholder="ubuntu-22.04"
                              value={autoLabel}
                              onChange={(e) => setAutoLabel(e.target.value)}
                            />
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Extracted images will appear in the Images list.
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="manual" className="mt-0 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Boot Files</div>
                        <div className="text-xs text-muted-foreground">
                          Provide kernel + initrd directly, or pick from an extracted ISO.
                        </div>
                      </div>
                      <div className="inline-flex rounded-lg border bg-muted/20 p-1">
                        <Button
                          type="button"
                          variant={manualMode === 'upload' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setManualMode('upload')}
                        >
                          Upload files
                        </Button>
                        <Button
                          type="button"
                          variant={manualMode === 'extracted' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setManualMode('extracted')}
                        >
                          Use extracted ISO
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="space-y-3 rounded-xl border bg-muted/10 p-4 lg:col-span-1">
                        <div className="space-y-2">
                          <Label htmlFor="manual-label">Image Label</Label>
                          <Input
                            id="manual-label"
                            placeholder="ubuntu-22.04"
                            value={manualLabel}
                            onChange={(e) => setManualLabel(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="manual-args">Kernel Args (optional)</Label>
                          <Input
                            id="manual-args"
                            placeholder="ip=dhcp"
                            value={manualArgs}
                            onChange={(e) => setManualArgs(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-4 rounded-xl border bg-muted/10 p-4 lg:col-span-2">
                        {manualMode === 'upload' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="manual-kernel">vmlinuz</Label>
                              <Input
                                key={manualInputKey}
                                id="manual-kernel"
                                type="file"
                                onChange={(e) => setManualKernel(e.target.files?.[0] || null)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="manual-initrd">initramfs</Label>
                              <Input
                                key={`${manualInputKey}-initrd`}
                                id="manual-initrd"
                                type="file"
                                onChange={(e) => setManualInitrd(e.target.files?.[0] || null)}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Source ISO</Label>
                              <select
                                value={extractedIsoName}
                                onChange={(e) => {
                                  setExtractedIsoName(e.target.value);
                                  if (!manualLabel.trim()) {
                                    setManualLabel(e.target.value.replace(/\.iso$/i, ''));
                                  }
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="">Select an ISO...</option>
                                {isoFiles
                                  .filter((file) => file.id.toLowerCase().endsWith('.iso'))
                                  .map((file) => (
                                    <option key={file.id} value={file.id}>
                                      {file.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="extracted-kernel">Kernel path</Label>
                                <Input
                                  id="extracted-kernel"
                                  list="kernel-paths"
                                  placeholder={extractedLoading ? 'Loading...' : '/iso/.../vmlinuz'}
                                  value={extractedKernelPath}
                                  onChange={(e) => setExtractedKernelPath(e.target.value)}
                                />
                                <datalist id="kernel-paths">
                                  {extractedKernelOptions.map((path) => (
                                    <option key={path} value={path} />
                                  ))}
                                </datalist>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="extracted-initrd">Initramfs path</Label>
                                <Input
                                  id="extracted-initrd"
                                  list="initrd-paths"
                                  placeholder={extractedLoading ? 'Loading...' : '/iso/.../initrd'}
                                  value={extractedInitrdPath}
                                  onChange={(e) => setExtractedInitrdPath(e.target.value)}
                                />
                                <datalist id="initrd-paths">
                                  {extractedInitrdOptions.map((path) => (
                                    <option key={path} value={path} />
                                  ))}
                                </datalist>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Extracted files</Label>
                              <div className="rounded-lg border bg-muted/20 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-xs text-muted-foreground">
                                    Browse the extracted ISO tree to pick kernel/initrd paths.
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={openExtractedBrowser}
                                    disabled={!extractedIsoName || extractedLoading}
                                  >
                                    Open file explorer
                                  </Button>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>Kernel</span>
                                    <span className="truncate font-mono text-foreground">
                                      {extractedKernelPath || 'Not selected'}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>Initrd</span>
                                    <span className="truncate font-mono text-foreground">
                                      {extractedInitrdPath || 'Not selected'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="url" className="mt-0 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-5">
                      <div className="lg:col-span-3 space-y-3 rounded-xl border bg-muted/10 p-4">
                        <div className="space-y-2">
                          <Label htmlFor="remote-url">Source URL</Label>
                          <div className="flex flex-wrap gap-2">
                            <Input
                              id="remote-url"
                              placeholder="https://example.com/image.iso"
                              value={remoteUrl}
                              onChange={(e) => {
                                setRemoteUrl(e.target.value);
                                setRemoteMeta(null);
                                setRemoteFileName('');
                                setRemoteFileNameEdited(false);
                              }}
                              className="min-w-0 flex-1"
                            />
                            <Button
                              type="button"
                              onClick={handleQueryRemoteMeta}
                              disabled={remoteLoading}
                            >
                              {remoteLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Query URL
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>File name</Label>
                          <Input
                            value={remoteFileName}
                            placeholder="Query URL to auto-fill"
                            onChange={(e) => {
                              setRemoteFileName(e.target.value);
                              setRemoteFileNameEdited(true);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="remote-auto-extract"
                            checked={remoteAutoExtract}
                            onCheckedChange={(value) => setRemoteAutoExtract(value === true)}
                          />
                          <Label htmlFor="remote-auto-extract" className="text-sm">
                            Auto extract and generate iPXE entry
                          </Label>
                        </div>
                        {remoteAutoExtract && (
                          <div className="space-y-2">
                            <Label htmlFor="remote-label">Image Name (optional)</Label>
                            <Input
                              id="remote-label"
                              placeholder="ubuntu-22.04"
                              value={remoteLabel}
                              onChange={(e) => setRemoteLabel(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                      <div className="lg:col-span-2 space-y-3 rounded-xl border bg-muted/10 p-4">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground">Metadata</div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">File size</span>
                            <span>{remoteMeta?.size ? formatBytes(remoteMeta.size) : '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">MIME type</span>
                            <span>{remoteMeta?.mimeType || '-'}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Query the URL to populate file details before downloading.
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-4">
              <div className="text-xs text-muted-foreground">
                {uploadMode === 'iso'
                  ? (isoFile ? `Selected: ${isoFile.name}` : 'Select an ISO file to continue.')
                  : uploadMode === 'manual'
                    ? (manualMode === 'upload'
                      ? 'Select kernel and initramfs files to continue.'
                      : extractedIsoName
                        ? 'Choose kernel/initrd paths from the extracted ISO.'
                        : 'Select a source ISO to browse.')
                    : (remoteUrl ? 'Query the URL or confirm file name before downloading.' : 'Enter a URL to begin.')}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setUploadOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitUpload}
                  disabled={
                    isoUploading ||
                    (uploadMode === 'url' && !remoteUrl.trim()) ||
                    (uploadMode === 'manual' && manualMode === 'extracted' && extractedLoading)
                  }
                >
                  {isoUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Working...
                    </>
                  ) : (
                    <>
                      {uploadMode === 'iso' ? 'Extract & Add' : 'Add'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        <Dialog
          open={manageOpen}
          onOpenChange={(open) => {
            setManageOpen(open);
            if (!open) {
              setManageItem(null);
            }
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Manage Image</DialogTitle>
              <DialogDescription>
                {manageItem?.entry?.label || manageItem?.name || 'Image details'}
              </DialogDescription>
            </DialogHeader>
            {manageItem ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">
                    {manageItem.id.startsWith('manual:') ? 'Manual entry' : 'ISO file'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">
                    {manageItem.pending
                      ? 'Processing'
                      : manageItem.entry
                        ? 'Imported'
                        : 'Not imported'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">File</span>
                  <span className="font-medium">{manageItem.name}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-medium">{formatBytes(manageItem.size)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">
                    {new Date(manageItem.modified_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {manageItem?.url ? (
                <Button variant="outline" asChild>
                  <a href={manageItem.url} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              )}
              {manageItem && !manageItem.entry && manageItem.id.toLowerCase().endsWith('.iso') ? (
                <Button variant="outline" onClick={() => openAttachFor(manageItem)}>
                  Attach boot files
                </Button>
              ) : null}
              {manageItem ? (
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteIso(manageItem.id, manageItem.entry?.label || manageItem.name)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={extractedBrowserOpen}
          onOpenChange={(open) => setExtractedBrowserOpen(open)}
        >
          <DialogContent className="w-[900px] max-w-[92vw] h-[560px] max-h-[85vh] p-0 overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="border-b bg-muted/40 px-6 py-4">
                <DialogHeader>
                  <DialogTitle>Extracted Files</DialogTitle>
                  <DialogDescription>
                    Browse extracted ISO contents and pick kernel/initrd paths.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 px-6 py-4 space-y-4 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setExtractedDir('')}
                      disabled={!extractedDir}
                    >
                      Root
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!extractedDir) return;
                        const parts = extractedDir.split('/').filter(Boolean);
                        parts.pop();
                        setExtractedDir(parts.join('/'));
                      }}
                      disabled={!extractedDir}
                    >
                      Up
                    </Button>
                  </div>
                  <Input
                    value={extractedFilter}
                    onChange={(e) => setExtractedFilter(e.target.value)}
                    placeholder="Search current folder..."
                    className="h-9 max-w-sm"
                  />
                </div>
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-background shadow-sm">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <span className="text-[10px]">Path</span>
                    <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] normal-case tracking-normal">
                      <button
                        type="button"
                        className="truncate hover:underline"
                        onClick={() => setExtractedDir('')}
                      >
                        {extractedRoot}
                      </button>
                      {extractedDir
                        .split('/')
                        .filter(Boolean)
                        .map((segment, index, parts) => {
                          const nextPath = parts.slice(0, index + 1).join('/');
                          return (
                            <span key={nextPath} className="flex items-center gap-1">
                              <span className="text-muted-foreground">/</span>
                              <button
                                type="button"
                                className="truncate hover:underline"
                                onClick={() => setExtractedDir(nextPath)}
                              >
                                {segment}
                              </button>
                            </span>
                          );
                        })}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {extractedLoading ? (
                      <div className="p-4 text-sm text-muted-foreground">Loading extracted files...</div>
                    ) : extractedBrowserEntries.length > 0 ? (
                      <div className="divide-y">
                        {extractedBrowserEntries.map((entry) => {
                          const fullPath = `${extractedRoot}/${entry.path}`;
                          return (
                            <div
                              key={entry.path}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                onClick={() => {
                                  if (entry.type === 'dir') {
                                    setExtractedDir(entry.path);
                                  }
                                }}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                  {entry.type === 'dir' ? (
                                    <Folder className="h-4 w-4" />
                                  ) : (
                                    <span className="text-[10px] font-semibold">FILE</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-mono text-sm">{entry.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {entry.type === 'dir' ? 'Folder' : formatBytes(entry.size ?? 0)}
                                  </div>
                                </div>
                              </button>
                              {entry.type === 'file' ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setExtractedKernelPath(fullPath)}
                                  >
                                    Use as kernel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setExtractedInitrdPath(fullPath)}
                                  >
                                    Use as initrd
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setExtractedDir(entry.path)}
                                >
                                  Open
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">
                        No files in this folder.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
                <div className="text-xs text-muted-foreground">
                  Tip: locate vmlinuz and initrd/initramfs in /boot or /casper.
                </div>
                <Button variant="outline" onClick={() => setExtractedBrowserOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isoMessage && (
          <div className="text-sm text-muted-foreground mb-4">{isoMessage}</div>
        )}
        {isoLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (activeTab === 'images' ? imageItems.length === 0 : isoItems.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="rounded-full bg-muted p-6 mb-4">
              <HardDrive className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {activeTab === 'images' ? 'No images' : 'No ISOs'}
            </h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {activeTab === 'images'
                ? 'Upload images to populate your PXE menu.'
                : 'Upload or download ISOs to see them here.'}
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Image
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={activeTab === 'images' ? imageItems : isoItems}
            searchKey="name"
            searchPlaceholder={activeTab === 'images' ? 'Search by image name...' : 'Search by ISO name...'}
            onRowClick={openManage}
            rowClassName={(row) => row.pending ? 'opacity-60 cursor-pointer' : 'cursor-pointer'}
          />
        )}
      </CardContent>
    </Card>
  );
}
