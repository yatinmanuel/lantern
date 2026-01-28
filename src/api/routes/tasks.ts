import { Router } from 'express';
import { TaskModel } from '../../database/models.js';
import { executeInstallation } from '../../tasks/installer.js';
import { logger } from '../../utils/logger.js';
import { parseParamInt } from '../../utils/params.js';
import { recordJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';

export const taskRoutes = Router();

// Execute a task
taskRoutes.post('/:taskId/execute', async (req, res) => {
  try {
    const taskId = parseParamInt(req.params.taskId);
    const task = await TaskModel.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({ error: 'Task is not pending' });
    }

    // Update task status
    await TaskModel.update(taskId, { status: 'running' });

    // Parse command
    const command = JSON.parse(task.command);
    
    // Execute based on task type
    if (task.type === 'install') {
      await executeInstallation(task.server_id, {
        os: command.os,
        version: command.version,
        config: command.config,
        disk: command.disk,
      });
      
      await TaskModel.update(taskId, {
        status: 'completed',
        result: 'Installation completed successfully',
      });
    } else {
      await TaskModel.update(taskId, {
        status: 'failed',
        result: `Unknown task type: ${task.type}`,
      });
    }

    const { source, created_by, meta } = buildJobMeta(req as any);
    await recordJob({
      type: 'tasks.execute',
      category: 'tasks',
      status: 'completed',
      message: `Executed task ${taskId}`,
      source,
      created_by,
      payload: { taskId, meta },
      target_type: 'task',
      target_id: String(taskId),
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error executing task:', error);
    const taskId = parseParamInt(req.params.taskId);
    await TaskModel.update(taskId, {
      status: 'failed',
      result: error instanceof Error ? error.message : 'Unknown error',
    });
    const { source, created_by, meta } = buildJobMeta(req as any);
    await recordJob({
      type: 'tasks.execute',
      category: 'tasks',
      status: 'failed',
      message: `Failed task ${taskId}`,
      source,
      created_by,
      payload: { taskId, error: error instanceof Error ? error.message : 'Unknown error', meta },
      target_type: 'task',
      target_id: String(taskId),
    });
    return res.status(500).json({ error: 'Failed to execute task' });
  }
});
