import { SSHClient } from '../../ssh/client.js';
import { logger } from '../../utils/logger.js';

export async function shutdownServer(ssh: SSHClient): Promise<void> {
  try {
    logger.info('Shutting down server');
    await ssh.executeCommand('poweroff');
  } catch (error) {
    logger.error('Error shutting down server:', error);
    throw error;
  }
}
