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
  
  // New Logic: The static menu just chains to the dynamic API
  // We use ${net0/mac} to pass the MAC address to the API
  const ipxeMenu = `#!ipxe

:start
chain http://${pxeServerIp}:${pxeServerPort}/api/ipxe/boot?mac=\${net0/mac} || goto fallback

:fallback
echo Failed to load dynamic menu. Falling back to shell.
shell
`;

  await fs.mkdir(path.dirname(menuPath), { recursive: true });
  await fs.writeFile(menuPath, ipxeMenu);
  logger.info(`iPXE entry point generated at ${menuPath} (chains to dynamic API)`);
  return { path: menuPath };
}
