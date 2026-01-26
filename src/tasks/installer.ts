import { ServerModel, InstallationModel } from '../database/models.js';
import { SSHClient } from '../ssh/client.js';
import { BaseInstaller, InstallerConfig } from './installers/base.js';
import { DebianInstaller } from './installers/debian.js';
import { ArchInstaller } from './installers/arch.js';
import { RHELInstaller } from './installers/rhel.js';
import { AlpineInstaller } from './installers/alpine.js';

export async function createInstaller(
  serverId: number,
  config: InstallerConfig
): Promise<BaseInstaller> {
  const server = ServerModel.findById(serverId);
  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  if (!server.ip_address) {
    throw new Error(`Server ${serverId} has no IP address`);
  }

  const ssh = new SSHClient({
    host: server.ip_address,
    username: 'root',
    privateKey: process.env.SSH_KEY_PATH,
  });

  const os = config.os.toLowerCase();

  switch (os) {
    case 'ubuntu':
    case 'debian':
      return new DebianInstaller(server, config, ssh);
    case 'arch':
      return new ArchInstaller(server, config, ssh);
    case 'fedora':
    case 'centos':
    case 'rhel':
      return new RHELInstaller(server, config, ssh);
    case 'alpine':
      return new AlpineInstaller(server, config, ssh);
    default:
      throw new Error(`Unsupported OS: ${os}`);
  }
}

export async function executeInstallation(
  serverId: number,
  config: InstallerConfig
): Promise<void> {
  const installation = InstallationModel.create({
    server_id: serverId,
    os_type: config.os,
    config_path: config.config || null,
    status: 'running',
    logs: null,
  });

  try {
    const installer = await createInstaller(serverId, config);
    const result = await installer.install();

    InstallationModel.update(installation.id, {
      status: result.success ? 'completed' : 'failed',
      logs: result.logs,
    });

    ServerModel.update(serverId, {
      status: result.success ? 'installed' : 'error',
    });

    if (!result.success) {
      throw new Error(result.error || 'Installation failed');
    }
  } catch (error) {
    InstallationModel.update(installation.id, {
      status: 'failed',
      logs: error instanceof Error ? error.message : 'Unknown error',
    });
    ServerModel.update(serverId, { status: 'error' });
    throw error;
  }
}
