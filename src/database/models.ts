import { getDatabase } from './index.js';
import { logger } from '../utils/logger.js';

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
  id: number;
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

export const ServerModel = {
  create(server: Omit<Server, 'id' | 'created_at' | 'updated_at' | 'last_seen'>): Server {
    const db = getDatabase();
    // Use CURRENT_TIMESTAMP or calculate timestamp in JavaScript
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = db.prepare(`
      INSERT INTO servers (mac_address, ip_address, hostname, status, hardware_info, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      server.mac_address,
      server.ip_address,
      server.hostname,
      server.status,
      JSON.stringify(server.hardware_info),
      now
    );
    return this.findById(result.lastInsertRowid as number)!;
  },

  findByMac(macAddress: string): Server | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM servers WHERE mac_address = ?').get(macAddress) as any;
    if (!row) return null;
    let hardware_info = null;
    if (row.hardware_info) {
      try {
        const trimmed = String(row.hardware_info).trim();
        if (trimmed && trimmed !== 'null' && trimmed !== '') {
          hardware_info = JSON.parse(trimmed);
        }
      } catch (error) {
        logger.warn(`Failed to parse hardware_info for server ${row.id}:`, error);
        hardware_info = null;
      }
    }
    return {
      ...row,
      hardware_info,
      last_seen: row.last_seen || row.created_at,
    };
  },

  findById(id: number): Server | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as any;
    if (!row) return null;
    let hardware_info = null;
    if (row.hardware_info) {
      try {
        const trimmed = String(row.hardware_info).trim();
        if (trimmed && trimmed !== 'null' && trimmed !== '') {
          hardware_info = JSON.parse(trimmed);
        }
      } catch (error) {
        logger.warn(`Failed to parse hardware_info for server ${row.id}:`, error);
        hardware_info = null;
      }
    }
    return {
      ...row,
      hardware_info,
      last_seen: row.last_seen || row.created_at,
    };
  },

  update(id: number, updates: Partial<Server>): Server {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.ip_address !== undefined) {
      fields.push('ip_address = ?');
      values.push(updates.ip_address);
    }
    if (updates.hostname !== undefined) {
      fields.push('hostname = ?');
      values.push(updates.hostname);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.hardware_info !== undefined) {
      fields.push('hardware_info = ?');
      values.push(JSON.stringify(updates.hardware_info));
    }

    if (fields.length === 0) {
      return this.findById(id)!;
    }

    // Calculate timestamp in JavaScript
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id)!;
  },

  findAll(): Server[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM servers ORDER BY created_at DESC').all() as any[];
    return rows.map(row => {
      let hardware_info = null;
      if (row.hardware_info) {
        try {
          const trimmed = String(row.hardware_info).trim();
          if (trimmed && trimmed !== 'null' && trimmed !== '') {
            hardware_info = JSON.parse(trimmed);
          }
        } catch (error) {
          logger.warn(`Failed to parse hardware_info for server ${row.id}:`, error);
          hardware_info = null;
        }
      }
      return {
      ...row,
        hardware_info,
        last_seen: row.last_seen || row.created_at,
      };
    });
  },

  delete(id: number): boolean {
    const db = getDatabase();
    
    // First, delete related tasks and installations (cascade delete)
    // SQLite doesn't enforce foreign keys by default, but we'll do it explicitly
    try {
      db.prepare('DELETE FROM tasks WHERE server_id = ?').run(id);
      db.prepare('DELETE FROM installations WHERE server_id = ?').run(id);
    } catch (error) {
      logger.warn(`Error deleting related records for server ${id}:`, error);
      // Continue with server deletion even if related records fail
    }
    
    // Then delete the server
    const stmt = db.prepare('DELETE FROM servers WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  updateLastSeen(id: number): void {
    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = db.prepare('UPDATE servers SET last_seen = ? WHERE id = ?');
    stmt.run(now, id);
  },

  updateLastSeenByMac(macAddress: string): void {
    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = db.prepare('UPDATE servers SET last_seen = ? WHERE mac_address = ?');
    stmt.run(now, macAddress);
  },

  findStaleServers(timeoutSeconds: number): Server[] {
    const db = getDatabase();
    try {
      // Calculate threshold time: now - timeoutSeconds
      // SQLite datetime format: 'YYYY-MM-DD HH:MM:SS'
      const threshold = new Date(Date.now() - timeoutSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
      // Include servers with NULL last_seen (old servers before migration) or last_seen older than threshold
      const stmt = db.prepare(`
        SELECT * FROM servers 
        WHERE last_seen IS NULL OR last_seen < ?
        ORDER BY COALESCE(last_seen, created_at) ASC
      `);
      const rows = stmt.all(threshold) as any[];
      return rows.map(row => {
        try {
          return {
            ...row,
            hardware_info: row.hardware_info ? JSON.parse(row.hardware_info) : null,
            last_seen: row.last_seen || row.created_at,
          };
        } catch (parseError) {
          // If JSON parsing fails, return with null hardware_info
          logger.warn(`Failed to parse hardware_info for server ${row.id}:`, parseError);
          return {
            ...row,
            hardware_info: null,
            last_seen: row.last_seen || row.created_at,
          };
        }
      });
    } catch (error) {
      logger.error('Error in findStaleServers:', error);
      throw error;
    }
  },
};

export const TaskModel = {
  create(task: Omit<Task, 'id' | 'created_at' | 'completed_at'>): Task {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO tasks (server_id, type, command, status, result)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      task.server_id,
      task.type,
      task.command,
      task.status,
      task.result
    );
    return this.findById(result.lastInsertRowid as number)!;
  },

  findById(id: number): Task | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row || null;
  },

  findByServer(serverId: number, status?: string): Task[] {
    const db = getDatabase();
    let query = 'SELECT * FROM tasks WHERE server_id = ?';
    const params: any[] = [serverId];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params) as any[];
    return rows;
  },

  update(id: number, updates: Partial<Task>): Task {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.result !== undefined) {
      fields.push('result = ?');
      values.push(updates.result);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      fields.push('completed_at = ?');
      values.push(now);
    }

    if (fields.length === 0) {
      return this.findById(id)!;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id)!;
  },
};

export const InstallationModel = {
  create(installation: Omit<Installation, 'id' | 'started_at' | 'completed_at'>): Installation {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO installations (server_id, os_type, config_path, status, logs)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      installation.server_id,
      installation.os_type,
      installation.config_path,
      installation.status,
      installation.logs
    );
    return this.findById(result.lastInsertRowid as number)!;
  },

  findById(id: number): Installation | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM installations WHERE id = ?').get(id) as any;
    return row || null;
  },

  findByServer(serverId: number): Installation[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM installations WHERE server_id = ? ORDER BY started_at DESC').all(serverId) as any[];
    return rows;
  },

  update(id: number, updates: Partial<Installation>): Installation {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.logs !== undefined) {
      fields.push('logs = ?');
      values.push(updates.logs);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      fields.push('completed_at = ?');
      values.push(now);
    }

    if (fields.length === 0) {
      return this.findById(id)!;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE installations SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.findById(id)!;
  },
};

export const PXEConfigModel = {
  get(key: string): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM pxe_config WHERE key = ?').get(key) as any;
    return row?.value || null;
  },

  set(key: string, value: string, description?: string): void {
    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = db.prepare(`
      INSERT INTO pxe_config (key, value, description, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = excluded.description,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value, description || null, now);
  },

  getAll(): PXEConfig[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM pxe_config ORDER BY key').all() as any[];
    return rows;
  },

  delete(key: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM pxe_config WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  },
};

export const IsoModel = {
  upsert(entry: Omit<IsoEntry, 'id' | 'created_at'>): IsoEntry {
    const db = getDatabase();
    const initrdItems = JSON.stringify(entry.initrd_items || []);
    const stmt = db.prepare(`
      INSERT INTO iso_entries (iso_name, label, os_type, kernel_path, initrd_items, boot_args)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(iso_name) DO UPDATE SET
        label = excluded.label,
        os_type = excluded.os_type,
        kernel_path = excluded.kernel_path,
        initrd_items = excluded.initrd_items,
        boot_args = excluded.boot_args
    `);
    stmt.run(
      entry.iso_name,
      entry.label,
      entry.os_type,
      entry.kernel_path,
      initrdItems,
      entry.boot_args
    );
    return this.findByIsoName(entry.iso_name)!;
  },

  findByIsoName(isoName: string): IsoEntry | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM iso_entries WHERE iso_name = ?').get(isoName) as any;
    if (!row) return null;
    let initrd_items: { path: string; name?: string }[] = [];
    if (row.initrd_items) {
      try {
        initrd_items = JSON.parse(row.initrd_items);
      } catch {
        initrd_items = [];
      }
    }
    return {
      ...row,
      initrd_items,
    } as IsoEntry;
  },

  getAll(): IsoEntry[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM iso_entries ORDER BY created_at DESC').all() as any[];
    return rows.map(row => {
      let initrd_items: { path: string; name?: string }[] = [];
      if (row.initrd_items) {
        try {
          initrd_items = JSON.parse(row.initrd_items);
        } catch {
          initrd_items = [];
        }
      }
      return {
        ...row,
        initrd_items,
      } as IsoEntry;
    });
  },

  deleteByIsoName(isoName: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM iso_entries WHERE iso_name = ?');
    const result = stmt.run(isoName);
    return result.changes > 0;
  },
};
