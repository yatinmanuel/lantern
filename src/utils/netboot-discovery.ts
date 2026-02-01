import { PXEConfigModel } from '../database/models.js';
import type { NetbootDistro, NetbootMirror } from '../database/models.js';
import { NetbootVersionModel } from '../database/models.js';
import { logger } from './logger.js';

const EOL_DAYS = 90;

/** User-Agent for mirror requests; many mirrors block or throttle requests without one. */
const MIRROR_USER_AGENT =
  'PXE-Netboot-Discovery/1.0 (+https://github.com; mirror discovery for PXE installers)';

/**
 * Fetch a URL and return response text. Uses proxy from config if set (requires undici).
 * Sends a User-Agent so mirrors (Debian, Ubuntu, Fedora, etc.) do not block the request.
 */
export async function fetchWithProxy(url: string): Promise<string> {
  const httpProxy = await PXEConfigModel.get('http_proxy');
  const httpsProxy = await PXEConfigModel.get('https_proxy');
  const proxy = (httpsProxy || httpProxy)?.trim();

  const headers: Record<string, string> = {
    'User-Agent': MIRROR_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
  };

  if (proxy) {
    const { fetch: undiciFetch, ProxyAgent } = await import('undici');
    const response = await undiciFetch(url, {
      dispatcher: new ProxyAgent(proxy),
      redirect: 'follow',
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    return response.text();
  }

  const fetchFn = (globalThis as unknown as { fetch?: (u: string, o?: RequestInit) => Promise<Response> }).fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }
  const response = await fetchFn(url, { redirect: 'follow', headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

/**
 * Test mirror connectivity by fetching the base URL or versions path.
 */
export async function testMirrorConnection(mirror: NetbootMirror, distro: NetbootDistro): Promise<boolean> {
  const baseUrl = mirror.url.replace(/\/+$/, '');
  const testPath = distro.versions_discovery_path
    ? `${baseUrl}${distro.versions_discovery_path}`
    : baseUrl;
  try {
    await fetchWithProxy(testPath);
    return true;
  } catch (err) {
    logger.warn('Mirror test failed', { url: testPath, error: err });
    return false;
  }
}

/**
 * Parse Apache/Nginx-style directory listing HTML for link hrefs (directory names).
 * Expects links like <a href="bookworm/"> or <a href='40/'>.
 */
function parseDirectoryLinks(html: string): string[] {
  const links: string[] = [];
  // Match both double- and single-quoted hrefs
  const hrefRegex = /<a\s+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRegex.exec(html)) !== null) {
    const href = m[1].trim();
    if (href === '../' || href === '..' || href.startsWith('?')) continue;
    const name = href.replace(/\/+$/, '');
    if (name && !name.includes('/')) {
      links.push(name);
    }
  }
  return [...new Set(links)];
}

/**
 * Filter link names by distro version_regex. Regex may have one capture group for display.
 */
function filterVersions(links: string[], versionRegex: string | null): { version: string; display_name: string }[] {
  if (!versionRegex) return links.map((v) => ({ version: v, display_name: v }));
  let re: RegExp;
  try {
    re = new RegExp(versionRegex);
  } catch {
    return links.map((v) => ({ version: v, display_name: v }));
  }
  const result: { version: string; display_name: string }[] = [];
  for (const link of links) {
    const match = link.match(re);
    if (match) {
      const version = match[1] ?? match[0];
      result.push({ version: link, display_name: version });
    }
  }
  return result;
}

/**
 * Discover available versions for a mirror by fetching and parsing the versions path.
 * For rolling releases (no versions_discovery_path), returns a single "rolling" version.
 */
export async function discoverVersions(
  mirror: NetbootMirror,
  distro: NetbootDistro
): Promise<{ version: string; display_name: string }[]> {
  if (!distro.versions_discovery_path) {
    return [{ version: 'rolling', display_name: 'Rolling' }];
  }

  const baseUrl = mirror.url.replace(/\/+$/, '');
  const versionsUrl = `${baseUrl}${distro.versions_discovery_path}`;
  const html = await fetchWithProxy(versionsUrl);
  const links = parseDirectoryLinks(html);
  return filterVersions(links, distro.version_regex);
}

/**
 * Refresh versions for a single mirror: discover, upsert, mark missing as unavailable, mark EOL.
 */
export async function refreshMirrorVersions(mirrorId: string): Promise<void> {
  const { NetbootDistroModel, NetbootMirrorModel } = await import('../database/models.js');
  const mirror = await NetbootMirrorModel.findById(mirrorId);
  if (!mirror) throw new Error('Mirror not found');
  const distro = await NetbootDistroModel.findById(mirror.distro_id);
  if (!distro) throw new Error('Distro not found');

  const versions = await discoverVersions(mirror, distro);
  const seenVersions = versions.map((v) => v.version);

  await NetbootVersionModel.upsertMany(mirrorId, versions);
  await NetbootVersionModel.markMissingUnavailable(mirrorId, seenVersions);
  await NetbootVersionModel.markEolOlderThan(mirrorId, EOL_DAYS);
}
