import { Router } from 'express';
import { PXEConfigModel } from '../../database/models.js';
import { logger } from '../../utils/logger.js';
import { enqueueJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';
import { getDnsmasqStatus } from '../../utils/config-service.js';

export const configRoutes = Router();

// Get all configuration
configRoutes.get('/', async (_req, res) => {
  try {
    const config = await PXEConfigModel.getAll();
    const configObj: Record<string, any> = {};
    config.forEach(item => {
      configObj[item.key] = {
        value: item.value,
        description: item.description,
        updated_at: item.updated_at,
      };
    });
    return res.json(configObj);
  } catch (error) {
    logger.error('Error fetching configuration:', error);
    return res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Get specific configuration value
configRoutes.get('/:key', async (req, res) => {
  try {
    const value = await PXEConfigModel.get(req.params.key);
    if (value === null) {
      return res.status(404).json({ error: 'Configuration key not found' });
    }
    return res.json({ key: req.params.key, value });
  } catch (error) {
    logger.error('Error fetching configuration:', error);
    return res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Update configuration
configRoutes.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'config.update',
      category: 'config',
      message: `Update config ${key}`,
      source,
      created_by,
      payload: { key, value, description, meta },
      target_type: 'config',
      target_id: key,
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating configuration:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Update multiple configuration values
configRoutes.put('/', async (req, res) => {
  try {
    const updates = req.body;
    if (typeof updates !== 'object' || updates === null) {
      return res.status(400).json({ error: 'Invalid configuration object' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'config.update',
      category: 'config',
      message: 'Update configuration',
      source,
      created_by,
      payload: { updates, meta },
      target_type: 'config',
      target_id: 'bulk',
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating configuration:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Get dnsmasq status
configRoutes.get('/service/dnsmasq/status', async (_req, res) => {
  try {
    const status = await getDnsmasqStatus();
    return res.json({ service: 'dnsmasq', ...status });
  } catch (error) {
    logger.error('Error checking dnsmasq status:', error);
    return res.status(500).json({ error: 'Failed to check dnsmasq status' });
  }
});

// Restart dnsmasq
configRoutes.post('/service/dnsmasq/restart', async (req, res) => {
  try {
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'config.dnsmasq.restart',
      category: 'config',
      message: 'Restart dnsmasq',
      source,
      created_by,
      payload: { meta },
      target_type: 'service',
      target_id: 'dnsmasq',
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error restarting dnsmasq:', error);
    return res.status(500).json({ error: 'Failed to restart dnsmasq' });
  }
});

// Regenerate dnsmasq config
configRoutes.post('/service/dnsmasq/regenerate', async (req, res) => {
  try {
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'config.dnsmasq.regenerate',
      category: 'config',
      message: 'Regenerate dnsmasq config',
      source,
      created_by,
      payload: { meta },
      target_type: 'service',
      target_id: 'dnsmasq',
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error regenerating dnsmasq config:', error);
    return res.status(500).json({ error: 'Failed to regenerate dnsmasq configuration' });
  }
});

// Regenerate iPXE menu
configRoutes.post('/ipxe/regenerate', async (req, res) => {
  try {
    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'config.ipxe.regenerate',
      category: 'config',
      message: 'Regenerate iPXE menu',
      source,
      created_by,
      payload: { meta },
      target_type: 'ipxe',
      target_id: 'menu',
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error: any) {
    logger.error('Error regenerating iPXE menu:', error);
    return res.status(500).json({ 
      error: 'Failed to regenerate iPXE menu',
      details: error.message 
    });
  }
});
