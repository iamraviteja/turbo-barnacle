/**
 * CircuitBreaker.ts
 * ---------------------------------------------------------------------------
 * WHAT IS A CIRCUIT BREAKER?
 * ---------------------------------------------------------------------------
 * The circuit breaker pattern protects a system from repeatedly calling a
 * downstream dependency (an API, DB, etc.) that is already failing. Just
 * like an electrical circuit breaker trips to stop current flow when there's
 * a fault, this pattern "trips" to stop outbound calls when failures pile
 * up - instead of hammering a struggling service (which makes recovery
 * harder) and instead of making every caller wait out a slow timeout on
 * every single request.
 *
 * Without it: if a downstream API goes down, every request from every
 * caller still pays the full timeout cost before failing. Under load this
 * can exhaust connection pools/threads and cause cascading failures
 * upstream too ("one slow service takes down the whole system").
 *
 * With it: after enough failures, the breaker "opens" and calls fail fast
 * (immediately, no network call at all) until a cool-down period passes.
 * This gives the downstream service breathing room to recover and keeps
 * our own app responsive.
 *
 * ---------------------------------------------------------------------------
 * THE THREE STATES
 * ---------------------------------------------------------------------------
 *
 *   CLOSED (normal operation)
 *     - Requests flow through normally.
 *     - Failures are counted in a rolling time window.
 *     - If failures within that window reach `failureThreshold`, the
 *       breaker trips to OPEN.
 *
 *   OPEN (failing fast)
 *     - Every request is rejected immediately WITHOUT calling the downstream
 *       service at all (this is the "fail fast" behaviour).
 *     - After `openDurationMs` has elapsed, the breaker transitions to
 *       HALF_OPEN to test the water.
 *
 *   HALF_OPEN (cautious probing)
 *     - A limited number of trial requests (`halfOpenMaxCalls`) are allowed
 *       through to see if the downstream service has recovered.
 *     - Enough consecutive successes (`successThreshold`) -> breaker closes
 *       (back to normal).
 *     - Any single failure -> breaker re-opens immediately and the cool-down
 *       timer restarts, since the service is evidently still unhealthy.
 *
 *   State diagram:
 *
 *        failures >= threshold
 *   CLOSED ───────────────────────► OPEN
 *     ▲                               │
 *     │                      openDurationMs elapses
 *     │                               │
 *     │                               ▼
 *     │  successThreshold met   HALF_OPEN
 *     └───────────────────────◄──────┤
 *                                     │ any failure
 *                                     └──────────► OPEN (timer resets)
 * ---------------------------------------------------------------------------
 */

import { logger } from './logger';
import { CircuitBreakerState } from './types';
import type { CircuitBreakerOptions, CircuitBreakerStatus } from './types';

/**
 * Thrown by the request gate when a call is rejected because the breaker
 * is OPEN. Kept as a distinct class (rather than a plain Error) so calling
 * code - and our own retry logic - can distinguish "breaker is open" from
 * a normal HTTP/network failure via `instanceof` or the `isCircuitBreakerError`
 * flag.
 */
export class CircuitBreakerOpenError extends Error {
  public readonly isCircuitBreakerError = true;

  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    // Restores correct prototype chain when compiled down for older targets.
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

export class CircuitBreaker {
  public readonly name: string;

  private readonly enabled: boolean;
  private readonly failureThreshold: number;
  private readonly rollingWindowMs: number;
  private readonly openDurationMs: number;
  private readonly successThreshold: number;
  private readonly halfOpenMaxCalls: number;

  private state: CircuitBreakerState;

  /** Timestamps (ms) of recent failures, used to evaluate the rolling window. */
  private failureTimestamps: number[];

  /** Tracks consecutive successes while HALF_OPEN. */
  private consecutiveSuccesses: number;

  /** Tracks in-flight trial calls while HALF_OPEN, to cap concurrency. */
  private halfOpenCallsInFlight: number;

  /** When the breaker tripped OPEN, so we know when to try HALF_OPEN. */
  private openedAt: number | null;

  constructor(options: CircuitBreakerOptions) {
    this.enabled = options.enabled;
    this.failureThreshold = options.failureThreshold;
    this.rollingWindowMs = options.rollingWindowMs;
    this.openDurationMs = options.openDurationMs;
    this.successThreshold = options.successThreshold;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls;
    this.name = options.name ?? 'default';

    this.state = CircuitBreakerState.CLOSED;
    this.failureTimestamps = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenCallsInFlight = 0;
    this.openedAt = null;
  }

