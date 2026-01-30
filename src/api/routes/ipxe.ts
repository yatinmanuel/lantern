
import { Router } from 'express';
import { BootMenuModel, ServerModel, IsoModel, PXEConfigModel } from '../../database/models.js';

const router = Router();

// Dynamic iPXE script generator
router.get('/boot', async (req, res) => {
  try {
    // 1. Identify Client
    const mac = req.query.mac as string;
    const menuId = req.query.menu as string; // Optional: specific menu ID (for chain/submenu)
    let server = mac ? await ServerModel.findByMac(mac) : null;
    
    // 2. Determine Menu
    let menu = null;
    
    // If menu query param is provided, use that menu directly (for chain targets)
    if (menuId) {
      menu = await BootMenuModel.findById(menuId);
    }
    
    // Otherwise, use client's assigned menu
    if (!menu && server?.boot_menu_id) {
      menu = await BootMenuModel.findById(server.boot_menu_id);
    }
    
    // Fallback if assigned menu missing or no client
    if (!menu) {
      menu = await BootMenuModel.getDefault();
    }

    if (!menu) {
      // Emergency fallback if no default menu exists
      return res.send('#!ipxe\n\necho No boot menu found.\nshell');
    }

    // 3. Render Menu
    // We need config for IPs
    const config = await PXEConfigModel.getAll();
    const configMap: Record<string, string> = {};
    config.forEach(c => configMap[c.key] = c.value);
    
    const pxeServerIp = configMap.pxe_server_ip || '192.168.1.10';
    const pxeServerPort = configMap.pxe_server_port || '3000';
    const baseUrl = `http://${pxeServerIp}:${pxeServerPort}`;

    const script = await renderIpxeMenu(menu, baseUrl);
    
    res.header('Content-Type', 'text/plain');
    res.send(script);

  } catch (error) {
    console.error('Error generating boot script:', error);
    res.status(500).send('#!ipxe\n\necho Server Error\nshell');
  }
});

