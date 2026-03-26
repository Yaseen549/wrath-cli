import { callAI } from './aiClient.js';
import { logger } from '../utils/logger.js';
import { MAX_CONTEXT_FILES } from '../config.js';

/**
 * Uses the AI to analyse the index summary and select the files most likely
 * relevant to the given error message.
 *
 * @param {object} index - The full WRATH index object.
 * @param {string} errorMessage - The error text from the user.
 * @returns {Promise<string[]>} Array of relative file paths to read.
 */
export async function findRelevantFiles(index, errorMessage) {
  const fileSummaries = Object.entries(index.files)
    .map(([path, meta]) => `${path}: ${meta.summary}`)
    .join('\n');

  const systemPrompt = `You are an expert software engineer and code analyst.
You will be given a JSON index of a codebase (one line per file with a summary) and an error message.
Your task: identify which files are most likely the root cause of the error, or need to be read to fix it.

Respond ONLY with a valid JSON array of relative file paths (strings). No explanation. No markdown.
Maximum ${MAX_CONTEXT_FILES} files. Order by relevance descending.
Example: ["src/app.js", "src/utils/parser.js"]`;

  const userMessage = `## Error Message
${errorMessage}

## Codebase File Index
${fileSummaries}`;

  logger.info('Asking AI to identify relevant files…');

  let raw;
  try {
    raw = await callAI(systemPrompt, userMessage, { expectJson: true, maxTokens: 1024 });
  } catch (err) {
    logger.error(`AI request failed: ${err.message}`);
    throw err;
  }

  let paths;
  try {
    paths = JSON.parse(raw);
  } catch {
    logger.warn('AI returned non-JSON for file list, attempting regex extraction…');
    const matches = raw.match(/"([^"]+\.[a-z]{1,6})"/g);
    if (matches) {
      paths = matches.map((m) => m.replace(/"/g, ''));
    } else {
      throw new Error('Could not parse relevant files from AI response: ' + raw);
    }
  }

  if (!Array.isArray(paths)) {
    throw new Error('AI did not return an array of file paths.');
  }

  // Filter to only files that actually exist in the index
  const validPaths = paths.filter((p) => index.files[p]);

  if (validPaths.length === 0) {
    logger.warn('AI returned no paths that match indexed files. Falling back to top 5 by recency.');
    return Object.entries(index.files)
      .sort((a, b) => b[1].lastModified - a[1].lastModified)
      .slice(0, 5)
      .map(([p]) => p);
  }

  return validPaths.slice(0, MAX_CONTEXT_FILES);
}
