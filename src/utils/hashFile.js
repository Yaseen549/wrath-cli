import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

/**
 * Generates a SHA-256 hash of the file at the given path.
 * @param {string} filePath - Absolute or relative path to the file.
 * @returns {Promise<string>} Hex-encoded hash string.
 */
export async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generates a SHA-256 hash from an in-memory string (e.g., file content).
 * @param {string} content - The string content to hash.
 * @returns {string} Hex-encoded hash string.
 */
export function hashContent(content) {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
