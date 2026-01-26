import { BaseInstaller, InstallerConfig, InstallerResult } from './base.js';
import { Server } from '../../database/models.js';
import { SSHClient } from '../../ssh/client.js';

export class AlpineInstaller extends BaseInstaller {
  constructor(server: Server, config: InstallerConfig, ssh: SSHClient) {
    super(server, config, ssh);
  }

  async install(): Promise<InstallerResult> {
    const logs: string[] = [];

    try {
      logs.push(await this.executePhase('Alpine Installation', [
        'lsblk',
        `setup-disk -m sys ${this.config.disk || '/dev/sda'}`,
        'reboot',
      ]));

      return {
        success: true,
        logs: logs.join('\n\n'),
      };
    } catch (error) {
      return {
        success: false,
        logs: logs.join('\n\n'),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
