'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
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
type IsoDisplay = IsoFile & { pending?: boolean; jobId?: string };

export function IsoManager() {
  const [isoFiles, setIsoFiles] = useState<IsoDisplay[]>([]);
  const [isoLoading, setIsoLoading] = useState(true);
  const [isoUploading, setIsoUploading] = useState(false);
  const [isoFile, setIsoFile] = useState<File | null>(null);
  const [isoMessage, setIsoMessage] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
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
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteMeta, setRemoteMeta] = useState<RemoteImageMeta | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);

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
            ? { ...file, pending: !file.entry, jobId: pending.jobId }
            : { ...file, pending: !file.entry };
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
    setRemoteUrl('');
    setRemoteMeta(null);
    setUploadInputKey((key) => key + 1);
    setManualInputKey((key) => key + 1);
    setUploadMode('iso');
  }

  function addPendingFromJob(job: Job) {
    if (job.category !== 'images') return;
    const id = job.target_id || `pending:${job.id}`;
    const label =
      (job.payload && typeof job.payload.label === 'string' && job.payload.label) ||
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
      const response = await isoApi.upload(isoFile);
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoFile(null);
      setIsoMessage('Image queued for import.');
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
    try {
      setIsoUploading(true);
      const response = await isoApi.downloadFromUrl(remoteUrl.trim());
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage('Image download queued.');
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
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to delete image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to delete image.');
    }
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
                  <a href={file.url} download>
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
                onClick={() => handleDeleteIso(file.id, displayName)}
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

  useEffect(() => {
    if (!extractedIsoName) {
      setExtractedFiles([]);
      setExtractedKernelPath('');
      setExtractedInitrdPath('');
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
        loadIsos({ showLoading: false, silent: true });
      }
    });
    return () => source.close();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            Upload images, extract inside the container, and auto-generate iPXE entries.
          </CardDescription>
        </div>
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
              + Add Image
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Add Image</DialogTitle>
              <DialogDescription>
                Add a boot image using ISO, manual kernel files, or direct download.
              </DialogDescription>
            </DialogHeader>
            <Tabs
              value={uploadMode}
              onValueChange={(value) => setUploadMode(value as UploadMode)}
              className="flex flex-col gap-4"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="iso">ISO Upload</TabsTrigger>
                <TabsTrigger value="manual">Boot Files</TabsTrigger>
                <TabsTrigger value="url">Direct URL</TabsTrigger>
              </TabsList>
              <div className="mt-4 min-h-[260px] max-h-[50vh] overflow-y-auto pr-1">
                <TabsContent value="iso" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="iso-upload">Image File</Label>
                    <Input
                      key={uploadInputKey}
                      id="iso-upload"
                      type="file"
                      accept=".iso"
                      onChange={(e) => setIsoFile(e.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">Only .iso files are accepted.</p>
                  </div>
                  {isoFile && (
                    <div className="text-sm text-muted-foreground">
                      Selected: <span className="font-medium text-foreground">{isoFile.name}</span>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="manual" className="mt-0 space-y-4">
                  <div className="flex flex-wrap gap-2">
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
                  <div className="space-y-2">
                    <Label htmlFor="manual-label">Image Label</Label>
                    <Input
                      id="manual-label"
                      placeholder="ubuntu-22.04"
                      value={manualLabel}
                      onChange={(e) => setManualLabel(e.target.value)}
                    />
                  </div>
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
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="manual-args">Kernel Args (optional)</Label>
                    <Input
                      id="manual-args"
                      placeholder="ip=dhcp"
                      value={manualArgs}
                      onChange={(e) => setManualArgs(e.target.value)}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="url" className="mt-0 space-y-4">
                    <div className="grid gap-4 md:grid-cols-[120px_1fr_120px_1fr] md:items-center">
                    <div className="text-sm text-muted-foreground">URL:</div>
                    <Input
                      id="remote-url"
                      placeholder="Enter URL to download"
                      value={remoteUrl}
                      onChange={(e) => {
                        setRemoteUrl(e.target.value);
                        setRemoteMeta(null);
                      }}
                      className="md:col-span-2"
                    />
                      <Button
                        type="button"
                        onClick={handleQueryRemoteMeta}
                        disabled={remoteLoading}
                        className="justify-self-start md:justify-self-end"
                      >
                      {remoteLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Query URL
                    </Button>

                    <div className="text-sm text-muted-foreground">File name:</div>
                    <Input
                      readOnly
                      value={remoteMeta?.fileName ?? ''}
                      placeholder="Please (re-)query URL to get meta information"
                      className="md:col-span-3"
                    />

                    <div className="text-sm text-muted-foreground">File size:</div>
                    <div className="text-sm">
                      {remoteMeta?.size ? formatBytes(remoteMeta.size) : '-'}
                    </div>

                    <div className="text-sm text-muted-foreground">MIME type:</div>
                    <div className="text-sm">
                      {remoteMeta?.mimeType || '-'}
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-muted-foreground">
                    Query the URL to populate file details before downloading.
                  </div>
                </TabsContent>
              </div>
            </Tabs>
            <div className="flex items-center justify-between gap-2 pt-2">
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
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isoMessage && (
          <div className="text-sm text-muted-foreground mb-4">{isoMessage}</div>
        )}
        {isoLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : isoFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="rounded-full bg-muted p-6 mb-4">
              <HardDrive className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No images</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Upload images to populate your PXE menu.
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              + Add Image
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={isoFiles}
            searchKey="name"
            searchPlaceholder="Search by image name..."
            rowClassName={(row) => row.pending ? 'opacity-60' : ''}
          />
        )}
      </CardContent>
    </Card>
  );
}
