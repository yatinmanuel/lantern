'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Server, Cpu, HardDrive, MemoryStick, Plus, Trash2, Settings, Clock, Activity, Power, PowerOff, Download, Loader2, Network, BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, Server as ServerType, Task, Installation } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const statusColors = {
  ready: 'bg-green-100 text-green-800 border-green-200',
  booting: 'bg-blue-100 text-blue-800 border-blue-200',
  installing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  installed: 'bg-purple-100 text-purple-800 border-purple-200',
  error: 'bg-red-100 text-red-800 border-red-200',
};

export default function ServersPage() {
  const router = useRouter();
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [formData, setFormData] = useState({
    mac_address: '',
    ip_address: '',
    cpu_cores: '',
    memory_gb: '',
    disk_gb: '',
  });
  const [editData, setEditData] = useState({
    ip_address: '',
    hostname: '',
    status: 'ready' as ServerType['status'],
  });
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installData, setInstallData] = useState({
    os: '',
    version: 'latest',
    disk: '/dev/sda',
    config: '',
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  async function handleRegister() {
    try {
      await api.registerServer({
        mac_address: formData.mac_address,
        ip_address: formData.ip_address || undefined,
        hardware_info: {
          cpu_cores: formData.cpu_cores ? parseInt(formData.cpu_cores) : undefined,
          memory_gb: formData.memory_gb ? parseInt(formData.memory_gb) : undefined,
          disk_gb: formData.disk_gb ? parseInt(formData.disk_gb) : undefined,
        },
      });
      setOpen(false);
      setFormData({ mac_address: '', ip_address: '', cpu_cores: '', memory_gb: '', disk_gb: '' });
      loadServers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to register client');
    }
  }

  async function handleDelete(server: ServerType) {
    if (!confirm(`Delete client ${server.mac_address}? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteServerById(server.id);
      alert('Delete queued');
      loadServers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete client');
    }
  }

  async function handleViewDetails(server: ServerType) {
    console.log('Opening details for client:', server.mac_address);
    setSelectedServer(server);
    setEditData({
      ip_address: server.ip_address || '',
      hostname: server.hostname || '',
      status: server.status,
    });
    setDetailOpen(true);
    setLoadingDetails(true);
    
    try {
      const [tasksData, installationsData] = await Promise.all([
        api.getServerTasks(server.mac_address).catch(() => []),
        api.getServerInstallations(server.mac_address).catch(() => []),
      ]);
      setTasks(tasksData);
      setInstallations(installationsData);
    } catch (error) {
      console.error('Failed to load client details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleUpdateServer() {
    if (!selectedServer) return;

    try {
      const updates: any = {};
      if (editData.ip_address !== selectedServer.ip_address) {
        updates.ip_address = editData.ip_address || null;
      }
      if (editData.hostname !== selectedServer.hostname) {
        updates.hostname = editData.hostname || null;
      }
      if (editData.status !== selectedServer.status) {
        updates.status = editData.status;
      }

      if (Object.keys(updates).length > 0) {
        await api.updateServer(selectedServer.id, updates);
        loadServers();
        // Optimistic update while job runs
        setSelectedServer({ ...selectedServer, ...updates });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update client');
    }
  }

  function formatLastSeen(lastSeen: string | undefined): string {
    if (!lastSeen) return 'Never';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  }

  const columns: ColumnDef<ServerType>[] = useMemo(() => [
    {
      accessorKey: "mac_address",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="MAC Address" />
      ),
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="font-mono font-medium cursor-pointer hover:underline"
            onClick={() => handleViewDetails(server)}
          >
            {server.mac_address}
          </div>
        )
      },
    },
    {
      accessorKey: "ip_address",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="IP Address" />
      ),
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="font-mono cursor-pointer hover:underline"
            onClick={() => handleViewDetails(server)}
          >
            {server.ip_address || '-'}
          </div>
        )
      },
    },
    {
      id: "hardware",
      header: "Hardware",
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="cursor-pointer"
            onClick={() => handleViewDetails(server)}
          >
            {server.hardware_info ? (
              <div className="flex gap-4 text-sm">
                {server.hardware_info.cpu_cores && (
                  <div className="flex items-center gap-1">
                    <Cpu className="h-4 w-4" />
                    {server.hardware_info.cpu_cores}
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
            ) : (
              '-'
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="cursor-pointer"
            onClick={() => handleViewDetails(server)}
          >
            <Badge className={statusColors[server.status]}>
              {server.status}
            </Badge>
          </div>
        )
      },
    },
    {
      accessorKey: "last_seen",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Seen" />
      ),
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
            onClick={() => handleViewDetails(server)}
          >
            <Clock className="h-3 w-3" />
            {formatLastSeen(server.last_seen)}
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.last_seen ? new Date(rowA.original.last_seen).getTime() : 0;
        const b = rowB.original.last_seen ? new Date(rowB.original.last_seen).getTime() : 0;
        return a - b;
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Registered" />
      ),
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div
            className="text-sm text-muted-foreground cursor-pointer"
            onClick={() => handleViewDetails(server)}
          >
            {new Date(server.created_at).toLocaleDateString()}
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        return new Date(rowA.original.created_at).getTime() - new Date(rowB.original.created_at).getTime();
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const server = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewDetails(server)}
              title="View Details"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(server)}
              className="text-destructive hover:text-destructive"
              title="Delete Client"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], [handleViewDetails, handleDelete, formatLastSeen]);

  async function handleReboot() {
    if (!selectedServer) return;
    
    if (!confirm(`Are you sure you want to reboot client ${selectedServer.mac_address}?`)) {
      return;
    }

    setActionLoading('reboot');
    try {
      await api.rebootServer(selectedServer.id);
      alert('Reboot queued');
      loadServers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to reboot client');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleShutdown() {
    if (!selectedServer) return;
    
    if (!confirm(`Are you sure you want to shutdown client ${selectedServer.mac_address}?`)) {
      return;
    }

    setActionLoading('shutdown');
    try {
      await api.shutdownServer(selectedServer.id);
      alert('Shutdown queued');
      loadServers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to shutdown client');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInstallOS() {
    if (!selectedServer) return;

    if (!installData.os) {
      alert('Please select an OS');
      return;
    }

    setActionLoading('install');
    try {
      await api.installOS(selectedServer.id, {
        os: installData.os,
        version: installData.version || undefined,
        disk: installData.disk || undefined,
        config: installData.config || undefined,
      });
      alert(`Installation queued for ${installData.os}`);
      setInstallDialogOpen(false);
      setInstallData({ os: '', version: 'latest', disk: '/dev/sda', config: '' });
      loadServers();
      // Reload details to see new task
      if (selectedServer) {
        handleViewDetails(selectedServer);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to install OS');
    } finally {
      setActionLoading(null);
    }
  }

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Clients</h1>
            <p className="text-muted-foreground">Manage your PXE clients</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Register Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register New Client</DialogTitle>
                <DialogDescription>
                  Manually register a client for testing
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="mac">MAC Address *</Label>
                  <Input
                    id="mac"
                    placeholder="Enter MAC address"
                    value={formData.mac_address}
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ip">IP Address</Label>
                  <Input
                    id="ip"
                    placeholder="Enter IP address"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpu">CPU Cores</Label>
                    <Input
                      id="cpu"
                      type="number"
                      placeholder="CPU cores"
                      value={formData.cpu_cores}
                      onChange={(e) => setFormData({ ...formData, cpu_cores: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="memory">Memory (GB)</Label>
                    <Input
                      id="memory"
                      type="number"
                      placeholder="Memory (GB)"
                      value={formData.memory_gb}
                      onChange={(e) => setFormData({ ...formData, memory_gb: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="disk">Disk (GB)</Label>
                    <Input
                      id="disk"
                      type="number"
                      placeholder="Disk (GB)"
                      value={formData.disk_gb}
                      onChange={(e) => setFormData({ ...formData, disk_gb: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleRegister} className="w-full">
                  Register
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
          <CardTitle>All Clients</CardTitle>
          <CardDescription>{servers.length} client(s) registered</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <Network className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No clients</h3>
                <p className="text-muted-foreground text-center max-w-md mb-6">
                  Boot a client machine from the network to automatically register it. 
                  Make sure your PXE server is properly configured first.
                </p>
                <Button
                  onClick={() => router.push('/settings')}
                  className="gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  Setup PXE Server
                </Button>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={servers}
                searchKey="mac_address"
                searchPlaceholder="Search by MAC address..."
              />
            )}
          </CardContent>
        </Card>

        {/* Server Details Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedServer && (
              <>
                <DialogHeader>
                  <DialogTitle>Client Details: {selectedServer.mac_address}</DialogTitle>
                  <DialogDescription>
                    Manage client settings and view tasks and installations
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="details" className="w-full">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
                    <TabsTrigger value="installations">Installations ({installations.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>MAC Address</Label>
                        <Input value={selectedServer.mac_address} disabled className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={editData.status}
                          onValueChange={(value) => setEditData({ ...editData, status: value as ServerType['status'] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="booting">Booting</SelectItem>
                            <SelectItem value="ready">Ready</SelectItem>
                            <SelectItem value="installing">Installing</SelectItem>
                            <SelectItem value="installed">Installed</SelectItem>
                            <SelectItem value="error">Error</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>IP Address</Label>
                        <Input
                          value={editData.ip_address}
                          onChange={(e) => setEditData({ ...editData, ip_address: e.target.value })}
                          placeholder="192.168.1.100"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Hostname</Label>
                        <Input
                          value={editData.hostname}
                          onChange={(e) => setEditData({ ...editData, hostname: e.target.value })}
                    placeholder="client-01"
                        />
                      </div>
                    </div>

                    {selectedServer.hardware_info && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Hardware Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4">
                            {selectedServer.hardware_info.cpu_cores && (
                              <div className="flex items-center gap-2">
                                <Cpu className="h-5 w-5" />
                                <div>
                                  <div className="text-sm text-muted-foreground">CPU Cores</div>
                                  <div className="font-semibold">{selectedServer.hardware_info.cpu_cores}</div>
                                </div>
                              </div>
                            )}
                            {selectedServer.hardware_info.memory_gb && (
                              <div className="flex items-center gap-2">
                                <MemoryStick className="h-5 w-5" />
                                <div>
                                  <div className="text-sm text-muted-foreground">Memory</div>
                                  <div className="font-semibold">{selectedServer.hardware_info.memory_gb} GB</div>
                                </div>
                              </div>
                            )}
                            {selectedServer.hardware_info.disk_gb && (
                              <div className="flex items-center gap-2">
                                <HardDrive className="h-5 w-5" />
                                <div>
                                  <div className="text-sm text-muted-foreground">Disk</div>
                                  <div className="font-semibold">{selectedServer.hardware_info.disk_gb} GB</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Timestamps</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Last Seen:</span>
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {formatLastSeen(selectedServer.last_seen)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Registered:</span>
                          <span>{new Date(selectedServer.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Last Updated:</span>
                          <span>{new Date(selectedServer.updated_at).toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                      <CardTitle className="text-lg">Client Actions</CardTitle>
                      <CardDescription>Perform actions on this client</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setInstallDialogOpen(true)}
                            disabled={!selectedServer.ip_address || actionLoading !== null}
                            className="w-full"
                          >
                            {actionLoading === 'install' ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            Install OS
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleReboot}
                            disabled={!selectedServer.ip_address || actionLoading !== null}
                            className="w-full"
                          >
                            {actionLoading === 'reboot' ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Power className="mr-2 h-4 w-4" />
                            )}
                            Reboot
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleShutdown}
                            disabled={!selectedServer.ip_address || actionLoading !== null}
                            className="w-full text-destructive hover:text-destructive"
                          >
                            {actionLoading === 'shutdown' ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <PowerOff className="mr-2 h-4 w-4" />
                            )}
                            Shutdown
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDetailOpen(false)}>
                        Close
                      </Button>
                      <Button onClick={handleUpdateServer}>
                        Save Changes
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="tasks">
                    {loadingDetails ? (
                      <div className="text-center py-8 text-muted-foreground">Loading tasks...</div>
                    ) : tasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No tasks found</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task) => (
                            <TableRow key={task.id}>
                              <TableCell className="font-mono">{task.id}</TableCell>
                              <TableCell>{task.type}</TableCell>
                              <TableCell>
                                <Badge className={
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  task.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }>
                                  {task.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(task.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm max-w-md truncate">
                                {task.result || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="installations">
                    {loadingDetails ? (
                      <div className="text-center py-8 text-muted-foreground">Loading installations...</div>
                    ) : installations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No installations found</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>OS Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Completed</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {installations.map((installation) => (
                            <TableRow key={installation.id}>
                              <TableCell className="font-mono">{installation.id}</TableCell>
                              <TableCell>{installation.os_type}</TableCell>
                              <TableCell>
                                <Badge className={
                                  installation.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  installation.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  installation.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }>
                                  {installation.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(installation.started_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {installation.completed_at ? new Date(installation.completed_at).toLocaleString() : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Install OS Dialog */}
        <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install OS on {selectedServer?.mac_address}</DialogTitle>
              <DialogDescription>
                Select an operating system to install on this client
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="os">Operating System *</Label>
                <Select
                  value={installData.os}
                  onValueChange={(value) => setInstallData({ ...installData, os: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select OS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ubuntu">Ubuntu</SelectItem>
                    <SelectItem value="debian">Debian</SelectItem>
                    <SelectItem value="alpine">Alpine Linux</SelectItem>
                    <SelectItem value="arch">Arch Linux</SelectItem>
                    <SelectItem value="fedora">Fedora</SelectItem>
                    <SelectItem value="centos">CentOS</SelectItem>
                    <SelectItem value="rhel">RHEL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  placeholder="latest"
                  value={installData.version}
                  onChange={(e) => setInstallData({ ...installData, version: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty or use "latest" for the latest stable version
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="disk">Target Disk</Label>
                <Input
                  id="disk"
                  placeholder="/dev/sda"
                  value={installData.disk}
                  onChange={(e) => setInstallData({ ...installData, disk: e.target.value })}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Default: /dev/sda
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="config">Configuration (Optional)</Label>
                <Input
                  id="config"
                  placeholder="Path to config file"
                  value={installData.config}
                  onChange={(e) => setInstallData({ ...installData, config: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Optional path to installation configuration file
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleInstallOS}
                  disabled={!installData.os || actionLoading !== null}
                >
                  {actionLoading === 'install' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Install OS
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}
