// Use relative URLs when served from backend, or proxy to backend in dev mode
import type { JobResponse } from './jobs-api';
import { getSessionHeaders, withSessionHeaders } from './session';
const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export interface Server {
  id: number;
  uuid: string;
  mac_address: string;
  ip_address: string | null;
  hostname: string | null;
  status: 'booting' | 'ready' | 'installing' | 'installed' | 'error';
  hardware_info: {
    cpu_cores?: number;
    memory_gb?: number;
    disk_gb?: number;
  } | null;
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

export const api = {
  async getServers(): Promise<Server[]> {
    const res = await fetch(`${API_BASE_URL}/api/servers`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch clients');
    return res.json();
  },

  async getServer(mac: string): Promise<Server> {
    const res = await fetch(`${API_BASE_URL}/api/servers/${mac}`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch client');
    return res.json();
  },

  async registerServer(data: {
    mac_address: string;
    hostname?: string;
    ip_address?: string;
    hardware_info?: Record<string, any>;
    manual?: boolean;
  }): Promise<Server> {
    const res = await fetch(`${API_BASE_URL}/api/servers/register`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to register client');
    return res.json();
  },

  async deleteServer(mac: string): Promise<JobResponse | void> {
    const res = await fetch(`${API_BASE_URL}/api/servers/${mac}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete client');
    return res.json().catch(() => undefined);
  },

  async deleteServerById(id: number): Promise<JobResponse | void> {
    const res = await fetch(`${API_BASE_URL}/api/servers/id/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete client');
    return res.json().catch(() => undefined);
  },

  async updateServer(id: number, updates: { ip_address?: string; hostname?: string; status?: Server['status'] }): Promise<JobResponse | Server> {
    const res = await fetch(`${API_BASE_URL}/api/servers/id/${id}`, {
      method: 'PATCH',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update client');
    return res.json().catch(() => ({} as Server));
  },

  async getServerTasks(mac: string): Promise<Task[]> {
    const res = await fetch(`${API_BASE_URL}/api/servers/${mac}/tasks/all`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async getServerInstallations(mac: string): Promise<Installation[]> {
    const res = await fetch(`${API_BASE_URL}/api/servers/${mac}/installations`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch installations');
    return res.json();
  },

  async rebootServer(id: number): Promise<JobResponse | { success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/servers/id/${id}/reboot`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to reboot client');
    }
    return res.json().catch(() => ({ success: true, message: 'Queued' }));
  },

  async shutdownServer(id: number): Promise<JobResponse | { success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/servers/id/${id}/shutdown`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to shutdown client');
    }
    return res.json().catch(() => ({ success: true, message: 'Queued' }));
  },

  async installOS(id: number, config: { os: string; version?: string; config?: string; disk?: string }): Promise<JobResponse | { success: boolean; message: string; taskId?: number }> {
    const res = await fetch(`${API_BASE_URL}/api/servers/id/${id}/install`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to install OS');
    }
    return res.json().catch(() => ({ success: true, message: 'Queued' }));
  },
};
