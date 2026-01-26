import { BaseInstaller, InstallerConfig, InstallerResult } from './base.js';
import { Server } from '../../database/models.js';
import { SSHClient } from '../../ssh/client.js';

export class ArchInstaller extends BaseInstaller {
  constructor(server: Server, config: InstallerConfig, ssh: SSHClient) {
    super(server, config, ssh);
  }

  async install(): Promise<InstallerResult> {
    const logs: string[] = [];
    const PXE_SERVER = process.env.PXE_SERVER_URL || 'http://192.168.1.10';
    const bootstrapUrl = 'https://geo.mirror.pkgbuild.com/iso/latest/archlinux-bootstrap-x86_64.tar.gz';

    try {
      // Phase 1: Foundation
      logs.push(await this.executePhase('Foundation', [
        'apk add fdisk grub grub-efi e2fsprogs dosfstools wget tar',
        'lsblk',
      ]));

      // Phase 2: Injection (Bootstrap tarball)
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
        `cd /mnt && (wget ${PXE_SERVER}/os-files/archlinux-bootstrap-x86_64.tar.gz || wget ${bootstrapUrl})`,
        'cd /mnt && tar -xzf archlinux-bootstrap-x86_64.tar.gz --strip-components=1',
        'rm /mnt/archlinux-bootstrap-x86_64.tar.gz',
        `echo 'Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch' > /mnt/etc/pacman.d/mirrorlist`,
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
        `chroot /mnt /bin/bash -c "pacman -Sy linux linux-firmware grub efibootmgr networkmanager nano base-devel"`,
        `chroot /mnt /bin/bash -c "genfstab -U /mnt >> /etc/fstab"`,
        `chroot /mnt /bin/bash -c "grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=GRUB /dev/sda"`,
        `chroot /mnt /bin/bash -c "grub-mkconfig -o /boot/grub/grub.cfg"`,
      ]));

      // Phase 5: Final Config
      logs.push(await this.executePhase('Final Config', [
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
}
