const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export type PXEConfigItem = {
  value: string;
  description?: string | null;
  updated_at?: string | null;
};

export type PXEConfig = Record<string, PXEConfigItem>;

export const configApi = {
  async getConfig(): Promise<PXEConfig> {
    const res = await fetch(`${API_BASE_URL}/api/config`, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Failed to fetch configuration');
    }
    return res.json();
  },

  async updateConfig(config: PXEConfig): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to update configuration' }));
      throw new Error(error.error || 'Failed to update configuration');
    }
  },

  async regenerateDnsmasq(): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch(`${API_BASE_URL}/api/config/service/dnsmasq/regenerate`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },

  async restartDnsmasq(): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch(`${API_BASE_URL}/api/config/service/dnsmasq/restart`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },

  async regenerateIpxeMenu(): Promise<{ success: boolean; message?: string; path?: string; error?: string }> {
    const res = await fetch(`${API_BASE_URL}/api/config/ipxe/regenerate`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },
};
