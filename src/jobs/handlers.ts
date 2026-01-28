import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { Job } from '../database/job-models.js';
import { IsoModel, ServerModel, TaskModel, PXEConfigModel } from '../database/models.js';
import { UserModel, RoleModel, PermissionModel } from '../database/user-models.js';
import { logger } from '../utils/logger.js';
import { generateIpxeMenu } from '../utils/ipxe.js';
import { sanitizeName, getIsoDir, ensureDirSync, downloadIsoFromUrl, processIsoFile, scanIsoDirectory } from '../utils/iso-tools.js';
import { applyConfiguration, regenerateDnsmasqConfig, restartDnsmasq } from '../utils/config-service.js';
import { executeInstallation } from '../tasks/installer.js';
import { natsManager } from '../utils/nats-manager.js';
import { sseManager } from '../utils/sse-manager.js';
import { enqueueJob, appendJobLog } from './service.js';

async function handleImagesImport(job: Job): Promise<Record<string, any>> {
  const filePath = job.payload?.filePath as string | undefined;
  if (!filePath) throw new Error('Missing filePath');
  await appendJobLog(job.id, `Extracting ${path.basename(filePath)}`);
  try {
    const result = await processIsoFile(filePath);
    await appendJobLog(job.id, `iPXE entry generated for ${result.entry.label}`);
    return { filePath, entry: result.entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendJobLog(job.id, message, 'error');
    throw error;
  }
}

async function handleImagesExtract(job: Job): Promise<Record<string, any>> {
  const filePath = job.payload?.filePath as string | undefined;
  if (!filePath) throw new Error('Missing filePath');
  await appendJobLog(job.id, `Extracting ${path.basename(filePath)}`);
  try {
    const result = await processIsoFile(filePath);
    await appendJobLog(job.id, `iPXE entry generated for ${result.entry.label}`);
    return { filePath, entry: result.entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendJobLog(job.id, message, 'error');
    throw error;
  }
}

async function handleImagesDownload(job: Job): Promise<Record<string, any>> {
  const url = job.payload?.url as string | undefined;
  const safeName = job.payload?.safeName as string | undefined;
  if (!url || !safeName) throw new Error('Missing URL or filename');

  const isoDir = await getIsoDir();
  ensureDirSync(isoDir);
  const targetPath = path.join(isoDir, safeName);

  if (fs.existsSync(targetPath)) {
    const existingEntry = await IsoModel.findByIsoName(safeName);
    if (existingEntry) {
      throw new Error('Image already exists');
    }
    await appendJobLog(job.id, `Found existing ISO on disk: ${safeName}`);
    const extractJob = await enqueueJob({
      type: 'images.extract',
      category: 'images',
      message: `Extract image ${safeName}`,
      source: job.source || 'system',
      created_by: job.created_by ?? null,
      payload: { filePath: targetPath, fileName: safeName, meta: job.payload?.meta },
      target_type: 'image',
      target_id: safeName,
    });
    return { fileName: safeName, filePath: targetPath, exists: true, extractJobId: extractJob.id };
  }

  await appendJobLog(job.id, `Downloading ${safeName}`);
  await downloadIsoFromUrl(url, targetPath, ({ downloaded, total }) => {
    const percent = total ? Math.round((downloaded / total) * 100) : null;
    const message = percent !== null
      ? `Download progress: ${percent}% (${downloaded} / ${total} bytes)`
      : `Download progress: ${downloaded} bytes`;
    void appendJobLog(job.id, message).catch(() => {});
  });
  await appendJobLog(job.id, `Download complete: ${safeName}`);
  const extractJob = await enqueueJob({
    type: 'images.extract',
    category: 'images',
    message: `Extract image ${safeName}`,
    source: job.source || 'system',
    created_by: job.created_by ?? null,
    payload: { filePath: targetPath, fileName: safeName, meta: job.payload?.meta },
    target_type: 'image',
    target_id: safeName,
  });
  return { fileName: safeName, filePath: targetPath, extractJobId: extractJob.id };
}

async function handleImagesManual(job: Job): Promise<Record<string, any>> {
  const label = job.payload?.label as string | undefined;
  const safeLabel = job.payload?.safeLabel as string | undefined;
  const kernelFilename = job.payload?.kernelFilename as string | undefined;
  const initrdFilename = job.payload?.initrdFilename as string | undefined;
  const osType = (job.payload?.osType as string | undefined) || 'custom';
  const bootArgs = (job.payload?.bootArgs as string | undefined) || null;

  if (!label || !kernelFilename || !initrdFilename) {
    throw new Error('Missing manual image fields');
  }

  const resolvedLabel = safeLabel || sanitizeName(label);

  const entry = {
    iso_name: `manual:${resolvedLabel}`,
    label,
    os_type: osType,
    kernel_path: `/iso/manual/${resolvedLabel}/${kernelFilename}`,
    initrd_items: [{ path: `/iso/manual/${resolvedLabel}/${initrdFilename}` }],
    boot_args: bootArgs,
  };

  const stored = await IsoModel.upsert(entry);
  await generateIpxeMenu();
  await appendJobLog(job.id, `iPXE entry generated for ${stored.label}`);
  return { entry: stored };
}

async function handleImagesAttach(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  const isoName = payload.iso_name as string | undefined;
  const label = payload.label as string | undefined;
  const osType = (payload.os_type as string | undefined) || 'custom';
  const kernelPath = payload.kernel_path as string | undefined;
  const initrdPaths = Array.isArray(payload.initrd_paths) ? payload.initrd_paths : [];
  const bootArgs = (payload.boot_args as string | undefined) || null;

  if (!isoName || !label || !kernelPath || initrdPaths.length === 0) {
    throw new Error('Missing attach image fields');
  }

  const entry = {
    iso_name: isoName,
    label,
    os_type: osType,
    kernel_path: kernelPath,
    initrd_items: initrdPaths.map((path: string) => ({ path })),
    boot_args: bootArgs,
  };

  const stored = await IsoModel.upsert(entry);
  await generateIpxeMenu();
  await appendJobLog(job.id, `iPXE entry generated for ${stored.label}`);
  return { entry: stored };
}

async function handleImagesRemote(job: Job): Promise<Record<string, any>> {
  const url = job.payload?.url as string | undefined;
  const safeName = job.payload?.safeName as string | undefined;
  if (!url || !safeName) throw new Error('Missing URL or filename');

  const isoDir = await getIsoDir();
  ensureDirSync(isoDir);
  const targetPath = path.join(isoDir, safeName);
  const baseName = safeName.replace(/\.iso$/i, '');
  const destDir = path.join(isoDir, baseName);

  if (fs.existsSync(targetPath)) {
    const existingEntry = await IsoModel.findByIsoName(safeName);
    if (existingEntry) {
      throw new Error('Image already exists');
    }
    // Stale download from a failed import; clean it up and retry fresh.
    await fsp.rm(targetPath, { force: true });
    await fsp.rm(destDir, { recursive: true, force: true });
  }

  try {
    await downloadIsoFromUrl(url, targetPath);
    const result = await processIsoFile(targetPath);
    return { fileName: safeName, entry: result.entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isUnsupported = message.toLowerCase().includes('unsupported iso layout');
    // Cleanup failed imports so retries don't get stuck on existing files.
    if (!isUnsupported) {
      await fsp.rm(targetPath, { force: true });
      await fsp.rm(destDir, { recursive: true, force: true });
    }
    throw error;
  }
}

async function handleImagesScan(): Promise<Record<string, any>> {
  const results = await scanIsoDirectory();
  return { results };
}

async function handleImagesDelete(job: Job): Promise<Record<string, any>> {
  const name = job.payload?.name as string | undefined;
  if (!name) throw new Error('Missing image name');

  const isoDir = await getIsoDir();
  if (name.startsWith('manual:')) {
    const safeLabel = sanitizeName(name.slice('manual:'.length));
    const manualDir = path.join(isoDir, 'manual', safeLabel);
    await fsp.rm(manualDir, { recursive: true, force: true });
    await IsoModel.deleteByIsoName(`manual:${safeLabel}`);
    await generateIpxeMenu();
    return { deleted: `manual:${safeLabel}` };
  }

  const fileName = path.basename(name);
  if (!fileName.toLowerCase().endsWith('.iso')) {
    throw new Error('Invalid ISO name');
  }

  const filePath = path.join(isoDir, fileName);
  const destDir = path.join(isoDir, fileName.replace(/\.iso$/i, ''));
  await fsp.rm(filePath, { force: true });
  await fsp.rm(destDir, { recursive: true, force: true });
  await IsoModel.deleteByIsoName(fileName);
  await generateIpxeMenu();
  return { deleted: fileName };
}

async function handleConfigUpdate(job: Job): Promise<Record<string, any>> {
  const updates = job.payload?.updates as Record<string, { value: string; description?: string }> | undefined;
  const key = job.payload?.key as string | undefined;
  const value = job.payload?.value as string | undefined;
  const description = job.payload?.description as string | undefined;

  if (updates && typeof updates === 'object') {
    for (const [cfgKey, cfgVal] of Object.entries(updates)) {
      const nextValue = typeof cfgVal === 'object' && cfgVal !== null && 'value' in cfgVal ? cfgVal.value : String(cfgVal);
      const nextDescription = typeof cfgVal === 'object' && cfgVal !== null && 'description' in cfgVal ? cfgVal.description : undefined;
      await PXEConfigModel.set(cfgKey, String(nextValue), nextDescription);
      await applyConfiguration(cfgKey, String(nextValue));
    }
    return { updated: Object.keys(updates) };
  }

  if (!key || value === undefined) {
    throw new Error('Missing configuration key/value');
  }

  await PXEConfigModel.set(key, String(value), description);
  await applyConfiguration(key, String(value));
  return { updated: [key] };
}

async function handleConfigRegenerateDnsmasq(): Promise<Record<string, any>> {
  const result = await regenerateDnsmasqConfig();
  return result;
}

async function handleConfigRestartDnsmasq(): Promise<Record<string, any>> {
  await restartDnsmasq();
  return { restarted: true };
}

async function handleConfigRegenerateIpxe(): Promise<Record<string, any>> {
  const result = await generateIpxeMenu();
  return result;
}

async function handleClientUpdate(job: Job): Promise<Record<string, any>> {
  const id = job.payload?.id as number | undefined;
  const updates = job.payload?.updates as Record<string, any> | undefined;
  if (!id || !updates) throw new Error('Missing client update payload');
  const server = await ServerModel.update(id, updates);
  return { server };
}

async function handleClientDelete(job: Job): Promise<Record<string, any>> {
  const id = job.payload?.id as number | undefined;
  if (!id) throw new Error('Missing client id');
  const server = await ServerModel.findById(id);
  if (!server) throw new Error('Server not found');
  await ServerModel.delete(id);
  sseManager.disconnect(server.mac_address);
  return { deleted: server.mac_address };
}

async function handleClientReboot(job: Job): Promise<Record<string, any>> {
  const id = job.payload?.id as number | undefined;
  if (!id) throw new Error('Missing client id');
  const server = await ServerModel.findById(id);
  if (!server) throw new Error('Server not found');

  const task = await TaskModel.create({
    server_id: server.id,
    type: 'reboot',
    command: JSON.stringify({ action: 'reboot' }),
    status: 'pending',
    result: null,
  });

  let natsSuccess = false;
  let sseSuccess = false;

  if (natsManager.isConnected()) {
    natsSuccess = await natsManager.publishTask(server.mac_address, task);
  }

  sseSuccess = sseManager.sendTask(server.mac_address, task);

  return { taskId: task.id, delivered: natsSuccess || sseSuccess };
}

async function handleClientShutdown(job: Job): Promise<Record<string, any>> {
  const id = job.payload?.id as number | undefined;
  if (!id) throw new Error('Missing client id');
  const server = await ServerModel.findById(id);
  if (!server) throw new Error('Server not found');

  const task = await TaskModel.create({
    server_id: server.id,
    type: 'shutdown',
    command: JSON.stringify({ action: 'shutdown' }),
    status: 'pending',
    result: null,
  });

  let natsSuccess = false;
  let sseSuccess = false;

  if (natsManager.isConnected()) {
    natsSuccess = await natsManager.publishTask(server.mac_address, task);
  }

  sseSuccess = sseManager.sendTask(server.mac_address, task);

  return { taskId: task.id, delivered: natsSuccess || sseSuccess };
}

async function handleClientInstall(job: Job): Promise<Record<string, any>> {
  const id = job.payload?.id as number | undefined;
  const os = job.payload?.os as string | undefined;
  const version = job.payload?.version as string | undefined;
  const config = job.payload?.config as string | undefined;
  const disk = job.payload?.disk as string | undefined;

  if (!id || !os) throw new Error('Missing install payload');

  const server = await ServerModel.findById(id);
  if (!server) throw new Error('Server not found');
  if (!server.ip_address) throw new Error('Server has no IP address');

  const task = await TaskModel.create({
    server_id: server.id,
    type: 'install',
    command: JSON.stringify({ os, version, config, disk }),
    status: 'pending',
    result: null,
  });

  await ServerModel.update(server.id, { status: 'installing' });

  try {
    await executeInstallation(server.id, {
      os,
      version: version || 'latest',
      config: config ?? undefined,
      disk: disk || '/dev/sda',
    });
    await TaskModel.update(task.id, { status: 'completed', result: 'Installation completed' });
    return { taskId: task.id };
  } catch (error) {
    await TaskModel.update(task.id, {
      status: 'failed',
      result: error instanceof Error ? error.message : 'Installation failed',
    });
    throw error;
  }
}

async function handleUserCreate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.username || !payload.password) {
    throw new Error('Username and password are required');
  }

  if (await UserModel.findByUsername(payload.username)) {
    throw new Error('Username already exists');
  }

  if (payload.email && (await UserModel.findByEmail(payload.email))) {
    throw new Error('Email already exists');
  }

  const user = await UserModel.create({
    username: payload.username,
    email: payload.email,
    password: payload.password,
    full_name: payload.full_name,
    is_active: payload.is_active !== false,
    is_superuser: !!payload.is_superuser,
  });

  if (Array.isArray(payload.role_ids)) {
    await RoleModel.setUserRoles(user.id, payload.role_ids);
  }

  if (Array.isArray(payload.permission_ids)) {
    await PermissionModel.setUserPermissions(user.id, payload.permission_ids);
  }

  return { user };
}

async function handleUserUpdate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing user id');

  const updated = await UserModel.update(payload.id, {
    email: payload.email,
    password: payload.password,
    full_name: payload.full_name,
    is_active: payload.is_active,
    is_superuser: payload.is_superuser,
  });

  if (Array.isArray(payload.role_ids)) {
    await RoleModel.setUserRoles(payload.id, payload.role_ids);
  }

  if (Array.isArray(payload.permission_ids)) {
    await PermissionModel.setUserPermissions(payload.id, payload.permission_ids);
  }

  return { user: updated };
}

