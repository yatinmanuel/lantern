'use client';

import { useEffect, useState } from 'react';
import { Server, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, Server as ServerType } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const ONLINE_THRESHOLD_MS = 60 * 1000;
const STANDBY_THRESHOLD_MS = 5 * 60 * 1000;

function getPresence(lastSeen?: string) {
  if (!lastSeen) {
    return { label: 'offline', dotClass: 'bg-muted-foreground/50', textClass: 'text-muted-foreground', pulse: false };
  }
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff <= ONLINE_THRESHOLD_MS) {
    return { label: 'online', dotClass: 'bg-emerald-500', textClass: 'text-emerald-400', pulse: true };
  }
  if (diff <= STANDBY_THRESHOLD_MS) {
    return { label: 'standby', dotClass: 'bg-amber-400', textClass: 'text-amber-300', pulse: true };
  }
  return { label: 'offline', dotClass: 'bg-muted-foreground/50', textClass: 'text-muted-foreground', pulse: false };
}

export default function DashboardPage() {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServers();
    const interval = setInterval(loadServers, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadServers() {
    try {
      const data = await api.getServers();
      setServers(data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  }

  const stats = {
    total: servers.length,
    ready: servers.filter(s => s.status === 'ready').length,
    installing: servers.filter(s => s.status === 'installing').length,
    installed: servers.filter(s => s.status === 'installed').length,
  };

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your PXE clients</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ready</CardTitle>
              <div className="h-4 w-4 rounded-full bg-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.ready}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Installing</CardTitle>
              <div className="h-4 w-4 rounded-full bg-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.installing}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Installed</CardTitle>
              <div className="h-4 w-4 rounded-full bg-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.installed}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
          <CardTitle>Recent Clients</CardTitle>
          <CardDescription>Latest registered clients</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : servers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No clients registered yet
              </div>
            ) : (
              <div className="space-y-4">
                {servers.slice(0, 5).map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <div className="font-medium">{server.mac_address}</div>
                        <div className="text-sm text-muted-foreground">
                          {server.ip_address || 'No IP assigned'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {server.hardware_info && (
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          {server.hardware_info.cpu_cores && (
                            <div className="flex items-center gap-1">
                              <Cpu className="h-4 w-4" />
                              {server.hardware_info.cpu_cores} cores
                            </div>
                          )}
                          {server.hardware_info.memory_gb && (
                            <div className="flex items-center gap-1">
                              <MemoryStick className="h-4 w-4" />
                              {server.hardware_info.memory_gb}GB
                            </div>
                          )}
                          {server.hardware_info.disk_gb && (
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-4 w-4" />
                              {server.hardware_info.disk_gb}GB
                            </div>
                          )}
                        </div>
                      )}
                      {(() => {
                        const presence = getPresence(server.last_seen);
                        return (
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${presence.dotClass} ${presence.pulse ? 'animate-pulse' : ''}`}
                            />
                            <Badge variant="secondary" className="capitalize">
                              {presence.label}
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
