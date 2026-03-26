import { join } from 'path';
import { readFile } from 'fs/promises';
import fse from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as readline from 'readline';
import { logger } from './logger.js';
import { INDEX_PATH } from '../config.js';
import { findRelevantFiles } from '../fixer/findRelevantFiles.js';
import { callAI } from '../fixer/aiClient.js';
import { renderAllDiffs } from '../fixer/diffViewer.js';
import { applyPatch } from '../fixer/applyPatch.js';
import { updateIndex } from '../indexer/updateIndex.js';

async function readMultilineFromTerminal() {
  console.log(chalk.magenta('Describe how you want to enhance the UI (Paste as many lines as you want).'));
  console.log(chalk.dim('Example: "Make it look like a modern SaaS dashboard with Tailwind, dark mode, and glassmorphism."'));
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
        if (emptyLineCount >= 2) rl.close();
      } else {
        if (emptyLineCount === 1) lines.push('');
        emptyLineCount = 0;
        lines.push(line);
      }
    });
    rl.on('close', () => {
      resolve(lines.join('\n').trim());
    });
  });
}

function buildUiSystemPrompt() {
  return `You are an expert Frontend Developer, UI/UX Designer, and CSS wizard.
The user wants to enhance the user interface of their project to look highly professional, modern, and polished.
You will receive the user's specific design request and the relevant UI files.
Improve the styling, layout, accessibility, and overall aesthetic. Use the existing styling framework (e.g., Tailwind, CSS modules, plain CSS) unless asked otherwise.

You MUST respond with a valid JSON object in this exact shape:
{
  "explanation": "A clear explanation of the design improvements made.",
  "changes": [
    {
      "path": "relative/path/to/file.js",
      "content": "...the complete new content of the file..."
    }
  ]
}

Rules:
- Only include files that actually need to change in "changes".
- Always provide the FULL file content, not a partial patch.
- Respond with raw JSON only — no markdown fences, no extra commentary.`;
}

function buildUiUserMessage(uiRequest, fileContents) {
  const filesSection = fileContents
    .map(({ path, content }) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');
  return `## UI Enhancement Request\n${uiRequest}\n\n## Relevant Source Files\n${filesSection}`;
}

export async function uiCommand(uiRequestArg, options) {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);
  let uiRequest = uiRequestArg;

  if (!uiRequest) {
    uiRequest = await readMultilineFromTerminal();
    if (!uiRequest) {
      logger.error('No description provided. Aborting.');
      process.exit(1);
    }
    console.clear();
  }

  if (!(await fse.pathExists(indexPath))) {
    logger.error('No WRATH index found. Run `wrath init` first.');
    process.exit(1);
  }

  let index = await fse.readJson(indexPath);

  logger.banner();
  const firstLine = uiRequest.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Enhancing UI: ${chalk.italic.magenta(preview)}`);
  logger.divider();

  // Find relevant files (we prompt the AI to look for components/styles)
  let relevantPaths = await findRelevantFiles(index, `I am enhancing the UI: ${uiRequest}. Find the relevant React components, HTML, CSS, or styling files needed for this.`);
  
  const fileContents = [];
  for (const relPath of relevantPaths) {
    try {
      const content = await readFile(join(cwd, relPath), 'utf-8');
      fileContents.push({ path: relPath, content });
    } catch (err) {}
  }

  logger.info('Sending UI context to AI for design generation…');

  const raw = await callAI(
    buildUiSystemPrompt(),
    buildUiUserMessage(uiRequest, fileContents),
    { expectJson: true, maxTokens: 8192 }
  );

  const aiResponse = JSON.parse(raw);

  logger.blank();
  logger.divider();
  console.log(chalk.bold.magenta('\n  ✨ UI Design Plan\n'));
  console.log(aiResponse.explanation.split('\n').map((l) => `  ${chalk.white(l)}`).join('\n'));
  logger.blank();

  if (aiResponse.changes.length === 0) return;

  const changes = aiResponse.changes.map(change => ({
    path: change.path,
    original: fileContents.find((f) => f.path === change.path)?.content ?? '',
    updated: change.content,
  }));

  console.log(chalk.bold.white('  📋 Proposed UI Changes\n'));
  renderAllDiffs(changes);

  if (options.dryRun) return;

  const { apply } = await inquirer.prompt([
    { type: 'confirm', name: 'apply', message: chalk.bold(`Apply ${changes.length} UI change(s)?`), default: true }
  ]);

  if (!apply) return;

  const writtenPaths = await applyPatch(changes, cwd);
  const updatedIndex = await updateIndex(index, writtenPaths, cwd);
  await fse.writeJson(indexPath, updatedIndex, { spaces: 2 });

  logger.blank();
  logger.success(`UI enhanced! Modified ${writtenPaths.length} file(s).`);
  logger.blank();
}