import { join } from 'path';
import fse from 'fs-extra';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { INDEX_PATH } from '../config.js';

export async function statusCommand() {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);

  if (!(await fse.pathExists(indexPath))) {
    logger.error('No WRATH index found. Run `wrath init` first.');
    process.exit(1);
  }

  let index;
  try {
    index = await fse.readJson(indexPath);
  } catch (err) {
    logger.error(`Could not read index: ${err.message}`);
    process.exit(1);
  }

  const fileCount = Object.keys(index.files).length;
  const lastScan = new Date(index.lastScan).toLocaleString();

  // Breakdown by extension
  const extCounts = {};
  for (const filePath of Object.keys(index.files)) {
    const ext = filePath.split('.').pop() || 'unknown';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const topExts = Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  logger.blank();
  console.log(chalk.bold.hex('#FF4500')('  ⚡ WRATH Index Status'));
  logger.divider();
  console.log(`  ${chalk.dim('Project root:')}   ${chalk.white(cwd)}`);
  console.log(`  ${chalk.dim('Index file:')}     ${chalk.white(INDEX_PATH)}`);
  console.log(`  ${chalk.dim('Files tracked:')}  ${chalk.green.bold(fileCount)}`);
  console.log(`  ${chalk.dim('Last scan:')}      ${chalk.white(lastScan)}`);
  logger.blank();

  if (topExts.length > 0) {
    console.log(chalk.bold('  📊 File types'));
    for (const [ext, count] of topExts) {
      const bar = '█'.repeat(Math.min(Math.ceil(count / fileCount * 20), 20));
      console.log(
        `  ${chalk.cyan('.' + ext).padEnd(14)} ${chalk.green(bar)} ${chalk.dim(count)}`
      );
    }
  }

  logger.blank();
}
