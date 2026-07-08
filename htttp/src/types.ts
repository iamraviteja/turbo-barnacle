/**
 * types.ts
 * ---------------------------------------------------------------------------
 * Central location for shared type definitions. Keeping these separate from
 * implementation files makes the public "shape" of the library easy to scan
 * and keeps circular-import risk low (types.ts imports nothing of its own).
 * ---------------------------------------------------------------------------
 */

// =============================================================================
// Logging
// =============================================================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogFormat = 'json' | 'pretty';

/** Arbitrary structured metadata attached to a log line. */
export type LogMeta = Record<string, unknown>;

export interface Logger {
  error(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
}

export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
}

// =============================================================================
// HTTP (base axios settings)
// =============================================================================

export interface HttpConfig {
  baseURL: string;
  timeoutMs: number;
}

// =============================================================================
// Retry / exponential backoff
// =============================================================================

export interface RetryConfig {
  /** Master on/off switch for the retry mechanism. */
  enabled: boolean;
  /** Max retry attempts after the initial request fails. */
  maxAttempts: number;
  /** Seed delay (ms) for the exponential backoff formula. */
  baseDelayMs: number;
  /** Upper bound (ms) a computed delay is capped at. */
  maxDelayMs: number;
  /** Multiplier applied per attempt: delay = baseDelay * factor^attempt. */
  backoffFactor: number;
  /** Randomization factor (0.0 - 1.0) applied to computed delays. */
  jitter: number;
  /** HTTP status codes considered transient/retryable. */
  statusCodes: number[];
  /** HTTP methods eligible for retry (should be idempotent). */
  methods: string[];
}

// =============================================================================
// Circuit breaker
// =============================================================================

/**
 * The three states in the circuit breaker state machine.
 * See the detailed explanation in CircuitBreaker.ts.
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Master on/off switch for the circuit breaker. */
  enabled: boolean;
  /** Failures within the rolling window required to trip CLOSED -> OPEN. */
  failureThreshold: number;
  /** Width (ms) of the rolling window used to count failures. */
  rollingWindowMs: number;
  /** How long (ms) the circuit stays OPEN before probing via HALF_OPEN. */
  openDurationMs: number;
  /** Consecutive successes needed in HALF_OPEN to fully close the circuit. */
  successThreshold: number;
  /** Max trial requests allowed through concurrently while HALF_OPEN. */
  halfOpenMaxCalls: number;
}

/** Constructor options for CircuitBreaker - config plus an identifying name. */
export interface CircuitBreakerOptions extends CircuitBreakerConfig {
  /** Identifier used in log lines; useful with one breaker per dependency. */
  name?: string;
}

/** Point-in-time snapshot of a breaker's internal state, for health checks. */
export interface CircuitBreakerStatus {
  name: string;
  state: CircuitBreakerState;
  failuresInWindow: number;
  consecutiveSuccesses: number;
  halfOpenCallsInFlight: number;
}

// =============================================================================
// Aggregate app configuration (as resolved from env vars)
// =============================================================================

export interface AppConfig {
  http: HttpConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  logging: LoggingConfig;
}

/**
 * Deep-partial overrides accepted by createHttpClient() so callers can
 * tweak individual settings without needing to supply a full config object.
 */
export interface HttpClientOverrides {
  name?: string;
  http?: Partial<HttpConfig>;
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
}
