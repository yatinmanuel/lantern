import { Router, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { URL } from 'url';
import { IsoModel, IsoFileModel, BootMenuModel, NetbootDistroModel, NetbootMirrorModel } from '../../database/models.js';
import { logger } from '../../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { enqueueJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';
import { fetchRemoteMetadata, getIsoDir, getBaseUrl, sanitizeName, ensureDirSync, listExtractedFiles } from '../../utils/iso-tools.js';

export const isoRoutes = Router();

const maxSizeMb = parseInt(process.env.ISO_MAX_SIZE_MB || '8192', 10);
const maxSizeBytes = maxSizeMb * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    void getIsoDir()
      .then((isoDir) => {
        ensureDirSync(isoDir);
        cb(null, isoDir);
      })
      .catch((error) => {
        logger.warn('Failed to resolve ISO directory, using fallback:', error);
        const fallback = process.env.ISO_DIR || '/var/www/html/iso';
        ensureDirSync(fallback);
        cb(null, fallback);
      });
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

const manualStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    void getIsoDir()
      .then((isoDir) => {
        const label = typeof req.body.label === 'string' ? req.body.label : 'manual';
        const safeLabel = sanitizeName(label);
        const destDir = path.join(isoDir, 'manual', safeLabel);
        ensureDirSync(destDir);
        cb(null, destDir);
      })
      .catch((error) => {
        logger.warn('Failed to resolve ISO directory for manual upload, using fallback:', error);
        const fallback = process.env.ISO_DIR || '/var/www/html/iso';
        const label = typeof req.body.label === 'string' ? req.body.label : 'manual';
        const safeLabel = sanitizeName(label);
        const destDir = path.join(fallback, 'manual', safeLabel);
        ensureDirSync(destDir);
        cb(null, destDir);
      });
  },
  filename: (_req, file, cb) => {
    const safe = sanitizeName(file.originalname || file.fieldname);
    cb(null, safe);
  },
});

const manualUpload = multer({
  storage: manualStorage,
  limits: { fileSize: maxSizeBytes },
});

isoRoutes.get('/', requireAuth, requirePermission('config.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const isoDir = await getIsoDir();
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

    const isoEntries = await IsoModel.getAll();
    const entryMap = new Map(isoEntries.map(entry => [entry.iso_name, entry]));
    const isoRecords = await IsoFileModel.getAll();
    const recordMap = new Map(isoRecords.map(record => [record.file_name, record]));
    const baseUrl = await getBaseUrl();

    const seen = new Set<string>();
    const fileItems = await Promise.all(files
      .filter(file => file.name.toLowerCase().endsWith('.iso'))
      .map(async (file) => {
        let record = recordMap.get(file.name);
        if (!record) {
          record = await IsoFileModel.upsertByName(file.name);
        }
        seen.add(file.name);
        const entry = entryMap.get(file.name) || null;
        const baseName = file.name.replace(/\.iso$/i, '');
        const destDir = path.join(isoDir, baseName);
        const extractedMarker = path.join(destDir, '.lantern-extracted');
        const extracted = fs.existsSync(extractedMarker) || fs.existsSync(destDir);
        return {
          id: record.id,
          name: file.name,
          size: file.size,
          modified_at: file.modified_at,
          url: `${baseUrl}/iso/${encodeURIComponent(file.name)}`,
          extracted,
          entry,
        };
      }));

    const staleRecords = isoRecords.filter(record => !seen.has(record.file_name));
    if (staleRecords.length > 0) {
      await Promise.all(staleRecords.map(record => IsoFileModel.deleteById(record.id)));
    }

    const items = fileItems.sort((a, b) =>
      b.modified_at.localeCompare(a.modified_at)
    );

    return res.json(items);
  } catch (error) {
    logger.error('Error listing ISOs:', error);
    return res.status(500).json({ error: 'Failed to list ISOs' });
  }
});

isoRoutes.get('/extracted/:name/files', requireAuth, requirePermission('config.view'), async (req: AuthRequest, res: Response) => {
  try {
    const isoName = getParamValue(req.params.name);
    if (!isoName) {
      return res.status(400).json({ error: 'Missing ISO name' });
    }

    const files = await listExtractedFiles(isoName);
    return res.json(files);
  } catch (error) {
    logger.error('Error listing extracted files:', error);
    return res.status(500).json({ error: 'Failed to list extracted files' });
  }
});

