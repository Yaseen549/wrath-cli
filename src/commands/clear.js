import { join } from 'path';
import fse from 'fs-extra';
import inquirer from 'inquirer';
import { logger } from '../utils/logger.js';
import { WRATH_DIR } from '../config.js';

export async function clearCommand() {
  const cwd = process.cwd();
  const wrathDir = join(cwd, WRATH_DIR);

  if (!(await fse.pathExists(wrathDir))) {
    logger.warn('No .wrath directory found. Nothing to clear.');
    return;
  }

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'This will delete the .wrath directory and all index data. Are you sure?',
      default: false,
    },
  ]);

  if (!confirmed) {
    logger.info('Clear cancelled.');
    return;
  }

  try {
    await fse.remove(wrathDir);
    logger.success('Deleted .wrath directory. Run `wrath init` to re-index.');
  } catch (err) {
    logger.error(`Failed to remove .wrath: ${err.message}`);
    process.exit(1);
  }
}
