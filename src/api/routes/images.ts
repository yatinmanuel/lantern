import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { BootMenuModel, IsoModel } from '../../database/models.js';
import { requireAuth, requirePermission, AuthRequest } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { generateIpxeMenu } from '../../utils/ipxe.js';
import { logger } from '../../utils/logger.js';
import { getIsoDir, getBaseUrl, getNfsExportPath, getUbuntuNetbootMode, detectIsoEntry } from '../../utils/iso-tools.js';

export const imageRoutes = Router();

imageRoutes.get('/', requireAuth, requirePermission('config.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const entries = await IsoModel.getAll();
    const items = entries.map((entry) => ({
      id: entry.id,
      iso_name: entry.iso_name,
      label: entry.label,
      os_type: entry.os_type,
      kernel_path: entry.kernel_path,
      initrd_items: entry.initrd_items || [],
      boot_args: entry.boot_args,
      created_at: entry.created_at,
    }));
    return res.json(items);
  } catch (error) {
    logger.error('Error listing images:', error);
    return res.status(500).json({ error: 'Failed to list images' });
  }
});

imageRoutes.delete('/:id', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawId = getParamValue(req.params.id);
    if (!rawId) {
      return res.status(400).json({ error: 'Image id is required' });
    }
    const existing = await IsoModel.findById(rawId);
    if (!existing) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const deleted = await IsoModel.deleteById(rawId);
    if (deleted) {
      await BootMenuModel.removeIsoReferences({ isoId: existing.id, isoName: existing.iso_name });
      await generateIpxeMenu();
    }
    return res.json({ deleted: rawId });
  } catch (error) {
    logger.error('Error deleting image:', error);
    return res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Regenerate boot args for an image from current config
imageRoutes.post('/:id/regenerate-boot-args', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawId = getParamValue(req.params.id);
    if (!rawId) {
      return res.status(400).json({ error: 'Image id is required' });
    }
    const existing = await IsoModel.findById(rawId);
    if (!existing) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get ISO name and check if extracted dir exists
    const isoName = existing.iso_name;
    const baseName = isoName.replace(/\.iso$/i, '');
    const isoDir = await getIsoDir();
    const destDir = path.join(isoDir, baseName);

    if (!fs.existsSync(destDir)) {
      return res.status(400).json({ 
        error: 'Extracted ISO directory not found. Cannot regenerate boot args for manually created images.' 
      });
    }

    // Regenerate boot args using current config
    const baseUrl = await getBaseUrl();
    const nfsExportBase = await getNfsExportPath();
    const ubuntuNetbootMode = await getUbuntuNetbootMode();
    const entry = detectIsoEntry(isoName, destDir, baseUrl, nfsExportBase, ubuntuNetbootMode);

    if (!entry) {
      return res.status(400).json({ 
        error: 'Could not detect boot configuration from extracted ISO. Layout may be unsupported.' 
      });
    }

    // Update the image with new boot args (IsoModel uses updateByIsoName)
    await IsoModel.updateByIsoName(existing.iso_name, { boot_args: entry.boot_args });
    await generateIpxeMenu();

    logger.info(`Regenerated boot args for image ${existing.id}: ${entry.boot_args}`);
    return res.json({ 
      success: true, 
      boot_args: entry.boot_args,
      message: 'Boot arguments regenerated successfully'
    });
  } catch (error) {
    logger.error('Error regenerating boot args:', error);
    return res.status(500).json({ error: 'Failed to regenerate boot arguments' });
  }
});
