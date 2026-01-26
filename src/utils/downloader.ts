import https from 'https';
import http from 'http';
import fs from 'fs';
import { logger } from './logger.js';

const PXE_SERVER_URL = process.env.PXE_SERVER_URL || 'http://192.168.1.10';

export interface DownloadOptions {
  pxeFirst?: boolean;
  timeout?: number;
}

export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions = {}
): Promise<void> {
  const { pxeFirst = true, timeout = 30000 } = options;

  // If pxeFirst is true and URL is an internet URL, try PXE server first
  if (pxeFirst && url.startsWith('http://') && !url.includes(PXE_SERVER_URL)) {
    const pxeUrl = url.replace(/^https?:\/\/[^\/]+/, `${PXE_SERVER_URL}/os-files`);
    try {
      logger.info(`Trying PXE server first: ${pxeUrl}`);
      await downloadFileInternal(pxeUrl, destination, timeout);
      return;
    } catch (error) {
      logger.warn(`PXE server download failed, falling back to internet: ${error}`);
    }
  }

  // Fallback to original URL
  await downloadFileInternal(url, destination, timeout);
}

function downloadFileInternal(url: string, destination: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(destination);

    const request = client.get(url, (response) => {
      if (response.statusCode === 404) {
        file.close();
        fs.unlinkSync(destination);
        return reject(new Error(`File not found: ${url}`));
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destination);
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      }
      reject(err);
    });

    request.setTimeout(timeout, () => {
      request.destroy();
      file.close();
      if (fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      }
      reject(new Error('Download timeout'));
    });
  });
}
