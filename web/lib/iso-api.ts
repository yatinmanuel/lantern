const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type IsoFile = {
  name: string;
  size: number;
  modified_at: string;
  url: string;
  entry?: {
    label: string;
    os_type: string;
  } | null;
};

export const isoApi = {
  async list(): Promise<IsoFile[]> {
    const res = await fetch(`${API_BASE_URL}/api/isos`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch image list');
    }
    return res.json();
  },

  async upload(file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE_URL}/api/isos`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to upload image' }));
      throw new Error(error.error || 'Failed to upload image');
    }
  },

  async remove(name: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete image' }));
      throw new Error(error.error || 'Failed to delete image');
    }
  },

  async scan(): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/isos/scan`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to scan images' }));
      throw new Error(error.error || 'Failed to scan images');
    }
  },
};
