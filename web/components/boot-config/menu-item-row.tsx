
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Image as ImageIcon, Type, Minus, Square, Zap, Power, Link2, FolderOpen, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { BootMenuContentItem, PowerStateAction } from '@/lib/menus-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MenuItemRowProps {
  id: string;
  item: BootMenuContentItem;
  onDelete: () => void;
  onChange: (updates: Partial<BootMenuContentItem>) => void;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isDragTarget?: boolean;
}

const POWER_STATE_LABELS: Record<PowerStateAction, string> = {
  local_boot: 'Boot from disk',
  reboot: 'Reboot',
  poweroff: 'Exit to shell', // legacy, no longer offered in UI
  shell: 'Exit to shell',
};

export function MenuItemRow({ id, item, onDelete, onChange, depth = 0, isExpanded, onToggleExpand, isDragTarget }: MenuItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const getIcon = () => {
    switch (item.type) {
      case 'iso': return ImageIcon;
      case 'smart_pxe': return Zap;
      case 'power_state': return Power;
      case 'chain': return Link2;
      case 'folder': return isExpanded ? FolderOpen : Folder;
      case 'header': return Square;
      case 'separator': return Minus;
      default: return Type;
    }
  };
  const Icon = getIcon();

  const getBadgeLabel = () => {
    switch (item.type) {
      case 'iso': return 'Image';
      case 'smart_pxe': return 'Smart PXE';
      case 'power_state': return 'Power';
      case 'chain': return 'Chain';
      case 'folder': return 'Folder';
      default: return null;
    }
  };
  const badgeLabel = getBadgeLabel();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
         "w-full flex items-center gap-2 p-2 bg-card border rounded-md group",
         isDragging && "shadow-lg ring-2 ring-primary bg-accent",
         isDragTarget && item.type === 'folder' && "ring-2 ring-primary border-primary bg-primary/10"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground p-1">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Folder expand/collapse toggle */}
      {item.type === 'folder' && onToggleExpand && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      )}

      <div className={cn("flex items-center justify-center h-8 w-8 rounded bg-muted shrink-0", item.type === 'folder' && !onToggleExpand && "ml-0")}>
         <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 flex items-center gap-2 min-w-0">
         {item.type === 'separator' ? (
            <div className="h-px bg-border w-full mx-2" />
         ) : item.type === 'iso' ? (
             <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label || item.isoName || 'Unknown Image'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">{badgeLabel}</Badge> 
                   <span className="truncate">{item.isoName}</span>
                </div>
             </div>
         ) : item.type === 'smart_pxe' ? (
             <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label || item.isoName || 'Smart PXE'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">{badgeLabel}</Badge>
                   <span className="truncate">{item.isoName}</span>
                </div>
             </div>
         ) : item.type === 'power_state' ? (
             <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label || POWER_STATE_LABELS[item.action || 'shell']}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">{badgeLabel}</Badge>
                   <span className="truncate">{item.action}</span>
                </div>
             </div>
         ) : item.type === 'chain' ? (
             <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label || 'Submenu'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">{badgeLabel}</Badge>
                   <span className="truncate">{item.targetMenuId ? `Menu: ${item.targetMenuId.slice(0, 8)}...` : item.chainUrl || 'Not configured'}</span>
                </div>
             </div>
         ) : item.type === 'folder' ? (
             <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label || 'Folder'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                   <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">{badgeLabel}</Badge>
                   <span className="truncate">{item.children?.length || 0} items</span>
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
      
      {/* Label override for iso/smart_pxe */}
      {(item.type === 'iso' || item.type === 'smart_pxe') && (
         <div className="w-32 shrink-0">
            <Input 
               value={item.label || ''} 
               onChange={(e) => onChange({ label: e.target.value })}
               placeholder="Label"
               className="h-8 text-xs"
            />
         </div>
      )}

      {/* Boot args override for iso/smart_pxe */}
      {(item.type === 'iso' || item.type === 'smart_pxe') && (
         <div className="w-28 shrink-0">
            <Input 
               value={item.bootArgsOverride || ''} 
               onChange={(e) => onChange({ bootArgsOverride: e.target.value || undefined })}
               placeholder="Boot args"
               className="h-8 text-xs"
               title="Override boot arguments for this entry"
            />
         </div>
      )}

      {/* Shortcut key for selectable items */}
      {(item.type === 'iso' || item.type === 'smart_pxe' || item.type === 'power_state' || item.type === 'chain' || item.type === 'folder') && (
         <div className="w-12 shrink-0">
            <Input 
               value={item.shortcutKey || ''} 
               onChange={(e) => {
                  const val = e.target.value.slice(0, 1).toLowerCase();
                  onChange({ shortcutKey: val || undefined });
               }}
               placeholder="Key"
               className="h-8 text-xs text-center"
               title="Shortcut key (single letter)"
               maxLength={1}
            />
         </div>
      )}

      {/* Auto-boot checkbox for smart_pxe */}
      {item.type === 'smart_pxe' && (
         <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Checkbox 
               checked={item.auto_boot || false}
               onCheckedChange={(checked) => onChange({ auto_boot: checked === true })}
            />
            Auto-boot
         </label>
      )}

      {/* Action dropdown for power_state */}
      {item.type === 'power_state' && (
         <div className="w-32 shrink-0">
            <Select 
               value={item.action === 'poweroff' ? 'shell' : (item.action || 'shell')} 
               onValueChange={(value) => onChange({ action: value as PowerStateAction, label: POWER_STATE_LABELS[value as PowerStateAction] })}
            >
               <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="local_boot">Boot from disk</SelectItem>
                  <SelectItem value="reboot">Reboot</SelectItem>
                  <SelectItem value="shell">Exit to shell</SelectItem>
               </SelectContent>
            </Select>
         </div>
      )}

      {/* Label input for power_state/chain/folder */}
      {(item.type === 'power_state' || item.type === 'chain' || item.type === 'folder') && (
         <div className="w-28 shrink-0">
            <Input 
               value={item.label || ''} 
               onChange={(e) => onChange({ label: e.target.value })}
               placeholder="Name"
               className="h-8 text-xs"
            />
         </div>
      )}

      {/* URL/Menu ID for chain */}
      {item.type === 'chain' && (
         <div className="w-36 shrink-0">
            <Input 
               value={item.chainUrl || item.targetMenuId || ''} 
               onChange={(e) => {
                  const val = e.target.value;
                  // If it looks like a URL, use chainUrl; otherwise assume menu ID
                  if (val.startsWith('http') || val.includes('/')) {
                     onChange({ chainUrl: val, targetMenuId: undefined });
                  } else {
                     onChange({ targetMenuId: val, chainUrl: undefined });
                  }
               }}
               placeholder="Menu ID or URL"
               className="h-8 text-xs"
            />
         </div>
      )}

      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
