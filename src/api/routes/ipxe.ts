
import { Router } from 'express';
import { BootMenuModel, ServerModel, IsoModel, PXEConfigModel } from '../../database/models.js';

const router = Router();

// Dynamic iPXE script generator
router.get('/boot', async (req, res) => {
  try {
    // 1. Identify Client
    const mac = req.query.mac as string;
    let server = mac ? await ServerModel.findByMac(mac) : null;
    
    // 2. Determine Menu
    let menu = null;
    if (server?.boot_menu_id) {
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
    let menuItems = '';
    let targets = '';
    
    // Helper to resolve ISO details
    const isos = await IsoModel.getAll();
    const isoMap = new Map(isos.map(i => [i.id, i])); // Map by ID
    // Also map by name for portability
    const isoNameMap = new Map(isos.map(i => [i.iso_name, i]));

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const key = `item_${i}`;
        
        if (item.type === 'header') {
            menuItems += `item --gap --          ------------------------- ${item.content} -------------------------\n`;
        } else if (item.type === 'separator') {
            menuItems += `item --gap --\n`;
        } else if (item.type === 'text') {
             // Just a label, maybe not selectable? iPXE items are usually selectable. 
             // Use --gap for non-selectable text
             menuItems += `item --gap --          ${item.content}\n`;
        } else if (item.type === 'iso') {
            let label = item.label || 'Unknown Image';
            let entry = null;

             if (item.isoId) entry = isoMap.get(item.isoId);
             else if (item.isoName) entry = isoNameMap.get(item.isoName);

             if (entry) {
                 label = item.label || entry.label;
                 menuItems += `item ${key}           ${label}\n`;
                 
                 // Generate Target Block
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
                 
                 const bootArgs = entry.boot_args ? ` ${entry.boot_args}` : '';
                 
                 targets += `
:${key}
kernel ${kernelUrl}${bootArgs}
${initrdLines}
boot
`;
             } else {
                 menuItems += `item --gap --          (Missing Image: ${label})\n`;
             }
        }
    }

    return `#!ipxe

set menu-timeout 5000
set submenu-timeout \${menu-timeout}
set menu-default exit

:start
menu ${menu.name}
${menuItems}
item --gap --
item --key x exit     Exit to shell
choose --timeout \${menu-timeout} --default exit selected || exit
goto \${selected}

${targets}

:exit
shell
`;
}

export const ipxeRoutes = router;
