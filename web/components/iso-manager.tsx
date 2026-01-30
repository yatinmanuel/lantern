'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Folder, File as FileIcon, HardDrive, Loader2, Plus, Trash2, Upload } from 'lucide-react';


import { ColumnDef } from '@tanstack/react-table';
import { isoApi, IsoFile, RemoteImageMeta, ExtractedFile } from '@/lib/iso-api';
import { imageApi, ImageEntry } from '@/lib/image-api';
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
type ImageDisplay = ImageEntry & { pending?: boolean; jobId?: string };
type ManageItem =
  | { kind: 'iso'; data: IsoDisplay }
  | { kind: 'image'; data: ImageDisplay };

export function IsoManager() {
  const [isoFiles, setIsoFiles] = useState<IsoDisplay[]>([]);
  const [isoLoading, setIsoLoading] = useState(true);
  const [imageEntries, setImageEntries] = useState<ImageDisplay[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [isoUploading, setIsoUploading] = useState(false);
  const [isoFile, setIsoFile] = useState<File | null>(null);
  const [isoMessage, setIsoMessage] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(true);
  const [autoLabel, setAutoLabel] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabMode>('images');
  const [manageOpen, setManageOpen] = useState(false);
  const [manageItem, setManageItem] = useState<ManageItem | null>(null);
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
  const [extractedInitrdPaths, setExtractedInitrdPaths] = useState<string[]>(['']);
  const [extractedLoading, setExtractedLoading] = useState(false);
  const [extractedFilter, setExtractedFilter] = useState('');
  const [extractedDir, setExtractedDir] = useState('');
  const [extractedBrowserOpen, setExtractedBrowserOpen] = useState(false);
  const [browserContext, setBrowserContext] = useState<'manual' | 'manage'>('manual');
  const [browserTarget, setBrowserTarget] = useState<{ type: 'kernel' } | { type: 'initrd'; index: number } | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<{ path: string; fullPath: string; type: 'file' | 'dir' } | null>(null);
  const [extractedBrowserError, setExtractedBrowserError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteMeta, setRemoteMeta] = useState<RemoteImageMeta | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteAutoExtract, setRemoteAutoExtract] = useState(true);
  const [remoteLabel, setRemoteLabel] = useState('');
  const [remoteFileName, setRemoteFileName] = useState('');
  const [remoteFileNameEdited, setRemoteFileNameEdited] = useState(false);
  const [manageLabel, setManageLabel] = useState('');
  const [manageOsType, setManageOsType] = useState('');
  const [manageKernelPath, setManageKernelPath] = useState('');
  const [manageInitrdPath, setManageInitrdPath] = useState('');
  const [manageBootArgs, setManageBootArgs] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageIsoName, setManageIsoName] = useState('');
  const [manageIsoSaving, setManageIsoSaving] = useState(false);

  useEffect(() => {
    loadIsos();
    loadImages();
    const interval = setInterval(() => {
      loadIsos({ showLoading: false, silent: true });
      loadImages({ showLoading: false, silent: true });
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
      console.error('Failed to load ISOs:', error);
      if (!silent) {
        setIsoMessage('Failed to load ISO list.');
      }
    } finally {
      if (showLoading) {
        setIsoLoading(false);
      }
    }
  }

  async function loadImages(options?: { showLoading?: boolean; silent?: boolean }) {
    const { showLoading = true, silent = false } = options ?? {};
    try {
      if (showLoading) {
        setImagesLoading(true);
      }
      const entries = await imageApi.list();
      setImageEntries(entries.map((entry) => ({
        ...entry,
        initrd_items: entry.initrd_items || [],
      })));
      if (!silent) {
        setIsoMessage(null);
      }
    } catch (error) {
      console.error('Failed to load image entries:', error);
      if (!silent) {
        setIsoMessage('Failed to load image entries.');
      }
    } finally {
      if (showLoading) {
        setImagesLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!manageOpen || manageItem?.kind !== 'image') return;
    setManageLabel(manageItem.data.label || '');
    setManageOsType(manageItem.data.os_type || '');
    setManageKernelPath(manageItem.data.kernel_path || '');
    setManageInitrdPath(manageItem.data.initrd_items?.[0]?.path || '');
    setManageBootArgs(manageItem.data.boot_args || '');
    if (manageItem.data.iso_name?.toLowerCase().endsWith('.iso')) {
      setExtractedIsoName(manageItem.data.iso_name);
    }
  }, [manageOpen, manageItem]);

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
    setExtractedInitrdPaths(['']);
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

  function resolveJobTargetId(job: Job): string | null {
    if (job.target_id) return job.target_id;
    const payload = job.payload || {};
    if (typeof payload.fileName === 'string' && payload.fileName) return payload.fileName;
    if (typeof payload.safeName === 'string' && payload.safeName) return payload.safeName;
    if (typeof payload.iso_name === 'string' && payload.iso_name) return payload.iso_name;
    return null;
  }

  function resolveJobLabel(job: Job): string {
    const payload = job.payload || {};
    if (typeof payload.fileName === 'string' && payload.fileName) return payload.fileName;
    if (typeof payload.safeName === 'string' && payload.safeName) return payload.safeName;
    if (typeof payload.label === 'string' && payload.label) return payload.label;
    if (job.target_id) return job.target_id;
    if (job.message) return job.message;
    return 'Pending';
  }

  function affectsIsoList(job: Job): boolean {
    if (job.target_type === 'iso') return true;
    if (job.type === 'images.build') return true;
    return ['images.download', 'images.add', 'iso.extract', 'images.extract'].includes(job.type);
  }

  function addPendingFromJob(job: Job) {
    if (job.category !== 'images') return;
    if (!affectsIsoList(job)) return;
    const targetId = resolveJobTargetId(job);
    const id = targetId || `pending:${job.id}`;
    const label = targetId || resolveJobLabel(job);
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
      await loadImages({ showLoading: false, silent: true });
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
      await loadImages({ showLoading: false, silent: true });
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
    const validInitrdPaths = extractedInitrdPaths.map(p => p.trim()).filter(Boolean);
    if (!extractedKernelPath.trim() || validInitrdPaths.length === 0) {
      setIsoMessage('Select kernel and at least one initramfs path.');
      return;
    }
    try {
      setIsoUploading(true);
      const response = await isoApi.attachFromExtracted({
        isoName: extractedIsoName.trim(),
        label: manualLabel.trim(),
        kernelPath: extractedKernelPath.trim(),
        initrdPaths: validInitrdPaths,
        bootArgs: manualArgs.trim() || undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage('Boot files queued for attach.');
      setUploadOpen(false);
      await loadImages({ showLoading: false, silent: true });
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
      await loadImages({ showLoading: false, silent: true });
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
    if (!confirm(`Delete ISO ${displayName}?`)) return;
    try {
      await isoApi.remove(id);
      setIsoMessage('ISO delete queued.');
      if (manageItem?.kind === 'iso' && manageItem.data.id === id) {
        setManageOpen(false);
        setManageItem(null);
      }
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to delete ISO:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to delete ISO.');
    }
  }

  async function handleDeleteImage(id: string, displayName: string) {
    if (!confirm(`Delete image entry ${displayName}?`)) return;
    try {
      await imageApi.remove(id);
      setIsoMessage('Image entry removed.');
      if (manageItem?.kind === 'image' && manageItem.data.id === id) {
        setManageOpen(false);
        setManageItem(null);
      }
      await loadImages({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to delete image entry:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to delete image entry.');
    }
  }

  async function handleUpdateImageEntry() {
    if (!manageItem || manageItem.kind !== 'image') return;
    if (!manageLabel.trim()) {
      setIsoMessage('Add a name for this image.');
      return;
    }
    if (!manageKernelPath.trim() || !manageInitrdPath.trim()) {
      setIsoMessage('Select both kernel and initrd paths.');
      return;
    }
    try {
      setManageSaving(true);
      const response = await isoApi.attachFromExtracted({
        isoName: manageItem.data.iso_name,
        label: manageLabel.trim(),
        kernelPath: manageKernelPath.trim(),
        initrdPaths: [manageInitrdPath.trim()],
        osType: manageOsType.trim() || undefined,
        bootArgs: manageBootArgs.trim() || undefined,
      });
      if (response?.job) {
        addPendingFromJob(response.job);
      }
      setIsoMessage('Image update queued.');
      setManageOpen(false);
      await loadImages({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to update image entry:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to update image entry.');
    } finally {
      setManageSaving(false);
    }
  }

  async function handleRenameIso() {
    if (!manageItem || manageItem.kind !== 'iso') return;
    const nextName = manageIsoName.trim();
    if (!nextName) {
      setIsoMessage('Enter a new ISO file name.');
      return;
    }
    try {
      setManageIsoSaving(true);
      const response = await isoApi.rename(manageItem.data.id, nextName);
      if (response?.file?.name) {
        setManageItem({
          kind: 'iso',
          data: {
            ...manageItem.data,
            name: response.file.name,
            id: response.file.id,
          },
        });
        setManageIsoName(response.file.name);
      }
      setIsoMessage('ISO rename complete.');
      await loadIsos({ showLoading: false, silent: true });
      await loadImages({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to rename ISO:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to rename ISO.');
    } finally {
      setManageIsoSaving(false);
    }
  }

  function openManageIso(item: IsoDisplay) {
    setManageItem({ kind: 'iso', data: item });
    setManageIsoName(item.name);
    setManageOpen(true);
  }

  function openManageImage(item: ImageDisplay) {
    setManageItem({ kind: 'image', data: item });
    if (item.iso_name?.toLowerCase().endsWith('.iso')) {
      setExtractedIsoName(item.iso_name);
    }
    setManageOpen(true);
  }

  function openExtractedBrowser(context: 'manual' | 'manage', target: { type: 'kernel' } | { type: 'initrd'; index: number }) {
    setBrowserContext(context);
    setBrowserTarget(target);
    setSelectedEntry(null);
    setExtractedDir('');
    setExtractedFilter('');
    if (!extractedIsoName && context === 'manual') {
      setIsoMessage('Select an extracted ISO first.');
      return;
    }
    if (context === 'manage' && manageItem?.kind === 'image' && manageItem.data.iso_name) {
      setExtractedIsoName(manageItem.data.iso_name);
    }
    setExtractedBrowserOpen(true);
  }

  function handleBrowserSelect() {
    if (!selectedEntry || selectedEntry.type !== 'file' || extractedLoading) return;
    
    if (browserContext === 'manage') {
      if (browserTarget?.type === 'kernel') {
        setManageKernelPath(selectedEntry.fullPath);
      } else if (browserTarget?.type === 'initrd') {
        setManageInitrdPath(selectedEntry.fullPath);
      }
    } else {
      if (browserTarget?.type === 'kernel') {
        setExtractedKernelPath(selectedEntry.fullPath);
      } else if (browserTarget?.type === 'initrd') {
        setExtractedInitrdPaths(prev => {
          const updated = [...prev];
          updated[browserTarget.index] = selectedEntry.fullPath;
          return updated;
        });
      }
    }
    setExtractedBrowserOpen(false);
    setSelectedEntry(null);
    setBrowserTarget(null);
  }

  function handleBrowserRowClick(entry: { path: string; type: 'file' | 'dir'; name: string }, fullPath: string) {
    if (entry.type === 'dir') {
      setExtractedDir(entry.path);
      setSelectedEntry(null);
    } else {
      setSelectedEntry({ path: entry.path, fullPath, type: 'file' });
    }
  }

  function handleBrowserRowDoubleClick(entry: { path: string; type: 'file' | 'dir'; name: string }, fullPath: string) {
    if (extractedLoading) return;
    if (entry.type === 'dir') {
      setExtractedDir(entry.path);
      setSelectedEntry(null);
    } else {
      // Double-click on file: confirm selection
      setSelectedEntry({ path: entry.path, fullPath, type: 'file' });
      // Use setTimeout to let the state update before triggering select
      setTimeout(() => {
        if (browserContext === 'manage') {
          if (browserTarget?.type === 'kernel') {
            setManageKernelPath(fullPath);
          } else if (browserTarget?.type === 'initrd') {
            setManageInitrdPath(fullPath);
          }
        } else {
          if (browserTarget?.type === 'kernel') {
            setExtractedKernelPath(fullPath);
          } else if (browserTarget?.type === 'initrd') {
            setExtractedInitrdPaths(prev => {
              const updated = [...prev];
              if (browserTarget.index < updated.length) {
                updated[browserTarget.index] = fullPath;
              }
              return updated;
            });
          }
        }
        setExtractedBrowserOpen(false);
        setSelectedEntry(null);
        setBrowserTarget(null);
      }, 0);
    }
  }

  function retryLoadExtractedFiles() {
    if (!extractedIsoName) return;
    setExtractedLoading(true);
    setExtractedBrowserError(null);
    isoApi.listExtractedFiles(extractedIsoName)
      .then((files) => {
        setExtractedFiles(files);
        setExtractedBrowserError(null);
      })
      .catch((error) => {
        console.error('Failed to load extracted files:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to load extracted files.';
        setExtractedFiles([]);
        setExtractedBrowserError(errorMsg);
      })
      .finally(() => {
        setExtractedLoading(false);
      });
  }

  const isoColumns: ColumnDef<IsoDisplay>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="ISO File" />
        ),
        cell: ({ row }) => {
          const file = row.original;
          return (
            <div className="flex items-center gap-2">
              <div className="font-medium truncate">{file.name}</div>
              {file.pending && <Badge variant="secondary">Processing</Badge>}
            </div>
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
                  handleDeleteIso(file.id, file.name);
                }}
                className="text-destructive hover:text-destructive"
                title="Delete ISO"
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

  const imageColumns: ColumnDef<ImageDisplay>[] = useMemo(
    () => [
      {
        accessorKey: 'label',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Image" />
        ),
        cell: ({ row }) => (
          <div className="font-medium">{row.original.label}</div>
        ),
      },
      {
        accessorKey: 'kernel_path',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Kernel" />
        ),
        cell: ({ row }) => (
          <div className="text-xs font-mono truncate max-w-[240px]" title={row.original.kernel_path}>
            {row.original.kernel_path}
          </div>
        ),
      },
      {
        id: 'initrd',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Initrd" />
        ),
        cell: ({ row }) => (
          <div
            className="text-xs font-mono truncate max-w-[240px]"
            title={row.original.initrd_items?.[0]?.path || ''}
          >
            {row.original.initrd_items?.[0]?.path || '—'}
          </div>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.created_at).toLocaleString()}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteImage(row.original.id, row.original.label);
              }}
              className="text-destructive hover:text-destructive"
              title="Delete image entry"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableHiding: false,
      },
    ],
    [handleDeleteImage]
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

  const manageCanBrowse = useMemo(() => {
    if (!manageItem || manageItem.kind !== 'image') return false;
    return manageItem.data.iso_name?.toLowerCase().endsWith('.iso');
  }, [manageItem]);

  const imageItems = useMemo(() => {
    return imageEntries;
  }, [imageEntries]);

  const isoItems = useMemo(() => {
    return isoFiles;
  }, [isoFiles]);

  useEffect(() => {
    if (!extractedIsoName) {
      setExtractedFiles([]);
      setExtractedKernelPath('');
      setExtractedInitrdPaths(['']);
      setExtractedFilter('');
      setExtractedDir('');
      setExtractedBrowserError(null);
      return;
    }

    let mounted = true;
    setExtractedLoading(true);
    setExtractedBrowserError(null);
    isoApi.listExtractedFiles(extractedIsoName)
      .then((files) => {
        if (!mounted) return;
        setExtractedFiles(files);
        setExtractedKernelPath('');
        setExtractedInitrdPaths(['']);
        setExtractedFilter('');
        setExtractedDir('');
        setExtractedBrowserError(null);
      })
      .catch((error) => {
        console.error('Failed to load extracted files:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to load extracted files.';
        if (mounted) {
          setExtractedFiles([]);
          setExtractedBrowserError(errorMsg);
        }
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
        const targetId = resolveJobTargetId(job);
        const hasFollowUpJob = job.result && (
          typeof job.result.addJobId === 'string' ||
          typeof job.result.extractJobId === 'string' ||
          typeof job.result.buildJobId === 'string'
        );

        if (targetId && !hasFollowUpJob && affectsIsoList(job)) {
          if (job.status === 'failed') {
            setIsoFiles((prev) => prev.filter((file) => file.id !== targetId));
          } else {
            setIsoFiles((prev) => prev.map((file) => file.id === targetId ? { ...file, pending: false } : file));
          }
        }
        loadIsos({ showLoading: false, silent: true });
        loadImages({ showLoading: false, silent: true });
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
          <DialogContent className="!w-[95vw] !max-w-5xl h-[80vh] max-h-[42rem] gap-0 p-0 overflow-hidden outline-none duration-200 sm:rounded-xl flex flex-col">
            <div className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-xl font-medium">Add Image</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1.5">
                  Import a boot image from a local file or remote URL.
                </DialogDescription>
              </DialogHeader>
            </div>
            
            <div className="flex bg-muted/30 flex-1 overflow-hidden">
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
                                .filter((file) => file.name.toLowerCase().endsWith('.iso'))
                                .map((file) => (
                                  <option key={file.id} value={file.name}>
                                    {file.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          
                          <div className="grid gap-4">
                             <div className="flex gap-2 items-end">
                               <div className="flex-1 space-y-2">
                                  <Label>Kernel Path</Label>
                                  <Input value={extractedKernelPath} readOnly placeholder="Select from explorer" className="bg-background" />
                               </div>
                               <Button variant="outline" onClick={() => openExtractedBrowser('manual', { type: 'kernel' })} disabled={!extractedIsoName}>Browse</Button>
                             </div>
                             
                             <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>Initrd Paths</Label>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    onClick={() => setExtractedInitrdPaths(prev => [...prev, ''])}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Initrd
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  {extractedInitrdPaths.map((path, index) => (
                                    <div key={index} className="flex gap-2 items-center">
                                      <Input 
                                        value={path} 
                                        readOnly 
                                        placeholder="Select from explorer" 
                                        className="flex-1 bg-background"
                                      />
                                      <Button 
                                        variant="outline" 
                                        onClick={() => openExtractedBrowser('manual', { type: 'initrd', index })}
                                        disabled={!extractedIsoName}
                                      >
                                        Browse
                                      </Button>
                                      {extractedInitrdPaths.length > 1 && (
                                        <Button 
                                          variant="ghost" 
                                          size="icon"
                                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                          onClick={() => setExtractedInitrdPaths(prev => prev.filter((_, i) => i !== index))}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
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
              setManageIsoName('');
              setManageIsoSaving(false);
            }
          }}
        >
        <DialogContent className="w-[95vw] max-w-5xl h-[80vh] max-h-[40rem] gap-0 p-0 overflow-hidden sm:rounded-xl flex flex-col">
            <div className="px-6 py-5 border-b bg-background/95 backdrop-blur">
              <DialogHeader>
                <DialogTitle className="text-lg font-medium tracking-tight">
                  {manageItem?.kind === 'image' ? 'Manage Image Entry' : 'Manage ISO'}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1">
                  {manageItem?.kind === 'image'
                    ? manageItem.data.label
                    : manageItem?.kind === 'iso'
                      ? manageItem.data.name
                      : 'Details'}
                </DialogDescription>
              </DialogHeader>
            </div>

            {manageItem?.kind === 'iso' ? (
              <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                    <span className="text-muted-foreground col-span-1">Type</span>
                    <span className="font-medium col-span-2 text-right">ISO file</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                    <span className="text-muted-foreground col-span-1">Status</span>
                    <span className="font-medium col-span-2 text-right">
                      {manageItem.data.pending ? (
                        <span className="inline-flex items-center text-yellow-600 dark:text-yellow-400">
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Processing
                        </span>
                      ) : (
                        'Available'
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                    <span className="text-muted-foreground col-span-1">File Name</span>
                    <span className="font-medium col-span-2 text-right truncate" title={manageItem.data.name}>
                      {manageItem.data.name}
                    </span>
                  </div>
                  <div className="space-y-2 py-2 border-b border-border/50">
                    <Label>Rename ISO</Label>
                    <div className="flex gap-2">
                      <Input
                        value={manageIsoName}
                        onChange={(e) => setManageIsoName(e.target.value)}
                        placeholder="new-name.iso"
                      />
                      <Button
                        variant="secondary"
                        onClick={handleRenameIso}
                        disabled={manageIsoSaving || !manageIsoName.trim()}
                      >
                        {manageIsoSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Rename
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                    <span className="text-muted-foreground col-span-1">Size</span>
                    <span className="font-medium col-span-2 text-right">{formatBytes(manageItem.data.size)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-2">
                    <span className="text-muted-foreground col-span-1">Updated</span>
                    <span className="font-medium col-span-2 text-right">
                      {new Date(manageItem.data.modified_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex gap-2 w-full">
                    {manageItem.data.url ? (
                      <Button variant="outline" className="flex-1" asChild>
                        <a href={manageItem.data.url} download>
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
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
                    onClick={() => handleDeleteIso(manageItem.data.id, manageItem.data.name)}
                  >
                    Delete ISO
                  </Button>
                </div>
              </div>
            ) : manageItem?.kind === 'image' ? (
              <div className="flex-1 flex flex-col">
                <div className="p-6 space-y-6 overflow-y-auto">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manage-label">Image Name</Label>
                      <Input
                        id="manage-label"
                        value={manageLabel}
                        onChange={(e) => setManageLabel(e.target.value)}
                        placeholder="e.g. Ubuntu 22.04"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manage-os-type">OS Type</Label>
                      <Input
                        id="manage-os-type"
                        value={manageOsType}
                        onChange={(e) => setManageOsType(e.target.value)}
                        placeholder="e.g. ubuntu"
                      />
                    </div>

                    <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                          <Label>Kernel Path</Label>
                          <Input
                            value={manageKernelPath}
                            onChange={(e) => setManageKernelPath(e.target.value)}
                            placeholder="/iso/.../vmlinuz"
                            className="font-mono text-xs"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => openExtractedBrowser('manage', { type: 'kernel' })}
                          disabled={!manageCanBrowse}
                        >
                          Browse
                        </Button>
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                          <Label>Initrd Path</Label>
                          <Input
                            value={manageInitrdPath}
                            onChange={(e) => setManageInitrdPath(e.target.value)}
                            placeholder="/iso/.../initrd"
                            className="font-mono text-xs"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => openExtractedBrowser('manage', { type: 'initrd', index: 0 })}
                          disabled={!manageCanBrowse}
                        >
                          Browse
                        </Button>
                      </div>
                      {!manageCanBrowse && (
                        <p className="text-xs text-muted-foreground">
                          File browser is available when the image was created from an ISO.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manage-boot-args">
                        Boot Arguments <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
                      </Label>
                      <Input
                        id="manage-boot-args"
                        value={manageBootArgs}
                        onChange={(e) => setManageBootArgs(e.target.value)}
                        placeholder="e.g. ip=dhcp console=ttyS0"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t bg-background/95 px-6 py-4">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/5"
                    onClick={() => handleDeleteImage(manageItem.data.id, manageItem.data.label)}
                  >
                    Delete Image Entry
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setManageOpen(false)}>
                      Close
                    </Button>
                    <Button
                      onClick={handleUpdateImageEntry}
                      disabled={manageSaving || !manageLabel.trim() || !manageKernelPath.trim() || !manageInitrdPath.trim()}
                    >
                      {manageSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={extractedBrowserOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedEntry(null);
              setBrowserTarget(null);
            }
            setExtractedBrowserOpen(open);
          }}
        >
          <DialogContent className="w-[95vw] max-w-4xl h-[80vh] max-h-[40rem] gap-0 p-0 overflow-hidden outline-none duration-200 sm:rounded-xl flex flex-col">
            <div className="px-6 py-4 border-b bg-background/95 backdrop-blur z-10 shrink-0">
              <DialogTitle className="text-lg font-medium tracking-tight">
                Select {browserTarget?.type === 'kernel' ? 'Kernel' : 'Initrd'} File
              </DialogTitle>
              <div className="flex items-center text-sm text-muted-foreground mt-2">
                <nav className="flex items-center">
                  <button 
                    onClick={() => { setExtractedDir(''); setSelectedEntry(null); }} 
                    className="hover:text-foreground transition-colors hover:underline"
                  >
                    {decodeURIComponent(extractedRoot.replace(/^\/iso\//, '')) || 'root'}
                  </button>
                  {extractedDir.split('/').filter(Boolean).map((part, i, arr) => {
                    const path = arr.slice(0, i + 1).join('/');
                    return (
                      <span key={path} className="flex items-center">
                        <span className="mx-1.5 opacity-50">/</span>
                        <button 
                          onClick={() => { setExtractedDir(path); setSelectedEntry(null); }}
                          className="hover:text-foreground transition-colors hover:underline"
                        >
                          {decodeURIComponent(part)}
                        </button>
                      </span>
                    );
                  })}
                </nav>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-muted/5">
              <div className="rounded-lg border bg-background shadow-sm overflow-hidden m-4">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-8">Name</div>
                  <div className="col-span-4 text-right">Size</div>
                </div>
                
                {extractedLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Loading directory...</span>
                  </div>
                ) : extractedBrowserError ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
                    <div className="text-destructive">{extractedBrowserError}</div>
                    <Button variant="outline" size="sm" onClick={retryLoadExtractedFiles}>
                      Retry
                    </Button>
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
                      const isSelected = selectedEntry?.path === entry.path && entry.type === 'file';
                      return (
                        <div 
                          key={entry.path} 
                          className={`grid grid-cols-12 gap-4 px-4 py-2.5 items-center transition-colors cursor-pointer text-sm select-none ${
                            isSelected 
                              ? 'bg-primary/10 ring-1 ring-primary/30' 
                              : 'hover:bg-muted/40'
                          }`}
                          onClick={() => handleBrowserRowClick(entry, fullPath)}
                          onDoubleClick={() => handleBrowserRowDoubleClick(entry, fullPath)}
                        >
                          <div className="col-span-8 flex items-center min-w-0">
                            {entry.type === 'dir' ? (
                              <Folder className="h-4 w-4 text-blue-400 mr-3 shrink-0 fill-blue-400/20" />
                            ) : (
                              <FileIcon className="h-4 w-4 text-slate-400 mr-3 shrink-0" />
                            )}
                            <span className={`truncate ${entry.type === 'dir' ? 'font-medium' : ''}`}>
                              {entry.name}
                            </span>
                          </div>
                          
                          <div className="col-span-4 text-right text-muted-foreground font-mono text-xs">
                            {entry.type === 'dir' ? '--' : formatBytes(entry.size ?? 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-background flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Input
                  value={extractedFilter}
                  onChange={(e) => setExtractedFilter(e.target.value)}
                  placeholder="Filter files..."
                  className="h-8 w-[200px] bg-muted/50"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setExtractedBrowserOpen(false);
                    setSelectedEntry(null);
                    setBrowserTarget(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleBrowserSelect}
                  disabled={!selectedEntry || selectedEntry.type !== 'file' || extractedLoading}
                >
                  Select
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
        {(activeTab === 'images' ? imagesLoading : isoLoading) ? (
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
                ? 'Create images from ISO uploads, direct downloads, or manual boot files.'
                : 'Upload or download ISO files to see them here.'}
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Image
            </Button>
          </div>
        ) : activeTab === 'images' ? (
          <DataTable
            columns={imageColumns}
            data={imageItems}
            searchKey="label"
            searchPlaceholder="Search by image label..."
            onRowClick={openManageImage}
            rowClassName={() => 'cursor-pointer'}
          />
        ) : (
          <DataTable
            columns={isoColumns}
            data={isoItems}
            searchKey="name"
            searchPlaceholder="Search by ISO name..."
            onRowClick={openManageIso}
            rowClassName={(row) => row.pending ? 'opacity-60 cursor-pointer' : 'cursor-pointer'}
          />
        )}
      </CardContent>
    </Card>
  );
}
