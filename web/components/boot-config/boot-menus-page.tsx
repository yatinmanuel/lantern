'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, X, Search, Monitor, Disc, Pencil, Save, Trash2 } from 'lucide-react';
import { menusApi, BootMenu, BootMenuContentItem } from '@/lib/menus-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  const [menuName, setMenuName] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [menuIsDefault, setMenuIsDefault] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<BootMenuContentItem[]>([]);
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // const { toast } = useToast();

  useEffect(() => {
    loadMenus();
  }, []);

  useEffect(() => {
    if (!selectedMenu) {
      setMenuName('');
      setMenuDescription('');
      setMenuIsDefault(false);
      setMenuItems([]);
      setEditOpen(false);
      return;
    }
    setMenuName(selectedMenu.name);
    setMenuDescription(selectedMenu.description || '');
    setMenuIsDefault(selectedMenu.is_default);
    setMenuItems(selectedMenu.content || []);
    setEditOpen(false);
    setDeleteOpen(false);
  }, [selectedMenu]);

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

  async function handleDeleteMenu(id: string) {
    try {
      await menusApi.delete(id);
      toast.success('Menu deleted');
      if (selectedMenu?.id === id) setSelectedMenu(null);
      setDeleteOpen(false);
      await loadMenus();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete menu');
    }
  }

  async function handleSaveMenu() {
    if (!selectedMenu) return;
    if (!menuName.trim()) {
      toast.error('Menu name is required');
      return;
    }
    setIsSavingMenu(true);
    try {
      await menusApi.update(selectedMenu.id, {
        name: menuName.trim(),
        description: menuDescription,
        is_default: menuIsDefault,
        content: menuItems,
      });
      const nextMenu: BootMenu = {
        ...selectedMenu,
        name: menuName.trim(),
        description: menuDescription,
        is_default: menuIsDefault,
        content: menuItems,
      };
      setMenus((prev) =>
        prev.map((menu) => {
          if (menu.id === selectedMenu.id) {
            return nextMenu;
          }
          if (menuIsDefault && menu.is_default) {
            return { ...menu, is_default: false };
          }
          return menu;
        })
      );
      setSelectedMenu(nextMenu);
      toast.success('Menu saved');
      setEditOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save menu');
    } finally {
      setIsSavingMenu(false);
    }
  }

  function handleEditOpenChange(open: boolean) {
    if (!open && selectedMenu) {
      setMenuName(selectedMenu.name);
      setMenuDescription(selectedMenu.description || '');
      setMenuIsDefault(selectedMenu.is_default);
      setDeleteOpen(false);
    }
    setEditOpen(open);
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

      <Card className="flex flex-1 flex-col w-full min-h-0 p-4 sm:p-6">
        <div className="flex flex-1 min-h-0 overflow-hidden gap-4">
          {/* Sidebar: Menu List */}
          <div className="w-80 flex flex-col bg-transparent">
            <div className="p-2 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search menus..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={() => setIsCreating(true)}
                  disabled={isCreating}
                  aria-label="New menu"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isCreating && (
              <div className="p-2 bg-card animate-in fade-in slide-in-from-top-2">
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
                  <div
                    key={menu.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMenu(menu)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedMenu(menu);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-md text-sm transition-colors cursor-pointer ${
                      selectedMenu?.id === menu.id
                        ? 'bg-primary/10 text-primary border border-primary/20 font-medium'
                        : 'hover:bg-accent text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Disc className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate">{menu.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {menu.is_default && (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1">Default</Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-transparent"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMenu(menu);
                          setEditOpen(true);
                        }}
                        aria-label={`Edit ${menu.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {!isLoading && filteredMenus.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No menus found.
                  </div>
                )}
                {!isLoading && (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/60 bg-muted/20"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add menu
                  </button>
                )}
              </div>
            </ScrollArea>

            <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Menu</DialogTitle>
                  <DialogDescription>Update the menu name, description, and default state.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="menu-name">Menu Name</Label>
                    <Input
                      id="menu-name"
                      value={menuName}
                      onChange={(e) => setMenuName(e.target.value)}
                      placeholder="Menu name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menu-description">Description</Label>
                    <Input
                      id="menu-description"
                      value={menuDescription}
                      onChange={(e) => setMenuDescription(e.target.value)}
                      placeholder="Add a short description"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={menuIsDefault}
                      onCheckedChange={(value) => setMenuIsDefault(value === true)}
                    />
                    Global Default
                  </label>
                </div>
                <DialogFooter>
                  <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={!selectedMenu}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete menu?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove "{menuName || selectedMenu?.name}" and its items.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => selectedMenu && handleDeleteMenu(selectedMenu.id)}
                          disabled={isSavingMenu}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button onClick={handleSaveMenu} disabled={!selectedMenu || isSavingMenu}>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>

          <div className="flex flex-1 min-h-0 gap-4">
            <div className="flex-1 min-h-0 rounded-2xl border border-border/40 bg-background/60 shadow-sm overflow-hidden flex flex-col">
              {/* Main Content: Menu Editor or Welcome */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
                {selectedMenu ? (
                  <MenuEditor
                    key={selectedMenu.id}
                    menu={selectedMenu}
                    onItemsChange={setMenuItems}
                    onSave={handleSaveMenu}
                    isSaving={isSavingMenu}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <Monitor className="h-12 w-12 mb-4 opacity-20" />
                    <p>Select a boot menu to configure</p>
                  </div>
                )}
              </div>
            </div>

            <div className="w-80 min-h-0 rounded-2xl border border-border/40 bg-background/60 shadow-sm overflow-hidden">
              <ClientOverridesPanel menus={menus} defaultMenuId={selectedMenu?.id ?? null} />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
