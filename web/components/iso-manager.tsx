'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Folder, File as FileIcon, HardDrive, Loader2, Plus, Trash2, Upload } from 'lucide-react';


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
    // Existing job stream logic
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

  // Helper for file input visual
  const FileInputWithPreview = ({ 
    file, 
    onSelect, 
    accept, 
    label 
  }: { 
    file: File | null; 
    onSelect: (f: File | null) => void; 
    accept?: string;
    label: string;
  }) => (
    <div className="relative group cursor-pointer">
      <div className={`
        relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed 
        transition-all duration-200 ease-in-out
        ${file 
          ? 'border-primary/50 bg-primary/5' 
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
        }
        h-32 w-full
      `}>
        <input
          type="file"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          accept={accept}
          onChange={(e) => onSelect(e.target.files?.[0] || null)}
        />
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          {file ? (
            <>
              <div className="rounded-full bg-background p-2 shadow-sm ring-1 ring-border">
                <FileIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-full bg-muted p-2 group-hover:bg-background transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">Click or drag file here</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

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
          <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden outline-none duration-200 sm:rounded-xl">
            <div className="px-6 py-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <DialogHeader>
                <DialogTitle className="text-xl font-medium">Add Image</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1.5">
                  Import a boot image from a local file or remote URL.
                </DialogDescription>
              </DialogHeader>
            </div>
            
            <div className="flex bg-muted/30 min-h-[400px]">
              {/* Sidebar Tabs */}
              <div className="w-[200px] border-r bg-background/50 p-4 space-y-1">
                <button
                  onClick={() => setUploadMode('iso')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    uploadMode === 'iso' 
                      ? 'bg-secondary text-foreground' 
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  Upload ISO
                </button>
                <button
                  onClick={() => setUploadMode('manual')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    uploadMode === 'manual' 
                      ? 'bg-secondary text-foreground' 
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  Boot Files
                </button>
                <button
                  onClick={() => setUploadMode('url')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    uploadMode === 'url' 
                      ? 'bg-secondary text-foreground' 
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  Direct URL
                </button>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-6 bg-background">
                {uploadMode === 'iso' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>ISO File</Label>
                        <FileInputWithPreview 
                          file={isoFile} 
                          onSelect={setIsoFile} 
                          accept=".iso" 
                          label="Upload ISO"
                        />
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/20">
                        <Checkbox
                          id="auto-extract"
                          className="mt-1"
                          checked={autoExtract}
                          onCheckedChange={(value) => setAutoExtract(value === true)}
                        />
                        <div className="grid gap-1.5">
                          <Label htmlFor="auto-extract" className="font-medium">
                            Auto-extract contents
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Automatically extract kernel and initrd to generate an iPXE entry.
                          </p>
                        </div>
                      </div>

                      {autoExtract && (
                        <div className="space-y-2">
                          <Label htmlFor="auto-label">Image Label <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                          <Input
                            id="auto-label"
                            placeholder="e.g. Ubuntu 22.04"
                            value={autoLabel}
                            onChange={(e) => setAutoLabel(e.target.value)}
                            className="bg-background"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {uploadMode === 'manual' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Sub-tabs for manual mode */}
                    <div className="flex rounded-lg bg-muted p-1 w-fit mb-4">
                       <button
                         type="button"
                         onClick={() => setManualMode('upload')}
                         className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                           manualMode === 'upload' 
                             ? 'bg-background shadow-sm text-foreground' 
                             : 'text-muted-foreground hover:text-foreground'
                         }`}
                       >
                         Upload Files
                       </button>
                       <button
                         type="button"
                         onClick={() => setManualMode('extracted')}
                         className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                           manualMode === 'extracted' 
                             ? 'bg-background shadow-sm text-foreground' 
                             : 'text-muted-foreground hover:text-foreground'
                         }`}
                       >
                         Use Extracted
                       </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="manual-label">Image Label</Label>
                        <Input
                          id="manual-label"
                          placeholder="e.g. Ubuntu 22.04"
                          value={manualLabel}
                          onChange={(e) => setManualLabel(e.target.value)}
                        />
                      </div>

                      {manualMode === 'upload' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Kernel (vmlinuz)</Label>
                            <FileInputWithPreview 
                              file={manualKernel} 
                              onSelect={setManualKernel}
                              label="Upload Kernel" 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Initrd (initramfs)</Label>
                            <FileInputWithPreview 
                              file={manualInitrd} 
                              onSelect={setManualInitrd}
                              label="Upload Initrd" 
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
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
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                          
                          <div className="grid gap-4">
                             <div className="flex gap-2 items-end">
                               <div className="flex-1 space-y-2">
                                  <Label>Kernel Path</Label>
                                  <Input value={extractedKernelPath} readOnly placeholder="Select from explorer" />
                               </div>
                               <Button variant="outline" onClick={openExtractedBrowser}>Browse</Button>
                             </div>
                             <div className="flex-1 space-y-2">
                                <Label>Initrd Path</Label>
                                <Input value={extractedInitrdPath} readOnly placeholder="Select from explorer" />
                             </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="manual-args">Boot Arguments <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                        <Input
                          id="manual-args"
                          placeholder="e.g. ip=dhcp console=ttyS0"
                          value={manualArgs}
                          onChange={(e) => setManualArgs(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {uploadMode === 'url' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="remote-url">Source URL</Label>
                        <div className="flex gap-2">
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
                          />
                          <Button 
                            variant="secondary"
                            onClick={handleQueryRemoteMeta}
                            disabled={remoteLoading || !remoteUrl}
                          >
                            {remoteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Check
                          </Button>
                        </div>
                      </div>

                      {remoteMeta && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm flex justify-between items-center text-muted-foreground">
                          <span>{remoteMeta.mimeType}</span>
                          <span>{formatBytes(remoteMeta.size || 0)}</span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Save Filename</Label>
                        <Input
                           value={remoteFileName}
                           onChange={(e) => {
                             setRemoteFileName(e.target.value);
                             setRemoteFileNameEdited(true);
                           }}
                           placeholder="image.iso"
                        />
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/20">
                         <Checkbox
                           id="remote-auto-extract"
                           className="mt-1"
                           checked={remoteAutoExtract}
                           onCheckedChange={(value) => setRemoteAutoExtract(value === true)}
                         />
                         <div className="grid gap-1.5">
                           <Label htmlFor="remote-auto-extract" className="font-medium">
                             Auto-extract contents
                           </Label>
                         </div>
                       </div>
                       
                       {remoteAutoExtract && (
                         <div className="space-y-2">
                           <Label htmlFor="remote-label">Image Label <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                           <Input
                             id="remote-label"
                             placeholder="e.g. Ubuntu 22.04"
                             value={remoteLabel}
                             onChange={(e) => setRemoteLabel(e.target.value)}
                           />
                         </div>
                       )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t bg-background/95 p-6 backdrop-blur">
               <div className="text-xs text-muted-foreground">
                 {isoUploading ? 'Processing request...' : 'Ready to add image.'}
               </div>
               <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmitUpload} 
                    disabled={isoUploading || 
                      (uploadMode === 'url' && !remoteUrl) || 
                      (uploadMode === 'manual' && manualMode === 'extracted' && !extractedIsoName)}
                  >
                    {isoUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {uploadMode === 'iso' ? 'Import Image' : 'Add Entry'}
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
          <DialogContent className="max-w-md gap-0 p-0 overflow-hidden sm:rounded-xl">
            <div className="px-6 py-5 border-b bg-background/95 backdrop-blur">
              <DialogHeader>
                <DialogTitle className="text-lg font-medium tracking-tight">Manage Image</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1">
                  {manageItem?.entry?.label || manageItem?.name || 'Image details'}
                </DialogDescription>
              </DialogHeader>
            </div>
            
            <div className="p-6 space-y-6">
            {manageItem ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground col-span-1">Type</span>
                  <span className="font-medium col-span-2 text-right">
                    {manageItem.id.startsWith('manual:') ? 'Manual entry' : 'ISO file'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground col-span-1">Status</span>
                  <span className="font-medium col-span-2 text-right">
                    {manageItem.pending
                      ? <span className="inline-flex items-center text-yellow-600 dark:text-yellow-400">
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin"/> Processing
                        </span>
                      : manageItem.entry
                        ? <span className="text-green-600 dark:text-green-400">Imported</span>
                        : 'Not imported'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground col-span-1">File Name</span>
                  <span className="font-medium col-span-2 text-right truncate" title={manageItem.name}>{manageItem.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                  <span className="text-muted-foreground col-span-1">Size</span>
                  <span className="font-medium col-span-2 text-right">{formatBytes(manageItem.size)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2">
                  <span className="text-muted-foreground col-span-1">Updated</span>
                  <span className="font-medium col-span-2 text-right">
                    {new Date(manageItem.modified_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : null}
            
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2 w-full">
                 {manageItem?.url ? (
                  <Button variant="outline" className="flex-1" asChild>
                    <a href={manageItem.url} download>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" className="flex-1" disabled>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                )}
                
                {manageItem && !manageItem.entry && manageItem.id.toLowerCase().endsWith('.iso') && (
                  <Button variant="secondary" className="flex-1" onClick={() => openAttachFor(manageItem)}>
                    Attach Boot Files
                  </Button>
                )}
              </div>
              
              {manageItem && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
                  onClick={() => handleDeleteIso(manageItem.id, manageItem.entry?.label || manageItem.name)}
                >
                  Delete Image
                </Button>
              )}
            </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={extractedBrowserOpen}
          onOpenChange={(open) => setExtractedBrowserOpen(open)}
        >
          <DialogContent className="w-[1000px] max-w-[95vw] h-[650px] gap-0 p-0 overflow-hidden outline-none duration-200 sm:rounded-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur z-10 shrink-0">
              <div className="space-y-1">
                <DialogTitle className="text-lg font-medium tracking-tight">File Explorer</DialogTitle>
                <div className="flex items-center text-sm text-muted-foreground gap-2">
                   <div className="flex items-center">
                     <button onClick={() => setExtractedDir('')} className="hover:text-foreground transition-colors hover:underline">
                       {extractedRoot.replace(/^\/iso\//, '') || 'root'}
                     </button>
                     {extractedDir.split('/').filter(Boolean).map((part, i, arr) => {
                       const path = arr.slice(0, i + 1).join('/');
                       return (
                         <span key={path} className="flex items-center">
                           <span className="mx-1.5 opacity-50">/</span>
                           <button 
                             onClick={() => setExtractedDir(path)}
                             className="hover:text-foreground transition-colors hover:underline"
                           >
                             {part}
                           </button>
                         </span>
                       );
                     })}
                   </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="relative">
                   <Input
                     value={extractedFilter}
                     onChange={(e) => setExtractedFilter(e.target.value)}
                     placeholder="Search files..."
                     className="h-8 w-[200px] bg-muted/50"
                   />
                 </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-muted/5 p-4">
              <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-6">Name</div>
                  <div className="col-span-2 text-right">Size</div>
                  <div className="col-span-4 text-right">Actions</div>
                </div>
                
                {extractedLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Loading directory...</span>
                  </div>
                ) : extractedBrowserEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Folder className="h-10 w-10 opacity-20 mb-3" />
                    <p>No files found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {extractedBrowserEntries.map((entry) => {
                      const fullPath = `${extractedRoot}/${entry.path}`;
                       return (
                        <div 
                          key={entry.path} 
                          className="grid grid-cols-12 gap-4 px-4 py-2.5 items-center hover:bg-muted/40 transition-colors group text-sm"
                        >
                          <div className="col-span-6 flex items-center min-w-0">
                            {entry.type === 'dir' ? (
                              <Folder className="h-4 w-4 text-blue-400 mr-3 shrink-0 fill-blue-400/20" />
                            ) : (
                              <FileIcon className="h-4 w-4 text-slate-400 mr-3 shrink-0" />
                            )}
                            <button 
                              className={`truncate text-left outline-none ${entry.type === 'dir' ? 'font-medium hover:text-primary hover:underline' : ''}`}
                              onClick={() => entry.type === 'dir' && setExtractedDir(entry.path)}
                            >
                              {entry.name}
                            </button>
                          </div>
                          
                          <div className="col-span-2 text-right text-muted-foreground font-mono text-xs">
                             {entry.type === 'dir' ? '--' : formatBytes(entry.size ?? 0)}
                          </div>
                          
                          <div className="col-span-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             {entry.type === 'dir' ? (
                               <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExtractedDir(entry.path)}>
                                 Open
                               </Button>
                             ) : (
                               <>
                                 <Button 
                                   size="sm" 
                                   variant="ghost" 
                                   className="h-7 text-xs hover:bg-primary/10 hover:text-primary"
                                   onClick={() => { setExtractedKernelPath(fullPath); }}
                                 >
                                   Set Kernel
                                 </Button>
                                 <Button 
                                   size="sm" 
                                   variant="ghost" 
                                   className="h-7 text-xs hover:bg-primary/10 hover:text-primary"
                                   onClick={() => { setExtractedInitrdPath(fullPath); }}
                                 >
                                   Set Initrd
                                 </Button>
                               </>
                             )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-background flex justify-end">
              <Button variant="outline" onClick={() => setExtractedBrowserOpen(false)}>
                Done
              </Button>
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
