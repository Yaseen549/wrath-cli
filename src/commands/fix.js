import { join } from 'path';
import { readFile } from 'fs/promises';
import fse from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer'; // We still need this for the "Apply changes? (y/n)" prompt
import * as readline from 'readline'; // Added for terminal input
import { logger } from '../utils/logger.js';
import { INDEX_PATH } from '../config.js';
import { findRelevantFiles } from '../fixer/findRelevantFiles.js';
import { callAI } from '../fixer/aiClient.js';
import { renderAllDiffs } from '../fixer/diffViewer.js';
import { applyPatch } from '../fixer/applyPatch.js';
import { updateIndex } from '../indexer/updateIndex.js';

// ── Helper: Multi-line terminal input ──────────────────────────────────────

async function readMultilineFromTerminal() {
  console.log(chalk.cyan('Paste your error message here.'));
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
        // If the user hits enter twice (or pastes ends with double newline), submit!
        if (emptyLineCount >= 2) {
          rl.close();
        }
      } else {
        // If there was a single empty line previously (e.g., inside the error log), keep it
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

function buildFixSystemPrompt() {
  return `You are an expert software engineer and code debugger.
You will be given an error message and the contents of the relevant source files from the project.
Your task is to identify the root cause and produce fixed versions of whichever files need to change.

You MUST respond with a valid JSON object in this exact shape:
{
  "explanation": "A clear, concise explanation of what is wrong and how you are fixing it (1-3 paragraphs).",
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
- Do not truncate or use placeholder comments like "// rest of the code".
- Respond with raw JSON only — no markdown fences, no extra commentary outside the JSON.`;
}

function buildFixUserMessage(errorMessage, fileContents) {
  const filesSection = fileContents
    .map(({ path, content }) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  return `## Error Message\n${errorMessage}\n\n## Relevant Source Files\n${filesSection}`;
}

// ── Main command ──────────────────────────────────────────────────────────

export async function fixCommand(errorMessageArg, options) {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);
  let errorMessage = errorMessageArg;

  // ── 0. Handle Terminal Input ───────────────────────────────────────────────
  if (!errorMessage) {
    errorMessage = await readMultilineFromTerminal();

    if (!errorMessage) {
      logger.error('No error message provided. Aborting.');
      process.exit(1);
    }

    // Wipe the terminal clean so the pasted error log doesn't ruin your design!
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

  // Show a clean, 1-line preview of the error instead of dumping the whole text
  const firstLine = errorMessage.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Fixing error: ${chalk.italic.yellow(preview)}`);
  logger.divider();

  // ── 2. Find relevant files ───────────────────────────────────────────────
  let relevantPaths;
  try {
    relevantPaths = await findRelevantFiles(index, errorMessage);
  } catch (err) {
    logger.error(`Could not determine relevant files: ${err.message}`);
    process.exit(1);
  }

  logger.info(`Relevant files identified (${relevantPaths.length}):`);
  for (const p of relevantPaths) {
    console.log(`  ${chalk.cyan('→')} ${p}`);
  }
  logger.blank();

  // ── 3. Read file contents ────────────────────────────────────────────────
  const fileContents = [];
  for (const relPath of relevantPaths) {
    const absPath = join(cwd, relPath);
    try {
      const content = await readFile(absPath, 'utf-8');
      fileContents.push({ path: relPath, content });
    } catch (err) {
      logger.warn(`Could not read ${relPath}: ${err.message}`);
    }
  }

  if (fileContents.length === 0) {
    logger.error('Could not read any of the identified files. Aborting.');
    process.exit(1);
  }

  // ── 4. Call AI for fix ───────────────────────────────────────────────────
  logger.info('Sending context to AI for analysis…');

  let raw;
  try {
    raw = await callAI(
      buildFixSystemPrompt(),
      buildFixUserMessage(errorMessage, fileContents),
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
  console.log(chalk.bold.white('\n  🤖 AI Explanation\n'));
  console.log(
    aiResponse.explanation
      .split('\n')
      .map((l) => `  ${chalk.white(l)}`)
      .join('\n')
  );
  logger.blank();

  if (aiResponse.changes.length === 0) {
    logger.info('AI found no code changes necessary. The issue may be environmental.');
    return;
  }

  // ── 6. Build change set with original content ────────────────────────────
  const changes = [];
  for (const change of aiResponse.changes) {
    const original =
      fileContents.find((f) => f.path === change.path)?.content ?? '';
    changes.push({
      path: change.path,
      original,
      updated: change.content,
    });
  }

  // ── 7. Show colorized diff ───────────────────────────────────────────────
  console.log(chalk.bold.white('  📋 Proposed Changes\n'));
  renderAllDiffs(changes);

  // ── 8. Dry run check ─────────────────────────────────────────────────────
  if (options.dryRun) {
    logger.info('Dry run mode — no changes written.');
    return;
  }

  // ── 9. Ask user to confirm ───────────────────────────────────────────────
  const { apply } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'apply',
      message: chalk.bold(`Apply ${changes.length} change(s)?`),
      default: true,
    },
  ]);

  if (!apply) {
    logger.info('Changes discarded. No files were modified.');
    return false; // 👈 RETURN FALSE so run.js knows we didn't fix it
  }

  // ⚡ NEW: Trigger the kill switch right before we write to the disk
  if (typeof options.onConfirm === 'function') {
    await options.onConfirm();
  }
  // ── 10. Apply patch ──────────────────────────────────────────────────────
  const writtenPaths = await applyPatch(changes, cwd);

  // ── 11. Update index for changed files ───────────────────────────────────
  if (writtenPaths.length > 0) {
    logger.info('Updating index for modified files…');
    try {
      const updatedIndex = await updateIndex(index, writtenPaths, cwd);
      await fse.writeJson(indexPath, updatedIndex, { spaces: 2 });
      logger.success('Index updated.');
    } catch (err) {
      logger.warn(`Could not update index: ${err.message}`);
    }
  }

  logger.blank();
  logger.success(`Done! Applied changes to ${writtenPaths.length} file(s).`);
  logger.blank();

  return true;
}