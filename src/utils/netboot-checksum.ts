import fs from 'fs';
import crypto from 'crypto';
import { fetchWithProxy } from './netboot-discovery.js';
import { logger } from './logger.js';

/**
 * Parse a SHA256SUMS-style file: lines of "hash  filename" or "hash *filename".
 * Returns a Map from filename to hex hash.
 */
export function parseChecksumFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+[\*]?\s*(.+)$/);
    if (match) {
      const hash = match[1].toLowerCase();
      const filename = match[2].trim().replace(/^\.\//, '');
      map.set(filename, hash);
    }
  }
  return map;
}

/**
 * Fetch checksum file from mirror. pathTemplate may use {base} for the directory of kernel/initrd.
 */
export async function fetchChecksumFile(
  mirrorBaseUrl: string,
  pathTemplate: string,
  basePath: string
): Promise<Map<string, string>> {
  const base = basePath.replace(/\/+$/, '');
  const path = pathTemplate.replace(/\{base\}/g, base).replace(/\{mirror\}/g, mirrorBaseUrl);
  const url = path.startsWith('http') ? path : `${mirrorBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\//, '')}`;
  const content = await fetchWithProxy(url);
  return parseChecksumFile(content);
}

/**
 * Verify a file's SHA256 matches the expected hash.
 */
export async function verifyFileSha256(filePath: string, expectedHash: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;
  const expected = expectedHash.toLowerCase();
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return new Promise<boolean>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex');
      resolve(actual === expected);
    });
    stream.on('error', reject);
  });
}

/**
 * Verify kernel and initrd files against a checksum map. Filenames are e.g. "linux", "initrd.gz".
 * Returns { kernelOk, initrdOk }.
 */
export async function verifyNetbootFiles(
  kernelPath: string,
  initrdPath: string,
  checksums: Map<string, string>,
  kernelFilename: string,
  initrdFilename: string
): Promise<{ kernelOk: boolean; initrdOk: boolean }> {
  const kernelHash = checksums.get(kernelFilename) ?? checksums.get(`./${kernelFilename}`);
  const initrdHash = checksums.get(initrdFilename) ?? checksums.get(`./${initrdFilename}`);

  let kernelOk = true;
  let initrdOk = true;

  if (kernelHash) {
    kernelOk = await verifyFileSha256(kernelPath, kernelHash);
    if (!kernelOk) logger.warn('Checksum mismatch for kernel', { path: kernelPath });
  }
  if (initrdHash) {
    initrdOk = await verifyFileSha256(initrdPath, initrdHash);
    if (!initrdOk) logger.warn('Checksum mismatch for initrd', { path: initrdPath });
  }

  return { kernelOk, initrdOk };
}
