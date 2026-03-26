import chalk from 'chalk';
import * as readline from 'readline';
import { logger } from './utils/logger.js';
import { callAI } from './fixer/aiClient.js';

// ── Helper: Multi-line terminal input ──────────────────────────────────────

async function readMultilineFromTerminal() {
  console.log(chalk.cyan('What do you need help with? (Ask about WRATH, next steps, or coding doubts)'));
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

function buildHelpSystemPrompt() {
  return `You are WRATH, an expert AI developer assistant built into a CLI tool.
The user is asking you for help, guidance, or clarification.
Provide clear, concise, and highly helpful answers. 
If they ask about "next steps" for a project, give them actionable, step-by-step advice.
Format your response cleanly using markdown so it is easy to read in a terminal. Keep it friendly and professional.`;
}

// ── Main command ──────────────────────────────────────────────────────────

export async function helpCommand(questionArg) {
  let question = questionArg;

  // ── 0. Handle Terminal Input ───────────────────────────────────────────────
  if (!question) {
    question = await readMultilineFromTerminal();

    if (!question) {
      logger.error('No question provided. Aborting.');
      process.exit(1);
    }
    
    console.clear();
  }

  logger.banner();
  
  // Show a clean, 1-line preview of the question
  const firstLine = question.split('\n')[0];
  const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  logger.info(`Question: ${chalk.italic.cyan(preview)}`);
  logger.divider();

  // ── 1. Call AI for an answer ─────────────────────────────────────────────
  logger.info('Thinking...');

  let answer;
  try {
    // Note: expectJson is FALSE here because we just want the AI to talk to us normally!
    answer = await callAI(
      buildHelpSystemPrompt(),
      question,
      { expectJson: false, maxTokens: 4096 }
    );
  } catch (err) {
    logger.error(`AI request failed: ${err.message}`);
    process.exit(1);
  }

  // ── 2. Display Response ──────────────────────────────────────────────────
  logger.blank();
  // We print the raw answer so the markdown renders nicely in the terminal
  console.log(answer);
  logger.blank();
  logger.divider();
}