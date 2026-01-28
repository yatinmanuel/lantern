import fs from 'fs/promises';
import path from 'path';
import { IsoModel, PXEConfigModel } from '../database/models.js';
import { logger } from './logger.js';

export async function generateIpxeMenu(): Promise<{ path: string }> {
  const config = await PXEConfigModel.getAll();
  const configMap: Record<string, string> = {};
  config.forEach(item => {
    configMap[item.key] = item.value;
  });

  const pxeServerIp = configMap.pxe_server_ip || '192.168.1.10';
  const pxeServerPort = configMap.pxe_server_port || '3000';
  const menuPath = configMap.ipxe_menu_path || '/var/www/html/ipxe/menu.ipxe';
  const alpineVersion = configMap.alpine_version || 'latest-stable';
  const alpineMirror = configMap.alpine_mirror || 'https://dl-cdn.alpinelinux.org/alpine';

  const isoEntries = (await IsoModel.getAll()).sort((a, b) => a.label.localeCompare(b.label));
  const baseUrl = `http://${pxeServerIp}:${pxeServerPort}`;

  const isoMenuItems = isoEntries.map((entry) => {
    const label = entry.label || entry.iso_name;
    const key = `iso_${entry.id}`;
    return { key, label, entry };
  });

  const isoMenuSection = isoMenuItems.length > 0
    ? `
item --gap --          ------------------------- Imported ISOs -------------------------
${isoMenuItems.map(item => `item ${item.key}           ${item.label}`).join('\n')}`
    : '';

  const isoMenuTargets = isoMenuItems.map((item) => {
    const entry = item.entry;
    const kernelUrl = entry.kernel_path.startsWith('http') ? entry.kernel_path : `${baseUrl}${entry.kernel_path}`;
    const initrds = entry.initrd_items || [];
    if (entry.os_type === 'windows') {
      const initrdLines = initrds.map(initrd => {
        const url = initrd.path.startsWith('http') ? initrd.path : `${baseUrl}${initrd.path}`;
        const name = initrd.name ? ` ${initrd.name}` : '';
        return `initrd ${url}${name}`;
      }).join('\n');
      return `
:${item.key}
kernel ${kernelUrl}
${initrdLines}
boot
`;
    }
    const initrdLines = initrds.map(initrd => {
      const url = initrd.path.startsWith('http') ? initrd.path : `${baseUrl}${initrd.path}`;
      return `initrd ${url}`;
    }).join('\n');
    const bootArgs = entry.boot_args ? ` ${entry.boot_args}` : '';
    return `
:${item.key}
kernel ${kernelUrl}${bootArgs}
${initrdLines}
boot
`;
  }).join('\n');

  const ipxeMenu = `#!ipxe

set menu-timeout 5000
set submenu-timeout \${menu-timeout}

:start
menu Intelligent PXE Server
item --gap --          ------------------------- Operating Systems -------------------------
item alpine           Boot Alpine Linux (Universal PXE Agent)
${isoMenuSection}
item --gap --
item --key x exit     Exit to shell
choose --timeout \${menu-timeout} --default alpine selected || exit
goto \${selected}

:alpine
echo Booting Alpine Linux with PXE Agent...
kernel http://${pxeServerIp}/ipxe/alpine/vmlinuz alpine_repo=${alpineMirror}/${alpineVersion}/main modloop=${alpineMirror}/${alpineVersion}/releases/x86_64/netboot/modloop-vanilla PXE_SERVER_URL=http://${pxeServerIp}:${pxeServerPort} quiet
initrd http://${pxeServerIp}/ipxe/alpine/initramfs
boot

${isoMenuTargets}

:exit
shell
`;

  await fs.mkdir(path.dirname(menuPath), { recursive: true });
  await fs.writeFile(menuPath, ipxeMenu);
  logger.info(`iPXE menu regenerated at ${menuPath}`);
  return { path: menuPath };
}
