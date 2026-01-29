
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Image as ImageIcon, Type, Minus, Square } from 'lucide-react';
import { BootMenuContentItem } from '@/lib/menus-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils'; // Assuming standard Shadcn utils

interface MenuItemRowProps {
  id: string;
  item: BootMenuContentItem;
  onDelete: () => void;
  onChange: (updates: Partial<BootMenuContentItem>) => void;
}

export function MenuItemRow({ id, item, onDelete, onChange }: MenuItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.type === 'iso' ? ImageIcon : 
               item.type === 'header' ? Square : 
               item.type === 'separator' ? Minus : Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
         "flex items-center gap-2 p-2 bg-card border rounded-md mb-2 group",
         isDragging && "shadow-lg ring-2 ring-primary bg-accent"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground p-1">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex items-center justify-center h-8 w-8 rounded bg-muted">
         <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 flex items-center gap-2">
         {item.type === 'separator' ? (
            <div className="h-px bg-border w-full mx-2" />
         ) : item.type === 'iso' ? (
             <div className="flex-1">
                <div className="text-sm font-medium">{item.label || item.isoName || 'Unknown Image'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">ISO</Badge> 
                   {item.isoName}
                </div>
             </div>
         ) : (
            <Input 
               value={item.content || ''} 
               onChange={(e) => onChange({ content: e.target.value })}
               placeholder={item.type === 'header' ? "Header Text" : "Text Label"}
               className="h-8 text-sm"
            />
         )}
      </div>
      
      {item.type === 'iso' && (
         <div className="w-1/3">
            <Input 
               value={item.label || ''} 
               onChange={(e) => onChange({ label: e.target.value })}
               placeholder="Override Label (Optional)"
               className="h-8 text-xs"
            />
         </div>
      )}

      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
