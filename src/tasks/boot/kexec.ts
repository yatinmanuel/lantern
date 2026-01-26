import { SSHClient } from '../../ssh/client.js';
import { logger } from '../../utils/logger.js';

export async function kexecBoot(ssh: SSHClient, kernel: string, initrd: string, cmdline: string): Promise<void> {
  try {
    logger.info('Booting via kexec', { kernel, initrd });
    
    // Load kernel
    await ssh.executeCommand(`kexec -l ${kernel} --initrd=${initrd} --append="${cmdline}"`);
    
    // Execute kexec
    await ssh.executeCommand('kexec -e');
  } catch (error) {
    logger.warn('kexec failed, falling back to traditional reboot:', error);
    // Fallback to traditional reboot
    const { rebootServer } = await import('./reboot.js');
    await rebootServer(ssh);
  }
}
