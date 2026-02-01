import { getSessionHeaders, withSessionHeaders } from './session';
import type { JobResponse } from './jobs-api';

const API_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type NetbootDistro = {
  id: string;
  slug: string;
  display_name: string;
  icon?: string | null;
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
};

export type NetbootMirror = {
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
};

export type NetbootVersion = {
  id: string;
  mirror_id: string;
  version: string;
  display_name: string;
  is_eol: boolean;
  is_available: boolean;
  discovered_at: string;
  last_seen_at: string;
};

export type NetbootDistroWithMirrors = NetbootDistro & { mirrors: NetbootMirror[] };

export type NetbootExportPayload = {
  schemaVersion: number;
  distros: Partial<NetbootDistro>[];
  mirrors: Partial<NetbootMirror>[];
};

export type NetbootImportSummary = {
  updated: number;
  added: number;
  message: string;
};

export const netbootApi = {
  async getDistros(): Promise<NetbootDistro[]> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/distros`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch distros');
    return res.json();
  },

  async getDistro(id: string): Promise<NetbootDistroWithMirrors> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/distros/${encodeURIComponent(id)}`, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Distro not found');
      throw new Error('Failed to fetch distro');
    }
    return res.json();
  },

  async updateDistro(
    id: string,
    updates: { display_name?: string; enabled?: boolean; sort_order?: number }
  ): Promise<NetbootDistro> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/distros/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update distro' }));
      throw new Error(err.error || 'Failed to update distro');
    }
    return res.json();
  },

  async getMirrors(distroId?: string): Promise<NetbootMirror[]> {
    const url = distroId
      ? `${API_BASE_URL}/api/netboot/mirrors?distro_id=${encodeURIComponent(distroId)}`
      : `${API_BASE_URL}/api/netboot/mirrors`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch mirrors');
    return res.json();
  },

  async addMirror(data: {
    distro_id: string;
    name: string;
    url: string;
    is_primary?: boolean;
  }): Promise<NetbootMirror> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/mirrors`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({
        distro_id: data.distro_id,
        name: data.name,
        url: data.url,
        is_primary: data.is_primary ?? false,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add mirror' }));
      throw new Error(err.error || 'Failed to add mirror');
    }
    return res.json();
  },

  async updateMirror(
    id: string,
    updates: { name?: string; url?: string; is_primary?: boolean; enabled?: boolean }
  ): Promise<NetbootMirror> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/mirrors/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update mirror' }));
      throw new Error(err.error || 'Failed to update mirror');
    }
    return res.json();
  },

  async deleteMirror(id: string): Promise<{ deleted: string }> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/mirrors/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete mirror' }));
      throw new Error(err.error || 'Failed to delete mirror');
    }
    return res.json();
  },

  async testUrl(url: string, distroId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/test-url`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ url: url.trim().replace(/\/+$/, ''), distro_id: distroId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to test URL' }));
      throw new Error(err.error || 'Failed to test URL');
    }
    return res.json();
  },

  async testMirror(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/mirrors/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to test mirror' }));
      throw new Error(err.error || 'Failed to test mirror');
    }
    return res.json();
  },

  async getVersions(mirrorId: string): Promise<NetbootVersion[]> {
    const res = await fetch(
      `${API_BASE_URL}/api/netboot/mirrors/${encodeURIComponent(mirrorId)}/versions`,
      {
        credentials: 'include',
        headers: getSessionHeaders(),
      }
    );
    if (!res.ok) throw new Error('Failed to fetch versions');
    return res.json();
  },

  async refreshMirror(id: string): Promise<JobResponse> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/mirrors/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to refresh mirror' }));
      throw new Error(err.error || 'Failed to refresh mirror');
    }
    return res.json();
  },

  async seed(): Promise<{ seeded: boolean }> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/seed`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to seed netboot sources' }));
      const detail = err.detail ? `: ${err.detail}` : '';
      throw new Error((err.error || 'Failed to seed netboot sources') + detail);
    }
    return res.json();
  },

  /** Fix Arch netboot URL: .../iso/latestarch/... doesn't exist; correct path is .../iso/latest/arch/... */
  async fixArchBootArgs(): Promise<{ fixed: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/fix-arch-boot-args`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fix Arch boot args' }));
      const detail = err.detail ? `: ${err.detail}` : '';
      throw new Error((err.error || 'Failed to fix Arch boot args') + detail);
    }
    return res.json();
  },

  async refreshAll(): Promise<JobResponse> {
    const res = await fetch(`${API_BASE_URL}/api/netboot/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to refresh mirrors' }));
      const detail = err.detail ? `: ${err.detail}` : '';
      throw new Error((err.error || 'Failed to refresh mirrors') + detail);
    }
    return res.json();
  },

  async exportConfig(officialOnly = true): Promise<NetbootExportPayload> {
    const url = `${API_BASE_URL}/api/netboot/export?official=${officialOnly ? 'true' : 'false'}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: getSessionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to export config');
    return res.json();
  },

  async importConfig(file: File): Promise<NetbootImportSummary> {
    const text = await file.text();
    const body = JSON.parse(text) as NetbootExportPayload;
    const res = await fetch(`${API_BASE_URL}/api/netboot/import`, {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to import config' }));
      throw new Error(err.error || 'Failed to import config');
    }
    return res.json();
  },
};
