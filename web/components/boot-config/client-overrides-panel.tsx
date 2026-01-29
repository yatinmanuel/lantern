
'use client';

import { useState, useEffect } from 'react';
import { BootMenu } from '@/lib/menus-api';
import { api } from '@/lib/api';
import { withSessionHeaders } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Monitor, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';

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
}

export function ClientOverridesPanel({ menus }: ClientOverridesPanelProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Filter only servers that have overrides or all? 
  // Let's show all, but put overridden ones on top or highlight them?
  // Requirements: "Client Overrides (Right Panel)". Maybe just list all and allow management.
  
  const overriddenServers = servers.filter(s => s.boot_menu_id);
  const defaultServers = servers.filter(s => !s.boot_menu_id);

  return (
    <div className="flex flex-col h-full bg-background border-l w-80">
       <div className="p-4 border-b bg-muted/10">
          <h3 className="font-semibold text-sm">Client Overrides</h3>
          <p className="text-xs text-muted-foreground">Assign specific menus to clients</p>
       </div>

       <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
             {/* Overridden Clients */}
             <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Active Overrides</h4>
                {overriddenServers.length === 0 && (
                   <p className="text-xs text-muted-foreground italic">No active overrides.</p>
                )}
                {overriddenServers.map(server => (
                   <ClientCard key={server.id} server={server} menus={menus} onAssign={handleAssign} />
                ))}
             </div>

             <div className="border-t pt-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Default Clients</h4>
                {defaultServers.length === 0 && !isLoading && (
                   <p className="text-xs text-muted-foreground italic">No other clients found.</p>
                )}
                {defaultServers.map(server => (
                   <ClientCard key={server.id} server={server} menus={menus} onAssign={handleAssign} />
                ))}
             </div>
          </div>
       </ScrollArea>
    </div>
  );
}

function ClientCard({ server, menus, onAssign }: { server: Server, menus: BootMenu[], onAssign: (sid: number, mid: string) => void }) {
   const currentMenu = menus.find(m => m.id === server.boot_menu_id);
   
   return (
      <div className="p-3 rounded-md border bg-card/50 hover:bg-card transition-colors">
         <div className="flex items-start justify-between mb-2">
            <div>
               <div className="font-medium text-sm flex items-center gap-2">
                  <Monitor className="h-3 w-3 text-muted-foreground" />
                  {server.hostname || server.mac_address}
               </div>
               <div className="text-[10px] text-muted-foreground font-mono">{server.ip_address || 'No IP'}</div>
            </div>
            {server.boot_menu_id && (
               <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 bg-primary/5 border-primary/20 text-primary">
                  Override
               </Badge>
            )}
         </div>
         
         <div className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Select 
               value={server.boot_menu_id?.toString() || 'default'} 
               onValueChange={(val: string) => onAssign(server.id, val)}
            >
               <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Select Menu" />
               </SelectTrigger>
               <SelectContent align="end">
                  <SelectItem value="default" className="text-muted-foreground font-medium">Use Global Default</SelectItem>
                  {menus.map(menu => (
                     <SelectItem key={menu.id} value={menu.id.toString()}>
                        {menu.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>
      </div>
   );
}
