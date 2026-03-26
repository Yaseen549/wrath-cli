import chalk from 'chalk';

const prefix = chalk.bold.hex('#FF4500')('⚡ WRATH');

export const logger = {
  info(message) {
    console.log(`${prefix} ${chalk.cyan('INFO')}  ${chalk.white(message)}`);
  },

  success(message) {
    console.log(`${prefix} ${chalk.green('✔ OK')}   ${chalk.greenBright(message)}`);
  },

  warn(message) {
    console.warn(`${prefix} ${chalk.yellow('WARN')}  ${chalk.yellow(message)}`);
  },

  error(message) {
    console.error(`${prefix} ${chalk.red('ERROR')} ${chalk.redBright(message)}`);
  },

  step(index, total, message) {
    const counter = chalk.dim(`[${index}/${total}]`);
    console.log(`${prefix} ${chalk.blue('STEP')}  ${counter} ${chalk.white(message)}`);
  },

  divider() {
    console.log(chalk.dim('─'.repeat(60)));
  },

  blank() {
    console.log('');
  },

  banner() {
    console.log('');
    console.log(chalk.bold.hex('#FF4500')('  ██╗    ██╗██████╗  █████╗ ████████╗██╗  ██╗'));
    console.log(chalk.bold.hex('#FF6030')('  ██║    ██║██╔══██╗██╔══██╗╚══██╔══╝██║  ██║'));
    console.log(chalk.bold.hex('#FF7550')('  ██║ █╗ ██║██████╔╝███████║   ██║   ███████║'));
    console.log(chalk.bold.hex('#FF9070')('  ██║███╗██║██╔══██╗██╔══██║   ██║   ██╔══██║'));
    console.log(chalk.bold.hex('#FFB090')('  ╚███╔███╔╝██║  ██║██║  ██║   ██║   ██║  ██║'));
    console.log(chalk.bold.hex('#FFD0B0')('   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝'));
    console.log('');
    console.log(chalk.dim('  AI-powered developer CLI — scaffold, index, fix.'));
    console.log('');
  },
};
