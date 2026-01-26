import { SSHClient } from '../../ssh/client.js';
import { logger } from '../../utils/logger.js';

export async function rebootServer(ssh: SSHClient): Promise<void> {
  try {
    logger.info('Rebooting server via traditional reboot');
    await ssh.executeCommand('reboot');
  } catch (error) {
    logger.error('Error rebooting server:', error);
    throw error;
  }
}
