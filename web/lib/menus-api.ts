
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface BootMenuContentItem {
  type: 'iso' | 'text' | 'header' | 'separator';
  // for iso
  isoId?: string;
  isoName?: string;
  label?: string; // override label or text content
  // for text/header
  content?: string;
}

export interface BootMenu {
  id: string;
  name: string;
  description?: string;
  content: BootMenuContentItem[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const menusApi = {
  async list(): Promise<BootMenu[]> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus`);
    if (!res.ok) throw new Error('Failed to fetch menus');
    return res.json();
  },

  async create(data: { name: string; description?: string; content: BootMenuContentItem[]; is_default?: boolean }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create menu');
    return res.json(); // returns job
  },

  async update(id: string, data: { name?: string; description?: string; content?: BootMenuContentItem[]; is_default?: boolean }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update menu');
    return res.json(); // returns job
  },

  async delete(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete menu');
    return res.json(); // returns job
  },
};
