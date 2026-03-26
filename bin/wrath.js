#!/usr/bin/env node

import 'dotenv/config';
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Updated imports to point to the new src/ folder structure
import { createCommand } from '../src/commands/create.js';
import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { fixCommand } from '../src/commands/fix.js';
import { statusCommand } from '../src/commands/status.js';
import { reindexCommand } from '../src/commands/reindex.js';
import { clearCommand } from '../src/commands/clear.js';
import { helpCommand } from '../src/help.js'; // Assuming help.js is in src/
import { recreateCommand } from '../src/commands/recreate.js';
import { runCommand } from '../src/commands/run.js';
import { uiCommand } from '../src/utils/ui.js'; // Assuming ui.js is in src/utils/
import { updateCommand } from '../src/commands/update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ⚡ THE FIX: Pointing up one directory level to find package.json
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .name('wrath')
  .description('⚡ WRATH — AI-powered developer CLI: scaffold, index, and fix your codebase.')
  .version(pkg.version);

program
  .command('create [description]')
  .description('Scaffold a new project from a natural-language description')
  .option('-d, --dir <directory>', 'Target directory for the new project', '.')
  .option('--no-install', 'Skip running npm install after scaffolding')
  .option('--no-git', 'Skip git init after scaffolding')
  .action(createCommand);

program
  .command('init')
  .description('Index the current project into .wrath/index.json')
  .option('-f, --force', 'Force re-index even if index exists')
  .action(initCommand);

program
  .command('fix [error]')
  .description('Diagnose and fix an error using the project index and AI')
  .option('--dry-run', 'Show diff without applying changes')
  .action(fixCommand);

program
  .command('add [feature]')
  .description('Add a new feature, file, or component to the project')
  .option('--dry-run', 'Show diff without applying changes')
  .action(addCommand);

program
  .command('status')
  .description('Show the current state of the WRATH index')
  .action(statusCommand);

program
  .command('reindex')
  .description('Force a full re-scan and rebuild of the project index')
  .action(reindexCommand);

program
  .command('clear')
  .description('Delete the .wrath directory and all index data')
  .action(clearCommand);

program
  .command('help [question]')
  .description('Ask WRATH a question, get clarification, or figure out your next steps')
  .action(helpCommand);

program
  .command('recreate [description]')
  .description('Wipe the current project (keeping .env and ignore files) and scaffold from scratch')
  .option('--no-install', 'Skip running npm install after scaffolding')
  .action(recreateCommand);

program
  .command('run <command>')
  .description('Run a dev server (like "npm start") and automatically catch and fix errors')
  .action(runCommand);

program
  .command('ui [description]')
  .description('Enhance the UI to look professional based on a natural language prompt')
  .option('--dry-run', 'Show diff without applying changes')
  .action(uiCommand);

program
  .command('update [request]')
  .description('Update existing functionality, refactor code, or polish the UI')
  .option('--dry-run', 'Show diff without applying changes')
  .action(updateCommand);

program.parse(process.argv);