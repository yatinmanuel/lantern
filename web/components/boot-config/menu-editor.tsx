
'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { BootMenu, BootMenuContentItem } from '@/lib/menus-api';
import { isoApi, IsoFile } from '@/lib/iso-api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MenuItemRow } from './menu-item-row';
import { Plus } from 'lucide-react';

interface MenuEditorProps {
  menu: BootMenu;
  onItemsChange?: (items: BootMenuContentItem[]) => void;
}

export function MenuEditor({ menu, onItemsChange }: MenuEditorProps) {
  // We add a unique ID to each item for dnd-kit stability, in real app we might use UUIDs
  // For now we will map index to a stable ID if easier, but dnd-kit prefers stable IDs.
  // We can generate temporary IDs for the session.
  const [items, setItems] = useState<(BootMenuContentItem & { _id: string })[]>([]);
  const [isos, setIsos] = useState<IsoFile[]>([]);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Reset state when menu changes
    setItems(menu.content.map((item, idx) => ({ ...item, _id: `${idx}-${Date.now()}-${Math.random()}` })));
    
    // Load ISOs
    isoApi.list().then(setIsos).catch(console.error);
  }, [menu]);

  useEffect(() => {
    if (!onItemsChange) return;
    const cleanItems = items.map(({ _id, ...rest }) => rest);
    onItemsChange(cleanItems);
  }, [items, onItemsChange]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function addItem(type: BootMenuContentItem['type'], extra?: Partial<BootMenuContentItem>) {
    setItems((prev) => [
      ...prev,
      { 
        type, 
        _id: `new-${Date.now()}-${Math.random()}`,
        content: type === 'header' ? 'New Header' : type === 'text' ? 'New Text' : undefined,
        ...extra 
      }
    ]);
  }

  function updateItem(id: string, updates: Partial<BootMenuContentItem>) {
     setItems(prev => prev.map(item => item._id === id ? { ...item, ...updates } : item));
  }

  function deleteItem(id: string) {
     setItems(prev => prev.filter(item => item._id !== id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor Area */}
      <div className="flex-1 min-h-0 flex flex-col p-6 bg-transparent">
         <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Menu Items</h3>

            <ContextMenu>
               <ContextMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(event) => {
                      event.preventDefault();
                      const button = addButtonRef.current;
                      if (!button) return;
                      const rect = button.getBoundingClientRect();
                      const contextEvent = new MouseEvent('contextmenu', {
                        bubbles: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.bottom + 4,
                      });
                      button.dispatchEvent(contextEvent);
                    }}
                    className="inline-flex items-center"
                    ref={addButtonRef}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Item
                  </Button>
               </ContextMenuTrigger>
               <ContextMenuContent align="end" className="w-56">
                  <ContextMenuLabel>Add Menu Item</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => addItem('header')}>Header</ContextMenuItem>
                  <ContextMenuItem onSelect={() => addItem('text')}>Text</ContextMenuItem>
                  <ContextMenuItem onSelect={() => addItem('separator')}>Separator</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                     <ContextMenuSubTrigger>ISO Image</ContextMenuSubTrigger>
                     <ContextMenuSubContent className="max-h-64 overflow-y-auto">
                        {isos.length === 0 ? (
                          <ContextMenuItem disabled>No ISOs available</ContextMenuItem>
                        ) : (
                          isos.map((iso) => (
                            <ContextMenuItem
                              key={iso.id}
                              onSelect={() =>
                                addItem('iso', {
                                  isoId: Number(iso.id),
                                  isoName: iso.name,
                                  label: iso.entry?.label || iso.name,
                                })
                              }
                            >
                              {iso.entry?.label || iso.name}
                            </ContextMenuItem>
                          ))
                        )}
                     </ContextMenuSubContent>
                  </ContextMenuSub>
               </ContextMenuContent>
            </ContextMenu>
         </div>

         <ScrollArea className="flex-1 min-h-0 pr-4">
            <DndContext 
               sensors={sensors} 
               collisionDetection={closestCenter} 
               onDragEnd={handleDragEnd}
               modifiers={[restrictToVerticalAxis]}
            >
               <SortableContext 
                  items={items.map(i => i._id)} 
                  strategy={verticalListSortingStrategy}
               >
                  <div className="space-y-2 pb-6">
                     {items.map((item) => (
                        <MenuItemRow 
                           key={item._id} 
                           id={item._id} 
                           item={item} 
                           onDelete={() => deleteItem(item._id)}
                           onChange={(u) => updateItem(item._id, u)}
                        />
                     ))}
                     {items.length === 0 && (
                        <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                           <p>Menu is empty</p>
                           <p className="text-xs">Add items to build your menu</p>
                        </div>
                     )}
                  </div>
               </SortableContext>
            </DndContext>
         </ScrollArea>
      </div>
    </div>
  );
}
