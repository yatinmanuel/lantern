import { getPool } from './index.js';

export interface Server {
  id: number;
  uuid: string;
  mac_address: string;
  ip_address: string | null;
  hostname: string | null;
  status: 'booting' | 'ready' | 'installing' | 'installed' | 'error';
  hardware_info: Record<string, any> | null;
  boot_menu_id?: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  server_id: number;
  type: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Installation {
  id: number;
  server_id: number;
  os_type: string;
  config_path: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface PXEConfig {
  id?: number;
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export interface IsoEntry {
  id: string;
  iso_name: string;
  label: string;
  os_type: string;
  kernel_path: string;
  initrd_items: { path: string; name?: string }[];
  boot_args: string | null;
  created_at: string;
}

export interface IsoFile {
  id: string;
  file_name: string;
  created_at: string;
  updated_at: string;
}

function mapServer(row: any): Server {
  return {
    ...row,
    hardware_info: row.hardware_info ?? null,
    last_seen: row.last_seen ?? null,
  } as Server;
}

export const ServerModel = {
  async create(
    server: Omit<Server, 'id' | 'uuid' | 'created_at' | 'updated_at'> & { last_seen?: string | null }
  ): Promise<Server> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO servers (mac_address, ip_address, hostname, status, hardware_info, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        server.mac_address,
        server.ip_address,
        server.hostname,
        server.status,
        server.hardware_info,
        server.last_seen ?? new Date().toISOString(),
      ]
    );
    return mapServer(result.rows[0]);
  },

  async findByMac(macAddress: string): Promise<Server | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM servers WHERE lower(mac_address) = lower($1)', [macAddress]);
    if (result.rows.length === 0) return null;
    return mapServer(result.rows[0]);
  },

  async findById(id: number): Promise<Server | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM servers WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapServer(result.rows[0]);
  },

  async update(id: number, updates: Partial<Server>): Promise<Server> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.ip_address !== undefined) {
      fields.push(`ip_address = $${idx++}`);
      values.push(updates.ip_address);
    }
    if (updates.hostname !== undefined) {
      fields.push(`hostname = $${idx++}`);
      values.push(updates.hostname);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.hardware_info !== undefined) {
      fields.push(`hardware_info = $${idx++}`);
      values.push(updates.hardware_info);
    }
    if (updates.boot_menu_id !== undefined) {
      fields.push(`boot_menu_id = $${idx++}`);
      values.push(updates.boot_menu_id);
    }
    if (updates.last_seen !== undefined) {
      fields.push(`last_seen = $${idx++}`);
      values.push(updates.last_seen);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE servers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return mapServer(result.rows[0]);
  },

  async findAll(): Promise<Server[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM servers ORDER BY created_at DESC');
    return result.rows.map(mapServer);
  },

  async delete(id: number): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM servers WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateLastSeen(id: number): Promise<void> {
    const db = getPool();
    await db.query('UPDATE servers SET last_seen = NOW() WHERE id = $1', [id]);
  },

  async updateLastSeenByMac(macAddress: string): Promise<void> {
    const db = getPool();
    await db.query('UPDATE servers SET last_seen = NOW() WHERE lower(mac_address) = lower($1)', [macAddress]);
  },

};

export const TaskModel = {
  async create(task: Omit<Task, 'id' | 'created_at' | 'completed_at'>): Promise<Task> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO tasks (server_id, type, command, status, result)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [task.server_id, task.type, task.command, task.status, task.result]
    );
    return result.rows[0] as Task;
  },

  async findById(id: number): Promise<Task | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return (result.rows[0] as Task) || null;
  },

  async findByServer(serverId: number, status?: string): Promise<Task[]> {
    const db = getPool();
    if (status) {
      const result = await db.query(
        'SELECT * FROM tasks WHERE server_id = $1 AND status = $2 ORDER BY created_at DESC',
        [serverId, status]
      );
      return result.rows as Task[];
    }
    const result = await db.query(
      'SELECT * FROM tasks WHERE server_id = $1 ORDER BY created_at DESC',
      [serverId]
    );
    return result.rows as Task[];
  },

  async update(id: number, updates: Partial<Task>): Promise<Task> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.result !== undefined) {
      fields.push(`result = $${idx++}`);
      values.push(updates.result);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at = NOW()');
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] as Task;
  },
};