async function handleUserDelete(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing user id');
  await UserModel.delete(payload.id);
  return { deleted: payload.id };
}

async function handleRoleCreate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.name) throw new Error('Role name is required');

  if (await RoleModel.findByName(payload.name)) {
    throw new Error('Role name already exists');
  }

  const role = await RoleModel.create(payload.name, payload.description || null);

  if (Array.isArray(payload.permission_ids)) {
    await RoleModel.setRolePermissions(role.id, payload.permission_ids);
  }

  return { role };
}

async function handleRoleUpdate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing role id');

  const updated = await RoleModel.update(payload.id, {
    name: payload.name,
    description: payload.description,
  });

  if (Array.isArray(payload.permission_ids)) {
    await RoleModel.setRolePermissions(payload.id, payload.permission_ids);
  }

  return { role: updated };
}

async function handleRoleDelete(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing role id');
  await RoleModel.delete(payload.id);
  return { deleted: payload.id };
}

async function handlePermissionCreate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.name || !payload.resource || !payload.action) {
    throw new Error('Permission name/resource/action are required');
  }

  if (await PermissionModel.findByName(payload.name)) {
    throw new Error('Permission name already exists');
  }

  const permission = await PermissionModel.create({
    name: payload.name,
    resource: payload.resource,
    action: payload.action,
    description: payload.description || null,
  });

  return { permission };
}

