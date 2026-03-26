import { initCommand } from './init.js';
import { logger } from '../utils/logger.js';

export async function reindexCommand() {
  logger.info('Forcing full re-index…');
  await initCommand({ force: true });
}
