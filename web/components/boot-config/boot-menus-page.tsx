
'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, X, Search, Monitor, Disc } from 'lucide-react';
import { menusApi, BootMenu } from '@/lib/menus-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MenuEditor } from './menu-editor';
import { ClientOverridesPanel } from './client-overrides-panel';
import { toast } from 'sonner';

export function BootMenusPage() {
  const [menus, setMenus] = useState<BootMenu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<BootMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Menu Form State
  const [newMenuName, setNewMenuName] = useState('');

  // const { toast } = useToast();

  useEffect(() => {
    loadMenus();
  }, []);

  async function loadMenus() {
    try {
      setIsLoading(true);
      const data = await menusApi.list();
      setMenus(data);
      // Select default menu if nothing selected
      if (!selectedMenu && data.length > 0) {
        const def = data.find(m => m.is_default);
        if (def) setSelectedMenu(def);
        else setSelectedMenu(data[0]);
      } else if (selectedMenu) {
         // Refresh selected object
         const updated = data.find(m => m.id === selectedMenu.id);
         if (updated) setSelectedMenu(updated);
      }
    } catch (error) {
      console.error('Failed to load menus', error);
      toast.error('Failed to load menus');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateMenu() {
    if (!newMenuName.trim()) return;
    try {
      await menusApi.create({
        name: newMenuName,
        content: [], // Start empty
        is_default: false
      });
      setNewMenuName('');
      setIsCreating(false);
      toast.success('Menu created');
      await loadMenus();
    } catch (error) {
      console.error(error);
      toast.error('Failed to create menu');
    }
  }

  async function handleDeleteMenu(id: number) {
    if (!confirm('Are you sure you want to delete this menu?')) return;
    try {
      await menusApi.delete(id);
      toast.success('Menu deleted');
      if (selectedMenu?.id === id) setSelectedMenu(null);
      await loadMenus();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete menu');
    }
  }

  const filteredMenus = menus.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col gap-6 pb-6 box-border overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold">Boot Configuration</h1>
        <p className="text-muted-foreground">Manage PXE boot menus and client overrides.</p>
      </div>

      <div className="flex flex-1 flex-col w-full overflow-hidden min-h-0 border rounded-xl bg-background shadow-sm">
        <div className="flex flex-1 overflow-hidden p-0 min-h-0">
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Sidebar: Menu List */}
            <div className="w-80 border-r bg-muted/10 flex flex-col">
              <div className="p-4 border-b space-y-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search menus..." 
                    className="pl-8" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={() => setIsCreating(true)} disabled={isCreating}>
                  <Plus className="mr-2 h-4 w-4" /> New Menu
                </Button>
              </div>
              
              {isCreating && (
                <div className="p-4 border-b bg-card animate-in fade-in slide-in-from-top-2">
                  <p className="text-xs font-medium mb-2">New Menu Name</p>
                  <div className="flex gap-2">
                    <Input 
                      value={newMenuName} 
                      onChange={(e) => setNewMenuName(e.target.value)} 
                      placeholder="e.g. Ubuntu Installers"
                      autoFocus
                    />
                    <Button size="icon" onClick={handleCreateMenu}><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setIsCreating(false)}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {isLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                  ) : filteredMenus.map(menu => (
                    <button
                      key={menu.id}
                      onClick={() => setSelectedMenu(menu)}
                      className={`w-full flex items-center justify-between p-3 rounded-md text-sm transition-colors ${
                        selectedMenu?.id === menu.id 
                          ? 'bg-primary/10 text-primary border border-primary/20 font-medium' 
                          : 'hover:bg-accent text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Disc className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">{menu.name}</span>
                      </div>
                      {menu.is_default && <Badge variant="secondary" className="text-[10px] h-5 px-1">Default</Badge>}
                    </button>
                  ))}
                  {!isLoading && filteredMenus.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No menus found.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Main Content: Menu Editor or Welcome */}
            <div className="flex-1 flex flex-col overflow-hidden bg-background border-r">
              {selectedMenu ? (
                <MenuEditor 
                  key={selectedMenu.id} 
                  menu={selectedMenu} 
                  onDelete={() => handleDeleteMenu(selectedMenu.id)}
                  onUpdate={loadMenus}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <Monitor className="h-12 w-12 mb-4 opacity-20" />
                  <p>Select a boot menu to configure</p>
                </div>
              )}
            </div>

            {/* Right Panel: Client Overrides */}
            <ClientOverridesPanel menus={menus} />
          </div>
        </div>
      </div>
    </div>
  );
}
