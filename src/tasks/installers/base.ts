import { Server } from '../../database/models.js';
import { SSHClient } from '../../ssh/client.js';

export interface InstallerConfig {
  os: string;
  version?: string;
  config?: string;
  disk?: string;
}

export interface InstallerResult {
  success: boolean;
  logs: string;
  error?: string;
}

export abstract class BaseInstaller {
  protected server: Server;
  protected config: InstallerConfig;
  protected ssh: SSHClient;

  constructor(server: Server, config: InstallerConfig, ssh: SSHClient) {
    this.server = server;
    this.config = config;
    this.ssh = ssh;
  }

  abstract install(): Promise<InstallerResult>;

  protected async executePhase(phase: string, commands: string[]): Promise<string> {
    const logs: string[] = [];
    logs.push(`=== Phase: ${phase} ===`);

    for (const command of commands) {
      try {
        logs.push(`Executing: ${command}`);
        const result = await this.ssh.executeCommand(command);
        logs.push(`Exit code: ${result.code}`);
        if (result.stdout) logs.push(`STDOUT: ${result.stdout}`);
        if (result.stderr) logs.push(`STDERR: ${result.stderr}`);
        
        if (result.code !== 0) {
          throw new Error(`Command failed with exit code ${result.code}`);
        }
      } catch (error) {
        logs.push(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    }

    return logs.join('\n');
  }
}
