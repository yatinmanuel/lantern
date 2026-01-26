import { Router } from 'express';
import { PXEConfigModel } from '../../database/models.js';
import { logger } from '../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export const configRoutes = Router();

// Get all configuration
configRoutes.get('/', (_req, res) => {
  try {
    const config = PXEConfigModel.getAll();
    const configObj: Record<string, any> = {};
    config.forEach(item => {
      configObj[item.key] = {
        value: item.value,
        description: item.description,
        updated_at: item.updated_at,
      };
    });
    return res.json(configObj);
  } catch (error) {
    logger.error('Error fetching configuration:', error);
    return res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Get specific configuration value
configRoutes.get('/:key', (req, res) => {
  try {
    const value = PXEConfigModel.get(req.params.key);
    if (value === null) {
      return res.status(404).json({ error: 'Configuration key not found' });
    }
    return res.json({ key: req.params.key, value });
  } catch (error) {
    logger.error('Error fetching configuration:', error);
    return res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Update configuration
configRoutes.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    PXEConfigModel.set(key, value, description);
    logger.info(`Configuration updated: ${key} = ${value}`);

    // Apply configuration changes if needed
    await applyConfiguration(key, value);

    return res.json({ success: true, key, value });
  } catch (error) {
    logger.error('Error updating configuration:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Update multiple configuration values
configRoutes.put('/', async (req, res) => {
  try {
    const updates = req.body;
    if (typeof updates !== 'object' || updates === null) {
      return res.status(400).json({ error: 'Invalid configuration object' });
    }

    const results: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === 'object' && val !== null && 'value' in val) {
        const configVal = val as { value: string; description?: string };
        PXEConfigModel.set(key, configVal.value, configVal.description);
        await applyConfiguration(key, configVal.value);
        results[key] = { success: true };
      } else {
        PXEConfigModel.set(key, String(val));
        await applyConfiguration(key, String(val));
        results[key] = { success: true };
      }
    }

    logger.info('Configuration updated:', Object.keys(updates));
    return res.json({ success: true, updated: results });
  } catch (error) {
    logger.error('Error updating configuration:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Apply configuration changes to system
async function applyConfiguration(key: string, _value: string): Promise<void> {
  try {
    switch (key) {
      case 'pxe_server_ip':
      case 'pxe_server_port':
      case 'dhcp_interface':
      case 'dhcp_range':
        // These require dnsmasq restart - handled by separate endpoint
        logger.info(`Configuration ${key} updated. Restart dnsmasq to apply.`);
        break;
      
      case 'ipxe_menu_path':
        // Menu path changed - no action needed
        break;
      
      default:
        // Other configs don't require immediate action
        break;
    }
  } catch (error) {
    logger.error(`Error applying configuration ${key}:`, error);
  }
}

// Get dnsmasq status
configRoutes.get('/service/dnsmasq/status', async (_req, res) => {
  try {
    try {
      const { stdout } = await execAsync('systemctl is-active dnsmasq');
      const isActive = String(stdout).trim() === 'active';
      return res.json({ 
        service: 'dnsmasq',
        status: isActive ? 'running' : 'stopped',
        active: isActive
      });
    } catch {
      // Try service command as fallback
      try {
        const { stdout } = await execAsync('service dnsmasq status');
        const output = String(stdout);
        const isRunning = output.includes('running') || output.includes('active');
        return res.json({ 
          service: 'dnsmasq',
          status: isRunning ? 'running' : 'stopped',
          active: isRunning
        });
      } catch {
        return res.json({ 
          service: 'dnsmasq',
          status: 'unknown',
          active: false,
          error: 'Cannot determine dnsmasq status'
        });
      }
    }
  } catch (error) {
    logger.error('Error checking dnsmasq status:', error);
    return res.status(500).json({ error: 'Failed to check dnsmasq status' });
  }
});

// Restart dnsmasq
configRoutes.post('/service/dnsmasq/restart', async (_req, res) => {
  try {
    try {
      await execAsync('sudo systemctl restart dnsmasq');
      logger.info('dnsmasq restarted via systemctl');
      return res.json({ success: true, message: 'dnsmasq restarted' });
    } catch {
      try {
        await execAsync('sudo service dnsmasq restart');
        logger.info('dnsmasq restarted via service');
        return res.json({ success: true, message: 'dnsmasq restarted' });
      } catch (error: any) {
        logger.error('Failed to restart dnsmasq:', error);
        return res.status(500).json({ 
          error: 'Failed to restart dnsmasq',
          details: error.message 
        });
      }
    }
  } catch (error) {
    logger.error('Error restarting dnsmasq:', error);
    return res.status(500).json({ error: 'Failed to restart dnsmasq' });
  }
});

// Regenerate dnsmasq config
configRoutes.post('/service/dnsmasq/regenerate', async (_req, res) => {
  try {
    const config = PXEConfigModel.getAll();
    const configMap: Record<string, string> = {};
    config.forEach(item => {
      configMap[item.key] = item.value;
    });

    const pxeServerIp = configMap.pxe_server_ip || '192.168.1.10';
    const dhcpInterface = configMap.dhcp_interface || 'eth0';
    const dhcpRange = configMap.dhcp_range || '192.168.1.100,192.168.1.200,12h';
    const pxeServerPort = configMap.pxe_server_port || '3000';
    const ipxeMenuUrl = `http://${pxeServerIp}:${pxeServerPort}/ipxe/menu.ipxe`;

    const dnsmasqConfig = `# PXE Server Configuration
# Generated by Intelligent PXE Server

interface=${dhcpInterface}
dhcp-range=${dhcpRange}
dhcp-option=3,${pxeServerIp}
dhcp-option=6,${pxeServerIp}

enable-tftp
tftp-root=/var/www/html
pxe-service=x86PC,"Boot from network",pxelinux
pxe-service=x86-64_EFI,"Boot from network (UEFI)",ipxe.efi

dhcp-match=set:ipxe,175
dhcp-boot=tag:!ipxe,undionly.kpxe,${pxeServerIp},${pxeServerIp}
dhcp-boot=tag:ipxe,${ipxeMenuUrl}

log-dhcp
log-queries
port=0
`;

    await fs.writeFile('/tmp/dnsmasq.conf.pxe', dnsmasqConfig);
    
    // Copy to /etc/dnsmasq.conf (requires sudo)
    try {
      await execAsync(`sudo cp /tmp/dnsmasq.conf.pxe /etc/dnsmasq.conf`);
      await execAsync('sudo systemctl restart dnsmasq');
      logger.info('dnsmasq configuration regenerated and restarted');
      return res.json({ success: true, message: 'dnsmasq configuration regenerated' });
    } catch (error: any) {
      logger.error('Failed to update dnsmasq config:', error);
      return res.status(500).json({ 
        error: 'Failed to update dnsmasq configuration',
        details: error.message,
        config: dnsmasqConfig
      });
    }
  } catch (error) {
    logger.error('Error regenerating dnsmasq config:', error);
    return res.status(500).json({ error: 'Failed to regenerate dnsmasq configuration' });
  }
});

// Regenerate iPXE menu
configRoutes.post('/ipxe/regenerate', async (_req, res) => {
  try {
    const config = PXEConfigModel.getAll();
    const configMap: Record<string, string> = {};
    config.forEach(item => {
      configMap[item.key] = item.value;
    });

    const pxeServerIp = configMap.pxe_server_ip || '192.168.1.10';
    const pxeServerPort = configMap.pxe_server_port || '3000';
    const menuPath = configMap.ipxe_menu_path || '/var/www/html/ipxe/menu.ipxe';

    const ipxeMenu = `#!ipxe

set menu-timeout 5000
set submenu-timeout \${menu-timeout}

:start
menu Intelligent PXE Server
item --gap --          ------------------------- Operating Systems -------------------------
item alpine           Boot Alpine Linux (Universal PXE Agent)
item --gap --
item --key x exit     Exit to shell
choose --timeout \${menu-timeout} --default alpine selected || exit
goto \${selected}

:alpine
echo Booting Alpine Linux with PXE Agent...
kernel http://${pxeServerIp}/ipxe/alpine/vmlinuz alpine_repo=http://dl-cdn.alpinelinux.org/alpine/latest-stable/main modloop=http://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86_64/netboot/modloop-vanilla PXE_SERVER_URL=http://${pxeServerIp}:${pxeServerPort} quiet
initrd http://${pxeServerIp}/ipxe/alpine/initramfs
boot

:exit
shell
`;

    await fs.writeFile(menuPath, ipxeMenu);
    logger.info(`iPXE menu regenerated at ${menuPath}`);
    return res.json({ success: true, message: 'iPXE menu regenerated', path: menuPath });
  } catch (error: any) {
    logger.error('Error regenerating iPXE menu:', error);
    return res.status(500).json({ 
      error: 'Failed to regenerate iPXE menu',
      details: error.message 
    });
  }
});
