
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
