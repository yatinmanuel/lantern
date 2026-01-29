
'use client';

import { useMemo, useState, useEffect } from 'react';
import { BootMenu } from '@/lib/menus-api';
import { api } from '@/lib/api';
import { withSessionHeaders } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Monitor, Pencil, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

interface Server {
  id: number;
  mac_address: string;
  hostname?: string;
  ip_address?: string;
  boot_menu_id?: number | null;
  status: string;
}

interface ClientOverridesPanelProps {
  menus: BootMenu[];
  variant?: 'panel' | 'sheet';
}

export function ClientOverridesPanel({ menus, variant = 'panel' }: ClientOverridesPanelProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMenuId, setBulkMenuId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    loadServers();
  }, [menus]); // Reload if menus change, mainly to refresh UI but servers data is separate

  async function loadServers() {
    try {
      const data = await api.getServers();
      setServers(data as Server[]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAssign(serverId: number, menuId: string) {
    const mId = menuId === 'default' ? null : parseInt(menuId, 10);
    try {
      // Call assignment API
      const res = await fetch(`${apiBaseUrl}/api/boot-menus/assign`, {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ clientId: serverId, menuId: mId }),
      });
      if (!res.ok) throw new Error('Failed to assign menu');
      
      toast.success(mId ? 'Menu assigned' : 'Reverted to default');
      
      // Optimistic update
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, boot_menu_id: mId } : s));
    } catch (error) {
      console.error(error);
      toast.error('Assignment failed');
    }
  }

  async function handleBulkAssign(selected: Server[]) {
    if (!bulkMenuId) {
      toast.error('Select a menu to attach.');
      return;
    }
    if (selected.length === 0) {
      toast.error('Select at least one client.');
      return;
    }

    const menuIdValue = bulkMenuId === 'default' ? null : parseInt(bulkMenuId, 10);
    setBulkAssigning(true);
    try {
      await Promise.all(selected.map((server) => (
        fetch(`${apiBaseUrl}/api/boot-menus/assign`, {
          method: 'POST',
          headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ clientId: server.id, menuId: menuIdValue }),
        }).then((res) => {
          if (!res.ok) throw new Error('Failed to assign menu');
          return res;
        })
      )));
      setServers((prev) => prev.map((server) => (
        selected.some((item) => item.id === server.id)
          ? { ...server, boot_menu_id: menuIdValue }
          : server
      )));
      toast.success(`Attached to ${selected.length} client(s).`);
      setBulkOpen(false);
      setRowSelection({});
      setBulkMenuId('');
    } catch (error) {
      console.error(error);
      toast.error('Bulk attach failed');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Filter only servers that have overrides or all? 
  // Let's show all, but put overridden ones on top or highlight them?
  // Show all clients with optional overrides.
  
  const overriddenServers = servers.filter(s => s.boot_menu_id);

  const columns = useMemo<ColumnDef<Server>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'client',
      accessorFn: (row) => `${row.hostname || ''} ${row.mac_address} ${row.ip_address || ''}`.trim(),
      header: 'Client',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{row.original.hostname || row.original.mac_address}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.mac_address}</div>
        </div>
      ),
    },
    {
      accessorKey: 'ip_address',
      header: 'IP',
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground font-mono">{row.original.ip_address || '—'}</div>
      ),
    },
    {
      id: 'current',
      header: 'Current Menu',
      cell: ({ row }) => {
        const current = menus.find((menu) => menu.id === row.original.boot_menu_id);
        return (
          <div className="text-xs text-muted-foreground">
            {current ? current.name : 'Global Default'}
          </div>
        );
      },
    },
  ], [menus]);

  const table = useReactTable({
    data: servers,
    columns,
    state: { rowSelection, columnFilters },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedServers = table.getSelectedRowModel().rows.map((row) => row.original);

  return (
    <div className={variant === 'sheet'
      ? 'flex flex-col h-full bg-background w-full'
      : 'flex flex-col h-full bg-background w-full'}
    >
       <div className="p-4 border-b bg-muted/10 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">Attached to Clients</h3>
            <p className="text-xs text-muted-foreground">Assign specific menus to clients</p>
          </div>
          <Dialog
            open={bulkOpen}
            onOpenChange={(open) => {
              setBulkOpen(open);
              if (!open) {
                setRowSelection({});
                setBulkMenuId('');
                setColumnFilters([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="shrink-0" title="Edit attached clients">
                <Pencil className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="!w-[90vw] !max-w-5xl h-[70vh] min-h-[70vh] max-h-[70vh] p-0 overflow-hidden">
              <div className="flex h-full flex-col">
                <DialogHeader className="px-6 pt-6 pb-4 border-b">
                  <DialogTitle>Edit Attached Clients</DialogTitle>
                  <DialogDescription>Manage attached clients and assign menus.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-1 flex-col gap-4 p-6 min-h-0">
                  <div className="rounded-lg border border-border/40 bg-background/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Attached Clients</h4>
                        <p className="text-xs text-muted-foreground">Remove clients or keep them attached.</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 max-h-28 overflow-auto pr-2">
                      {overriddenServers.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No clients attached yet.</div>
                      ) : (
                        overriddenServers.map((server) => {
                          const current = menus.find((menu) => menu.id === server.boot_menu_id);
                          return (
                            <div key={server.id} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {server.hostname || server.mac_address}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {current ? current.name : 'Global Default'}
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleAssign(server.id, 'default')}
                                aria-label="Remove client override"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[16rem]">
                      <Select value={bulkMenuId} onValueChange={setBulkMenuId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select menu to attach" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use Global Default</SelectItem>
                          {menus.map((menu) => (
                            <SelectItem key={menu.id} value={menu.id.toString()}>
                              {menu.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <Input
                        placeholder="Search clients..."
                        value={(table.getColumn('client')?.getFilterValue() as string) ?? ''}
                        onChange={(event) => table.getColumn('client')?.setFilterValue(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden rounded-md border">
                    <div className="h-full overflow-auto">
                      <Table>
                        <TableHeader>
                          {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                              {headerGroup.headers.map((header) => (
                                <TableHead key={header.id}>
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                              ))}
                            </TableRow>
                          ))}
                        </TableHeader>
                        <TableBody>
                          {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                              <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && 'selected'}
                                onClick={() => row.toggleSelected()}
                                className="cursor-pointer"
                              >
                                {row.getVisibleCells().map((cell) => (
                                  <TableCell key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                No clients found.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {selectedServers.length} selected
                    </div>
                    <DataTablePagination table={table} />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t px-6 py-4">
                  <Button variant="ghost" onClick={() => setBulkOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleBulkAssign(selectedServers)}
                    disabled={bulkAssigning || !bulkMenuId || selectedServers.length === 0}
                  >
                    {bulkAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Attach
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
       </div>

       <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
             <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Active Overrides</h4>
             {overriddenServers.length === 0 && !isLoading && (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                   No clients attached yet. Use the pencil icon to manage attachments.
                </div>
             )}
             {overriddenServers.map(server => (
                <ClientCard key={server.id} server={server} menus={menus} />
             ))}
          </div>
       </ScrollArea>
    </div>
  );
}

function ClientCard({ server, menus }: { server: Server, menus: BootMenu[] }) {
   const currentMenu = menus.find(m => m.id === server.boot_menu_id);

   return (
      <div className="p-3 rounded-md border bg-card/50 hover:bg-card transition-colors">
         <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
               <div className="font-medium text-sm flex items-center gap-2">
                  <Monitor className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{server.hostname || server.mac_address}</span>
               </div>
               <div className="text-[10px] text-muted-foreground font-mono truncate">{server.ip_address || 'No IP'}</div>
            </div>
            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 bg-primary/5 border-primary/20 text-primary">
               Override
            </Badge>
         </div>

         <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground truncate">
               {currentMenu ? currentMenu.name : 'Global Default'}
            </div>
         </div>
      </div>
   );
}