export const InstallationModel = {
  async create(installation: Omit<Installation, 'id' | 'started_at' | 'completed_at'>): Promise<Installation> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO installations (server_id, os_type, config_path, status, logs)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [installation.server_id, installation.os_type, installation.config_path, installation.status, installation.logs]
    );
    return result.rows[0] as Installation;
  },

  async findById(id: number): Promise<Installation | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM installations WHERE id = $1', [id]);
    return (result.rows[0] as Installation) || null;
  },

  async findByServer(serverId: number): Promise<Installation[]> {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM installations WHERE server_id = $1 ORDER BY started_at DESC',
      [serverId]
    );
    return result.rows as Installation[];
  },

  async update(id: number, updates: Partial<Installation>): Promise<Installation> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.logs !== undefined) {
      fields.push(`logs = $${idx++}`);
      values.push(updates.logs);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at = NOW()');
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE installations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] as Installation;
  },
};

export const PXEConfigModel = {
  async get(key: string): Promise<string | null> {
    const db = getPool();
    const result = await db.query('SELECT value FROM pxe_config WHERE key = $1', [key]);
    return result.rows[0]?.value || null;
  },

  async set(key: string, value: string, description?: string): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO pxe_config (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [key, value, description || null]
    );
  },

  async getAll(): Promise<PXEConfig[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM pxe_config ORDER BY key');
    return result.rows as PXEConfig[];
  },

  async delete(key: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM pxe_config WHERE key = $1', [key]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const IsoModel = {
  async upsert(entry: Omit<IsoEntry, 'id' | 'created_at'>): Promise<IsoEntry> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO iso_entries (iso_name, label, os_type, kernel_path, initrd_items, boot_args)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (iso_name) DO UPDATE SET
         label = EXCLUDED.label,
         os_type = EXCLUDED.os_type,
         kernel_path = EXCLUDED.kernel_path,
         initrd_items = EXCLUDED.initrd_items,
         boot_args = EXCLUDED.boot_args
       RETURNING *`,
      [
        entry.iso_name,
        entry.label,
        entry.os_type,
        entry.kernel_path,
        JSON.stringify(entry.initrd_items || []),
        entry.boot_args,
      ]
    );
    return result.rows[0] as IsoEntry;
  },

  async findByIsoName(isoName: string): Promise<IsoEntry | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_entries WHERE iso_name = $1', [isoName]);
    if (result.rows.length === 0) return null;
    return result.rows[0] as IsoEntry;
  },

  async findById(id: string): Promise<IsoEntry | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_entries WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return result.rows[0] as IsoEntry;
  },

  async getAll(): Promise<IsoEntry[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_entries ORDER BY created_at DESC');
    return result.rows as IsoEntry[];
  },

  async deleteByIsoName(isoName: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM iso_entries WHERE iso_name = $1', [isoName]);
    return (result.rowCount ?? 0) > 0;
  },

  async deleteById(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM iso_entries WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateByIsoName(
    isoName: string,
    updates: Partial<Pick<IsoEntry, 'iso_name' | 'kernel_path' | 'initrd_items' | 'boot_args'>>
  ): Promise<IsoEntry | null> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.iso_name !== undefined) {
      fields.push(`iso_name = $${idx++}`);
      values.push(updates.iso_name);
    }
    if (updates.kernel_path !== undefined) {
      fields.push(`kernel_path = $${idx++}`);
      values.push(updates.kernel_path);
    }
    if (updates.initrd_items !== undefined) {
      fields.push(`initrd_items = $${idx++}`);
      values.push(JSON.stringify(updates.initrd_items));
    }
    if (updates.boot_args !== undefined) {
      fields.push(`boot_args = $${idx++}`);
      values.push(updates.boot_args);
    }

    if (fields.length === 0) {
      return this.findByIsoName(isoName);
    }

    values.push(isoName);
    const result = await db.query(
      `UPDATE iso_entries SET ${fields.join(', ')} WHERE iso_name = $${idx} RETURNING *`,
      values
    );
    return (result.rows[0] as IsoEntry) || null;
  },
};

export const IsoFileModel = {
  async upsertByName(fileName: string): Promise<IsoFile> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO iso_files (file_name, updated_at)
       VALUES ($1, NOW())
       ON CONFLICT (file_name) DO UPDATE SET
         updated_at = NOW()
       RETURNING *`,
      [fileName]
    );
    return result.rows[0] as IsoFile;
  },

  async findById(id: string): Promise<IsoFile | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_files WHERE id = $1', [id]);
    return (result.rows[0] as IsoFile) || null;
  },

  async findByName(fileName: string): Promise<IsoFile | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_files WHERE file_name = $1', [fileName]);
    return (result.rows[0] as IsoFile) || null;
  },

  async getAll(): Promise<IsoFile[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM iso_files ORDER BY created_at DESC');
    return result.rows as IsoFile[];
  },

  async rename(id: string, fileName: string): Promise<IsoFile | null> {
    const db = getPool();
    const result = await db.query(
      `UPDATE iso_files SET file_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [fileName, id]
    );
    return (result.rows[0] as IsoFile) || null;
  },

  async deleteById(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM iso_files WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async deleteByName(fileName: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM iso_files WHERE file_name = $1', [fileName]);
    return (result.rowCount ?? 0) > 0;
  },
};

export interface MenuColors {
  preset?: 'default' | 'dark' | 'custom';
  default_fg?: number | string;
  default_bg?: number | string;
  highlight_fg?: number | string;
  highlight_bg?: number | string;
}

export interface BootMenu {
  id: string;
  name: string;
  description: string | null;
  content: Record<string, any>[];
  is_default: boolean;
  timeout_sec?: number;
  default_item_key?: string;
  menu_colors?: MenuColors;
  created_at: string;
  updated_at: string;
}

export const BootMenuModel = {
  async create(menu: Omit<BootMenu, 'id' | 'created_at' | 'updated_at'>): Promise<BootMenu> {
    const db = getPool();
    if (menu.is_default) {
      await db.query('UPDATE boot_menus SET is_default = false');
    }
    const result = await db.query(
      `INSERT INTO boot_menus (name, description, content, is_default, timeout_sec, default_item_key, menu_colors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        menu.name,
        menu.description,
        JSON.stringify(menu.content),
        menu.is_default,
        menu.timeout_sec ?? null,
        menu.default_item_key ?? null,
        menu.menu_colors ? JSON.stringify(menu.menu_colors) : null
      ]
    );
    return result.rows[0] as BootMenu;
  },

  async update(id: string, updates: Partial<BootMenu>): Promise<BootMenu> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.content !== undefined) {
      fields.push(`content = $${idx++}`);
      values.push(JSON.stringify(updates.content));
    }
    if (updates.is_default !== undefined) {
      if (updates.is_default) {
        await db.query('UPDATE boot_menus SET is_default = false');
      }
      fields.push(`is_default = $${idx++}`);
      values.push(updates.is_default);
    }
    if (updates.timeout_sec !== undefined) {
      fields.push(`timeout_sec = $${idx++}`);
      values.push(updates.timeout_sec);
    }
    if (updates.default_item_key !== undefined) {
      fields.push(`default_item_key = $${idx++}`);
      values.push(updates.default_item_key);
    }
    if (updates.menu_colors !== undefined) {
      fields.push(`menu_colors = $${idx++}`);
      values.push(updates.menu_colors ? JSON.stringify(updates.menu_colors) : null);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE boot_menus SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] as BootMenu;
  },

  async findById(id: string): Promise<BootMenu | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM boot_menus WHERE id = $1', [id]);
    return (result.rows[0] as BootMenu) || null;
  },

  async getDefault(): Promise<BootMenu | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM boot_menus WHERE is_default = true LIMIT 1');
    return (result.rows[0] as BootMenu) || null;
  },

  async getAll(): Promise<BootMenu[]> {
    const db = getPool();
    const result = await db.query('SELECT * FROM boot_menus ORDER BY created_at DESC');
    return result.rows as BootMenu[];
  },

  async delete(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM boot_menus WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async removeIsoReferences(params: { isoId?: string | null; isoName?: string | null }): Promise<{ updated: number }> {
    const { isoId, isoName } = params;
    if (!isoId && !isoName) {
      return { updated: 0 };
    }

    // Recursive helper to filter items and handle folders
    function filterItemsRecursively(items: any[]): { filtered: any[]; changed: boolean } {
      let changed = false;
      const filtered = items.filter((item: any) => {
        if (!item) return false;
        // Filter out iso and smart_pxe entries that match
        if (item.type === 'iso' || item.type === 'smart_pxe') {
          if (isoId && item.isoId === isoId) {
            changed = true;
            return false;
          }
          if (isoName && item.isoName === isoName) {
            changed = true;
            return false;
          }
        }
        return true;
      }).map((item: any) => {
        // Recursively process folder children
        if (item.type === 'folder' && Array.isArray(item.children)) {
          const childResult = filterItemsRecursively(item.children);
          if (childResult.changed) {
            changed = true;
            return { ...item, children: childResult.filtered };
          }
        }
        return item;
      });
      return { filtered, changed };
    }

    const menus = await this.getAll();
    let updated = 0;

    await Promise.all(
      menus.map(async (menu) => {
        const content = Array.isArray(menu.content) ? menu.content : [];
        const result = filterItemsRecursively(content);

        if (result.changed) {
          updated += 1;
          await this.update(menu.id, { content: result.filtered });
        }
      })
    );

    return { updated };
  },
};

