import { Router, Response } from 'express';
import {
  NetbootDistroModel,
  NetbootMirrorModel,
  NetbootVersionModel,
  type NetbootDistro,
  type NetbootMirror,
} from '../../database/models.js';
import { requireAuth, requirePermission, AuthRequest } from '../../utils/auth.js';
import { getParamValue } from '../../utils/params.js';
import { logger } from '../../utils/logger.js';
import { testMirrorConnection, refreshMirrorVersions } from '../../utils/netboot-discovery.js';
import { seedNetbootIfEmpty, fixArchBootArgsTemplate } from '../../utils/netboot-seed.js';
import { generateIpxeMenu } from '../../utils/ipxe.js';
import { enqueueJob } from '../../jobs/service.js';
import { buildJobMeta } from '../../jobs/request-context.js';

export const netbootRoutes = Router();

netbootRoutes.get(
  '/distros',
  requireAuth,
  requirePermission('config.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const distros = await NetbootDistroModel.getAll(false);
      return res.json(distros);
    } catch (error) {
      logger.error('Error listing netboot distros:', error);
      return res.status(500).json({ error: 'Failed to list distros' });
    }
  }
);

netbootRoutes.get(
  '/distros/:id',
  requireAuth,
  requirePermission('config.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Distro id is required' });
      const distro = await NetbootDistroModel.findById(id);
      if (!distro) return res.status(404).json({ error: 'Distro not found' });
      const mirrors = await NetbootMirrorModel.getByDistroId(id);
      return res.json({ ...distro, mirrors });
    } catch (error) {
      logger.error('Error fetching netboot distro:', error);
      return res.status(500).json({ error: 'Failed to fetch distro' });
    }
  }
);

netbootRoutes.put(
  '/distros/:id',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Distro id is required' });
      const distro = await NetbootDistroModel.findById(id);
      if (!distro) return res.status(404).json({ error: 'Distro not found' });
      const { display_name, enabled, sort_order } = req.body ?? {};
      const updates: Partial<NetbootDistro> = {};
      if (typeof display_name === 'string') updates.display_name = display_name;
      if (typeof enabled === 'boolean') updates.enabled = enabled;
      if (typeof sort_order === 'number') updates.sort_order = sort_order;
      const updated = await NetbootDistroModel.update(id, updates);
      return res.json(updated);
    } catch (error) {
      logger.error('Error updating netboot distro:', error);
      return res.status(500).json({ error: 'Failed to update distro' });
    }
  }
);

netbootRoutes.get(
  '/mirrors',
  requireAuth,
  requirePermission('config.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const distroId = getParamValue(req.query.distro_id as string | undefined);
      const mirrors = distroId
        ? await NetbootMirrorModel.getByDistroId(distroId)
        : await NetbootMirrorModel.getAll(false);
      return res.json(mirrors);
    } catch (error) {
      logger.error('Error listing netboot mirrors:', error);
      return res.status(500).json({ error: 'Failed to list mirrors' });
    }
  }
);

netbootRoutes.post(
  '/mirrors',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { distro_id, name, url, is_primary } = req.body ?? {};
      if (!distro_id || !name || !url) {
        return res.status(400).json({ error: 'distro_id, name, and url are required' });
      }
      const distro = await NetbootDistroModel.findById(distro_id);
      if (!distro) return res.status(404).json({ error: 'Distro not found' });
      const mirror = await NetbootMirrorModel.create({
        distro_id,
        name: String(name).trim(),
        url: String(url).trim().replace(/\/+$/, ''),
        is_primary: Boolean(is_primary),
        is_official: false,
        enabled: true,
      });
      return res.status(201).json(mirror);
    } catch (error) {
      logger.error('Error creating netboot mirror:', error);
      return res.status(500).json({ error: 'Failed to create mirror' });
    }
  }
);

netbootRoutes.put(
  '/mirrors/:id',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Mirror id is required' });
      const mirror = await NetbootMirrorModel.findById(id);
      if (!mirror) return res.status(404).json({ error: 'Mirror not found' });
      const { name, url, is_primary, enabled } = req.body ?? {};
      const updates: Partial<NetbootMirror> = {};
      if (typeof name === 'string') updates.name = name.trim();
      if (typeof url === 'string') updates.url = url.trim().replace(/\/+$/, '');
      if (typeof is_primary === 'boolean') updates.is_primary = is_primary;
      if (typeof enabled === 'boolean') updates.enabled = enabled;
      const updated = await NetbootMirrorModel.update(id, updates);
      return res.json(updated);
    } catch (error) {
      logger.error('Error updating netboot mirror:', error);
      return res.status(500).json({ error: 'Failed to update mirror' });
    }
  }
);