isoRoutes.post('/attach', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const isoName = typeof req.body?.iso_name === 'string' ? req.body.iso_name.trim() : '';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const osType = typeof req.body?.os_type === 'string' && req.body.os_type.trim()
      ? req.body.os_type.trim()
      : 'custom';
    const bootArgs = typeof req.body?.boot_args === 'string' && req.body.boot_args.trim()
      ? req.body.boot_args.trim()
      : undefined;
    const kernelPath = typeof req.body?.kernel_path === 'string' ? req.body.kernel_path.trim() : '';
    const initrdPaths = Array.isArray(req.body?.initrd_paths) ? req.body.initrd_paths : [];

    if (!isoName) {
      return res.status(400).json({ error: 'iso_name is required' });
    }
    if (!label) {
      return res.status(400).json({ error: 'label is required' });
    }
    if (!kernelPath) {
      return res.status(400).json({ error: 'kernel_path is required' });
    }
    if (!initrdPaths.length) {
      return res.status(400).json({ error: 'initrd_paths is required' });
    }

    const normalizedInitrd = initrdPaths
      .filter((value: any) => typeof value === 'string' && value.trim())
      .map((value: string) => value.trim());

    const isInvalidPath = (value: string) => !value.startsWith('/iso/');
    if (isInvalidPath(kernelPath) || normalizedInitrd.some(isInvalidPath)) {
      return res.status(400).json({ error: 'Kernel/initrd paths must start with /iso/' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'images.attach',
      category: 'images',
      message: `Attach boot files for ${isoName}`,
      source,
      created_by,
      payload: {
        iso_name: isoName,
        label,
        os_type: osType,
        kernel_path: kernelPath,
        initrd_paths: normalizedInitrd,
        boot_args: bootArgs,
        meta,
      },
      target_type: 'image',
      target_id: isoName,
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error attaching boot files:', error);
    return res.status(500).json({ error: 'Failed to attach boot files' });
  }
});

isoRoutes.post('/', requireAuth, requirePermission('config.edit'), (req: AuthRequest, res: Response) => {
  upload.single('file')(req as any, res as any, async (err) => {
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

    const autoExtractRaw = (req.body as any)?.auto_extract;
    const autoExtract = autoExtractRaw === undefined
      ? true
      : String(autoExtractRaw).toLowerCase() === 'true';
    const label = typeof (req.body as any)?.label === 'string' ? (req.body as any).label.trim() : '';

    try {
      await IsoFileModel.upsertByName(file.filename);
      const { source, created_by, meta } = buildJobMeta(req);
      const job = await enqueueJob({
        type: 'images.add',
        category: 'images',
        message: `Add image ${file.filename}`,
        source,
        created_by,
        payload: {
          filePath: file.path,
          fileName: file.filename,
          size: file.size,
          auto_extract: autoExtract,
          label: label || undefined,
          meta,
        },
        target_type: 'iso',
        target_id: file.filename,
      });

      return res.status(202).json({ success: true, jobId: job.id, job });
    } catch (queueError) {
      logger.error('ISO queue failed:', queueError);
      return res.status(500).json({ error: 'Failed to queue image import' });
    }
  });
});

isoRoutes.post('/manual', requireAuth, requirePermission('config.edit'), (req: AuthRequest, res: Response) => {
  manualUpload.fields([
    { name: 'kernel', maxCount: 1 },
    { name: 'initrd', maxCount: 1 },
  ])(req as any, res as any, async (err) => {
    if (err) {
      logger.error('Manual image upload failed:', err);
      res.status(400).json({ error: err.message || 'Upload failed' });
      return;
    }

    const label = typeof req.body.label === 'string' ? req.body.label.trim() : '';
    if (!label) {
      res.status(400).json({ error: 'Label is required' });
      return;
    }

    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const kernel = files?.kernel?.[0];
    const initrd = files?.initrd?.[0];
    if (!kernel || !initrd) {
      res.status(400).json({ error: 'Both kernel and initramfs are required' });
      return;
    }

    const safeLabel = sanitizeName(label);
    const osType = typeof req.body.os_type === 'string' && req.body.os_type.trim()
      ? req.body.os_type.trim()
      : 'custom';
    const bootArgs = typeof req.body.boot_args === 'string' && req.body.boot_args.trim()
      ? req.body.boot_args.trim()
      : undefined;

    try {
      const { source, created_by, meta } = buildJobMeta(req);
      const job = await enqueueJob({
        type: 'images.manual',
        category: 'images',
        message: `Add manual image ${label}`,
        source,
        created_by,
        payload: {
          label,
          safeLabel,
          osType,
          bootArgs,
          kernelFilename: kernel.filename,
          initrdFilename: initrd.filename,
          meta,
        },
        target_type: 'image',
        target_id: `manual:${safeLabel}`,
      });

      res.status(202).json({ success: true, jobId: job.id, job });
    } catch (queueError) {
      logger.error('Manual image queue failed:', queueError);
      res.status(500).json({ error: 'Failed to queue manual image' });
    }
  });
});

isoRoutes.post('/remote', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const autoExtractRaw = req.body?.auto_extract;
  const autoExtract = autoExtractRaw === undefined
    ? true
    : String(autoExtractRaw).toLowerCase() === 'true';
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  const requestedName = typeof req.body?.file_name === 'string' ? req.body.file_name.trim() : '';
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const baseName = requestedName || path.basename(parsedUrl.pathname || '');
  const safeName = sanitizeName(baseName || `download-${Date.now()}.iso`);
  if (!safeName.toLowerCase().endsWith('.iso')) {
    return res.status(400).json({ error: 'URL must point to a .iso file' });
  }

  const isoDir = await getIsoDir();
  ensureDirSync(isoDir);
  const targetPath = path.join(isoDir, safeName);
  const existingEntry = await IsoModel.findByIsoName(safeName);
  const { source, created_by, meta } = buildJobMeta(req);

  if (fs.existsSync(targetPath)) {
    if (existingEntry) {
      return res.status(409).json({ error: 'Image already exists' });
    }
    const addJob = await enqueueJob({
      type: 'images.add',
      category: 'images',
      message: `Add image ${safeName}`,
      source,
      created_by,
      payload: {
        filePath: targetPath,
        fileName: safeName,
        auto_extract: autoExtract,
        label: label || undefined,
        meta,
      },
      target_type: 'iso',
      target_id: safeName,
    });
    return res.status(202).json({ success: true, jobId: addJob.id, job: addJob });
  }

  const downloadJob = await enqueueJob({
    type: 'images.download',
    category: 'images',
    message: `Download image ${safeName}`,
    source,
    created_by,
    payload: { url, safeName, auto_extract: autoExtract, label: label || undefined, meta },
    target_type: 'iso',
    target_id: safeName,
  });

  return res.status(202).json({ success: true, jobId: downloadJob.id, job: downloadJob });
});

