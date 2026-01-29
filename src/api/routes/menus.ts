
import { Router } from 'express';
import { BootMenuModel } from '../../database/models.js';
import { enqueueJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';

const router = Router();

// List all menus
router.get('/', async (req, res) => {
  try {
    const menus = await BootMenuModel.getAll();
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Create menu (via Job)
router.post('/', async (req, res) => {
  try {
    const { name, description, content, is_default } = req.body;
    const { source, created_by, meta } = buildJobMeta(req);

    const job = await enqueueJob({
      type: 'menu.create',
      category: 'config',
      message: `Create menu ${name}`,
      source,
      created_by,
      payload: { name, description, content, is_default, meta },
      target_type: 'menu',
      target_id: 'new'
    });

    res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Update menu (via Job)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = req.body;
    const { source, created_by, meta } = buildJobMeta(req);

    const job = await enqueueJob({
      type: 'menu.update',
      category: 'config',
      message: `Update menu ${id}`,
      source,
      created_by,
      payload: { id, ...updates, meta },
      target_type: 'menu',
      target_id: String(id)
    });

    res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Delete menu (via Job)
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { source, created_by, meta } = buildJobMeta(req);

    const job = await enqueueJob({
      type: 'menu.delete',
      category: 'config',
      message: `Delete menu ${id}`,
      source,
      created_by,
      payload: { id, meta },
      target_type: 'menu',
      target_id: String(id)
    });

    res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Assign menu to client (via Job)
router.post('/assign', async (req, res) => {
  try {
    const { clientId, menuId } = req.body; // clientId is MAC or ID? Job expects Server ID usually or MAC.
    // Job handler for 'client.assign_menu' expects payload: { clientId, menuId }
    
    // Check job handler implementation. 
    // In handlers.ts: 
    // case 'client.assign_menu':
    //   await ServerModel.update(payload.serverId, { boot_menu_id: payload.menuId });

    const serverId = parseInt(clientId, 10);
    const bootMenuId = menuId ? parseInt(menuId, 10) : null;

    const { source, created_by, meta } = buildJobMeta(req);

    const job = await enqueueJob({
      type: 'client.assign_menu',
      category: 'config',
      message: `Assign menu ${bootMenuId} to client ${serverId}`,
      source,
      created_by,
      payload: { serverId, menuId: bootMenuId, meta },
      target_type: 'client',
      target_id: String(serverId)
    });

    res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export const menuRoutes = router;