netbootRoutes.delete(
  '/mirrors/:id',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Mirror id is required' });
      const mirror = await NetbootMirrorModel.findById(id);
      if (!mirror) return res.status(404).json({ error: 'Mirror not found' });
      if (mirror.is_official) {
        return res.status(400).json({ error: 'Cannot delete official mirror' });
      }
      await NetbootMirrorModel.delete(id);
      return res.json({ deleted: id });
    } catch (error) {
      logger.error('Error deleting netboot mirror:', error);
      return res.status(500).json({ error: 'Failed to delete mirror' });
    }
  }
);

netbootRoutes.post(
  '/test-url',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const url = typeof req.body?.url === 'string' ? req.body.url.trim().replace(/\/+$/, '') : '';
      const distroId = typeof req.body?.distro_id === 'string' ? req.body.distro_id.trim() : '';
      if (!url || !distroId) {
        return res.status(400).json({ error: 'url and distro_id are required' });
      }
      const distro = await NetbootDistroModel.findById(distroId);
      if (!distro) return res.status(404).json({ error: 'Distro not found' });
      const syntheticMirror: NetbootMirror = {
        id: '',
        distro_id: distroId,
        name: 'Test',
        url,
        is_primary: false,
        is_official: false,
        enabled: true,
        last_tested_at: null,
        last_test_success: null,
        last_refreshed_at: null,
        created_at: '',
      };
      const success = await testMirrorConnection(syntheticMirror, distro);
      return res.json({ success });
    } catch (error) {
      logger.error('Error testing netboot URL:', error);
      return res.status(500).json({ error: 'Failed to test URL' });
    }
  }
);

netbootRoutes.post(
  '/mirrors/:id/test',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Mirror id is required' });
      const mirror = await NetbootMirrorModel.findById(id);
      if (!mirror) return res.status(404).json({ error: 'Mirror not found' });
      const distro = await NetbootDistroModel.findById(mirror.distro_id);
      if (!distro) return res.status(404).json({ error: 'Distro not found' });
      const success = await testMirrorConnection(mirror, distro);
      await NetbootMirrorModel.update(id, {
        last_tested_at: new Date().toISOString(),
        last_test_success: success,
      });
      return res.json({ success });
    } catch (error) {
      logger.error('Error testing netboot mirror:', error);
      return res.status(500).json({ error: 'Failed to test mirror' });
    }
  }
);

netbootRoutes.get(
  '/mirrors/:id/versions',
  requireAuth,
  requirePermission('config.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Mirror id is required' });
      const versions = await NetbootVersionModel.getByMirrorId(id);
      return res.json(versions);
    } catch (error) {
      logger.error('Error listing netboot versions:', error);
      return res.status(500).json({ error: 'Failed to list versions' });
    }
  }
);

netbootRoutes.post(
  '/mirrors/:id/refresh',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamValue(req.params.id);
      if (!id) return res.status(400).json({ error: 'Mirror id is required' });
      const { source, created_by, meta } = buildJobMeta(req);
      const job = await enqueueJob({
        type: 'netboot.refresh-mirror',
        category: 'netboot',
        message: `Refresh netboot versions for mirror ${id}`,
        source,
        created_by,
        payload: { mirror_id: id, meta },
        target_type: 'netboot',
        target_id: id,
      });
      return res.status(202).json({ success: true, jobId: job.id, job });
    } catch (error) {
      logger.error('Error enqueueing netboot refresh:', error);
      return res.status(500).json({ error: 'Failed to refresh mirror' });
    }
  }
);

netbootRoutes.post(
  '/seed',
  requireAuth,
  requirePermission('config.edit'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await seedNetbootIfEmpty();
      return res.json({ seeded: true });
    } catch (error) {
      logger.error('Error seeding netboot sources:', error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        error: 'Failed to seed netboot sources',
        detail: message,
      });
    }
  }
);

// Fix Arch netboot URL: .../iso/latestarch/... doesn't exist; correct path is .../iso/latest/arch/...
netbootRoutes.post(
  '/fix-arch-boot-args',
  requireAuth,
  requirePermission('config.edit'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await fixArchBootArgsTemplate();
      await generateIpxeMenu();
      return res.json({ fixed: true, message: 'Arch boot args updated; iPXE menu regenerated.' });
    } catch (error) {
      logger.error('Error fixing Arch boot args:', error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        error: 'Failed to fix Arch boot args',
        detail: message,
      });
    }
  }
);

