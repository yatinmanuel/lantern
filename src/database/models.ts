import { getPool } from './index.js';

export interface Server {
  id: number;
  mac_address: string;
  ip_address: string | null;
  hostname: string | null;
  status: 'booting' | 'ready' | 'installing' | 'installed' | 'error';
  hardware_info: Record<string, any> | null;
  last_seen: string;
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
  id: number;
  iso_name: string;
  label: string;
  os_type: string;
  kernel_path: string;
  initrd_items: { path: string; name?: string }[];
  boot_args: string | null;
  created_at: string;
}

function mapServer(row: any): Server {
  return {
    ...row,
    hardware_info: row.hardware_info ?? null,
    last_seen: row.last_seen || row.created_at,
  } as Server;
}

export const ServerModel = {
  async create(server: Omit<Server, 'id' | 'created_at' | 'updated_at' | 'last_seen'>): Promise<Server> {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO servers (mac_address, ip_address, hostname, status, hardware_info, last_seen)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        server.mac_address,
        server.ip_address,
        server.hostname,
        server.status,
        server.hardware_info,
      ]
    );
    return mapServer(result.rows[0]);
  },

  async findByMac(macAddress: string): Promise<Server | null> {
    const db = getPool();
    const result = await db.query('SELECT * FROM servers WHERE mac_address = $1', [macAddress]);
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
    await db.query('UPDATE servers SET last_seen = NOW() WHERE mac_address = $1', [macAddress]);
  },

  async findStaleServers(timeoutSeconds: number): Promise<Server[]> {
    const db = getPool();
    const threshold = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
    const result = await db.query(
      `SELECT * FROM servers
       WHERE last_seen IS NULL OR last_seen < $1
       ORDER BY COALESCE(last_seen, created_at) ASC`,
      [threshold]
    );
    return result.rows.map(mapServer);
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
        entry.initrd_items || [],
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
};
