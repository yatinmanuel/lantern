import { getSessionHeaders } from './session';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type ImageEntry = {
  id: string;
  iso_name: string;
  label: string;
  os_type: string;
  kernel_path: string;
  initrd_items: { path: string; name?: string }[];
  boot_args: string | null;
  created_at: string;
};

export const imageApi = {
  async list(): Promise<ImageEntry[]> {
    const res = await fetch(`${API_BASE_URL}/api/images`, { credentials: 'include', headers: getSessionHeaders() });
    if (!res.ok) {
      throw new Error('Failed to fetch images');
    }
    return res.json();
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete image' }));
      throw new Error(error.error || 'Failed to delete image');
    }
  },

  async regenerateBootArgs(id: string): Promise<{ success: boolean; boot_args: string; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}/regenerate-boot-args`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to regenerate boot arguments' }));
      throw new Error(error.error || 'Failed to regenerate boot arguments');
    }
    return res.json();
  },
};
