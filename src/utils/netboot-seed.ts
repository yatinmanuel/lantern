import { NetbootDistroModel, NetbootMirrorModel } from '../database/models.js';
import { logger } from './logger.js';

interface DistroSeed {
  slug: string;
  display_name: string;
  kernel_path_template: string;
  initrd_path_template: string;
  boot_args_template: string;
  versions_discovery_path: string | null;
  version_regex: string | null;
  architectures: string[];
  requires_subscription: boolean;
  supports_preseed: boolean;
  supports_kickstart: boolean;
  checksum_file_template: string | null;
  sort_order: number;
}

interface MirrorSeed {
  name: string;
  url: string;
  is_official: boolean;
}

const DISTROS: (DistroSeed & { mirrors: MirrorSeed[] })[] = [
  {
    slug: 'debian',
    display_name: 'Debian',
    kernel_path_template: '{mirror}/dists/{version}/main/installer-{arch}/current/images/netboot/debian-installer/{arch}/linux',
    initrd_path_template: '{mirror}/dists/{version}/main/installer-{arch}/current/images/netboot/debian-installer/{arch}/initrd.gz',
    boot_args_template: 'auto=true priority=critical mirror/suite={version} -- quiet',
    versions_discovery_path: '/dists/',
    version_regex: '^(trixie|bookworm|bullseye|buster|stretch)$',
    architectures: ['amd64', 'i386', 'arm64'],
    requires_subscription: false,
    supports_preseed: true,
    supports_kickstart: false,
    checksum_file_template: '{base}/SHA256SUMS',
    sort_order: 10,
    mirrors: [
      { name: 'Official', url: 'http://deb.debian.org/debian', is_official: true },
    ],
  },
  {
    slug: 'ubuntu',
    display_name: 'Ubuntu',
    kernel_path_template: '{mirror}/dists/{version}/main/installer-{arch}/current/legacy-images/netboot/ubuntu-installer/{arch}/linux',
    initrd_path_template: '{mirror}/dists/{version}/main/installer-{arch}/current/legacy-images/netboot/ubuntu-installer/{arch}/initrd.gz',
    boot_args_template: 'auto=true priority=critical mirror/suite={version} -- quiet',
    versions_discovery_path: '/dists/',
    version_regex: '^(noble|jammy|focal|bionic)$',
    architectures: ['amd64', 'i386', 'arm64'],
    requires_subscription: false,
    supports_preseed: true,
    supports_kickstart: false,
    checksum_file_template: null,
    sort_order: 20,
    mirrors: [
      { name: 'Official', url: 'http://archive.ubuntu.com/ubuntu', is_official: true },
    ],
  },
  {
    slug: 'fedora',
    display_name: 'Fedora',
    kernel_path_template: '{mirror}/releases/{version}/Server/{arch}/os/images/pxeboot/vmlinuz',
    initrd_path_template: '{mirror}/releases/{version}/Server/{arch}/os/images/pxeboot/initrd.img',
    boot_args_template: 'inst.stage2={mirror}/releases/{version}/Server/{arch}/os inst.repo={mirror}/releases/{version}/Server/{arch}/os ip=dhcp',
    versions_discovery_path: '/releases/',
    version_regex: '^(\\d{2})$', // e.g. 40, 41
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 30,
    mirrors: [
      { name: 'Official', url: 'http://download.fedoraproject.org/pub/fedora/linux', is_official: true },
    ],
  },
  {
    slug: 'rocky',
    display_name: 'Rocky Linux',
    kernel_path_template: '{mirror}/{version}/BaseOS/{arch}/os/images/pxeboot/vmlinuz',
    initrd_path_template: '{mirror}/{version}/BaseOS/{arch}/os/images/pxeboot/initrd.img',
    boot_args_template: 'inst.stage2={mirror}/{version}/BaseOS/{arch}/os inst.repo={mirror}/{version}/BaseOS/{arch}/os ip=dhcp',
    versions_discovery_path: '/',
    version_regex: '^(\\d+)$',
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 40,
    mirrors: [
      { name: 'Official', url: 'http://dl.rockylinux.org/pub/rocky', is_official: true },
    ],
  },
  {
    slug: 'almalinux',
    display_name: 'AlmaLinux',
    kernel_path_template: '{mirror}/{version}/BaseOS/{arch}/os/images/pxeboot/vmlinuz',
    initrd_path_template: '{mirror}/{version}/BaseOS/{arch}/os/images/pxeboot/initrd.img',
    boot_args_template: 'inst.stage2={mirror}/{version}/BaseOS/{arch}/os inst.repo={mirror}/{version}/BaseOS/{arch}/os ip=dhcp',
    versions_discovery_path: '/',
    version_regex: '^(\\d+)$',
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 50,
    mirrors: [
      { name: 'Official', url: 'http://repo.almalinux.org/almalinux', is_official: true },
    ],
  },
  {
    slug: 'centos-stream',
    display_name: 'CentOS Stream',
    kernel_path_template: '{mirror}/{version}-stream/BaseOS/{arch}/os/images/pxeboot/vmlinuz',
    initrd_path_template: '{mirror}/{version}-stream/BaseOS/{arch}/os/images/pxeboot/initrd.img',
    boot_args_template: 'inst.stage2={mirror}/{version}-stream/BaseOS/{arch}/os inst.repo={mirror}/{version}-stream/BaseOS/{arch}/os ip=dhcp',
    versions_discovery_path: '/',
    version_regex: '^(\\d+)-stream$',
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 55,
    mirrors: [
      { name: 'Official', url: 'http://mirror.stream.centos.org', is_official: true },
    ],
  },
  {
    slug: 'arch',
    display_name: 'Arch Linux',
    kernel_path_template: '{mirror}/iso/latest/arch/boot/x86_64/vmlinuz-linux',
    initrd_path_template: '{mirror}/iso/latest/arch/boot/x86_64/initramfs-linux.img',
    boot_args_template: 'archisobasedir=arch archiso_http_srv={mirror}/iso/latest/ ip=dhcp',
    versions_discovery_path: null,
    version_regex: null,
    architectures: ['x86_64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: false,
    checksum_file_template: null,
    sort_order: 60,
    mirrors: [
      { name: 'Official', url: 'http://mirror.rackspace.com/archlinux', is_official: true },
    ],
  },
  {
    slug: 'opensuse',
    display_name: 'openSUSE Leap',
    kernel_path_template: '{mirror}/{version}/repo/oss/boot/{arch}/loader/linux',
    initrd_path_template: '{mirror}/{version}/repo/oss/boot/{arch}/loader/initrd',
    boot_args_template: 'install={mirror}/{version}/repo/oss inst.repo={mirror}/{version}/repo/oss ip=dhcp',
    versions_discovery_path: '/',
    version_regex: '^(\\d+\\.\\d+)$',
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 70,
    mirrors: [
      { name: 'Official', url: 'http://download.opensuse.org/distribution/leap', is_official: true },
    ],
  },
  {
    slug: 'alpine',
    display_name: 'Alpine Linux',
    kernel_path_template: '{mirror}/{version}/releases/{arch}/netboot/vmlinuz-virt',
    initrd_path_template: '{mirror}/{version}/releases/{arch}/netboot/initramfs-virt',
    boot_args_template: 'alpine_repo={mirror}/{version}/main modloop={mirror}/{version}/releases/{arch}/netboot/modloop-virt ip=dhcp',
    versions_discovery_path: '/',
    version_regex: '^v(\\d+\\.\\d+)$',
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: false,
    supports_preseed: false,
    supports_kickstart: false,
    checksum_file_template: null,
    sort_order: 80,
    mirrors: [
      { name: 'Official', url: 'http://dl-cdn.alpinelinux.org/alpine', is_official: true },
    ],
  },
  {
    slug: 'rhel',
    display_name: 'Red Hat Enterprise Linux',
    kernel_path_template: '{mirror}/images/pxeboot/vmlinuz',
    initrd_path_template: '{mirror}/images/pxeboot/initrd.img',
    boot_args_template: 'inst.stage2={mirror} inst.repo={mirror} ip=dhcp',
    versions_discovery_path: null,
    version_regex: null,
    architectures: ['x86_64', 'aarch64'],
    requires_subscription: true,
    supports_preseed: false,
    supports_kickstart: true,
    checksum_file_template: null,
    sort_order: 90,
    mirrors: [],
  },
];

const ARCH_BOOT_ARGS_OLD = 'archisobasedir=arch archiso_http_srv={mirror}/iso/latest ip=dhcp';
const ARCH_BOOT_ARGS_NEW = 'archisobasedir=arch archiso_http_srv={mirror}/iso/latest/ ip=dhcp';

/**
 * Fix Arch Linux netboot URL: initramfs concatenates archiso_http_srv + archisobasedir
 * without a slash, so archiso_http_srv must end with / to produce .../iso/latest/arch/...
 * Call after seed so existing DBs get the fix.
 */
export async function fixArchBootArgsTemplate(): Promise<void> {
  const db = getPool();
  const r = await db.query(
    `UPDATE netboot_distros SET boot_args_template = $1 WHERE slug = 'arch' AND boot_args_template = $2`,
    [ARCH_BOOT_ARGS_NEW, ARCH_BOOT_ARGS_OLD]
  );
  if ((r.rowCount ?? 0) > 0) {
    logger.info('Updated Arch Linux distro boot_args_template (trailing slash fix)');
  }
  // Fix stored boot_args: any ".../iso/latest " (no trailing slash) -> ".../iso/latest/ "
  const r2 = await db.query(
    `UPDATE iso_entries SET boot_args = regexp_replace(boot_args, '/iso/latest +', '/iso/latest/ ', 'g')
     WHERE os_type = 'arch' AND boot_args ~ '/iso/latest +' AND boot_args !~ '/iso/latest/ '`
  );
  if ((r2.rowCount ?? 0) > 0) {
    logger.info('Updated existing Arch netboot image boot_args (trailing slash fix)', { count: r2.rowCount });
  }
}

export async function seedNetbootIfEmpty(): Promise<void> {
  const count = await NetbootDistroModel.count();
  if (count > 0) {
    return;
  }

  logger.info('Seeding netboot distros and official mirrors');

  for (const d of DISTROS) {
    const distro = await NetbootDistroModel.create({
      slug: d.slug,
      display_name: d.display_name,
      icon: null,
      kernel_path_template: d.kernel_path_template,
      initrd_path_template: d.initrd_path_template,
      boot_args_template: d.boot_args_template,
      versions_discovery_path: d.versions_discovery_path,
      version_regex: d.version_regex,
      architectures: d.architectures,
      requires_subscription: d.requires_subscription,
      supports_preseed: d.supports_preseed,
      supports_kickstart: d.supports_kickstart,
      checksum_file_template: d.checksum_file_template,
      enabled: true,
      sort_order: d.sort_order,
    });

    let first = true;
    for (const m of d.mirrors) {
      await NetbootMirrorModel.create({
        distro_id: distro.id,
        name: m.name,
        url: m.url,
        is_primary: first,
        is_official: m.is_official,
        enabled: true,
      });
      first = false;
    }
  }

  logger.info(`Seeded ${DISTROS.length} netboot distros`);
}
