import fs from 'fs';
import path from 'path';
import { downloadFile } from './downloader.js';
import { logger } from './logger.js';

const OS_FILES_DIR = process.env.OS_FILES_DIR || '/var/www/html/os-files';

export interface FileCacheEntry {
  filename: string;
  url: string;
  localPath: string;
  size: number;
  downloadedAt: string;
}

export class FileCache {
  private cacheDir: string;

  constructor(cacheDir: string = OS_FILES_DIR) {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.info(`Created cache directory: ${this.cacheDir}`);
    }
  }

  async getFile(filename: string, url: string): Promise<string> {
    const localPath = path.join(this.cacheDir, filename);

    // Check if file exists locally
    if (fs.existsSync(localPath)) {
      logger.info(`Using cached file: ${filename}`);
      return localPath;
    }

    // Download file
    logger.info(`Downloading file: ${filename} from ${url}`);
    await downloadFile(url, localPath, { pxeFirst: false });
    logger.info(`Downloaded file: ${filename}`);

    return localPath;
  }

  listFiles(): FileCacheEntry[] {
    if (!fs.existsSync(this.cacheDir)) {
      return [];
    }

    return fs.readdirSync(this.cacheDir)
      .map(filename => {
        const filePath = path.join(this.cacheDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          url: '', // Not stored
          localPath: filePath,
          size: stats.size,
          downloadedAt: stats.mtime.toISOString(),
        };
      });
  }

  getFileUrl(filename: string): string {
    const pxeServerUrl = process.env.PXE_SERVER_URL || 'http://192.168.1.10';
    return `${pxeServerUrl}/os-files/${filename}`;
  }
}
