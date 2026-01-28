import { Router } from 'express';
import { ServerModel, TaskModel, InstallationModel } from '../../database/models.js';
import { logger } from '../../utils/logger.js';
import { sseManager } from '../../utils/sse-manager.js';
import { parseParamInt } from '../../utils/params.js';
import { enqueueJob, recordJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';

export const serverRoutes = Router();

// Register a new server (called by Alpine agent on boot)
serverRoutes.post('/register', async (req, res) => {
  try {
    const { mac_address, ip_address, hardware_info } = req.body;

    if (!mac_address) {
      return res.status(400).json({ error: 'mac_address is required' });
    }

    // Check if server already exists
    let server = await ServerModel.findByMac(mac_address);
    
    if (server) {
      // Update existing server
      server = await ServerModel.update(server.id, {
        ip_address: ip_address || server.ip_address,
        hardware_info: hardware_info || server.hardware_info,
        status: 'ready',
      });
      // Update last_seen timestamp
      await ServerModel.updateLastSeen(server.id);
      logger.info(`Server updated: ${mac_address}`, { ip: ip_address });
    } else {
      // Create new server
      server = await ServerModel.create({
        mac_address,
        ip_address: ip_address || null,
        hostname: null,
        status: 'ready',
        hardware_info: hardware_info || null,
      });
      // Update last_seen timestamp
      await ServerModel.updateLastSeen(server.id);
      logger.info(`Server registered: ${mac_address}`, { ip: ip_address });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    await recordJob({
      type: 'clients.register',
      category: 'clients',
      status: 'completed',
      message: `Client registered ${mac_address}`,
      source,
      created_by,
      payload: { mac_address, ip_address, hardware_info, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.json(server);
  } catch (error) {
    logger.error('Error registering server:', error);
    return res.status(500).json({ error: 'Failed to register server' });
  }
});

// Get all servers
serverRoutes.get('/', async (_req, res) => {
  try {
    const servers = await ServerModel.findAll();
    return res.json(servers);
  } catch (error) {
    logger.error('Error fetching servers:', error);
    return res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Get stale servers (servers that haven't been seen recently)
// MUST come before /:mac route to avoid route conflict
serverRoutes.get('/stale', async (req, res) => {
  try {
    const timeoutSeconds = parseInt(req.query.timeout as string || '30', 10);
    const staleServers = await ServerModel.findStaleServers(timeoutSeconds);
    return res.json({
      count: staleServers.length,
      servers: staleServers,
      timeout_seconds: timeoutSeconds,
    });
  } catch (error) {
    logger.error('Error fetching stale servers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ 
      error: 'Failed to fetch stale servers',
      details: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

// Manually trigger cleanup of stale servers
// MUST come before /:mac route to avoid route conflict
serverRoutes.post('/cleanup', async (req, res) => {
  try {
    const timeoutSeconds = parseInt(req.body.timeout || process.env.CLEANUP_TIMEOUT_SECONDS || '30', 10);
    const staleServers = await ServerModel.findStaleServers(timeoutSeconds);
    
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const server of staleServers) {
      const result = await ServerModel.delete(server.id);
      if (result) {
        deleted.push(server.mac_address);
        logger.info(`Manually removed stale server: ${server.mac_address} (last seen: ${server.last_seen})`);
      } else {
        failed.push(server.mac_address);
      }
    }

    const { source, created_by, meta } = buildJobMeta(req);
    await recordJob({
      type: 'clients.cleanup',
      category: 'clients',
      status: 'completed',
      message: 'Cleanup stale clients',
      source,
      created_by,
      payload: { deleted, failed, timeoutSeconds, meta },
      target_type: 'client',
      target_id: 'cleanup',
    });

    return res.json({
      success: true,
      deleted_count: deleted.length,
      failed_count: failed.length,
      deleted: deleted,
      failed: failed,
      timeout_seconds: timeoutSeconds,
    });
  } catch (error) {
    logger.error('Error during manual cleanup:', error);
    return res.status(500).json({ error: 'Failed to cleanup stale servers' });
  }
});

// Get server by MAC address
serverRoutes.get('/:mac', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    return res.json(server);
  } catch (error) {
    logger.error('Error fetching server:', error);
    return res.status(500).json({ error: 'Failed to fetch server' });
  }
});

// Get server by ID
serverRoutes.get('/id/:id', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    return res.json(server);
  } catch (error) {
    logger.error('Error fetching server:', error);
    return res.status(500).json({ error: 'Failed to fetch server' });
  }
});

// Update server status
serverRoutes.patch('/:mac/status', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { status } = req.body;
    if (!status || !['booting', 'ready', 'installing', 'installed', 'error'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await ServerModel.update(server.id, { status });

    const { source, created_by, meta } = buildJobMeta(req);
    await recordJob({
      type: 'clients.update-status',
      category: 'clients',
      status: 'completed',
      message: `Update client status ${server.mac_address} -> ${status}`,
      source,
      created_by,
      payload: { status, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.json(updated);
  } catch (error) {
    logger.error('Error updating server status:', error);
    return res.status(500).json({ error: 'Failed to update server status' });
  }
});

// Update server (general update endpoint)
serverRoutes.patch('/:mac', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { ip_address, hostname, status } = req.body;
    const updates: any = {};
    
    if (ip_address !== undefined) updates.ip_address = ip_address;
    if (hostname !== undefined) updates.hostname = hostname;
    if (status !== undefined) {
      if (!['booting', 'ready', 'installing', 'installed', 'error'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.status = status;
    }

    const updated = await ServerModel.update(server.id, updates);

    const { source, created_by, meta } = buildJobMeta(req);
    await recordJob({
      type: 'clients.update',
      category: 'clients',
      status: 'completed',
      message: `Update client ${server.mac_address}`,
      source,
      created_by,
      payload: { updates, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.json(updated);
  } catch (error) {
    logger.error('Error updating server:', error);
    return res.status(500).json({ error: 'Failed to update server' });
  }
});

// Update server by ID
serverRoutes.patch('/id/:id', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { ip_address, hostname, status } = req.body;
    const updates: any = {};
    
    if (ip_address !== undefined) updates.ip_address = ip_address;
    if (hostname !== undefined) updates.hostname = hostname;
    if (status !== undefined) {
      if (!['booting', 'ready', 'installing', 'installed', 'error'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.json(server);
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.update',
      category: 'clients',
      message: `Update client ${server.mac_address}`,
      source,
      created_by,
      payload: { id, updates, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error updating server:', error);
    return res.status(500).json({ error: 'Failed to update server' });
  }
});

// SSE endpoint for real-time task delivery (persistent connection)
serverRoutes.get('/:mac/tasks/stream', async (req, res) => {
  try {
    const macAddress = req.params.mac;
    const server = await ServerModel.findByMac(macAddress);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Update last_seen timestamp (heartbeat)
    await ServerModel.updateLastSeen(server.id);

    // Check for any pending tasks immediately and send them
    const pendingTasks = await TaskModel.findByServer(server.id, 'pending');
    if (pendingTasks.length > 0) {
      // Send existing tasks before establishing SSE connection
      // This ensures tasks aren't missed
      sseManager.sendTasks(macAddress, pendingTasks);
    }

    // Establish SSE connection (keeps connection open)
    sseManager.connect(macAddress, res);

    // Send any pending tasks that were created after connection
    // (they'll be sent via sseManager.sendTask when created)
    // Note: Connection stays open, no return needed
  } catch (error) {
    logger.error('Error establishing SSE connection:', error);
    res.status(500).json({ error: 'Failed to establish SSE connection' });
  }
});

// Long polling endpoint for tasks (fallback - stays open until task arrives or timeout)
serverRoutes.get('/:mac/tasks', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Update last_seen timestamp (heartbeat)
    await ServerModel.updateLastSeen(server.id);

    const timeout = parseInt(req.query.timeout as string || '30', 10) * 1000; // Default 30 seconds
    
    // Long polling: check for tasks repeatedly until one is found or timeout
    const checkInterval = 500; // Check every 500ms
    const maxChecks = Math.floor(timeout / checkInterval);
    
    for (let i = 0; i < maxChecks; i++) {
    const tasks = await TaskModel.findByServer(server.id, 'pending');
      
      if (tasks.length > 0) {
        // Found tasks, return immediately
        return res.json(tasks);
      }
      
      // Check if client disconnected
      if (req.aborted) {
        return res.end();
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Timeout - return empty array
    return res.json([]);
  } catch (error) {
    logger.error('Error fetching tasks:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});


// Get all tasks for a server
serverRoutes.get('/:mac/tasks/all', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const tasks = await TaskModel.findByServer(server.id);
    return res.json(tasks);
  } catch (error) {
    logger.error('Error fetching tasks:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get installations for a server
serverRoutes.get('/:mac/installations', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const installations = await InstallationModel.findByServer(server.id);
    return res.json(installations);
  } catch (error) {
    logger.error('Error fetching installations:', error);
    return res.status(500).json({ error: 'Failed to fetch installations' });
  }
});

// Delete a server
serverRoutes.delete('/:mac', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.delete',
      category: 'clients',
      message: `Delete client ${server.mac_address}`,
      source,
      created_by,
      payload: { id: server.id, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error deleting server:', error);
    return res.status(500).json({ 
      error: 'Failed to delete server',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete server by ID
serverRoutes.delete('/id/:id', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.delete',
      category: 'clients',
      message: `Delete client ${server.mac_address}`,
      source,
      created_by,
      payload: { id: server.id, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.status(202).json({ success: true, jobId: job.id, job });
  } catch (error) {
    logger.error('Error deleting server:', error);
    return res.status(500).json({ 
      error: 'Failed to delete server',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Report task completion (called by Alpine agent)
serverRoutes.post('/:mac/tasks/:taskId/complete', async (req, res) => {
  try {
    const server = await ServerModel.findByMac(req.params.mac);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Update last_seen timestamp (heartbeat)
    await ServerModel.updateLastSeen(server.id);

    const task = await TaskModel.findById(parseParamInt(req.params.taskId));
    if (!task || task.server_id !== server.id) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { success, result } = req.body;
    await TaskModel.update(task.id, {
      status: success ? 'completed' : 'failed',
      result: result || null,
    });

    const { source, created_by, meta } = buildJobMeta(req);
    await recordJob({
      type: 'tasks.complete',
      category: 'tasks',
      status: success ? 'completed' : 'failed',
      message: `Task ${task.id} ${success ? 'completed' : 'failed'}`,
      source,
      created_by,
      payload: { taskId: task.id, serverId: server.id, success, meta },
      target_type: 'task',
      target_id: String(task.id),
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error completing task:', error);
    return res.status(500).json({ error: 'Failed to complete task' });
  }
});

// Reboot server by ID (creates a task for the agent to execute)
serverRoutes.post('/id/:id/reboot', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.reboot',
      category: 'clients',
      message: `Reboot client ${server.mac_address}`,
      source,
      created_by,
      payload: { id: server.id, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.status(202).json({ 
      success: true, 
      jobId: job.id,
      job,
      message: 'Reboot queued'
    });
  } catch (error) {
    logger.error('Error creating reboot task:', error);
    return res.status(500).json({ 
      error: 'Failed to create reboot task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Shutdown server by ID (creates a task for the agent to execute)
serverRoutes.post('/id/:id/shutdown', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.shutdown',
      category: 'clients',
      message: `Shutdown client ${server.mac_address}`,
      source,
      created_by,
      payload: { id: server.id, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    return res.status(202).json({ 
      success: true, 
      jobId: job.id,
      job,
      message: 'Shutdown queued'
    });
  } catch (error) {
    logger.error('Error creating shutdown task:', error);
    return res.status(500).json({ 
      error: 'Failed to create shutdown task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Install OS on server by ID
serverRoutes.post('/id/:id/install', async (req, res) => {
  try {
    const id = parseParamInt(req.params.id);
    const server = await ServerModel.findById(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { os, version, config, disk } = req.body;

    if (!os) {
      return res.status(400).json({ error: 'OS type is required' });
    }

    if (!server.ip_address) {
      return res.status(400).json({ error: 'Server has no IP address' });
    }

    const { source, created_by, meta } = buildJobMeta(req);
    const job = await enqueueJob({
      type: 'clients.install',
      category: 'clients',
      message: `Install ${os} on ${server.mac_address}`,
      source,
      created_by,
      payload: { id: server.id, os, version, config, disk, meta },
      target_type: 'client',
      target_id: String(server.id),
    });

    logger.info(`Installation queued for server ${server.mac_address}: ${os}`);

    return res.status(202).json({ 
      success: true, 
      message: `Installation queued for ${os}`,
      jobId: job.id,
      job,
    });
  } catch (error) {
    logger.error('Error starting installation:', error);
    return res.status(500).json({ 
      error: 'Failed to start installation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
