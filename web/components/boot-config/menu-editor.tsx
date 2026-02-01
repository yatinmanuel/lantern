
'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  DndContext, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  useDroppable,
  pointerWithin,
  closestCenter,
  CollisionDetection,
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { BootMenu, BootMenuContentItem } from '@/lib/menus-api';
import { imageApi, type ImageEntry } from '@/lib/image-api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MenuItemRow } from './menu-item-row';
import { Plus, Heading, Type, Minus, Image as ImageIcon, Save, Zap, Power, Link2, FolderOpen } from 'lucide-react';

interface MenuEditorProps {
  menu: BootMenu;
  onItemsChange?: (items: BootMenuContentItem[]) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

type ItemWithId = BootMenuContentItem & { _id: string; children?: ItemWithId[] };

function injectIds(items: BootMenuContentItem[], prefix = ''): ItemWithId[] {
  return items.map((item, idx) => {
    const _id = prefix ? `${prefix}-${idx}` : `${idx}-${Date.now()}-${Math.random()}`;
    if (item.type === 'folder' && Array.isArray(item.children)) {
      return { ...item, _id, children: injectIds(item.children, _id) };
    }
    return { ...item, _id };
  });
}

function stripIds(items: ItemWithId[]): BootMenuContentItem[] {
  return items.map((item) => {
    const { _id, children, ...rest } = item;
    if (item.type === 'folder' && Array.isArray(children)) {
      return { ...rest, children: stripIds(children) } as BootMenuContentItem;
    }
    return rest as BootMenuContentItem;
  });
}

function getAllSortableIds(items: ItemWithId[]): string[] {
  const ids: string[] = [];
  items.forEach((item) => {
    ids.push(item._id);
    if (item.type === 'folder' && item.children) {
      ids.push(...getAllSortableIds(item.children));
    }
  });
  return ids;
}

function findItemById(items: ItemWithId[], id: string): { item: ItemWithId; parent: ItemWithId[]; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i]._id === id) {
      return { item: items[i], parent: items, index: i };
    }
    if (items[i].type === 'folder' && items[i].children) {
      const found = findItemById(items[i].children!, id);
      if (found) return found;
    }
  }
  return null;
}