export interface NetbootDistro {
  id: string;
  slug: string;
  display_name: string;
  icon: string | null;
  kernel_path_template: string;
  initrd_path_template: string;
  boot_args_template: string;
  versions_discovery_path: string | null;
  version_regex: string | null;
  architectures: string[];
  requires_subscription: boolean;
  supports_preseed: boolean;
  supports_kickstart: boolean;
  checksum_file_template: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface NetbootMirror {
  id: string;
  distro_id: string;
  name: string;
  url: string;
  is_primary: boolean;
  is_official: boolean;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_success: boolean | null;
  last_refreshed_at: string | null;
  created_at: string;
}

export interface NetbootVersion {
  id: string;
  mirror_id: string;
  version: string;
  display_name: string;
  is_eol: boolean;
  is_available: boolean;
  discovered_at: string;
  last_seen_at: string;
}

function mapNetbootDistro(row: any): NetbootDistro {
  return {
    ...row,
    architectures: Array.isArray(row.architectures) ? row.architectures : (row.architectures ? JSON.parse(row.architectures) : []),
  } as NetbootDistro;
}

export const NetbootDistroModel = {
  async create(distro: Omit<NetbootDistro, 'id' | 'created_at'>): Promise<NetbootDistro> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO netboot_distros (slug, display_name, icon, kernel_path_template, initrd_path_template, boot_args_template,
       versions_discovery_path, version_regex, architectures, requires_subscription, supports_preseed, supports_kickstart,
       checksum_file_template, enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        distro.slug,
        distro.display_name,
        distro.icon ?? null,
        distro.kernel_path_template,
        distro.initrd_path_template,
        distro.boot_args_template,
        distro.versions_discovery_path ?? null,
        distro.version_regex ?? null,
        JSON.stringify(distro.architectures ?? []),
        distro.requires_subscription ?? false,
        distro.supports_preseed ?? false,
        distro.supports_kickstart ?? false,
        distro.checksum_file_template ?? null,
        distro.enabled ?? true,
        distro.sort_order ?? 0,
      ]
    );
    return mapNetbootDistro(result.rows[0]);
  },

  async findById(id: string): Promise<NetbootDistro | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM netboot_distros WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapNetbootDistro(result.rows[0]);
  },

  async findBySlug(slug: string): Promise<NetbootDistro | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM netboot_distros WHERE slug = $1', [slug]);
    if (result.rows.length === 0) return null;
    return mapNetbootDistro(result.rows[0]);
  },

  async getAll(enabledOnly?: boolean): Promise<NetbootDistro[]> {
    const db = getPool();
    const query = enabledOnly
      ? 'SELECT * FROM netboot_distros WHERE enabled = true ORDER BY sort_order, display_name'
      : 'SELECT * FROM netboot_distros ORDER BY sort_order, display_name';
    const result = await db.query(query);
    return result.rows.map(mapNetbootDistro);
  },

  async update(id: string, updates: Partial<NetbootDistro>): Promise<NetbootDistro> {
    const db = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.display_name !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(updates.display_name);
    }
    if (updates.icon !== undefined) {
      fields.push(`icon = $${idx++}`);
      values.push(updates.icon);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${idx++}`);
      values.push(updates.enabled);
    }
    if (updates.sort_order !== undefined) {
      fields.push(`sort_order = $${idx++}`);
      values.push(updates.sort_order);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing!;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE netboot_distros SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return mapNetbootDistro(result.rows[0]);
  },

  async count(): Promise<number> {
    const db = getPool();
    const result = await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM netboot_distros');
    return Number(result.rows[0]?.count ?? 0);
  },

  async delete(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM netboot_distros WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const NetbootMirrorModel = {
  async create(mirror: Omit<NetbootMirror, 'id' | 'created_at'>): Promise<NetbootMirror> {
    const db = getPool();
    if (mirror.is_primary) {
      await db.query(
        'UPDATE netboot_mirrors SET is_primary = false WHERE distro_id = $1',
        [mirror.distro_id]
      );
    }
    const result = await db.query(
      `INSERT INTO netboot_mirrors (distro_id, name, url, is_primary, is_official, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        mirror.distro_id,
        mirror.name,
        mirror.url,
        mirror.is_primary ?? false,
        mirror.is_official ?? false,
        mirror.enabled ?? true,
      ]
    );
    return result.rows[0] as NetbootMirror;
  },

  async findById(id: string): Promise<NetbootMirror | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM netboot_mirrors WHERE id = $1', [id]);
    return (result.rows[0] as NetbootMirror) || null;
  },

  async getByDistroId(distroId: string, enabledOnly?: boolean): Promise<NetbootMirror[]> {
    const db = getPool();
    const query = enabledOnly
      ? 'SELECT * FROM netboot_mirrors WHERE distro_id = $1 AND enabled = true ORDER BY is_primary DESC, name'
      : 'SELECT * FROM netboot_mirrors WHERE distro_id = $1 ORDER BY is_primary DESC, name';
    const result = await db.query(query, [distroId]);
    return result.rows as NetbootMirror[];
  },

  async getAll(enabledOnly?: boolean): Promise<NetbootMirror[]> {
    const db = getPool();
    const query = enabledOnly
      ? 'SELECT * FROM netboot_mirrors WHERE enabled = true ORDER BY distro_id, is_primary DESC, name'
      : 'SELECT * FROM netboot_mirrors ORDER BY distro_id, is_primary DESC, name';
    const result = await db.query(query);
    return result.rows as NetbootMirror[];
  },

  async getPrimaryForDistro(distroId: string): Promise<NetbootMirror | null> {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM netboot_mirrors WHERE distro_id = $1 AND is_primary = true AND enabled = true LIMIT 1',
      [distroId]
    );
    return (result.rows[0] as NetbootMirror) || null;
  },

  async update(id: string, updates: Partial<NetbootMirror>): Promise<NetbootMirror> {
    const db = getPool();
    const existing = await this.findById(id);
    if (!existing) throw new Error('Mirror not found');

    if (updates.is_primary === true) {
      await db.query(
        'UPDATE netboot_mirrors SET is_primary = false WHERE distro_id = $1',
        [existing.distro_id]
      );
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      fields.push(`url = $${idx++}`);
      values.push(updates.url);
    }
    if (updates.is_primary !== undefined) {
      fields.push(`is_primary = $${idx++}`);
      values.push(updates.is_primary);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${idx++}`);
      values.push(updates.enabled);
    }
    if (updates.last_tested_at !== undefined) {
      fields.push(`last_tested_at = $${idx++}`);
      values.push(updates.last_tested_at);
    }
    if (updates.last_test_success !== undefined) {
      fields.push(`last_test_success = $${idx++}`);
      values.push(updates.last_test_success);
    }
    if (updates.last_refreshed_at !== undefined) {
      fields.push(`last_refreshed_at = $${idx++}`);
      values.push(updates.last_refreshed_at);
    }

    if (fields.length === 0) {
      return existing;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE netboot_mirrors SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] as NetbootMirror;
  },

  async delete(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query('DELETE FROM netboot_mirrors WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async findByUrl(url: string): Promise<NetbootMirror | null> {
    const db = getPool();
    const normalized = url.replace(/\/+$/, '').toLowerCase();
    const result = await db.query(
      'SELECT * FROM netboot_mirrors WHERE LOWER(TRIM(TRAILING \'/\' FROM url)) = $1',
      [normalized]
    );
    return (result.rows[0] as NetbootMirror) || null;
  },
};

export const NetbootVersionModel = {
  async create(version: Omit<NetbootVersion, 'id'>): Promise<NetbootVersion> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO netboot_versions (mirror_id, version, display_name, is_eol, is_available, discovered_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (mirror_id, version) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         is_eol = EXCLUDED.is_eol,
         is_available = EXCLUDED.is_available,
         last_seen_at = EXCLUDED.last_seen_at
       RETURNING *`,
      [
        version.mirror_id,
        version.version,
        version.display_name,
        version.is_eol ?? false,
        version.is_available ?? true,
        version.discovered_at ?? new Date().toISOString(),
        version.last_seen_at ?? new Date().toISOString(),
      ]
    );
    return result.rows[0] as NetbootVersion;
  },

  async upsertMany(mirrorId: string, versions: { version: string; display_name: string }[]): Promise<void> {
    const db = getPool();
    const now = new Date().toISOString();
    for (const v of versions) {
      await db.query(
        `INSERT INTO netboot_versions (mirror_id, version, display_name, is_eol, is_available, discovered_at, last_seen_at)
         VALUES ($1, $2, $3, false, true, $4, $4)
         ON CONFLICT (mirror_id, version) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           is_available = true,
           last_seen_at = EXCLUDED.last_seen_at`,
        [mirrorId, v.version, v.display_name, now]
      );
    }
  },

  async findById(id: string): Promise<NetbootVersion | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM netboot_versions WHERE id = $1', [id]);
    return (result.rows[0] as NetbootVersion) || null;
  },

  async getByMirrorId(mirrorId: string): Promise<NetbootVersion[]> {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM netboot_versions WHERE mirror_id = $1 ORDER BY display_name',
      [mirrorId]
    );
    return result.rows as NetbootVersion[];
  },

  async markMissingUnavailable(mirrorId: string, seenVersions: string[]): Promise<void> {
    const db = getPool();
    if (seenVersions.length === 0) {
      await db.query(
        'UPDATE netboot_versions SET is_available = false WHERE mirror_id = $1',
        [mirrorId]
      );
      return;
    }
    await db.query(
      'UPDATE netboot_versions SET is_available = false WHERE mirror_id = $1 AND version != ALL($2::text[])',
      [mirrorId, seenVersions]
    );
    await db.query(
      'UPDATE netboot_versions SET is_available = true, last_seen_at = NOW() WHERE mirror_id = $1 AND version = ANY($2::text[])',
      [mirrorId, seenVersions]
    );
  },

  async markEolOlderThan(mirrorId: string, days: number): Promise<void> {
    const db = getPool();
    await db.query(
      `UPDATE netboot_versions SET is_eol = true WHERE mirror_id = $1 AND last_seen_at < NOW() - INTERVAL '1 day' * $2`,
      [mirrorId, days]
    );
  },

  async deleteByMirrorId(mirrorId: string): Promise<number> {
    const db = getPool();
    const result = await db.query('DELETE FROM netboot_versions WHERE mirror_id = $1', [mirrorId]);
    return result.rowCount ?? 0;
  },
};
