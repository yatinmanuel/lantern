'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { isoApi, IsoFile } from '@/lib/iso-api';
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

export function IsoManager() {
  const [isoFiles, setIsoFiles] = useState<IsoFile[]>([]);
  const [isoLoading, setIsoLoading] = useState(true);
  const [isoUploading, setIsoUploading] = useState(false);
  const [isoFile, setIsoFile] = useState<File | null>(null);
  const [isoMessage, setIsoMessage] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);

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
      setIsoFiles(files);
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

  async function handleUploadIso() {
    if (!isoFile) {
      setIsoMessage('Select a file first.');
      return;
    }
    try {
      setIsoUploading(true);
      await isoApi.upload(isoFile);
      setIsoFile(null);
      setUploadInputKey((key) => key + 1);
      setIsoMessage('Image uploaded.');
      setUploadOpen(false);
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to upload image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to upload image.');
    } finally {
      setIsoUploading(false);
    }
  }

  async function handleDeleteIso(name: string) {
    if (!confirm(`Delete image ${name}?`)) return;
    try {
      await isoApi.remove(name);
      setIsoMessage('Image deleted.');
      await loadIsos({ showLoading: false, silent: true });
    } catch (error) {
      console.error('Failed to delete image:', error);
      setIsoMessage(error instanceof Error ? error.message : 'Failed to delete image.');
    }
  }

  const columns: ColumnDef<IsoFile>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Image Name" />
        ),
        cell: ({ row }) => {
          const file = row.original;
          return (
            <div className="space-y-1">
              <div className="font-medium">{file.name}</div>
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
          return (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={file.url} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteIso(file.name)}
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            Upload images, extract inside the container, and auto-generate iPXE entries.
          </CardDescription>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Image/ISO
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Image</DialogTitle>
              <DialogDescription>
                Upload a boot image to extract and add to the PXE menu.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
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
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setUploadOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUploadIso} disabled={isoUploading}>
                  {isoUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Image
                    </>
                  )}
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
              Add Image/ISO
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={isoFiles}
            searchKey="name"
            searchPlaceholder="Search by image name..."
          />
        )}
      </CardContent>
    </Card>
  );
}
