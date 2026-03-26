import { spawn, execSync } from 'child_process';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { fixCommand } from './fix.js';

const ERROR_SIGNATURES = [
    'Failed to compile',
    'ERR_MODULE_NOT_FOUND',
    'SyntaxError:',
    'TypeError:',
    'ReferenceError:',
    'Error:',
    'Exception:'
];

const MAX_RETRY_ATTEMPTS = 3;
let retryCount = 0;

// Helper to auto-detect dev command from package.json
function detectCommand() {
    try {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
        if (pkg.scripts && pkg.scripts.dev) return 'npm run dev';
        if (pkg.scripts && pkg.scripts.start) return 'npm start';
    } catch (err) {
        // ignore
    }
    return null;
}

export async function runCommand(commandStr) {
    if (!commandStr) {
        commandStr = detectCommand();
        if (!commandStr) {
            logger.error('Could not detect start script. Please provide a command (e.g., wrath run "npm start")');
            process.exit(1);
        }
        logger.info(`Auto-detected dev command: ${chalk.cyan(commandStr)}`);
    }

    const [cmd, ...args] = commandStr.split(' ');
    let isFixing = false;

    async function startProcess() {
        if (!isFixing) {
            logger.banner();
            logger.info(`Starting auto-healing server: ${chalk.cyan(commandStr)}`);
            logger.divider();
        }

        let child = spawn(cmd, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true,
        });

        let logBuffer = [];
        let errorDetected = false;

        // ⚡ THE FIX: A robust cross-platform tree killer
        const killChildProcess = () => new Promise((resolve) => {
            if (!child || child.killed) return resolve();

            child.on('exit', resolve);
            child.on('close', resolve);

            try {
                if (os.platform() === 'win32') {
                    // Force kill the process tree on Windows
                    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
                } else {
                    // Standard kill on Unix
                    child.kill('SIGKILL');
                }
            } catch (err) {
                // If the process is already dead, taskkill throws an error. We can safely ignore it.
            }

            // Fallback timeout to ensure the script doesn't hang waiting for an exit event
            setTimeout(resolve, 1500);
        });

        const handleOutput = (data) => {
            const text = data.toString();
            process.stdout.write(text);

            if (isFixing) return;

            logBuffer.push(text);
            if (logBuffer.length > 50) logBuffer.shift();

            if (!errorDetected && ERROR_SIGNATURES.some(sig => text.includes(sig))) {
                errorDetected = true;

                setTimeout(async () => {
                    isFixing = true;
                    const fullErrorLog = logBuffer.join('\n');

                    logger.divider();
                    logger.warn(chalk.bold.red('🚨 WRATH INTERCEPTED AN ERROR'));

                    if (retryCount >= MAX_RETRY_ATTEMPTS) {
                        logger.error(`Reached max auto-fix attempts (${MAX_RETRY_ATTEMPTS}). Stopping to save your API tokens.`);
                        await killChildProcess();
                        process.exit(1);
                    }

                    const { action } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'action',
                            message: 'How would you like to proceed?',
                            choices: [
                                { name: chalk.green('Attempt AI Fix (Costs Tokens)'), value: 'fix' },
                                { name: chalk.yellow('Keep server running (Ignore error)'), value: 'ignore' },
                                { name: chalk.red('Kill server and Exit'), value: 'exit' }
                            ]
                        }
                    ]);

                    if (action === 'fix') {
                        retryCount++;
                        logger.info(`Attempt ${retryCount}/${MAX_RETRY_ATTEMPTS}: Handing over to WRATH Fixer...`);

                        // ⚡ Kill the server and wipe the process tree IMMEDIATELY
                        logger.info('Shutting down broken server...');
                        await killChildProcess();

                        try {
                            const fixApplied = await fixCommand(fullErrorLog, { dryRun: false });

                            if (fixApplied) {
                                logger.success('Fix applied. Restarting server...');
                                isFixing = false;
                                errorDetected = false;
                                startProcess();
                            } else {
                                logger.warn('Fix rejected. Shutting down...');
                                process.exit(0);
                            }
                        } catch (err) {
                            logger.error(`Auto-fix failed: ${err.message}`);
                            process.exit(1);
                        }
                    } else if (action === 'exit') {
                        await killChildProcess();
                        process.exit(0);
                    } else {
                        logger.info('Monitoring resumed. Waiting for next error...');
                        isFixing = false;
                        errorDetected = false;
                    }
                }, 1200);
            }
        };

        child.stdout.on('data', handleOutput);
        child.stderr.on('data', handleOutput);

        child.on('close', (code) => {
            if (!isFixing && code !== 0 && code !== null) {
                logger.error(`Process crashed with code ${code}`);
            }
        });
    }

    startProcess();
}