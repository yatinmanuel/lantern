import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { promisify } from 'util';
import { IsoModel, PXEConfigModel } from '../database/models.js';
import { logger } from './logger.js';
import { generateIpxeMenu } from './ipxe.js';

const execFileAsync = promisify(execFile);

const maxSizeMb = parseInt(process.env.ISO_MAX_SIZE_MB || '8192', 10);
const maxSizeBytes = maxSizeMb * 1024 * 1024;

type FetchResponse = {
  ok: boolean;
  status: number;
  body?: any;
  headers: { get: (name: string) => string | null };
};

type FetchFn = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<FetchResponse>;
const fetchFn = (globalThis as unknown as { fetch?: FetchFn }).fetch;

export function sanitizeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._+-]+/g, '_');
}

export function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseContentDispositionFilename(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerValue);
  const raw = match?.[1] || match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function fetchRemoteMetadata(url: string): Promise<{ fileName: string | null; size: number | null; mimeType: string | null }> {
  if (!fetchFn) {
    throw new Error('Fetch is not available in this runtime');
  }

  let response = await fetchFn(url, { method: 'HEAD' });
  if (!response.ok) {
    response = await fetchFn(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  }
  if (!response.ok) {
    throw new Error(`Failed to query URL (status ${response.status})`);
  }

  const contentDisposition = response.headers.get('content-disposition');
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  const fileName = parseContentDispositionFilename(contentDisposition);
  const size = contentLength ? Number(contentLength) : null;
  return {
    fileName,
    size: Number.isFinite(size) ? size : null,
    mimeType: contentType || null,
  };
}

export async function getIsoDir(): Promise<string> {
  const config = await PXEConfigModel.getAll();
  const configMap: Record<string, string> = {};
  config.forEach(item => {
    configMap[item.key] = item.value;
  });
  const webRoot = configMap.web_root || process.env.WEB_ROOT || '/var/www/html';
  return configMap.iso_dir || process.env.ISO_DIR || path.join(webRoot, 'iso');
}

export async function getBaseUrl(): Promise<string> {
  const config = await PXEConfigModel.getAll();
  const configMap: Record<string, string> = {};
  config.forEach(item => {
    configMap[item.key] = item.value;
  });
  const ip = configMap.pxe_server_ip || '192.168.1.10';
  const port = configMap.pxe_server_port || '3000';
  return `http://${ip}:${port}`;
}

export async function extractIso(isoPath: string, destDir: string): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true });
  const marker = path.join(destDir, '.lantern-extracted');
  if (fs.existsSync(marker)) {
    return;
  }
  try {
    await execFileAsync('bsdtar', ['-xf', isoPath, '-C', destDir]);
  } catch (error) {
    logger.warn('bsdtar failed, trying 7z:', error);
    await execFileAsync('7z', ['x', `-o${destDir}`, isoPath]);
  }
  await fsp.writeFile(marker, new Date().toISOString());
}

async function walkFiles(dir: string, root: string, files: string[]): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, root, files);
    } else if (entry.isFile()) {
      files.push(path.relative(root, fullPath));
    }
  }
}

export async function listExtractedFiles(isoName: string): Promise<{ path: string; size: number }[]> {
  const isoDir = await getIsoDir();
  const baseName = isoName.replace(/\.iso$/i, '');
  const destDir = path.join(isoDir, baseName);
  if (!fs.existsSync(destDir)) {
    return [];
  }

  const relativeFiles: string[] = [];
  await walkFiles(destDir, destDir, relativeFiles);
  const results: { path: string; size: number }[] = [];
  for (const relPath of relativeFiles) {
    const fullPath = path.join(destDir, relPath);
    const stats = await fsp.stat(fullPath);
    results.push({
      path: `/iso/${encodeURIComponent(baseName)}/${relPath.replace(/\\/g, '/')}`,
      size: stats.size,
    });
  }
  return results;
}

