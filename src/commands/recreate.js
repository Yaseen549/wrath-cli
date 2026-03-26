import { resolve, join } from 'path';
import fse from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as readline from 'readline';
import { generateProject } from '../creator/generateProject.js';
import { logger } from '../utils/logger.js';

// ── Helper: Multi-line terminal input ──────────────────────────────────────

async function readMultilineFromTerminal() {
  console.log(chalk.cyan('Enter your NEW project description (Paste as many lines as you want).'));
  console.log(chalk.dim('Press Enter TWICE (two blank lines) to submit.'));
  console.log(chalk.dim('──────────────────────────────────────────────────────────────────\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  const lines = [];
  let emptyLineCount = 0;

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line.trim() === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          rl.close();
        }
      } else {
        if (emptyLineCount === 1) {
          lines.push('');
        }
        emptyLineCount = 0;
        lines.push(line);
      }
    });

    rl.on('close', () => {
      resolve(lines.join('\n').trim());
    });
  });
}

// ── Helper: Controlled Demolition ──────────────────────────────────────────

async function cleanDirectory(targetDir) {
  const items = await fse.readdir(targetDir);

  let deletedCount = 0;
  let keptCount = 0;

  for (const item of items) {
    // 🛡️ PRESERVATION RULES 🛡️
    if (
      item === '.git' ||
      item.startsWith('.env') ||
      item.endsWith('ignore')
    ) {
      keptCount++;
      continue;
    }

    // Delete everything else
    await fse.remove(join(targetDir, item));
    deletedCount++;
  }

  return { deletedCount, keptCount };
}

// ── Main command ──────────────────────────────────────────────────────────

export async function recreateCommand(descriptionArg, options) {
  const targetDir = resolve(process.cwd(), options.dir || '.');
  let description = descriptionArg;

  // 1. Get the new description via Terminal
  if (!description) {
    description = await readMultilineFromTerminal();

    if (!description) {
      logger.error('No description provided. Aborting.');
      process.exit(1);
    }
    
    // Wipe the terminal clean
    console.clear();
  }

  logger.banner();
  logger.warn(chalk.red.bold('WARNING: DESTRUCTIVE ACTION'));
  console.log(`  You are about to wipe the current directory: ${chalk.cyan(targetDir)}`);
  console.log(`  We will KEEP: ${chalk.green('.git, .env*, and *ignore files')}`);
  console.log(`  Everything else will be ${chalk.red.underline('PERMANENTLY DELETED')} before recreating.\n`);

  // 2. Ask for confirmation before destroying files
  const { confirmWipe } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmWipe',
      message: chalk.bold.red('Are you absolutely sure you want to wipe and recreate this project?'),
      default: false,
    },
  ]);

  if (!confirmWipe) {
    logger.info('Action canceled. Your files are safe.');
    return;
  }

  // 3. Execute the wipe
  logger.divider();
  logger.info('Wiping directory...');
  try {
    const stats = await cleanDirectory(targetDir);
    logger.success(`Wiped ${stats.deletedCount} items. Kept ${stats.keptCount} safe items.`);
  } catch (err) {
    logger.error(`Failed to wipe directory: ${err.message}`);
    process.exit(1);
  }

  logger.blank();
  const firstLine = description.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Recreating project: ${chalk.italic.white(`"${preview}"`)}`);
  logger.divider();

  // 4. Re-scaffold the new project
  try {
    await generateProject(description, targetDir, {
      runInstall: options.install !== false,
      runGitInit: false, // We preserved the .git folder, so no need to init again
    });
  } catch (err) {
    logger.error(`Project recreation failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }

  logger.divider();
  logger.blank();
  console.log(chalk.bold.green('  ♻️  Project recreated successfully!'));
  logger.blank();
  console.log(`  Next steps:`);
  console.log(`    ${chalk.cyan('wrath init')}   ${chalk.dim('# re-index the fresh codebase')}`);
  logger.blank();
}