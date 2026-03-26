import { join } from 'path';
import fse from 'fs-extra';
import chalk from 'chalk';
import { buildIndex } from '../indexer/buildIndex.js';
import { logger } from '../utils/logger.js';
import { WRATH_DIR, INDEX_PATH } from '../config.js';

export async function initCommand(options) {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);
  const wrathDir = join(cwd, WRATH_DIR);

  // Check if already indexed and not forced
  if (!options.force && (await fse.pathExists(indexPath))) {
    logger.warn('Project is already indexed. Use --force to re-index, or run `wrath reindex`.');
    return;
  }

  logger.banner();
  logger.info(`Initializing WRATH index for: ${chalk.cyan(cwd)}`);
  logger.divider();

  const startTime = Date.now();

  let index;
  try {
    index = await buildIndex(cwd);
  } catch (err) {
    logger.error(`Failed to build index: ${err.message}`);
    process.exit(1);
  }

  await fse.ensureDir(wrathDir);
  await fse.writeJson(indexPath, index, { spaces: 2 });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const fileCount = Object.keys(index.files).length;

  logger.divider();
  logger.success(`Index built in ${chalk.bold(elapsed + 's')}`);
  logger.blank();
  console.log(chalk.bold('  📦 Summary'));
  console.log(`  ${chalk.dim('Files indexed:')}  ${chalk.white.bold(fileCount)}`);
  console.log(`  ${chalk.dim('Index saved to:')} ${chalk.white(INDEX_PATH)}`);
  console.log(`  ${chalk.dim('Scan time:')}     ${chalk.white(new Date(index.lastScan).toLocaleString())}`);
  logger.blank();
  logger.success('WRATH is ready. Run `wrath fix "your error"` to start fixing bugs!');
  logger.blank();
}
