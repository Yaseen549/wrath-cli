import { resolve } from 'path';
import chalk from 'chalk';
import * as readline from 'readline';
import { generateProject } from '../creator/generateProject.js';
import { logger } from '../utils/logger.js';

// Helper function to capture multi-line terminal input
async function readMultilineFromTerminal() {
  console.log(chalk.cyan('Enter your project description (Paste as many lines as you want).'));
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
        // If the user hits enter twice, submit!
        if (emptyLineCount >= 2) {
          rl.close();
        }
      } else {
        // If there was a single empty line previously, keep it
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

export async function createCommand(descriptionArg, options) {
  const targetDir = resolve(process.cwd(), options.dir || '.');
  let description = descriptionArg;

  // If no description was passed inline, read directly from the terminal
  if (!description) {
    description = await readMultilineFromTerminal();

    if (!description) {
      logger.error('No description provided. Aborting.');
      process.exit(1);
    }
    
    // Wipe the terminal clean so the pasted text doesn't ruin your design!
    console.clear(); 
  }

  logger.banner();
  
  // Show a clean, 1-line preview instead of dumping the whole text
  const firstLine = description.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Creating project: ${chalk.italic.white(`"${preview}${description.includes('\n') && firstLine.length <= 60 ? '...' : ''}"`)}`);
  logger.divider();

  try {
    await generateProject(description, targetDir, {
      runInstall: options.install !== false,
      runGitInit: options.git !== false,
    });
  } catch (err) {
    logger.error(`Project generation failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }

  logger.divider();
  logger.blank();
  console.log(chalk.bold.green('  ✅ Project created successfully!'));
  logger.blank();
  console.log(`  Next steps:`);
  console.log(`    ${chalk.cyan('cd')} ${chalk.white(targetDir)}`);
  console.log(`    ${chalk.cyan('wrath init')}   ${chalk.dim('# index the codebase')}`);
  console.log(`    ${chalk.cyan('wrath status')} ${chalk.dim('# check the index')}`);
  logger.blank();
}