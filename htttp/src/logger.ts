/**
 * logger.ts
 * ---------------------------------------------------------------------------
 * Minimal, dependency-free leveled logger implementing the `Logger`
 * interface from types.ts.
 *
 * In a real production app you'd likely swap this for winston/pino, but
 * because the rest of the codebase depends on the `Logger` interface
 * rather than this concrete class, swapping implementations later is a
 * one-file change - everywhere else just does `import logger from './logger'`.
 * ---------------------------------------------------------------------------
 */

import { config } from './config';
import type { Logger, LogLevel, LogMeta } from './types';

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevelWeight = LEVEL_WEIGHT[config.logging.level];

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  if (LEVEL_WEIGHT[level] > currentLevelWeight) return; // below configured verbosity, skip

  if (config.logging.format === 'json') {
    // Structured output - easy to ship to a log aggregator (ELK, Datadog, etc.)
    const entry = { timestamp: timestamp(), level, message, ...(meta ? { meta } : {}) };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  } else {
    // Human-readable output for local development.
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.log(`[${timestamp()}] [${level.toUpperCase()}] ${message}${metaStr}`);
  }
}

export const logger: Logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};

export default logger;
