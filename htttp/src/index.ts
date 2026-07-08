/**
 * index.ts
 * ---------------------------------------------------------------------------
 * Public entry point. Re-exports the pieces a consuming app needs, along
 * with all shared types so TypeScript consumers get full type information
 * without reaching into internal files.
 * ---------------------------------------------------------------------------
 */

export { createHttpClient, computeBackoffDelay, isRetryableError } from './httpClient';
export type { ResilientAxiosInstance } from './httpClient';

export { CircuitBreaker, CircuitBreakerOpenError } from './CircuitBreaker';

export { config } from './config';
export { logger } from './logger';

export {
  CircuitBreakerState,
} from './types';

export type {
  AppConfig,
  HttpConfig,
  RetryConfig,
  CircuitBreakerConfig,
  CircuitBreakerOptions,
  CircuitBreakerStatus,
  HttpClientOverrides,
  LoggingConfig,
  LogLevel,
  LogFormat,
  LogMeta,
  Logger,
} from './types';