function findFolderById(items: ItemWithId[], id: string): ItemWithId | null {
  for (const item of items) {
    if (item._id === id && item.type === 'folder') return item;
    if (item.type === 'folder' && item.children) {
      const found = findFolderById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function isDescendant(parent: ItemWithId, childId: string): boolean {
  if (parent._id === childId) return true;
  if (parent.children) {
    return parent.children.some(c => isDescendant(c, childId));
  }
  return false;
}

function FolderDropZone({ folderId, isActive, children }: { folderId: string; isActive: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-drop-${folderId}`,
    data: { type: 'folder-drop', folderId },
  });

  return (
    <div 
      ref={setNodeRef}
      className={`ml-6 border-l-2 pl-2 space-y-2 mt-2 min-h-[40px] rounded-r transition-colors ${
        isOver && isActive ? 'border-primary bg-primary/10' : 'border-border/50'
      }`}
    >
      {children}
    </div>
  );
}

function fetchImages(): Promise<ImageEntry[]> {
  return imageApi.list();
}

export function MenuEditor({ menu, onItemsChange, onSave, isSaving }: MenuEditorProps) {
  const [items, setItems] = useState<ItemWithId[]>([]);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setItems(injectIds(menu.content || []));
  }, [menu]);

  useEffect(() => {
    fetchImages().then(setImages).catch(console.error);
  }, []);

  const refreshImages = () => {
    fetchImages().then(setImages).catch(console.error);
  };

  useEffect(() => {
    if (!onItemsChange) return;
    onItemsChange(stripIds(items));
  }, [items, onItemsChange]);

  const customCollisionDetection: CollisionDetection = (args) => {
    // First check for folder drop zones using pointer detection
    const pointerCollisions = pointerWithin(args);
    const folderDropCollision = pointerCollisions.find(c => 
      String(c.id).startsWith('folder-drop-')
    );
    if (folderDropCollision) {
      return [folderDropCollision];
    }
    // Use closestCenter for smooth sorting animations
    return closestCenter(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    
    if (!over || active.id === over.id) return;
    
    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;
    
    setItems((currentItems) => {
      const newItems = JSON.parse(JSON.stringify(currentItems)) as ItemWithId[];
      
      const activeResult = findItemById(newItems, activeIdStr);
      if (!activeResult) return currentItems;
      
      if (overIdStr.startsWith('folder-drop-')) {
        const folderId = overIdStr.replace('folder-drop-', '');
        const targetFolder = findFolderById(newItems, folderId);
        
        if (targetFolder && targetFolder._id !== activeIdStr) {
          if (activeResult.item.type === 'folder' && isDescendant(activeResult.item, folderId)) {
            return currentItems;
          }
          
          activeResult.parent.splice(activeResult.index, 1);
          targetFolder.children = targetFolder.children || [];
          targetFolder.children.push(activeResult.item);
          setExpandedFolders(prev => new Set([...prev, targetFolder._id]));
          return newItems;
        }
        return currentItems;
      }
      
      const overResult = findItemById(newItems, overIdStr);
      if (!overResult) return currentItems;
      
      if (overResult.item.type === 'folder' && overResult.item._id !== activeIdStr) {
        return currentItems;
      }
      
      if (activeResult.parent === overResult.parent) {
        const movedItems = arrayMove(activeResult.parent, activeResult.index, overResult.index);
        activeResult.parent.length = 0;
        activeResult.parent.push(...movedItems);
        return newItems;
      }
      
      activeResult.parent.splice(activeResult.index, 1);
      const newOverResult = findItemById(newItems, overIdStr);
      if (newOverResult) {
        newOverResult.parent.splice(newOverResult.index, 0, activeResult.item);
      }
      return newItems;
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  function addItem(type: BootMenuContentItem['type'], extra?: Partial<BootMenuContentItem>) {
    const newItem: ItemWithId = {
      type,
      _id: `new-${Date.now()}-${Math.random()}`,
      content: type === 'header' ? 'New Header' : type === 'text' ? 'New Text' : undefined,
      label: type === 'power_state' ? (extra?.action === 'local_boot' ? 'Boot from disk' : 
             extra?.action === 'reboot' ? 'Reboot' : 
             extra?.action === 'shell' ? 'Exit to shell' : undefined) : 
             type === 'folder' ? 'New Folder' : undefined,
      children: type === 'folder' ? [] : undefined,
      ...extra,
    };
    setItems((prev) => [...prev, newItem]);
  }

  function updateItemRecursive(itemList: ItemWithId[], id: string, updates: Partial<BootMenuContentItem>): ItemWithId[] {
    return itemList.map((item) => {
      if (item._id === id) {
        return { ...item, ...updates };
      }
      if (item.type === 'folder' && item.children) {
        return { ...item, children: updateItemRecursive(item.children, id, updates) };
      }
      return item;
    });
  }

  function updateItem(id: string, updates: Partial<BootMenuContentItem>) {
    setItems((prev) => updateItemRecursive(prev, id, updates));
  }

  function deleteItemRecursive(itemList: ItemWithId[], id: string): ItemWithId[] {
    return itemList.filter((item) => {
      if (item._id === id) return false;
      if (item.type === 'folder' && item.children) {
        item.children = deleteItemRecursive(item.children, id);
      }
      return true;
    });
  }

  function deleteItem(id: string) {
    setItems((prev) => deleteItemRecursive(prev, id));
  }

  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAddMenu() {
    const button = addButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom + 4,
    });
    button.dispatchEvent(contextEvent);
  }

  const activeItem = activeId ? findItemById(items, activeId)?.item : null;

  function renderItems(itemList: ItemWithId[], depth = 0) {
    return itemList.map((item) => (
      <div key={item._id}>
        <MenuItemRow
          id={item._id}
          item={item}
          onDelete={() => deleteItem(item._id)}
          onChange={(u) => updateItem(item._id, u)}
          depth={depth}
          isExpanded={expandedFolders.has(item._id)}
          onToggleExpand={() => toggleFolder(item._id)}
          isDragTarget={overId === `folder-drop-${item._id}` && activeId !== item._id}
        />
        {item.type === 'folder' && expandedFolders.has(item._id) && (
          <FolderDropZone 
            folderId={item._id} 
            isActive={!!activeId && activeId !== item._id && !(activeItem?.type === 'folder' && isDescendant(activeItem, item._id))}
          >
            {item.children && item.children.length > 0 ? (
              renderItems(item.children, depth + 1)
            ) : (
              <div className="text-xs text-muted-foreground py-2 px-3 italic">
                Drop items here
              </div>
            )}
          </FolderDropZone>
        )}
      </div>
    ));
  }

  const allSortableIds = getAllSortableIds(items);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 flex flex-col p-6 bg-transparent">
        <div className="flex items-center justify-between mb-4 shrink-0 pl-4 pr-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Menu Items</h3>

          <div className="flex items-center gap-2">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(event) => {
                    event.preventDefault();
                    openAddMenu();
                  }}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  ref={addButtonRef}
                  aria-label="Add menu item"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent align="end" className="w-64 p-2" onOpenAutoFocus={refreshImages}>
                <ContextMenuItem onSelect={() => addItem('header')} className="gap-2">
                  <Heading className="h-4 w-4 text-muted-foreground" />
                  <span>Section Header</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => addItem('text')} className="gap-2">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  <span>Text Label</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => addItem('separator')} className="gap-2">
                  <Minus className="h-4 w-4 text-muted-foreground" />
                  <span>Divider</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => addItem('folder')} className="gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span>Folder</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span>Image</span>
                    </div>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-64 overflow-y-auto p-1">
                    {images.length === 0 ? (
                      <ContextMenuItem disabled>No images available</ContextMenuItem>
                    ) : (
                      images.map((img) => (
                        <ContextMenuItem
                          key={img.id}
                          onSelect={() =>
                            addItem('iso', {
                              isoId: img.id,
                              isoName: img.iso_name,
                              label: img.label,
                            })
                          }
                        >
                          {img.label || img.iso_name}
                        </ContextMenuItem>
                      ))
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span>Smart PXE</span>
                    </div>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-64 overflow-y-auto p-1">
                    {images.length === 0 ? (
                      <ContextMenuItem disabled>No images available</ContextMenuItem>
                    ) : (
                      images.map((img) => (
                        <ContextMenuItem
                          key={img.id}
                          onSelect={() =>
                            addItem('smart_pxe', {
                              isoId: img.id,
                              isoName: img.iso_name,
                              label: img.label,
                              auto_boot: false,
                            })
                          }
                        >
                          {img.label || img.iso_name}
                        </ContextMenuItem>
                      ))
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <div className="flex items-center gap-2">
                      <Power className="h-4 w-4 text-muted-foreground" />
                      <span>Power State</span>
                    </div>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="p-1">
                    <ContextMenuItem onSelect={() => addItem('power_state', { action: 'local_boot' })}>
                      Boot from disk
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => addItem('power_state', { action: 'reboot' })}>
                      Reboot
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => addItem('power_state', { action: 'shell' })}>
                      Exit to shell
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuItem onSelect={() => addItem('chain', { label: 'Submenu' })} className="gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span>Chain / Submenu</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
              onClick={() => onSave?.()}
              disabled={!onSave || isSaving}
              aria-label="Save menu"
              title="Save menu"
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 pb-6 pl-4 pr-3">
                {renderItems(items)}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    openAddMenu();
                  }}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/60 bg-muted/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add menu item
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>
      </div>
    </div>
  );
}
