import { join } from 'path';
import { readFile } from 'fs/promises';
import fse from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer'; // Still needed for the 'Apply changes? (y/n)' prompt
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
  console.log(chalk.cyan('Describe the feature or code you want to add (Paste as many lines as you want).'));
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

// ── Prompt builders ────────────────────────────────────────────────────────

function buildAddSystemPrompt() {
  return `You are an expert software architect and developer.
The user wants to add a new feature, file, or code snippet to their project.
You will be given the user's request and the contents of any relevant existing files for context.
Your task is to generate the new files or modify existing files to seamlessly integrate the requested feature.

You MUST respond with a valid JSON object in this exact shape:
{
  "explanation": "A clear, concise explanation of the files you created or modified to add the feature.",
  "changes": [
    {
      "path": "relative/path/to/file.js",
      "content": "...the complete content of the file..."
    }
  ]
}

Rules:
- If creating a new file, provide the desired relative path and the full file content.
- If modifying an existing file (e.g., adding an export, updating a router), provide the FULL updated file content.
- Strictly match the project's existing coding style, framework, and language (e.g., use TypeScript if the project uses it).
- Respond with raw JSON only — no markdown fences, no extra commentary outside the JSON.`;
}

function buildAddUserMessage(featureRequest, fileContents) {
  let message = `## Feature Request\n${featureRequest}\n\n`;

  if (fileContents.length > 0) {
    const filesSection = fileContents
      .map(({ path, content }) => `### Context File: ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');
    message += `## Existing Project Context\n${filesSection}`;
  } else {
    message += `## Context\nNo existing files were deemed necessary to read for this addition. Generate the new files independently.`;
  }

  return message;
}

// ── Main command ──────────────────────────────────────────────────────────

export async function addCommand(featureRequestArg, options) {
  const cwd = process.cwd();
  const indexPath = join(cwd, INDEX_PATH);
  let featureRequest = featureRequestArg;

  // ── 0. Handle Terminal Input ───────────────────────────────────────────────
  if (!featureRequest) {
    featureRequest = await readMultilineFromTerminal();

    if (!featureRequest) {
      logger.error('No description provided. Aborting.');
      process.exit(1);
    }

    // Wipe the terminal clean so the pasted prompt doesn't ruin your design!
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

  // Show a clean, 1-line preview of the request instead of dumping the whole text
  const firstLine = featureRequest.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Adding feature: ${chalk.italic.green(preview)}`);
  logger.divider();

  // ── 2. Find relevant files for context ───────────────────────────────────
  let relevantPaths = [];
  try {
    logger.info('Analyzing project index for context...');
    relevantPaths = await findRelevantFiles(index, `I am adding: ${featureRequest}. What existing files do I need to read to integrate this properly?`);
  } catch (err) {
    logger.warn(`Could not determine context files, proceeding blindly: ${err.message}`);
  }

  // ── 3. Read file contents ────────────────────────────────────────────────
  const fileContents = [];
  if (relevantPaths.length > 0) {
    logger.info(`Context files identified (${relevantPaths.length}):`);
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
  logger.info('Asking AI to generate code...');

  let raw;
  try {
    raw = await callAI(
      buildAddSystemPrompt(),
      buildAddUserMessage(featureRequest, fileContents),
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
  console.log(chalk.bold.white('\n  ✨ AI Implementation Plan\n'));
  console.log(
    aiResponse.explanation
      .split('\n')
      .map((l) => `  ${chalk.green(l)}`)
      .join('\n')
  );
  logger.blank();

  if (aiResponse.changes.length === 0) {
    logger.info('AI did not generate any file changes.');
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
  console.log(chalk.bold.white('  📋 Proposed Additions/Modifications\n'));
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
      message: chalk.bold(`Apply ${changes.length} change(s)?`),
      default: true,
    },
  ]);

  if (!apply) {
    logger.info('Changes discarded. No files were modified.');
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
  logger.success(`Done! Added/Modified ${writtenPaths.length} file(s).`);
  logger.blank();
}