isoRoutes.post('/remote/meta', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  try {
    const meta = await fetchRemoteMetadata(url);
    const fallbackName = path.basename(parsedUrl.pathname || '') || null;
    const name = meta.fileName || fallbackName;
    return res.json({
      url,
      fileName: name,
      size: meta.size,
      mimeType: meta.mimeType,
      isIso: name ? name.toLowerCase().endsWith('.iso') : false,
    });
  } catch (error) {
    logger.error('Remote URL metadata fetch failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to query URL' });
  }
});

isoRoutes.post('/scan', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'images.scan',
      category: 'images',
      message: 'Scan images directory',
      source,
      created_by,
      payload: { meta },
      target_type: 'image',
      target_id: 'scan',
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('ISO scan enqueue failed:', error);
    return res.status(500).json({ error: 'Failed to scan ISOs' });
  }
});

// Download netboot installer files from configured mirror (database)
isoRoutes.post('/netboot', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const mirrorId = typeof req.body?.mirror_id === 'string' ? req.body.mirror_id.trim() : '';
    const version = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
    const arch = typeof req.body?.arch === 'string' ? req.body.arch.trim() : 'amd64';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const preseedUrl = typeof req.body?.preseed_url === 'string' ? req.body.preseed_url.trim() : '';
    const kickstartUrl = typeof req.body?.kickstart_url === 'string' ? req.body.kickstart_url.trim() : '';
    const extraArgs = typeof req.body?.extra_args === 'string' ? req.body.extra_args.trim() : '';

    if (!mirrorId || !version) {
      return res.status(400).json({ error: 'mirror_id and version are required' });
    }

    const mirror = await NetbootMirrorModel.findById(mirrorId);
    if (!mirror) return res.status(404).json({ error: 'Mirror not found' });
    const distro = await NetbootDistroModel.findById(mirror.distro_id);
    if (!distro) return res.status(404).json({ error: 'Distro not found' });

    const mirrorBase = mirror.url.replace(/\/+$/, '');
    const replaceTemplate = (t: string): string =>
      t
        .replace(/\{mirror\}/g, mirrorBase)
        .replace(/\{version\}/g, version)
        .replace(/\{arch\}/g, arch);

    const kernelPath = replaceTemplate(distro.kernel_path_template);
    const initrdPath = replaceTemplate(distro.initrd_path_template);
    const kernelUrl = kernelPath.startsWith('http') ? kernelPath : `${mirrorBase}/${kernelPath.replace(/^\//, '')}`;
    const initrdUrl = initrdPath.startsWith('http') ? initrdPath : `${mirrorBase}/${initrdPath.replace(/^\//, '')}`;

    let bootArgs = replaceTemplate(distro.boot_args_template);
    if (preseedUrl) bootArgs += ` preseed/url=${preseedUrl}`;
    if (kickstartUrl) bootArgs += ` inst.ks=${kickstartUrl}`;
    if (extraArgs) bootArgs += ` ${extraArgs}`;

    const dirName = `netboot-${distro.slug}-${version}-${arch}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const displayLabel = label || `${distro.display_name} ${version} Netboot (${arch})`;

    const { source: jobSource, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'images.netboot',
      category: 'images',
      message: `Download ${distro.display_name} ${version} netboot files`,
      source: jobSource,
      created_by,
      payload: {
        mirror_id: mirrorId,
        distro_slug: distro.slug,
        version,
        arch,
        dirName,
        label: displayLabel,
        kernelUrl,
        initrdUrl,
        bootArgs,
        checksum_file_template: distro.checksum_file_template ?? null,
        mirror_url: mirror.url,
        meta,
      },
      target_type: 'image',
      target_id: dirName,
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Netboot download enqueue failed:', error);
    return res.status(500).json({ error: 'Failed to queue netboot download' });
  }
});

isoRoutes.patch('/:id', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawId = getParamValue(req.params.id);
    if (!rawId) {
      return res.status(400).json({ error: 'Missing ISO id' });
    }
    const nextNameRaw = typeof req.body?.file_name === 'string' ? req.body.file_name.trim() : '';
    if (!nextNameRaw) {
      return res.status(400).json({ error: 'file_name is required' });
    }
    const safeBase = sanitizeName(path.basename(nextNameRaw));
    if (!safeBase) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    const nextName = safeBase.toLowerCase().endsWith('.iso') ? safeBase : `${safeBase}.iso`;

    const isoFile = await IsoFileModel.findById(rawId);
    if (!isoFile) {
      return res.status(404).json({ error: 'ISO not found' });
    }

    if (isoFile.file_name === nextName) {
      return res.json({ renamed: false, file: isoFile });
    }

    const isoDir = await getIsoDir();
    const oldName = isoFile.file_name;
    const oldPath = path.join(isoDir, oldName);
    const newPath = path.join(isoDir, nextName);
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'ISO file not found on disk' });
    }
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: 'Target file name already exists' });
    }

    await fsp.rename(oldPath, newPath);

    const oldBase = oldName.replace(/\.iso$/i, '');
    const newBase = nextName.replace(/\.iso$/i, '');
    const oldDir = path.join(isoDir, oldBase);
    const newDir = path.join(isoDir, newBase);
    if (fs.existsSync(oldDir)) {
      await fsp.rename(oldDir, newDir);
    }

    const oldIsoPath = `/iso/${encodeURIComponent(oldBase)}`;
    const newIsoPath = `/iso/${encodeURIComponent(newBase)}`;
    const replaceIsoPath = (value?: string | null) =>
      value ? value.split(oldIsoPath).join(newIsoPath) : value ?? null;

    const existingEntry = await IsoModel.findByIsoName(oldName);
    if (existingEntry) {
      const updatedInitrd = (existingEntry.initrd_items || []).map((item) => ({
        ...item,
        path: replaceIsoPath(item.path) || item.path,
      }));
      await IsoModel.updateByIsoName(oldName, {
        iso_name: nextName,
        kernel_path: replaceIsoPath(existingEntry.kernel_path) || existingEntry.kernel_path,
        initrd_items: updatedInitrd,
        boot_args: replaceIsoPath(existingEntry.boot_args ?? undefined),
      });

      const menus = await BootMenuModel.getAll();
      await Promise.all(
        menus.map(async (menu) => {
          const nextContent = (menu.content || []).map((item: any) => {
            if (item?.type === 'iso' && item.isoName === oldName) {
              return { ...item, isoName: nextName };
            }
            return item;
          });
          if (JSON.stringify(nextContent) !== JSON.stringify(menu.content || [])) {
            await BootMenuModel.update(menu.id, { content: nextContent });
          }
        })
      );
    }

    const updatedFile = await IsoFileModel.rename(rawId, nextName);
    return res.json({
      renamed: true,
      file: updatedFile ? { id: updatedFile.id, name: updatedFile.file_name } : null,
    });
  } catch (error) {
    logger.error('ISO rename failed:', error);
    return res.status(500).json({ error: 'Failed to rename ISO' });
  }
});

isoRoutes.delete('/:id', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawId = getParamValue(req.params.id);
    if (!rawId) {
      return res.status(400).json({ error: 'Missing ISO id' });
    }
    const isoFile = await IsoFileModel.findById(rawId);
    if (!isoFile) {
      return res.status(404).json({ error: 'ISO not found' });
    }
    const rawName = isoFile.file_name;

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'images.delete',
      category: 'images',
      message: `Delete image ${rawName}`,
      source,
      created_by,
      payload: { name: rawName, meta },
      target_type: 'image',
      target_id: isoFile.id,
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error queuing ISO delete:', error);
    return res.status(500).json({ error: 'Failed to delete ISO' });
  }
});
