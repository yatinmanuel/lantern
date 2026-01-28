import { Router, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { URL } from 'url';
import { IsoModel } from '../../database/models.js';
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
    const isoNames = new Set(files.map(file => file.name));
    const baseUrl = await getBaseUrl();

    const fileItems = files
      .filter(file => file.name.toLowerCase().endsWith('.iso'))
      .map(file => {
        const entry = entryMap.get(file.name) || null;
        return {
          id: file.name,
          name: entry?.label || file.name,
          size: file.size,
          modified_at: file.modified_at,
          url: `${baseUrl}/iso/${encodeURIComponent(file.name)}`,
          entry,
        };
      });

    const manualItems = isoEntries
      .filter(entry => !isoNames.has(entry.iso_name))
      .map(entry => ({
        id: entry.iso_name,
        name: entry.label || entry.iso_name,
        size: 0,
        modified_at: entry.created_at || new Date().toISOString(),
        url: null,
        entry,
      }));

    const items = [...fileItems, ...manualItems].sort((a, b) =>
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

    try {
      const { source, created_by, meta } = buildJobMeta(req);
      const job = await enqueueJob({
        type: 'images.extract',
        category: 'images',
        message: `Import image ${file.filename}`,
        source,
        created_by,
        payload: {
          filePath: file.path,
          fileName: file.filename,
          size: file.size,
          meta,
        },
        target_type: 'image',
        target_id: file.filename,
      });

      res.status(202).json({ success: true, jobId: job.id, job });
    } catch (queueError) {
      logger.error('ISO queue failed:', queueError);
      res.status(500).json({ error: 'Failed to queue image import' });
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

  const baseName = path.basename(parsedUrl.pathname || '');
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
    const extractJob = await enqueueJob({
      type: 'images.extract',
      category: 'images',
      message: `Extract image ${safeName}`,
      source,
      created_by,
      payload: { filePath: targetPath, fileName: safeName, meta },
      target_type: 'image',
      target_id: safeName,
    });
    return res.status(202).json({ success: true, jobId: extractJob.id, job: extractJob });
  }

  const downloadJob = await enqueueJob({
    type: 'images.download',
    category: 'images',
    message: `Download image ${safeName}`,
    source,
    created_by,
    payload: { url, safeName, meta },
    target_type: 'image',
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

isoRoutes.delete('/:name', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawName = getParamValue(req.params.name);
    if (!rawName) {
      return res.status(400).json({ error: 'Missing ISO name' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'images.delete',
      category: 'images',
      message: `Delete image ${rawName}`,
      source,
      created_by,
      payload: { name: rawName, meta },
      target_type: 'image',
      target_id: rawName,
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error queuing ISO delete:', error);
    return res.status(500).json({ error: 'Failed to delete ISO' });
  }
});
