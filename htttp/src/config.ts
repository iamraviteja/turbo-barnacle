/**
 * config.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for all tunable behaviour in this package.
 *
 * Every knob that controls retries, backoff timing, or circuit breaker
 * thresholds is read from `process.env` here (populated from a .env file
 * via `dotenv`). Nothing else in the codebase should call `process.env`
 * directly - this keeps configuration centralized, testable, and easy to
 * override (e.g. in tests you can just pass a config object instead of
 * relying on real env vars).
 * ---------------------------------------------------------------------------
 */

import 'dotenv/config';
import type { AppConfig, LogFormat, LogLevel } from './types';

// ---------------------------------------------------------------------------
// Small parsing helpers. Env vars are always strings, so we coerce them to
// the right primitive type and fall back to sane defaults if unset/invalid.
// ---------------------------------------------------------------------------

function toInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

function toList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function toIntList(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  return toList(value, [])
    .map((v) => parseInt(v, 10))
    .filter((n): n is number => Number.isFinite(n));
}

const VALID_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];
function toLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const lower = (value || '').toLowerCase();
  return (VALID_LOG_LEVELS as readonly string[]).includes(lower) ? (lower as LogLevel) : fallback;
}

const VALID_LOG_FORMATS: readonly LogFormat[] = ['json', 'pretty'];
function toLogFormat(value: string | undefined, fallback: LogFormat): LogFormat {
  const lower = (value || '').toLowerCase();
  return (VALID_LOG_FORMATS as readonly string[]).includes(lower) ? (lower as LogFormat) : fallback;
}

export const config: AppConfig = {
  http: {
    baseURL: process.env.HTTP_BASE_URL || '',
    timeoutMs: toInt(process.env.HTTP_TIMEOUT_MS, 5000),
  },

  retry: {
    enabled: toBool(process.env.RETRY_ENABLED, true),
    maxAttempts: toInt(process.env.RETRY_MAX_ATTEMPTS, 3),
    baseDelayMs: toInt(process.env.RETRY_BASE_DELAY_MS, 300),
    maxDelayMs: toInt(process.env.RETRY_MAX_DELAY_MS, 10000),
    backoffFactor: toFloat(process.env.RETRY_BACKOFF_FACTOR, 2),
    jitter: toFloat(process.env.RETRY_JITTER, 0.2),
    statusCodes: toIntList(process.env.RETRY_STATUS_CODES, [408, 429, 500, 502, 503, 504]),
    methods: toList(process.env.RETRY_METHODS, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']).map((m) =>
      m.toUpperCase()
    ),
  },

  circuitBreaker: {
    enabled: toBool(process.env.CIRCUIT_BREAKER_ENABLED, true),
    failureThreshold: toInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 5),
    rollingWindowMs: toInt(process.env.CIRCUIT_BREAKER_ROLLING_WINDOW_MS, 60000),
    openDurationMs: toInt(process.env.CIRCUIT_BREAKER_OPEN_DURATION_MS, 30000),
    successThreshold: toInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD, 2),
    halfOpenMaxCalls: toInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS, 3),
  },

  logging: {
    level: toLogLevel(process.env.LOG_LEVEL, 'info'),
    format: toLogFormat(process.env.LOG_FORMAT, 'pretty'),
  },
};

export default config;
