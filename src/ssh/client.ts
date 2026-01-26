import { Client, ConnectConfig } from 'ssh2';
import { logger } from '../utils/logger.js';
import fs from 'fs';

export interface SSHConfig {
  host: string;
  port?: number;
  username?: string;
  privateKey?: string;
  password?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class SSHClient {
  private config: ConnectConfig;

  constructor(config: SSHConfig) {
    this.config = {
      host: config.host,
      port: config.port || 22,
      username: config.username || 'root',
      readyTimeout: 20000,
    };

    if (config.privateKey) {
      this.config.privateKey = fs.readFileSync(config.privateKey);
    } else if (config.password) {
      this.config.password = config.password;
    }
  }

  async executeCommand(command: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';

      conn.on('ready', () => {
        logger.debug(`SSH connected to ${this.config.host}`);
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream.on('close', (code: number | null) => {
            conn.end();
            resolve({ stdout, stderr, code });
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        logger.error(`SSH connection error to ${this.config.host}:`, err);
        reject(err);
      });

      conn.connect(this.config);
    });
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.fastPut(localPath, remotePath, (err) => {
            conn.end();
            if (err) {
              return reject(err);
            }
            resolve();
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect(this.config);
    });
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.fastGet(remotePath, localPath, (err) => {
            conn.end();
            if (err) {
              return reject(err);
            }
            resolve();
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect(this.config);
    });
  }
}
