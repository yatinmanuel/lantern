
import { getPool } from './index.js';
import { logger } from '../utils/logger.js';

export async function migrateDefaultMenu() {
  const db = getPool();
  
  // Check if default menu exists
  const defaultMenu = await db.query('SELECT id FROM boot_menus WHERE is_default = true');
  if (defaultMenu.rows.length > 0) {
    return; // Already migrated
  }

  // Get all ISO entries
  const isos = await db.query('SELECT * FROM iso_entries ORDER BY label');
  
  const menuContent = isos.rows.map(iso => ({
    type: 'iso',
    isoId: iso.id, // We'll need to make sure we use ID or Name consistently. Using Name for portability.
    isoName: iso.iso_name,
    label: iso.label
  }));

  // Create default menu
  await db.query(
    `INSERT INTO boot_menus (name, description, content, is_default)
     VALUES ($1, $2, $3, $4)`,
    ['Default Menu', 'Automatically created from existing images', JSON.stringify(menuContent), true]
  );
  
  logger.info(`Migrated ${isos.rows.length} ISOs to new Default Menu`);
}

/** Replace poweroff with shell in all boot menu content (power off option removed). */
function replacePoweroffInContent(content: any[]): { content: any[]; changed: boolean } {
  let changed = false;
  const out = content.map((item: any) => {
    if (!item || typeof item !== 'object') return item;
    if (item.type === 'power_state' && item.action === 'poweroff') {
      changed = true;
      return { ...item, action: 'shell' };
    }
    if (item.type === 'folder' && Array.isArray(item.children)) {
      const childResult = replacePoweroffInContent(item.children);
      if (childResult.changed) {
        changed = true;
        return { ...item, children: childResult.content };
      }
    }
    return item;
  });
  return { content: out, changed };
}

export async function migratePoweroffToShell() {
  const db = getPool();
  const menus = await db.query('SELECT id, content FROM boot_menus');
  for (const row of menus.rows) {
    const result = replacePoweroffInContent(row.content || []);
    if (result.changed) {
      await db.query('UPDATE boot_menus SET content = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(result.content),
        row.id,
      ]);
      logger.info(`Migrated boot menu ${row.id}: poweroff -> shell`);
    }
  }
}
