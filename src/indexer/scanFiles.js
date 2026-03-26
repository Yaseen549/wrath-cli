import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import ignore from 'ignore';
import { existsSync } from 'fs';
import { IGNORED_DIRS, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "../config.js";

/**
 * Reads and parses .gitignore from the project root.
 * Returns an `ignore` instance.
 */
async function loadGitignore(rootDir) {
  const ig = ignore();
  ig.add(IGNORED_DIRS);

  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8');
    ig.add(content);
  }

  return ig;
}

/**
 * Recursively walks a directory and returns all eligible file paths.
 * @param {string} rootDir - Absolute path to the project root.
 * @returns {Promise<string[]>} Array of relative file paths.
 */
export async function scanFiles(rootDir) {
  const ig = await loadGitignore(rootDir);
  const results = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(rootDir, fullPath);

      // Normalize path separators for cross-platform compatibility
      const normalizedRelative = relativePath.replace(/\\/g, '/');

      // Skip ignored paths
      if (ig.ignores(normalizedRelative)) continue;

      // Skip hard-coded ignored directory names regardless of depth
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.includes(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        const name = basename(entry.name);

        // Check by extension or exact filename (e.g. Dockerfile, Makefile)
        const isSupported =
          SUPPORTED_EXTENSIONS.includes(ext) ||
          SUPPORTED_EXTENSIONS.includes(name);

        if (!isSupported) continue;

        // Skip files that exceed the max size limit
        try {
          const fileStat = await stat(fullPath);
          if (fileStat.size > MAX_FILE_SIZE_BYTES) continue;
        } catch {
          continue;
        }

        results.push(normalizedRelative);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}
