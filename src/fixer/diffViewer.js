import { createTwoFilesPatch } from 'diff';
import chalk from 'chalk';

/**
 * Renders a colorized unified diff to the console.
 *
 * @param {string} originalContent - The original file content.
 * @param {string} newContent - The proposed new file content.
 * @param {string} filePath - File path used as the diff header label.
 */
export function renderDiff(originalContent, newContent, filePath) {
  const patch = createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    originalContent,
    newContent,
    '',
    '',
    { context: 4 }
  );

  const lines = patch.split('\n');

  console.log('');
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      console.log(chalk.bold.white(line));
    } else if (line.startsWith('@@')) {
      console.log(chalk.cyan(line));
    } else if (line.startsWith('+')) {
      console.log(chalk.green(line));
    } else if (line.startsWith('-')) {
      console.log(chalk.red(line));
    } else {
      console.log(chalk.dim(line));
    }
  }
  console.log('');
}

/**
 * Renders diffs for multiple files.
 *
 * @param {Array<{path: string, original: string, updated: string}>} changes
 */
export function renderAllDiffs(changes) {
  for (const { path, original, updated } of changes) {
    console.log(chalk.bold.yellow(`\n  ── ${path} ──`));
    renderDiff(original, updated, path);
  }
}
