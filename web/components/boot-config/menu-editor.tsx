
'use client';

import { useState, useEffect } from 'react';
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
import { BootMenu, menusApi, BootMenuContentItem } from '@/lib/menus-api';
import { isoApi, IsoFile } from '@/lib/iso-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Assuming simple textarea for description
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Needs installation? Assuming Shadcn Switch
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MenuItemRow } from './menu-item-row';
import { Save, Loader2, Plus, GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface MenuEditorProps {
  menu: BootMenu;
  onDelete: () => void;
  onUpdate: () => void;
}

export function MenuEditor({ menu, onDelete, onUpdate }: MenuEditorProps) {
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description || '');
  const [isDefault, setIsDefault] = useState(menu.is_default);
  // We add a unique ID to each item for dnd-kit stability, in real app we might use UUIDs
  // For now we will map index to a stable ID if easier, but dnd-kit prefers stable IDs.
  // We can generate temporary IDs for the session.
  const [items, setItems] = useState<(BootMenuContentItem & { _id: string })[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isos, setIsos] = useState<IsoFile[]>([]);
  
  // const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Reset state when menu changes
    setName(menu.name);
    setDescription(menu.description || '');
    setIsDefault(menu.is_default);
    setItems(menu.content.map((item, idx) => ({ ...item, _id: `${idx}-${Date.now()}-${Math.random()}` })));
    
    // Load ISOs
    isoApi.list().then(setIsos).catch(console.error);
  }, [menu]);

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

  async function handleSave() {
    setIsSaving(true);
    try {
      // Strip _id before saving
      const cleanContent = items.map(({ _id, ...rest }) => rest);
      await menusApi.update(menu.id, {
        name,
        description,
        is_default: isDefault,
        content: cleanContent
      });
      toast.success('Menu saved');
      onUpdate();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save menu');
    } finally {
      setIsSaving(false);
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
      {/* Header / Actions */}
      <div className="p-6 border-b flex justify-between items-start">
         <div className="space-y-4 w-1/2">
            <div className="space-y-1">
               <Label>Menu Name</Label>
               <Input value={name} onChange={(e) => setName(e.target.value)} className="font-semibold text-lg" />
            </div>
            <div className="space-y-1">
               <Label>Description</Label>
               <Input value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm" />
            </div>
            <div className="flex items-center gap-2 pt-2">
               <Switch checked={isDefault} onCheckedChange={setIsDefault} id="is-default" />
               <Label htmlFor="is-default" className="cursor-pointer">Set as Global Default</Label>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Button onClick={onDelete} size="sm" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
               <Trash2 className="mr-2 h-4 w-4" /> Delete Menu
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
               {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
               Save Changes
            </Button>
         </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden flex flex-col p-6 bg-muted/5">
         <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Menu Items</h3>
            
            <Dialog>
               <DialogTrigger asChild>
                  <Button size="sm" variant="secondary"><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
               </DialogTrigger>
               <DialogContent>
                  <DialogHeader>
                     <DialogTitle>Add Menu Item</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                     <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => addItem('header')}>
                        <span className="font-bold">Header</span>
                        <span className="text-xs text-muted-foreground font-normal">Section Title</span>
                     </Button>
                     <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => addItem('text')}>
                        <span className="font-bold">Text</span>
                        <span className="text-xs text-muted-foreground font-normal">Static Label</span>
                     </Button>
                     <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => addItem('separator')}>
                        <span className="font-bold">Separator</span>
                        <span className="text-xs text-muted-foreground font-normal">Divider Line</span>
                     </Button>
                     {/* ISO Selection */}
                     <Select onValueChange={(val: string) => {
                           const iso = isos.find(i => i.id.toString() === val);
                           if (iso) addItem('iso', { isoId: Number(iso.id), isoName: iso.name, label: iso.entry?.label || iso.name });
                        }}>
                        <SelectTrigger className="h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed">
                           <span className="font-bold">ISO Image</span>
                           <span className="text-xs text-muted-foreground font-normal">Select an uploaded image</span>
                        </SelectTrigger>
                        <SelectContent>
                           {isos.map(iso => (
                              <SelectItem key={iso.id} value={iso.id.toString()}>
                                 {iso.entry?.label || iso.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               </DialogContent>
            </Dialog>
         </div>

         <ScrollArea className="flex-1 pr-4">
            <DndContext 
               sensors={sensors} 
               collisionDetection={closestCenter} 
               onDragEnd={handleDragEnd}
            >
               <SortableContext 
                  items={items.map(i => i._id)} 
                  strategy={verticalListSortingStrategy}
               >
                  <div className="space-y-2 pb-10">
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