async function renderIpxeMenu(menu: any, baseUrl: string) {
    const items = menu.content || [];
    
    // Helper to resolve ISO/Image details
    const isos = await IsoModel.getAll();
    const isoMap = new Map(isos.map(i => [i.id, i])); // Map by ID
    // Also map by name for portability
    const isoNameMap = new Map(isos.map(i => [i.iso_name, i]));

    // Helper to generate boot target for an image entry (used by iso and smart_pxe)
    function generateImageTarget(entry: any, key: string, bootArgsOverride?: string): string {
        const kernelUrl = entry.kernel_path.startsWith('http') ? entry.kernel_path : `${baseUrl}${entry.kernel_path}`;
        const initrds = entry.initrd_items || [];
        
        let initrdLines = '';
        if (entry.os_type === 'windows') {
            // Windows logic (wimboot)
            initrdLines = initrds.map((ir: any) => {
                const url = ir.path.startsWith('http') ? ir.path : `${baseUrl}${ir.path}`;
                const name = ir.name ? ` ${ir.name}` : '';
                return `initrd ${url}${name}`;
            }).join('\n');
        } else {
            // Linux logic
            initrdLines = initrds.map((ir: any) => {
                const url = ir.path.startsWith('http') ? ir.path : `${baseUrl}${ir.path}`;
                return `initrd ${url}`;
            }).join('\n');
        }
        
        // Use override if provided, else entry's boot_args
        const bootArgs = bootArgsOverride ? ` ${bootArgsOverride}` : (entry.boot_args ? ` ${entry.boot_args}` : '');
        
        return `
:${key}
kernel ${kernelUrl}${bootArgs}
${initrdLines}
boot
`;
    }

    // Track auto_boot item for default selection
    let autoBootKey: string | null = null;
    
    // Collect all submenu blocks
    let allSubmenus = '';

    // Recursive function to process items
    function processItems(
        itemList: any[], 
        keyPrefix: string, 
        parentLabel: string,
        menuTitle: string
    ): { menuItems: string; targets: string } {
        let menuItems = '';
        let targets = '';

        for (let i = 0; i < itemList.length; i++) {
            const item = itemList[i];
            const key = keyPrefix ? `${keyPrefix}_${i}` : `item_${i}`;
            const shortcutKeyOpt = item.shortcutKey ? `--key ${item.shortcutKey} ` : '';
            
            if (item.type === 'header') {
                menuItems += `item --gap --          ------------------------- ${item.content || ''} -------------------------\n`;
            } else if (item.type === 'separator') {
                menuItems += `item --gap --\n`;
            } else if (item.type === 'text') {
                menuItems += `item --gap --          ${item.content || ''}\n`;
            } else if (item.type === 'iso') {
                let label = item.label || 'Unknown Image';
                let entry = null;

                if (item.isoId) entry = isoMap.get(item.isoId);
                else if (item.isoName) entry = isoNameMap.get(item.isoName);

                if (entry) {
                    label = item.label || entry.label;
                    menuItems += `item ${shortcutKeyOpt}${key}           ${label}\n`;
                    targets += generateImageTarget(entry, key, item.bootArgsOverride);
                } else {
                    menuItems += `item --gap --          (Missing Image: ${label})\n`;
                }
            } else if (item.type === 'smart_pxe') {
                let label = item.label || 'Smart PXE';
                let entry = null;

                if (item.isoId) entry = isoMap.get(item.isoId);
                else if (item.isoName) entry = isoNameMap.get(item.isoName);

                if (entry) {
                    label = item.label || entry.label;
                    menuItems += `item ${shortcutKeyOpt}${key}           ${label}\n`;
                    targets += generateImageTarget(entry, key, item.bootArgsOverride);
                    
                    // Track first auto_boot item (only at root level)
                    if (item.auto_boot && !autoBootKey && !keyPrefix) {
                        autoBootKey = key;
                    }
                } else {
                    menuItems += `item --gap --          (Missing Image: ${label})\n`;
                }
            } else if (item.type === 'power_state') {
                const label = item.label || item.action || 'Power';
                menuItems += `item ${shortcutKeyOpt}${key}           ${label}\n`;
                
                if (item.action === 'reboot') {
                    targets += `\n:${key}\nreboot\n`;
                } else if (item.action === 'shell') {
                    targets += `\n:${key}\nshell\n`;
                } else if (item.action === 'local_boot') {
                    // Try sanboot for local disk; on failure return to menu (exit can cause parent boot chain to drop to shell).
                    targets += `
:${key}
iseq \${platform} efi && goto ${key}_efi || goto ${key}_bios
:${key}_bios
sanboot --no-describe --drive 0x80 || goto ${parentLabel}
:${key}_efi
sanboot --no-describe --drive 0 || goto ${parentLabel}
`;
                }
            } else if (item.type === 'chain') {
                const label = item.label || 'Submenu';
                menuItems += `item ${shortcutKeyOpt}${key}           ${label}\n`;
                
                if (item.targetMenuId) {
                    targets += `\n:${key}\nchain ${baseUrl}/api/ipxe/boot?mac=\${net0/mac}&menu=${item.targetMenuId} || goto ${parentLabel}\n`;
                } else if (item.chainUrl) {
                    targets += `\n:${key}\nchain ${item.chainUrl} || goto ${parentLabel}\n`;
                } else {
                    targets += `\n:${key}\necho Missing chain target\nsleep 2\ngoto ${parentLabel}\n`;
                }
            } else if (item.type === 'folder') {
                const folderLabel = item.label || 'Folder';
                const folderKey = `folder_${key}`;
                
                // Add menu item to go to folder
                menuItems += `item ${shortcutKeyOpt}${key}           ${folderLabel} >\n`;
                
                // Generate target that goes to the folder submenu
                targets += `\n:${key}\ngoto ${folderKey}\n`;
                
                // Recursively process folder children
                const children = item.children || [];
                const childResult = processItems(children, key, folderKey, folderLabel);
                
                // Generate the submenu block
                allSubmenus += `
:${folderKey}
menu ${folderLabel}
${childResult.menuItems}
item --gap --
item ${folderKey}_back    < Return
choose --timeout \${submenu-timeout} --default ${folderKey}_back selected || goto ${folderKey}_back
goto \${selected}

${childResult.targets}

:${folderKey}_back
goto ${parentLabel}
`;
            }
        }

        return { menuItems, targets };
    }

    // Process root items
    const result = processItems(items, '', 'start', menu.name);

    // Determine timeout (in ms for iPXE)
    const timeoutSec = menu.timeout_sec ?? 5;
    const timeoutMs = timeoutSec === 0 ? 0 : timeoutSec * 1000;
    
    // Determine default item: auto_boot wins, else default_item_key, else 'exit'
    const defaultItem = autoBootKey || menu.default_item_key || 'exit';

    // Generate color commands if menu_colors is set
    let colorCommands = '';
    if (menu.menu_colors && menu.menu_colors.preset !== 'default') {
        const colors = menu.menu_colors;
        if (colors.preset === 'dark') {
            colorCommands = `cpair --foreground 7 --background 0 0
cpair --foreground 0 --background 7 7
`;
        } else if (colors.preset === 'custom') {
            if (colors.default_fg !== undefined || colors.default_bg !== undefined) {
                const fg = colors.default_fg ?? 7;
                const bg = colors.default_bg ?? 0;
                colorCommands += `cpair --foreground ${fg} --background ${bg} 0\n`;
            }
            if (colors.highlight_fg !== undefined || colors.highlight_bg !== undefined) {
                const fg = colors.highlight_fg ?? 0;
                const bg = colors.highlight_bg ?? 7;
                colorCommands += `cpair --foreground ${fg} --background ${bg} 7\n`;
            }
        }
    }

    return `#!ipxe

${colorCommands}set menu-timeout ${timeoutMs}
set submenu-timeout \${menu-timeout}
set menu-default ${defaultItem}

:start
menu ${menu.name}
${result.menuItems}
item --gap --
item --key x exit     Exit to shell
choose --timeout \${menu-timeout} --default \${menu-default} selected || goto exit
goto \${selected}

${result.targets}
${allSubmenus}

:exit
shell
`;
}

export const ipxeRoutes = router;
