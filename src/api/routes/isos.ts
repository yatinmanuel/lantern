import { Router, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import { IsoModel, PXEConfigModel } from '../../database/models.js';
import { logger } from '../../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { generateIpxeMenu } from '../../utils/ipxe.js';

export const isoRoutes = Router();
const execFileAsync = promisify(execFile);

function getIsoDir(): string {
  const config = PXEConfigModel.getAll();
  const configMap: Record<string, string> = {};
  config.forEach(item => {
    configMap[item.key] = item.value;
  });
  const webRoot = configMap.web_root || process.env.WEB_ROOT || '/var/www/html';
  return configMap.iso_dir || process.env.ISO_DIR || path.join(webRoot, 'iso');
}

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getBaseUrl(): string {
  const config = PXEConfigModel.getAll();
  const configMap: Record<string, string> = {};
  config.forEach(item => {
    configMap[item.key] = item.value;
  });
  const ip = configMap.pxe_server_ip || '192.168.1.10';
  const port = configMap.pxe_server_port || '3000';
  return `http://${ip}:${port}`;
}

const maxSizeMb = parseInt(process.env.ISO_MAX_SIZE_MB || '8192', 10);
const maxSizeBytes = maxSizeMb * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const isoDir = getIsoDir();
    ensureDirSync(isoDir);
    cb(null, isoDir);
  },
  filename: (_req, file, cb) => {
    const base = path.basename(file.originalname);
    const safe = base.replace(/[^a-zA-Z0-9._+-]+/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.iso')) {
      cb(null, true);
    } else {
      cb(new Error('Only .iso files are allowed'));
    }
  },
});

async function extractIso(isoPath: string, destDir: string): Promise<void> {
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

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function detectIsoEntry(isoName: string, destDir: string): {
  iso_name: string;
  label: string;
  os_type: string;
  kernel_path: string;
  initrd_items: { path: string; name?: string }[];
  boot_args: string | null;
} | null {
  const baseName = isoName.replace(/\.iso$/i, '');
  const isoBasePath = `/iso/${encodeURIComponent(baseName)}`;
  const baseUrl = getBaseUrl();
  const label = baseName;

  const casperKernel = path.join(destDir, 'casper', 'vmlinuz');
  if (fileExists(casperKernel)) {
    const initrdCandidates = ['initrd', 'initrd.lz', 'initrd.gz', 'initrd.xz'];
    const initrdRel = initrdCandidates.find(candidate => fileExists(path.join(destDir, 'casper', candidate)));
    if (initrdRel) {
      return {
        iso_name: isoName,
        label,
        os_type: 'ubuntu',
        kernel_path: `${isoBasePath}/casper/vmlinuz`,
        initrd_items: [{ path: `${isoBasePath}/casper/${initrdRel}` }],
        boot_args: 'boot=casper ip=dhcp',
      };
    }
  }

  const liveKernel = path.join(destDir, 'live', 'vmlinuz');
  const liveInitrd = path.join(destDir, 'live', 'initrd.img');
  if (fileExists(liveKernel) && fileExists(liveInitrd)) {
    return {
      iso_name: isoName,
      label,
      os_type: 'debian',
      kernel_path: `${isoBasePath}/live/vmlinuz`,
      initrd_items: [{ path: `${isoBasePath}/live/initrd.img` }],
      boot_args: 'boot=live ip=dhcp',
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

async function processIsoFile(filePath: string): Promise<void> {
  const isoDir = getIsoDir();
  const fileName = path.basename(filePath);
  const baseName = fileName.replace(/\.iso$/i, '');
  const destDir = path.join(isoDir, baseName);

  await fsp.rm(destDir, { recursive: true, force: true });
  await extractIso(filePath, destDir);
  const entry = detectIsoEntry(fileName, destDir);
  if (!entry) {
    throw new Error('Unsupported ISO layout. Could not detect boot files.');
  }
  IsoModel.upsert(entry);
  await generateIpxeMenu();
}

isoRoutes.get('/', requireAuth, requirePermission('config.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const isoDir = getIsoDir();
    ensureDirSync(isoDir);
    const entries = await fsp.readdir(isoDir, { withFileTypes: true });
    const files = await Promise.all(entries.filter(e => e.isFile()).map(async (entry) => {
      const fullPath = path.join(isoDir, entry.name);
      const stats = await fsp.stat(fullPath);
      return {
        name: entry.name,
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
      };
    }));
    const baseUrl = getBaseUrl();
    const items = files
      .filter(file => file.name.toLowerCase().endsWith('.iso'))
      .sort((a, b) => b.modified_at.localeCompare(a.modified_at))
      .map(file => ({
        ...file,
        url: `${baseUrl}/iso/${encodeURIComponent(file.name)}`,
        entry: IsoModel.findByIsoName(file.name),
      }));
    return res.json(items);
  } catch (error) {
    logger.error('Error listing ISOs:', error);
    return res.status(500).json({ error: 'Failed to list ISOs' });
  }
});

isoRoutes.post('/', requireAuth, requirePermission('config.edit'), (req: AuthRequest, res: Response) => {
  upload.single('file')(req as any, res as any, (err) => {
    if (err) {
      logger.error('ISO upload failed:', err);
      res.status(400).json({ error: err.message || 'Upload failed' });
      return;
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    void processIsoFile(file.path)
      .then(() => {
        res.json({ success: true, name: file.filename, size: file.size });
      })
      .catch((processError) => {
        logger.error('ISO processing failed:', processError);
        res.status(500).json({ error: processError instanceof Error ? processError.message : 'ISO processing failed' });
      });
  });
});

isoRoutes.post('/scan', requireAuth, requirePermission('config.edit'), async (_req: AuthRequest, res: Response) => {
  try {
    const isoDir = getIsoDir();
    ensureDirSync(isoDir);
    const entries = await fsp.readdir(isoDir, { withFileTypes: true });
    const isoFiles = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.iso'))
      .map(entry => entry.name);

    const results: { name: string; status: string; error?: string }[] = [];
    for (const isoName of isoFiles) {
      if (IsoModel.findByIsoName(isoName)) {
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

    return res.json({ success: true, results });
  } catch (error) {
    logger.error('ISO scan failed:', error);
    return res.status(500).json({ error: 'Failed to scan ISOs' });
  }
});

isoRoutes.delete('/:name', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawName = getParamValue(req.params.name);
    if (!rawName) {
      return res.status(400).json({ error: 'Missing ISO name' });
    }
    const fileName = path.basename(rawName);
    if (!fileName.toLowerCase().endsWith('.iso')) {
      return res.status(400).json({ error: 'Invalid ISO name' });
    }
    const isoDir = getIsoDir();
    const filePath = path.join(isoDir, fileName);
    const destDir = path.join(isoDir, fileName.replace(/\.iso$/i, ''));
    await fsp.unlink(filePath);
    await fsp.rm(destDir, { recursive: true, force: true });
    IsoModel.deleteByIsoName(fileName);
    await generateIpxeMenu();
    logger.info(`ISO deleted: ${fileName}`);
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting ISO:', error);
    return res.status(500).json({ error: 'Failed to delete ISO' });
  }
});
