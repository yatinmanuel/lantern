
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
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MenuItemRow } from './menu-item-row';
import { Plus, Heading, Type, Minus, Image as ImageIcon, Save } from 'lucide-react';

interface MenuEditorProps {
  menu: BootMenu;
  onItemsChange?: (items: BootMenuContentItem[]) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function MenuEditor({ menu, onItemsChange, onSave, isSaving }: MenuEditorProps) {
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

  return (
    <div className="flex flex-col h-full">
      {/* Editor Area */}
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
                 <ContextMenuContent align="end" className="w-64 p-2">
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
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                       <ContextMenuSubTrigger>
                         <div className="flex items-center gap-2">
                           <ImageIcon className="h-4 w-4 text-muted-foreground" />
                           <span>ISO Image</span>
                         </div>
                       </ContextMenuSubTrigger>
                       <ContextMenuSubContent className="max-h-64 overflow-y-auto p-1">
                          {isos.length === 0 ? (
                            <ContextMenuItem disabled>No ISOs available</ContextMenuItem>
                          ) : (
                            isos.map((iso) => (
                              <ContextMenuItem
                                key={iso.id}
                                onSelect={() =>
                                  addItem('iso', {
                                    isoId: iso.entry?.id,
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
               collisionDetection={closestCenter} 
               onDragEnd={handleDragEnd}
               modifiers={[restrictToVerticalAxis]}
            >
               <SortableContext 
                  items={items.map(i => i._id)} 
                  strategy={verticalListSortingStrategy}
               >
                  <div className="space-y-2 pb-6 pl-4 pr-3">
                     {items.map((item) => (
                        <MenuItemRow 
                           key={item._id} 
                           id={item._id} 
                           item={item} 
                           onDelete={() => deleteItem(item._id)}
                           onChange={(u) => updateItem(item._id, u)}
                        />
                     ))}
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
