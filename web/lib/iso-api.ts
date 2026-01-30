import { getSessionHeaders, withSessionHeaders } from './session';
import type { JobResponse } from './jobs-api';
const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type IsoFile = {
  id: string;
  name: string;
  size: number;
  modified_at: string;
  url?: string | null;
  extracted?: boolean;
  entry?: {
    id: string;
    iso_name: string;
    label: string;
    os_type: string;
    kernel_path?: string;
    initrd_items?: { path: string; name?: string }[];
    boot_args?: string | null;
  } | null;
};

export type RemoteImageMeta = {
  fileName: string | null;
  size: number | null;
  mimeType: string | null;
  isIso: boolean;
};

export type ExtractedFile = {
  path: string;
  size: number;
};

export const isoApi = {
  async list(): Promise<IsoFile[]> {
    const res = await fetch(`${API_BASE_URL}/api/isos`, { credentials: 'include', headers: getSessionHeaders() });
    if (!res.ok) {
      throw new Error('Failed to fetch image list');
    }
    return res.json();
  },

  async upload(file: File, options?: { autoExtract?: boolean; label?: string }): Promise<JobResponse | void> {
    const form = new FormData();
    form.append('file', file);
    if (options?.autoExtract !== undefined) {
      form.append('auto_extract', String(options.autoExtract));
    }
    if (options?.label) {
      form.append('label', options.label);
    }
    const res = await fetch(`${API_BASE_URL}/api/isos`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to upload image' }));
      throw new Error(error.error || 'Failed to upload image');
    }
    return res.json().catch(() => undefined);
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete image' }));
      throw new Error(error.error || 'Failed to delete image');
    }
  },

  async rename(id: string, fileName: string): Promise<{ renamed: boolean; file: { id: string; name: string } | null }> {
    const res = await fetch(`${API_BASE_URL}/api/isos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ file_name: fileName }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to rename ISO' }));
      throw new Error(error.error || 'Failed to rename ISO');
    }
    return res.json();
  },

  async uploadManual(data: { label: string; kernel: File; initrd: File; bootArgs?: string }): Promise<JobResponse | void> {
    const form = new FormData();
    form.append('label', data.label);
    if (data.bootArgs) {
      form.append('boot_args', data.bootArgs);
    }
    form.append('kernel', data.kernel);
    form.append('initrd', data.initrd);
    const res = await fetch(`${API_BASE_URL}/api/isos/manual`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to add image' }));
      throw new Error(error.error || 'Failed to add image');
    }
    return res.json().catch(() => undefined);
  },

  async downloadFromUrl(
    url: string,
    options?: { autoExtract?: boolean; fileName?: string; label?: string }
  ): Promise<JobResponse | void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/remote`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        url,
        auto_extract: options?.autoExtract,
        file_name: options?.fileName,
        label: options?.label,
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to download image' }));
      throw new Error(error.error || 'Failed to download image');
    }
    return res.json().catch(() => undefined);
  },

  async queryRemoteMeta(url: string): Promise<RemoteImageMeta> {
    const res = await fetch(`${API_BASE_URL}/api/isos/remote/meta`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to query URL' }));
      throw new Error(error.error || 'Failed to query URL');
    }
    return res.json();
  },

  async scan(): Promise<JobResponse | void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/scan`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to scan images' }));
      throw new Error(error.error || 'Failed to scan images');
    }
    return res.json().catch(() => undefined);
  },

  async listExtractedFiles(isoName: string): Promise<ExtractedFile[]> {
    const res = await fetch(`${API_BASE_URL}/api/isos/extracted/${encodeURIComponent(isoName)}/files`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to load extracted files' }));
      throw new Error(error.error || 'Failed to load extracted files');
    }
    return res.json();
  },

  async attachFromExtracted(data: {
    isoName: string;
    label: string;
    kernelPath: string;
    initrdPaths: string[];
    osType?: string;
    bootArgs?: string;
  }): Promise<JobResponse | void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/attach`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        iso_name: data.isoName,
        label: data.label,
        kernel_path: data.kernelPath,
        initrd_paths: data.initrdPaths,
        os_type: data.osType,
        boot_args: data.bootArgs,
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to attach boot files' }));
      throw new Error(error.error || 'Failed to attach boot files');
    }
    return res.json().catch(() => undefined);
  },
};
