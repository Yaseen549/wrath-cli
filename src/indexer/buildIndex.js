import { readFile } from 'fs/promises';
import { join } from 'path';
import { scanFiles } from './scanFiles.js';
import { hashFile } from '../utils/hashFile.js';
import { logger } from '../utils/logger.js';

/**
 * Parses a file's content to extract imports, exports, functions, and classes
 * using regex-based heuristics. Works across JS/TS/JSX/TSX and Python.
 */
function parseFileContent(content, filePath) {
  const imports = [];
  const exports = [];
  const functions = [];
  const classes = [];

  const ext = filePath.split('.').pop().toLowerCase();

  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'].includes(ext)) {
    // ES module imports
    const importMatches = content.matchAll(
      /^\s*import\s+(?:[\w*{},\s]+from\s+)?['"]([^'"]+)['"]/gm
    );
    for (const m of importMatches) imports.push(m[1]);

    // require() calls
    const requireMatches = content.matchAll(
      /require\(\s*['"]([^'"]+)['"]\s*\)/g
    );
    for (const m of requireMatches) imports.push(m[1]);

    // Named exports
    const namedExportMatches = content.matchAll(
      /^\s*export\s+(?:default\s+)?(?:function|class|const|let|var|async function)\s+([\w$]+)/gm
    );
    for (const m of namedExportMatches) exports.push(m[1]);

    // export { ... }
    const bracketExportMatches = content.matchAll(/export\s+\{([^}]+)\}/g);
    for (const m of bracketExportMatches) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim());
      exports.push(...names.filter(Boolean));
    }

    // Function declarations
    const fnMatches = content.matchAll(
      /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/gm
    );
    for (const m of fnMatches) functions.push(m[1]);

    // Arrow function assignments
    const arrowMatches = content.matchAll(
      /(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?\(/gm
    );
    for (const m of arrowMatches) functions.push(m[1]);

    // Class declarations
    const classMatches = content.matchAll(/^\s*(?:export\s+)?class\s+([\w$]+)/gm);
    for (const m of classMatches) classes.push(m[1]);
  } else if (ext === 'py') {
    // Python imports
    const pyImportMatches = content.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm);
    for (const m of pyImportMatches) imports.push(m[1]);

    // Python def
    const pyFnMatches = content.matchAll(/^\s*def\s+([\w]+)\s*\(/gm);
    for (const m of pyFnMatches) functions.push(m[1]);

    // Python class
    const pyClassMatches = content.matchAll(/^\s*class\s+([\w]+)/gm);
    for (const m of pyClassMatches) classes.push(m[1]);
  }

  // Deduplicate
  return {
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
  };
}

/**
 * Generates a short summary of the file based on its parsed content.
 */
function generateSummary(parsed, filePath) {
  const parts = [];
  if (parsed.classes.length) parts.push(`Classes: ${parsed.classes.join(', ')}`);
  if (parsed.functions.length) parts.push(`Functions: ${parsed.functions.slice(0, 5).join(', ')}`);
  if (parsed.exports.length) parts.push(`Exports: ${parsed.exports.join(', ')}`);
  if (!parts.length) return `File: ${filePath}`;
  return parts.join(' | ');
}

/**
 * Builds the full index from scratch for the project at rootDir.
 * @param {string} rootDir - Absolute path to the project root.
 * @returns {Promise<object>} The complete index object.
 */
export async function buildIndex(rootDir) {
  logger.info('Scanning project files…');
  const files = await scanFiles(rootDir);
  logger.info(`Found ${files.length} eligible file(s).`);

  const index = {
    files: {},
    lastScan: Date.now(),
  };

  let processed = 0;
  for (const relPath of files) {
    const absPath = join(rootDir, relPath);
    try {
      const [content, hash] = await Promise.all([
        readFile(absPath, 'utf-8'),
        hashFile(absPath),
      ]);

      const { imports, exports, functions, classes } = parseFileContent(content, relPath);
      const summary = generateSummary({ imports, exports, functions, classes }, relPath);

      const fileStat = await import('fs/promises').then((fs) => fs.stat(absPath));

      index.files[relPath] = {
        hash,
        imports,
        exports,
        functions,
        classes,
        summary,
        lastModified: fileStat.mtimeMs,
      };
    } catch (err) {
      logger.warn(`Could not index ${relPath}: ${err.message}`);
    }
    processed++;
    if (processed % 20 === 0) {
      logger.info(`  Indexed ${processed}/${files.length} files…`);
    }
  }

  return index;
}
