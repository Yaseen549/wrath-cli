import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { hashFile } from '../utils/hashFile.js';
import { logger } from '../utils/logger.js';
import { buildIndex } from './buildIndex.js';

/**
 * Re-indexes only the specified files within an existing index.
 * Adds new entries, updates changed ones, and removes deleted ones.
 *
 * @param {object} existingIndex - The current index object.
 * @param {string[]} filePaths - Relative paths to files that were modified.
 * @param {string} rootDir - Absolute path to the project root.
 * @returns {Promise<object>} Updated index object.
 */
export async function updateIndex(existingIndex, filePaths, rootDir) {
  const index = { ...existingIndex, files: { ...existingIndex.files } };

  for (const relPath of filePaths) {
    const absPath = join(rootDir, relPath);

    // Check if file still exists
    let fileExists = true;
    try {
      await stat(absPath);
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      delete index.files[relPath];
      logger.info(`Removed deleted file from index: ${relPath}`);
      continue;
    }

    try {
      const content = await readFile(absPath, 'utf-8');
      const hash = await hashFile(absPath);
      const fileStat = await stat(absPath);

      // Dynamically import parsing logic from buildIndex
      const { parseFileContent, generateSummary } = await importParseHelpers();
      const parsed = parseFileContent(content, relPath);
      const summary = generateSummary(parsed, relPath);

      index.files[relPath] = {
        hash,
        imports: parsed.imports,
        exports: parsed.exports,
        functions: parsed.functions,
        classes: parsed.classes,
        summary,
        lastModified: fileStat.mtimeMs,
      };

      logger.info(`Updated index for: ${relPath}`);
    } catch (err) {
      logger.warn(`Could not update index for ${relPath}: ${err.message}`);
    }
  }

  index.lastScan = Date.now();
  return index;
}

/**
 * Inline re-implementation of parse helpers to avoid circular imports.
 * Matches the logic in buildIndex.js.
 */
async function importParseHelpers() {
  function parseFileContent(content, filePath) {
    const imports = [];
    const exports = [];
    const functions = [];
    const classes = [];
    const ext = filePath.split('.').pop().toLowerCase();

    if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'].includes(ext)) {
      for (const m of content.matchAll(/^\s*import\s+(?:[\w*{},\s]+from\s+)?['"]([^'"]+)['"]/gm))
        imports.push(m[1]);
      for (const m of content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g))
        imports.push(m[1]);
      for (const m of content.matchAll(
        /^\s*export\s+(?:default\s+)?(?:function|class|const|let|var|async function)\s+([\w$]+)/gm
      )) exports.push(m[1]);
      for (const m of content.matchAll(/export\s+\{([^}]+)\}/g))
        exports.push(...m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean));
      for (const m of content.matchAll(
        /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/gm
      )) functions.push(m[1]);
      for (const m of content.matchAll(
        /(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?\(/gm
      )) functions.push(m[1]);
      for (const m of content.matchAll(/^\s*(?:export\s+)?class\s+([\w$]+)/gm))
        classes.push(m[1]);
    } else if (ext === 'py') {
      for (const m of content.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm)) imports.push(m[1]);
      for (const m of content.matchAll(/^\s*def\s+([\w]+)\s*\(/gm)) functions.push(m[1]);
      for (const m of content.matchAll(/^\s*class\s+([\w]+)/gm)) classes.push(m[1]);
    }

    return {
      imports: [...new Set(imports)],
      exports: [...new Set(exports)],
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
    };
  }

  function generateSummary(parsed, filePath) {
    const parts = [];
    if (parsed.classes.length) parts.push(`Classes: ${parsed.classes.join(', ')}`);
    if (parsed.functions.length) parts.push(`Functions: ${parsed.functions.slice(0, 5).join(', ')}`);
    if (parsed.exports.length) parts.push(`Exports: ${parsed.exports.join(', ')}`);
    if (!parts.length) return `File: ${filePath}`;
    return parts.join(' | ');
  }

  return { parseFileContent, generateSummary };
}
