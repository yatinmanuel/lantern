import { BaseInstaller, InstallerConfig, InstallerResult } from './base.js';
import { Server } from '../../database/models.js';
import { SSHClient } from '../../ssh/client.js';

export class DebianInstaller extends BaseInstaller {
  constructor(server: Server, config: InstallerConfig, ssh: SSHClient) {
    super(server, config, ssh);
  }

  async install(): Promise<InstallerResult> {
    const logs: string[] = [];
    const os = this.config.os.toLowerCase();
    const version = this.config.version || (os === 'ubuntu' ? 'noble' : 'bookworm');
    const mirror = os === 'ubuntu' 
      ? `http://archive.ubuntu.com/ubuntu/`
      : `http://deb.debian.org/debian/`;

    try {
      // Phase 1: Foundation
      logs.push(await this.executePhase('Foundation', [
        'apk add debootstrap fdisk grub grub-efi e2fsprogs dosfstools',
        'lsblk',
      ]));

      // Phase 2: Injection (debootstrap)
      const debootstrapCmd = `debootstrap --arch=amd64 ${version} /mnt ${mirror}`;
      logs.push(await this.executePhase('Injection', [
        `cfdisk /dev/sda <<EOF
n
p
1

+512M
t
1
n
p
2


w
EOF`,
        'mkfs.vfat -F32 /dev/sda1',
        'mkfs.ext4 /dev/sda2',
        'mount /dev/sda2 /mnt',
        'mkdir -p /mnt/boot/efi',
        'mount /dev/sda1 /mnt/boot/efi',
        debootstrapCmd,
      ]));

      // Phase 3: Brain Transplant
      logs.push(await this.executePhase('Brain Transplant', [
        'mount -t proc /proc /mnt/proc',
        'mount -t sysfs /sys /mnt/sys',
        'mount --bind /dev /mnt/dev',
        'mount --bind /dev/pts /mnt/dev/pts',
        'cp /etc/resolv.conf /mnt/etc/resolv.conf',
      ]));

      // Phase 4: Life Support
      logs.push(await this.executePhase('Life Support', [
        `chroot /mnt /bin/bash -c "apt update && apt install -y linux-image-generic grub-efi efibootmgr network-manager"`,
        `chroot /mnt /bin/bash -c "grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=GRUB /dev/sda"`,
        `chroot /mnt /bin/bash -c "update-grub"`,
      ]));

      // Phase 5: Final Config
      const rootUuid = await this.getRootUUID();
      const efiUuid = await this.getEFIUUID();
      
      logs.push(await this.executePhase('Final Config', [
        `chroot /mnt /bin/bash -c "echo 'UUID=${rootUuid}  /  ext4  defaults  0  1' >> /etc/fstab"`,
        `chroot /mnt /bin/bash -c "echo 'UUID=${efiUuid}   /boot/efi vfat defaults 0 1' >> /etc/fstab"`,
        `chroot /mnt /bin/bash -c "passwd root"`,
        'umount /mnt/dev/pts /mnt/dev /mnt/sys /mnt/proc /mnt/boot/efi /mnt',
        'reboot',
      ]));

      return {
        success: true,
        logs: logs.join('\n\n'),
      };
    } catch (error) {
      return {
        success: false,
        logs: logs.join('\n\n'),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async getRootUUID(): Promise<string> {
    const result = await this.ssh.executeCommand('blkid /dev/sda2 | grep -oP "UUID=\\"\\K[^\\"]+"');
    return result.stdout.trim();
  }

  private async getEFIUUID(): Promise<string> {
    const result = await this.ssh.executeCommand('blkid /dev/sda1 | grep -oP "UUID=\\"\\K[^\\"]+"');
    return result.stdout.trim();
  }
}