async function handlePermissionUpdate(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing permission id');

  const updated = await PermissionModel.update(payload.id, {
    name: payload.name,
    resource: payload.resource,
    action: payload.action,
    description: payload.description,
  });

  return { permission: updated };
}

async function handlePermissionDelete(job: Job): Promise<Record<string, any>> {
  const payload = job.payload || {};
  if (!payload.id) throw new Error('Missing permission id');
  await PermissionModel.delete(payload.id);
  return { deleted: payload.id };
}

export async function runJobHandler(job: Job): Promise<Record<string, any>> {
  switch (job.type) {
    case 'images.import':
      return handleImagesImport(job);
    case 'images.extract':
      return handleImagesExtract(job);
    case 'images.download':
      return handleImagesDownload(job);
    case 'images.manual':
      return handleImagesManual(job);
    case 'images.attach':
      return handleImagesAttach(job);
    case 'images.remote':
      return handleImagesRemote(job);
    case 'images.scan':
      return handleImagesScan();
    case 'images.delete':
      return handleImagesDelete(job);
    case 'config.update':
      return handleConfigUpdate(job);
    case 'config.dnsmasq.regenerate':
      return handleConfigRegenerateDnsmasq();
    case 'config.dnsmasq.restart':
      return handleConfigRestartDnsmasq();
    case 'config.ipxe.regenerate':
      return handleConfigRegenerateIpxe();
    case 'clients.update':
      return handleClientUpdate(job);
    case 'clients.delete':
      return handleClientDelete(job);
    case 'clients.reboot':
      return handleClientReboot(job);
    case 'clients.shutdown':
      return handleClientShutdown(job);
    case 'clients.install':
      return handleClientInstall(job);
    case 'users.create':
      return handleUserCreate(job);
    case 'users.update':
      return handleUserUpdate(job);
    case 'users.delete':
      return handleUserDelete(job);
    case 'roles.create':
      return handleRoleCreate(job);
    case 'roles.update':
      return handleRoleUpdate(job);
    case 'roles.delete':
      return handleRoleDelete(job);
    case 'permissions.create':
      return handlePermissionCreate(job);
    case 'permissions.update':
      return handlePermissionUpdate(job);
    case 'permissions.delete':
      return handlePermissionDelete(job);
    default:
      logger.warn('Unhandled job type', { jobType: job.type, jobId: job.id });
      throw new Error(`Unhandled job type: ${job.type}`);
  }
}
