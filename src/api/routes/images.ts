import { Router, Response } from 'express';
import { IsoModel } from '../../database/models.js';
import { requireAuth, requirePermission, AuthRequest } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { generateIpxeMenu } from '../../utils/ipxe.js';
import { logger } from '../../utils/logger.js';

export const imageRoutes = Router();

imageRoutes.get('/', requireAuth, requirePermission('config.view'), async (_req: AuthRequest, res: Response) => {
  try {
    const entries = await IsoModel.getAll();
    const items = entries.map((entry) => ({
      id: entry.iso_name,
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

imageRoutes.delete('/:name', requireAuth, requirePermission('config.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const rawName = getParamValue(req.params.name);
    if (!rawName) {
      return res.status(400).json({ error: 'Image name is required' });
    }
    const deleted = await IsoModel.deleteByIsoName(rawName);
    if (deleted) {
      await generateIpxeMenu();
    }
    return res.json({ deleted: rawName });
  } catch (error) {
    logger.error('Error deleting image:', error);
    return res.status(500).json({ error: 'Failed to delete image' });
  }
});