export async function downloadIsoFromUrl(
  url: string,
  targetPath: string,
  onProgress?: (progress: { downloaded: number; total?: number }) => void
): Promise<void> {
  if (!fetchFn) {
    throw new Error('Fetch is not available in this runtime');
  }
  const response = await fetchFn(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download image (status ${response.status})`);
  }
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? Number(contentLength) : undefined;
  if (total && total > maxSizeBytes) {
    throw new Error('Image exceeds maximum size');
  }
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const fileStream = fs.createWriteStream(targetPath);
  let downloaded = 0;
  let lastReport = 0;
  try {
    for await (const chunk of Readable.fromWeb(response.body as any)) {
      const buffer = Buffer.from(chunk);
      downloaded += buffer.length;
      if (!fileStream.write(buffer)) {
        await new Promise((resolve) => fileStream.once('drain', resolve));
      }
      if (onProgress) {
        const now = Date.now();
        if (now - lastReport > 1000 || (total && downloaded >= total)) {
          lastReport = now;
          onProgress({ downloaded, total });
        }
      }
    }
    fileStream.end();
    await finished(fileStream);
  } catch (error) {
    fileStream.destroy();
    throw error;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readDirSafe(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function pickAlpineBootFiles(destDir: string): { kernel: string; initrd: string; modloop?: string; repoPath?: string } | null {
  const bootDir = path.join(destDir, 'boot');
  if (!fileExists(bootDir)) return null;
  const entries = readDirSafe(bootDir);
  const kernels = entries.filter((name) => name === 'vmlinuz' || name.startsWith('vmlinuz-'));
  const initrds = entries.filter((name) => name === 'initramfs' || name.startsWith('initramfs-'));
  const modloops = entries.filter((name) => name === 'modloop' || name.startsWith('modloop-'));
  if (kernels.length === 0 || initrds.length === 0) return null;

  const normalizeFlavor = (name: string, prefix: string) => {
    if (name === prefix) return '';
    if (name.startsWith(`${prefix}-`)) return name.slice(prefix.length + 1);
    return '';
  };

  let kernel = kernels[0];
  let initrd = initrds[0];
  let modloop = modloops[0];

  for (const candidate of kernels) {
    const flavor = normalizeFlavor(candidate, 'vmlinuz');
    const initrdMatch = initrds.find((item) =>
      flavor ? item === `initramfs-${flavor}` : item === 'initramfs'
    );
    if (initrdMatch) {
      kernel = candidate;
      initrd = initrdMatch;
      modloop = modloops.find((item) =>
        flavor ? item === `modloop-${flavor}` : item === 'modloop'
      ) || modloop;
      break;
    }
  }

  let repoPath: string | undefined;
  const apksDir = path.join(destDir, 'apks');
  if (fileExists(apksDir)) {
    // Alpine's init scripts automatically append the architecture to alpine_repo,
    // so we should NOT include the arch dir (e.g. x86_64) in the path.
    // Just use /apks and let Alpine add the arch suffix itself.
    repoPath = '/apks';
  }

  return { kernel, initrd, modloop, repoPath };
}

export function detectIsoEntry(isoName: string, destDir: string, baseUrl: string): {
  iso_name: string;
  label: string;
  os_type: string;
  kernel_path: string;
  initrd_items: { path: string; name?: string }[];
  boot_args: string | null;
} | null {
  const baseName = isoName.replace(/\.iso$/i, '');
  const isoBasePath = `/iso/${encodeURIComponent(baseName)}`;
  const label = baseName;

  const casperKernel = path.join(destDir, 'casper', 'vmlinuz');
  if (fileExists(casperKernel)) {
    const initrdCandidates = ['initrd', 'initrd.lz', 'initrd.gz', 'initrd.xz'];
    const initrdRel = initrdCandidates.find(candidate => fileExists(path.join(destDir, 'casper', candidate)));
    if (initrdRel) {
      // Low-RAM netboot: use fetch=filesystem.squashfs so casper streams it instead of buffering an ISO
      const squashfsCandidates = ['filesystem.squashfs', 'filesystem.squashfs.lz'];
      const squashfsRel = squashfsCandidates.find(c => fileExists(path.join(destDir, 'casper', c))) || 'filesystem.squashfs';
      const fetchUrl = `${baseUrl}${isoBasePath}/casper/${squashfsRel}`;
      return {
        iso_name: isoName,
        label,
        os_type: 'ubuntu',
        kernel_path: `${isoBasePath}/casper/vmlinuz`,
        initrd_items: [{ path: `${isoBasePath}/casper/${initrdRel}` }],
        boot_args: `boot=casper netboot=http ip=dhcp live-media-path=/casper fetch="${fetchUrl}"`,
      };
    }
  }

  const liveKernel = path.join(destDir, 'live', 'vmlinuz');
  const liveInitrd = path.join(destDir, 'live', 'initrd.img');
  if (fileExists(liveKernel) && fileExists(liveInitrd)) {
    // For netboot, Debian live needs fetch= to find the squashfs over HTTP
    return {
      iso_name: isoName,
      label,
      os_type: 'debian',
      kernel_path: `${isoBasePath}/live/vmlinuz`,
      initrd_items: [{ path: `${isoBasePath}/live/initrd.img` }],
      boot_args: `boot=live fetch=${baseUrl}${isoBasePath}/live/filesystem.squashfs ip=dhcp`,
    };
  }

  const fedoraKernel = path.join(destDir, 'images', 'pxeboot', 'vmlinuz');
  const fedoraInitrd = path.join(destDir, 'images', 'pxeboot', 'initrd.img');
  if (fileExists(fedoraKernel) && fileExists(fedoraInitrd)) {
    return {
      iso_name: isoName,
      label,
      os_type: 'fedora',
      kernel_path: `${isoBasePath}/images/pxeboot/vmlinuz`,
      initrd_items: [{ path: `${isoBasePath}/images/pxeboot/initrd.img` }],
      boot_args: `inst.stage2=${baseUrl}${isoBasePath} inst.repo=${baseUrl}${isoBasePath} ip=dhcp`,
    };
  }

  const archKernel = path.join(destDir, 'arch', 'boot', 'x86_64', 'vmlinuz-linux');
  const archInitrd = path.join(destDir, 'arch', 'boot', 'x86_64', 'initramfs-linux.img');
  if (fileExists(archKernel) && fileExists(archInitrd)) {
    return {
      iso_name: isoName,
      label,
      os_type: 'arch',
      kernel_path: `${isoBasePath}/arch/boot/x86_64/vmlinuz-linux`,
      initrd_items: [{ path: `${isoBasePath}/arch/boot/x86_64/initramfs-linux.img` }],
      boot_args: `archisobasedir=arch archiso_http_srv=${baseUrl} archiso_http_dir=${isoBasePath} ip=dhcp`,
    };
  }

  const suseKernel = path.join(destDir, 'boot', 'x86_64', 'loader', 'linux');
  const suseInitrd = path.join(destDir, 'boot', 'x86_64', 'loader', 'initrd');
  if (fileExists(suseKernel) && fileExists(suseInitrd)) {
    return {
      iso_name: isoName,
      label,
      os_type: 'opensuse',
      kernel_path: `${isoBasePath}/boot/x86_64/loader/linux`,
      initrd_items: [{ path: `${isoBasePath}/boot/x86_64/loader/initrd` }],
      boot_args: `install=${baseUrl}${isoBasePath} ip=dhcp`,
    };
  }

  const alpineBoot = pickAlpineBootFiles(destDir);
  if (alpineBoot) {
    const repoArg = alpineBoot.repoPath
      ? `alpine_repo=${baseUrl}${isoBasePath}${alpineBoot.repoPath}`
      : `alpine_repo=${baseUrl}${isoBasePath}/apks`;
    const modloopArg = alpineBoot.modloop
      ? `modloop=${baseUrl}${isoBasePath}/boot/${alpineBoot.modloop}`
      : '';
    const bootArgs = [repoArg, modloopArg, 'ip=dhcp'].filter(Boolean).join(' ');
    return {
      iso_name: isoName,
      label,
      os_type: 'alpine',
      kernel_path: `${isoBasePath}/boot/${alpineBoot.kernel}`,
      initrd_items: [{ path: `${isoBasePath}/boot/${alpineBoot.initrd}` }],
      boot_args: bootArgs,
    };
  }

  const windowsWim = path.join(destDir, 'sources', 'boot.wim');
  const bootSdi = path.join(destDir, 'boot', 'boot.sdi');
  const bootBcd = path.join(destDir, 'boot', 'bcd');
  const bootMgr = path.join(destDir, 'bootmgr');
  const bootMgrEfi = path.join(destDir, 'bootmgr.efi');
  if (fileExists(windowsWim) && fileExists(bootSdi) && fileExists(bootBcd) && (fileExists(bootMgr) || fileExists(bootMgrEfi))) {
    const bootMgrPath = fileExists(bootMgr) ? `${isoBasePath}/bootmgr` : `${isoBasePath}/bootmgr.efi`;
    return {
      iso_name: isoName,
      label,
      os_type: 'windows',
      kernel_path: '/ipxe/wimboot',
      initrd_items: [
        { path: bootMgrPath, name: 'bootmgr' },
        { path: `${isoBasePath}/boot/bcd`, name: 'BCD' },
        { path: `${isoBasePath}/boot/boot.sdi`, name: 'boot.sdi' },
        { path: `${isoBasePath}/sources/boot.wim`, name: 'boot.wim' },
      ],
      boot_args: null,
    };
  }

  return null;
}

export async function buildImageFromExtracted(
  filePathOrName: string,
  options?: { label?: string }
): Promise<{ entry: Awaited<ReturnType<typeof IsoModel.upsert>> }> {
  const isoDir = await getIsoDir();
  const fileName = path.basename(filePathOrName);
  const baseName = fileName.replace(/\.iso$/i, '');
  const destDir = path.join(isoDir, baseName);

  if (!fs.existsSync(destDir)) {
    throw new Error('Extracted ISO not found. Run iso.extract first.');
  }

  const baseUrl = await getBaseUrl();
  const entry = detectIsoEntry(fileName, destDir, baseUrl);
  if (!entry) {
    throw new Error('Unsupported ISO layout. Files extracted; configure boot files manually.');
  }
  if (options?.label) {
    entry.label = options.label;
  }
  const stored = await IsoModel.upsert(entry);
  await generateIpxeMenu();
  return { entry: stored };
}

export async function processIsoFile(
  filePath: string,
  options?: { label?: string }
): Promise<{ entry: Awaited<ReturnType<typeof IsoModel.upsert>> }>{
  const isoDir = await getIsoDir();
  const fileName = path.basename(filePath);
  const baseName = fileName.replace(/\.iso$/i, '');
  const destDir = path.join(isoDir, baseName);

  await fsp.rm(destDir, { recursive: true, force: true });
  await extractIso(filePath, destDir);
  return buildImageFromExtracted(fileName, options);
}

export async function scanIsoDirectory(): Promise<{ name: string; status: string; error?: string }[]> {
  const isoDir = await getIsoDir();
  ensureDirSync(isoDir);
  const entries = await fsp.readdir(isoDir, { withFileTypes: true });
  const isoFiles = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.iso'))
    .map(entry => entry.name);

  const results: { name: string; status: string; error?: string }[] = [];
  for (const isoName of isoFiles) {
    if (await IsoModel.findByIsoName(isoName)) {
      results.push({ name: isoName, status: 'skipped' });
      continue;
    }
    try {
      await processIsoFile(path.join(isoDir, isoName));
      results.push({ name: isoName, status: 'imported' });
    } catch (error) {
      results.push({ name: isoName, status: 'failed', error: error instanceof Error ? error.message : 'Failed' });
    }
  }

  return results;
}
