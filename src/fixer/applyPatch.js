import { writeFile } from 'fs/promises';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../utils/logger.js';

/**
 * Applies a set of file changes to disk.
 *
 * @param {Array<{path: string, updated: string}>} changes - Files to write.
 * @param {string} rootDir - The project root directory.
 * @returns {Promise<string[]>} Paths of successfully written files.
 */
export async function applyPatch(changes, rootDir) {
  const written = [];

  for (const { path: relPath, updated } of changes) {
    const absPath = join(rootDir, relPath);

    try {
      // Ensure parent directory exists
      await fse.ensureDir(join(absPath, '..'));
      await writeFile(absPath, updated, 'utf-8');
      logger.success(`Wrote: ${relPath}`);
      written.push(relPath);
    } catch (err) {
      logger.error(`Failed to write ${relPath}: ${err.message}`);
    }
  }

  return written;
}
