import { join } from 'path';
import fse from 'fs-extra';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { callAI } from '../fixer/aiClient.js';
import { logger } from '../utils/logger.js';

/**
 * Bulletproof JSON Sanitizer
 * Fixes physical line breaks and unescaped tabs inside AI-generated JSON strings.
 */
function sanitizeAIResponse(raw) {

const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '');
  let inString = false;
  let escapeNext = false;
  let result = '';
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      result += char;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    // If we are INSIDE a string and the AI used a physical line break, escape it!
    if (inString && char === '\n') {
      result += '\\n';
      continue;
    }
    if (inString && char === '\r') {
      continue; // Strip carriage returns to be safe
    }
    if (inString && char === '\t') {
      result += '\\t';
      continue;
    }
    
    result += char;
  }
  
  return result;
}

/**
 * Ask the AI to generate a project plan containing both setup commands and custom files.
 */
async function generateProjectPlan(description) {
  const osName = process.platform === 'win32' ? 'Windows' : 'Mac/Linux';

  const systemPrompt = `You are a master software architect and coding agent.
The user will describe a project. Your job is to generate a complete project scaffold and setup plan.
The user is running this on a ${osName} machine.

Respond ONLY with a valid JSON object in this exact shape:
{
  "setupCommands": [
    "npx create-react-app app-name",
    "cd app-name && npm install"
  ],
  "files": [
    {
      "path": "app-name/src/App.js",
      "content": "...the full file content..."
    }
  ]
}

CRITICAL JSON RULES - READ CAREFULLY:
- ALWAYS dynamically determine the project name and commands from the user's prompt.
- If your setup commands create a new subdirectory, all paths in the "files" array MUST start with that subdirectory.
- DO NOT include long-running dev server commands like 'npm start' in setupCommands.
- Keep CSS and boilerplate code concise.
- Respond with raw JSON only. No markdown fences.`;

  const userMessage = `Project description: ${description}`;

  logger.info('Asking AI to design project structure and commands…');
  const raw = await callAI(systemPrompt, userMessage, { expectJson: true, maxTokens: 8192 });

  let plan;
  try {
    // 🛡️ Pass the raw response through our new State Machine Sanitizer
    const safeJsonString = sanitizeAIResponse(raw);
    plan = JSON.parse(safeJsonString);
  } catch (err) {
    throw new Error('AI returned invalid JSON. It may have hit its token limit.\nSnippet: ' + raw.slice(-300));
  }

  if (Array.isArray(plan)) {
    return { setupCommands: [], files: plan };
  }

  return plan;
}

/**
 * Writes all generated files to the target directory.
 */
async function writeFiles(files, targetDir) {
  for (const file of files) {
    if (!file.path || typeof file.content !== 'string') continue;
    const absPath = join(targetDir, file.path);
    await fse.ensureDir(join(absPath, '..'));
    await fse.writeFile(absPath, file.content, 'utf-8');
    logger.success(`Created/Updated: ${file.path}`);
  }
}

/**
 * Full project generation pipeline.
 */
export async function generateProject(description, targetDir, options = {}) {
  const { runInstall = true, runGitInit = true } = options;

  await fse.ensureDir(targetDir);

  const plan = await generateProjectPlan(description);

  // 1. Execute Setup Commands
  if (plan.setupCommands && plan.setupCommands.length > 0) {
    logger.info(`Executing ${plan.setupCommands.length} setup command(s)…`);
    for (const cmd of plan.setupCommands) {
      logger.info(`Running: ${chalk.cyan(cmd)}`);
      try {
        execSync(cmd, { cwd: targetDir, stdio: 'inherit' });
      } catch (err) {
        logger.warn(`Command failed: ${cmd}\n${err.message}`);
      }
    }
  }

  // 2. Write Custom Files
  if (plan.files && plan.files.length > 0) {
    logger.info(`Writing ${plan.files.length} custom files to ${targetDir}…`);
    await writeFiles(plan.files, targetDir);
  }

  // 3. Fallback Git Init
  if (runGitInit && !(await fse.pathExists(join(targetDir, '.git')))) {
    try {
      execSync('git init', { cwd: targetDir, stdio: 'pipe' });
      logger.success('Initialized git repository.');
    } catch (err) {
      // ignore
    }
  }

  // 4. Fallback NPM Install
  if (runInstall) {
    const hasPkg = await fse.pathExists(join(targetDir, 'package.json'));
    const hasNodeModules = await fse.pathExists(join(targetDir, 'node_modules'));
    
    if (hasPkg && !hasNodeModules) {
      logger.info('Running fallback npm install… (this may take a moment)');
      try {
        execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
        logger.success('npm install complete.');
      } catch (err) {
        logger.warn(`npm install failed: ${err.message}`);
      }
    }
  }
}