netbootRoutes.post(
  '/refresh',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const count = await NetbootDistroModel.count();
      if (count === 0) {
        try {
          await seedNetbootIfEmpty();
        } catch (seedError) {
          logger.error('Error seeding netboot sources in refresh:', seedError);
          const msg = seedError instanceof Error ? seedError.message : String(seedError);
          return res.status(500).json({
            error: 'Failed to seed netboot sources (no distros yet)',
            detail: msg,
          });
        }
      }
      const { source, created_by, meta } = buildJobMeta(req);
      const job = await enqueueJob({
        type: 'netboot.refresh',
        category: 'netboot',
        message: 'Refresh all netboot mirrors',
        source,
        created_by,
        payload: { meta },
        target_type: 'netboot',
        target_id: 'all',
      });
      return res.status(202).json({ success: true, jobId: job.id, job });
    } catch (error) {
      logger.error('Error enqueueing netboot refresh all:', error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        error: 'Failed to refresh mirrors',
        detail: message,
      });
    }
  }
);

netbootRoutes.get(
  '/export',
  requireAuth,
  requirePermission('config.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const excludeOfficial = req.query.official === 'false';
      const distros = await NetbootDistroModel.getAll(false);
      let mirrors = await NetbootMirrorModel.getAll(false);
      if (excludeOfficial) {
        mirrors = mirrors.filter((m) => !m.is_official);
      }
      const payload = {
        schemaVersion: 1,
        distros: distros.map((d) => ({
          id: d.id,
          slug: d.slug,
          display_name: d.display_name,
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
          enabled: d.enabled,
          sort_order: d.sort_order,
        })),
        mirrors: mirrors.map((m) => ({
          id: m.id,
          distro_id: m.distro_id,
          name: m.name,
          url: m.url,
          is_primary: m.is_primary,
          is_official: m.is_official,
          enabled: m.enabled,
        })),
      };
      return res.json(payload);
    } catch (error) {
      logger.error('Error exporting netboot config:', error);
      return res.status(500).json({ error: 'Failed to export config' });
    }
  }
);

netbootRoutes.post(
  '/import',
  requireAuth,
  requirePermission('config.edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as { schemaVersion?: number; distros?: any[]; mirrors?: any[] };
      const distrosPayload = Array.isArray(body.distros) ? body.distros : [];
      const mirrorsPayload = Array.isArray(body.mirrors) ? body.mirrors : [];
      const knownSlugs = new Set((await NetbootDistroModel.getAll(false)).map((d) => d.slug));
      const distroIdBySlug = new Map<string, string>();
      for (const d of await NetbootDistroModel.getAll(false)) {
        distroIdBySlug.set(d.slug, d.id);
      }
      let updated = 0;
      let added = 0;
      const normalizedUrl = (u: string) => u.replace(/\/+$/, '').toLowerCase();
      const existingByUrl = new Map<string, NetbootMirror>();
      for (const m of await NetbootMirrorModel.getAll(false)) {
        existingByUrl.set(normalizedUrl(m.url), m);
      }
      for (const m of mirrorsPayload) {
        const distroSlug = m.distro_slug ?? (m.distro_id ? (await NetbootDistroModel.findById(m.distro_id))?.slug : null) ?? null;
        if (!distroSlug || !knownSlugs.has(distroSlug)) continue;
        const distroId = distroIdBySlug.get(distroSlug);
        if (!distroId) continue;
        const url = String(m.url ?? '').trim().replace(/\/+$/, '');
        if (!url) continue;
        const key = normalizedUrl(url);
        const existing = existingByUrl.get(key);
        if (existing) {
          await NetbootMirrorModel.update(existing.id, {
            name: typeof m.name === 'string' ? m.name : existing.name,
            is_primary: typeof m.is_primary === 'boolean' ? m.is_primary : existing.is_primary,
            enabled: typeof m.enabled === 'boolean' ? m.enabled : existing.enabled,
          });
          updated += 1;
        } else {
          await NetbootMirrorModel.create({
            distro_id: distroId,
            name: typeof m.name === 'string' ? m.name : 'Imported',
            url,
            is_primary: Boolean(m.is_primary),
            is_official: false,
            enabled: true,
          });
          added += 1;
        }
      }
      for (const d of distrosPayload) {
        const slug = d.slug;
        if (!slug || !knownSlugs.has(slug)) continue;
        const existing = await NetbootDistroModel.findBySlug(slug);
        if (existing) {
          await NetbootDistroModel.update(existing.id, {
            display_name: typeof d.display_name === 'string' ? d.display_name : existing.display_name,
            enabled: typeof d.enabled === 'boolean' ? d.enabled : existing.enabled,
            sort_order: typeof d.sort_order === 'number' ? d.sort_order : existing.sort_order,
          });
        }
      }
      return res.json({ updated, added, message: `Updated ${updated} mirrors, added ${added} mirrors` });
    } catch (error) {
      logger.error('Error importing netboot config:', error);
      return res.status(500).json({ error: 'Failed to import config' });
    }
  }
);
