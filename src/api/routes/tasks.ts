import { Router } from 'express';
import { TaskModel } from '../../database/models.js';
import { executeInstallation } from '../../tasks/installer.js';
import { logger } from '../../utils/logger.js';

export const taskRoutes = Router();

// Execute a task
taskRoutes.post('/:taskId/execute', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const task = TaskModel.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({ error: 'Task is not pending' });
    }

    // Update task status
    TaskModel.update(taskId, { status: 'running' });

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
      
      TaskModel.update(taskId, {
        status: 'completed',
        result: 'Installation completed successfully',
      });
    } else {
      TaskModel.update(taskId, {
        status: 'failed',
        result: `Unknown task type: ${task.type}`,
      });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error executing task:', error);
    const taskId = parseInt(req.params.taskId);
    TaskModel.update(taskId, {
      status: 'failed',
      result: error instanceof Error ? error.message : 'Unknown error',
    });
    return res.status(500).json({ error: 'Failed to execute task' });
  }
});
