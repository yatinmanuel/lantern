
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type PowerStateAction = 'reboot' | 'poweroff' | 'shell' | 'local_boot'; // poweroff hidden in UI, legacy only

export interface BootMenuContentItem {
  type: 'iso' | 'text' | 'header' | 'separator' | 'smart_pxe' | 'power_state' | 'chain' | 'folder';
  // for iso and smart_pxe
  isoId?: string;
  isoName?: string;
  label?: string; // override label or text content
  // for text/header
  content?: string;
  // for smart_pxe
  auto_boot?: boolean;
  // for power_state
  action?: PowerStateAction;
  // for chain
  targetMenuId?: string;
  chainUrl?: string;
  // for folder
  children?: BootMenuContentItem[];
  // per-item enhancements
  shortcutKey?: string;
  bootArgsOverride?: string;
}

export interface MenuColors {
  preset?: 'default' | 'dark' | 'custom';
  default_fg?: number | string; // color index or RGB hex
  default_bg?: number | string;
  highlight_fg?: number | string;
  highlight_bg?: number | string;
}

export interface BootMenu {
  id: string;
  name: string;
  description?: string;
  content: BootMenuContentItem[];
  is_default: boolean;
  timeout_sec?: number; // 0 = wait indefinitely
  default_item_key?: string; // stable key for default selection
  menu_colors?: MenuColors;
  created_at: string;
  updated_at: string;
}

export const menusApi = {
  async list(): Promise<BootMenu[]> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus`);
    if (!res.ok) throw new Error('Failed to fetch menus');
    return res.json();
  },

  async create(data: { name: string; description?: string; content: BootMenuContentItem[]; is_default?: boolean; timeout_sec?: number; default_item_key?: string; menu_colors?: MenuColors }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/boot-menus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create menu');
    return res.json(); // returns job
  },

  async update(id: string, data: { name?: string; description?: string; content?: BootMenuContentItem[]; is_default?: boolean; timeout_sec?: number; default_item_key?: string; menu_colors?: MenuColors }): Promise<any> {
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