  /**
   * Returns true if a request is currently allowed to proceed.
   * This is the "gate" every outbound call must pass through first.
   */
  public canRequest(): boolean {
    if (!this.enabled) return true;

    this.maybeTransitionFromOpenToHalfOpen();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Fail fast - the whole point of the pattern.
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Only let a limited number of probe requests through at once.
        return this.halfOpenCallsInFlight < this.halfOpenMaxCalls;

      default: {
        // Exhaustiveness check: if a new state is ever added to the enum
        // without updating this switch, TypeScript will flag `state` here
        // as not being of type `never`, causing a compile error.
        const exhaustiveCheck: never = this.state;
        return exhaustiveCheck;
      }
    }
  }

  /**
   * Call this immediately before dispatching a request that passed
   * `canRequest()`, so HALF_OPEN can track in-flight probes.
   */
  public onRequestStart(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCallsInFlight += 1;
    }
  }

  /** Record a successful call outcome. */
  public onSuccess(): void {
    if (!this.enabled) return;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCallsInFlight = Math.max(0, this.halfOpenCallsInFlight - 1);
      this.consecutiveSuccesses += 1;

      logger.debug(`[CircuitBreaker:${this.name}] probe succeeded in HALF_OPEN`, {
        consecutiveSuccesses: this.consecutiveSuccesses,
        successThreshold: this.successThreshold,
      });

      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.closeCircuit();
      }
    }
    // A success in CLOSED state doesn't need to reset the failure window
    // immediately - the rolling window naturally ages old failures out.
  }

  /** Record a failed call outcome. */
  public onFailure(): void {
    if (!this.enabled) return;

    const now = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCallsInFlight = Math.max(0, this.halfOpenCallsInFlight - 1);
      logger.warn(`[CircuitBreaker:${this.name}] probe failed in HALF_OPEN - re-opening circuit`);
      // Any failure while probing means the service is still unhealthy;
      // go straight back to OPEN and restart the cool-down clock.
      this.openCircuit();
      return;
    }

    if (this.state === CircuitBreakerState.CLOSED) {
      this.failureTimestamps.push(now);
      this.pruneOldFailures(now);

      logger.debug(`[CircuitBreaker:${this.name}] failure recorded`, {
        failuresInWindow: this.failureTimestamps.length,
        failureThreshold: this.failureThreshold,
      });

      if (this.failureTimestamps.length >= this.failureThreshold) {
        this.openCircuit();
      }
    }
  }

  /** Remove failure timestamps older than the rolling window. */
  private pruneOldFailures(now: number): void {
    const cutoff = now - this.rollingWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  /** CLOSED/HALF_OPEN -> OPEN */
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.openedAt = Date.now();
    this.failureTimestamps = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenCallsInFlight = 0;

    logger.warn(`[CircuitBreaker:${this.name}] state -> OPEN`, {
      cooldownMs: this.openDurationMs,
    });
  }

  /** OPEN -> HALF_OPEN, only once the cool-down period has elapsed. */
  private maybeTransitionFromOpenToHalfOpen(): void {
    if (this.state !== CircuitBreakerState.OPEN || this.openedAt === null) return;

    const elapsed = Date.now() - this.openedAt;
    if (elapsed >= this.openDurationMs) {
      this.state = CircuitBreakerState.HALF_OPEN;
      this.consecutiveSuccesses = 0;
      this.halfOpenCallsInFlight = 0;

      logger.info(`[CircuitBreaker:${this.name}] state -> HALF_OPEN (probing downstream service)`);
    }
  }

  /** HALF_OPEN -> CLOSED, once enough consecutive successes are observed. */
  private closeCircuit(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureTimestamps = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenCallsInFlight = 0;

    logger.info(`[CircuitBreaker:${this.name}] state -> CLOSED (service recovered)`);
  }

  /** Snapshot of current breaker status, handy for health checks/metrics. */
  public getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failuresInWindow: this.failureTimestamps.length,
      consecutiveSuccesses: this.consecutiveSuccesses,
      halfOpenCallsInFlight: this.halfOpenCallsInFlight,
    };
  }
}
