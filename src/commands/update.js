import { join } from 'path';
import { readFile } from 'fs/promises';
import fse from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { INDEX_PATH } from '../config.js';
import { findRelevantFiles } from '../fixer/findRelevantFiles.js';
import { callAI } from '../fixer/aiClient.js';
import { renderAllDiffs } from '../fixer/diffViewer.js';
import { applyPatch } from '../fixer/applyPatch.js';
import { updateIndex } from '../indexer/updateIndex.js';

// ── Helper: Multi-line terminal input ──────────────────────────────────────

async function readMultilineFromTerminal() {
  console.log(chalk.cyan('Describe the updates, refactoring, or UI changes you want to make.'));
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

// ── Prompt builders ────────────────────────────────────────────────────────

function buildUpdateSystemPrompt() {
  return `You are an expert software engineer, refactoring specialist, and UI/UX designer.
The user wants to update existing functionality, refactor code, or modify the UI of their project.
You will be given the user's request and the contents of the relevant existing files.
Your task is to safely modify the existing files to implement the requested updates while maintaining clean architecture.

You MUST respond with a valid JSON object in this exact shape:
{
  "explanation": "A clear, concise explanation of what was updated, refactored, or redesigned.",
  "changes": [
    {
      "path": "relative/path/to/file.js",
      "content": "...the complete updated content of the file..."
    }
  ]
}

Rules:
- Provide the FULL updated file content for any file you modify.
- Do not remove existing functionality unless explicitly asked to do so by the user.
- If it is a UI update, ensure modern design practices, proper accessibility, and responsive styling.
- Strictly match the project's existing coding style, framework, and language.
- Respond with raw JSON only — no markdown fences, no extra commentary outside the JSON.`;
}

function buildUpdateUserMessage(updateRequest, fileContents) {
  let message = `## Update Request\n${updateRequest}\n\n`;

  if (fileContents.length > 0) {
    const filesSection = fileContents
      .map(({ path, content }) => `### Context File: ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');
    message += `## Existing Project Context\n${filesSection}`;
  } else {
    message += `## Context\nNo existing files were found. Proceed blindly based on the request.`;
  }

  return message;
}

// ── Main command ──────────────────────────────────────────────────────────

export async function updateCommand(updateRequestArg, options) {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);
  let updateRequest = updateRequestArg;

  // ── 0. Handle Terminal Input ───────────────────────────────────────────────
  if (!updateRequest) {
    updateRequest = await readMultilineFromTerminal();

    if (!updateRequest) {
      logger.error('No update description provided. Aborting.');
      process.exit(1);
    }

    console.clear();
  }

  // ── 1. Load index ────────────────────────────────────────────────────────
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

  logger.banner();

  const firstLine = updateRequest.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Updating project: ${chalk.italic.blue(preview)}`);
  logger.divider();

  // ── 2. Find relevant files for context ───────────────────────────────────
  let relevantPaths = [];
  try {
    logger.info('Analyzing project index for files to update...');
    relevantPaths = await findRelevantFiles(index, `I am updating: ${updateRequest}. Which files need to be modified?`);
  } catch (err) {
    logger.warn(`Could not determine context files, proceeding blindly: ${err.message}`);
  }

  // ── 3. Read file contents ────────────────────────────────────────────────
  const fileContents = [];
  if (relevantPaths.length > 0) {
    logger.info(`Target files identified (${relevantPaths.length}):`);
    for (const relPath of relevantPaths) {
      console.log(`  ${chalk.cyan('→')} ${relPath}`);
      const absPath = join(cwd, relPath);
      try {
        const content = await readFile(absPath, 'utf-8');
        fileContents.push({ path: relPath, content });
      } catch (err) {
        // Ignore files we can't read
      }
    }
    logger.blank();
  }

  // ── 4. Call AI to generate code ──────────────────────────────────────────
  logger.info('Asking AI to generate updates...');

  let raw;
  try {
    raw = await callAI(
      buildUpdateSystemPrompt(),
      buildUpdateUserMessage(updateRequest, fileContents),
      { expectJson: true, maxTokens: 8192 }
    );
  } catch (err) {
    logger.error(`AI request failed: ${err.message}`);
    process.exit(1);
  }

  let aiResponse;
  try {
    aiResponse = JSON.parse(raw);
  } catch {
    logger.error('AI returned invalid JSON. Raw response:');
    console.error(raw.slice(0, 1000));
    process.exit(1);
  }

  if (!aiResponse.changes || !Array.isArray(aiResponse.changes)) {
    logger.error('AI response is missing "changes" array.');
    process.exit(1);
  }

  // ── 5. Show explanation ──────────────────────────────────────────────────
  logger.blank();
  logger.divider();
  console.log(chalk.bold.white('\n  ✨ AI Update Plan\n'));
  console.log(
    aiResponse.explanation
      .split('\n')
      .map((l) => `  ${chalk.blueBright(l)}`)
      .join('\n')
  );
  logger.blank();

  if (aiResponse.changes.length === 0) {
    logger.info('AI did not generate any file updates.');
    return;
  }

  // ── 6. Build change set with original content (if file exists) ───────────
  const changes = [];
  for (const change of aiResponse.changes) {
    let original = '';
    try {
        if (await fse.pathExists(join(cwd, change.path))) {
            original = await readFile(join(cwd, change.path), 'utf-8');
        }
    } catch(e) { /* ignore */ }
    
    changes.push({
      path: change.path,
      original,
      updated: change.content,
    });
  }

  // ── 7. Show colorized diff ───────────────────────────────────────────────
  console.log(chalk.bold.white('  📋 Proposed Updates\n'));
  renderAllDiffs(changes);

  if (options.dryRun) {
    logger.info('Dry run mode — no changes written.');
    return;
  }

  // ── 8. Ask user to confirm ───────────────────────────────────────────────
  const { apply } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'apply',
      message: chalk.bold(`Apply ${changes.length} update(s)?`),
      default: true,
    },
  ]);

  if (!apply) {
    logger.info('Updates discarded. No files were modified.');
    return;
  }

  // ── 9. Apply patch ──────────────────────────────────────────────────────
  const writtenPaths = await applyPatch(changes, cwd);

  // ── 10. Update index for changed files ───────────────────────────────────
  if (writtenPaths.length > 0) {
    logger.info('Updating index for modified files...');
    try {
      const updatedIndex = await updateIndex(index, writtenPaths, cwd);
      await fse.writeJson(indexPath, updatedIndex, { spaces: 2 });
      logger.success('Index updated.');
    } catch (err) {
      logger.warn(`Could not update index: ${err.message}`);
    }
  }

  logger.blank();
  logger.success(`Done! Updated ${writtenPaths.length} file(s).`);
  logger.blank();
}