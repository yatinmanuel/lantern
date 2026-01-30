import { Router, Response } from 'express';
import { BootMenuModel, IsoModel } from '../../database/models.js';
import { requireAuth, requirePermission, AuthRequest } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { generateIpxeMenu } from '../../utils/ipxe.js';
import { logger } from '../../utils/logger.js';

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
