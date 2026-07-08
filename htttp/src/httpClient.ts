/**
 * httpClient.ts
 * ---------------------------------------------------------------------------
 * WHAT IS RETRY WITH EXPONENTIAL BACKOFF?
 * ---------------------------------------------------------------------------
 * Transient failures (a dropped connection, a 503 while a service is
 * mid-deploy, a momentary network blip) often succeed if you just try
 * again. But retrying instantly, or retrying too aggressively, can make
 * things worse - it adds load right when a service is already struggling.
 *
 * Exponential backoff fixes this by waiting progressively longer between
 * each retry attempt:
 *
 *     delay(attempt) = min(maxDelay, baseDelay * factor^attempt)
 *
 * e.g. with baseDelay=300ms, factor=2: 300ms, 600ms, 1200ms, 2400ms, ...
 * capped at maxDelay so later attempts don't wait excessively long.
 *
 * JITTER: if many clients fail at the same time (e.g. a shared dependency
 * blips) and all retry on the exact same schedule, they'll all hit the
 * service again at the same instant - a "thundering herd" - potentially
 * causing the very overload that triggered the failures in the first
 * place. Adding a small random +/- percentage ("jitter") to each computed
 * delay spreads retries out over time instead of them landing in lockstep.
 *
 * WHICH ERRORS ARE RETRIED?
 *   - Network-level failures (no response at all: DNS failure, connection
 *     reset, timeout) - these are almost always safe to retry.
 *   - Configured HTTP status codes (typically 408/429/5xx) - i.e. errors
 *     that are likely transient, as opposed to 4xx client errors like 400
 *     or 404 which will just fail identically every time.
 *   - Only for HTTP methods considered idempotent (GET, PUT, DELETE, etc.)
 *     by default, since retrying a non-idempotent POST could duplicate a
 *     side effect (e.g. double-charging a payment). This is configurable
 *     via RETRY_METHODS for callers who know their POSTs are safe to retry.
 *
 * ---------------------------------------------------------------------------
 * HOW RETRY AND THE CIRCUIT BREAKER WORK TOGETHER
 * ---------------------------------------------------------------------------
 * These two patterns solve different problems and layer cleanly:
 *   - Retry handles *transient* failures on a *single* request - "try this
 *     one call a few more times before giving up".
 *   - Circuit breaker handles *sustained* failures *across* requests -
 *     "this dependency has been failing repeatedly, stop hammering it".
 *
 * The breaker gate is checked before the retry loop even starts, and each
 * individual attempt inside the retry loop reports its outcome
 * (success/failure) to the breaker. If the breaker trips OPEN mid-retry
 * loop (e.g. this request's own failures were the ones that tripped it),
 * the loop stops immediately rather than continuing to retry into a now-
 * open circuit.
 * ---------------------------------------------------------------------------
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { config as defaultConfig } from './config';
import { logger } from './logger';
import { CircuitBreaker, CircuitBreakerOpenError } from './CircuitBreaker';
import type { HttpClientOverrides, RetryConfig } from './types';

// ---------------------------------------------------------------------------
// Module augmentation: axios's InternalAxiosRequestConfig doesn't know
// about our retry bookkeeping fields, so we extend it here. This gives us
// full type safety on `requestConfig.__retryAttempt` etc. everywhere below,
// instead of resorting to `any` casts.
// ---------------------------------------------------------------------------
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    /** Number of retry attempts already made for this logical request. */
    __retryAttempt?: number;
    /** Timestamp (ms) the most recent attempt was dispatched, for timing logs. */
    __requestStartedAt?: number;
  }
}

/** An axios instance augmented with a reference to its circuit breaker. */
export interface ResilientAxiosInstance extends AxiosInstance {
  circuitBreaker: CircuitBreaker;
}

/**
 * Computes the exponential backoff delay for a given attempt number, with
 * jitter applied, capped at maxDelayMs.
 *
 * @param attempt - 1-indexed attempt number (1 = first retry).
 * @param retryConfig - resolved retry configuration.
 * @returns delay in milliseconds.
 */
export function computeBackoffDelay(attempt: number, retryConfig: RetryConfig): number {
  const { baseDelayMs, backoffFactor, maxDelayMs, jitter } = retryConfig;

  const rawDelay = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
  const cappedDelay = Math.min(rawDelay, maxDelayMs);

  // Jitter: randomize within +/- (jitter * 100)% of the capped delay so
  // concurrent callers don't retry in lockstep with each other.
  const jitterRange = cappedDelay * jitter;
  const jitteredDelay = cappedDelay + (Math.random() * 2 - 1) * jitterRange;

  return Math.max(0, Math.round(jitteredDelay));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decides whether a given error is worth retrying, based on:
 *   - the HTTP method used (must be in the configured allow-list)
 *   - whether it was a network-level error (no response received), or
 *   - whether the response status is in the configured retry list.
 */
export function isRetryableError(error: AxiosError, retryConfig: RetryConfig): boolean {
  const method = (error.config?.method ?? 'get').toUpperCase();
  if (!retryConfig.methods.includes(method)) {
    return false;
  }

  // No `response` means the request never got a reply at all - timeout,
  // DNS failure, connection reset, TLS handshake failure, etc. These are
  // typically transient and safe to retry.
  if (!error.response) {
    return true;
  }

  return retryConfig.statusCodes.includes(error.response.status);
}

/**
 * Factory that builds a fully configured axios instance with:
 *   - retry + exponential backoff (via a response interceptor)
 *   - a circuit breaker guarding all requests
 *   - request/response logging
 *
 * @param overrides - optional overrides merged over the values loaded from
 *        config.ts / env vars. Handy for tests or for constructing multiple
 *        clients with different breakers (e.g. one per downstream service).
 */
export function createHttpClient(overrides: HttpClientOverrides = {}): ResilientAxiosInstance {
  const httpConfig = { ...defaultConfig.http, ...(overrides.http ?? {}) };
  const retryConfig: RetryConfig = { ...defaultConfig.retry, ...(overrides.retry ?? {}) };
  const cbConfig = { ...defaultConfig.circuitBreaker, ...(overrides.circuitBreaker ?? {}) };

  const circuitBreaker = new CircuitBreaker({
    ...cbConfig,
    name: overrides.name ?? httpConfig.baseURL ?? 'http-client',
  });

  const client = axios.create({
    baseURL: httpConfig.baseURL,
    timeout: httpConfig.timeoutMs,
  }) as ResilientAxiosInstance;

  // ---------------------------------------------------------------------
  // Request interceptor: this is the circuit breaker "gate". Every
  // request must pass through here before it's allowed onto the wire.
  // ---------------------------------------------------------------------
  client.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
    if (!circuitBreaker.canRequest()) {
      // Reject synchronously with a dedicated error type so callers (and
      // our own retry logic) can distinguish "breaker is open" from a
      // normal HTTP/network failure and skip retrying entirely - retrying
      // into an open circuit would defeat the whole purpose of the
      // breaker.
      const err = new CircuitBreakerOpenError(
        `Circuit breaker is OPEN for "${circuitBreaker.name}" - failing fast without calling downstream service.`
      );
      return Promise.reject(err);
    }

    circuitBreaker.onRequestStart();

    // Stash retry bookkeeping on the request config so it survives across
    // the interceptor chain (axios re-runs interceptors for retried
    // requests since we manually re-invoke `client(requestConfig)`).
    requestConfig.__retryAttempt = requestConfig.__retryAttempt ?? 0;
    requestConfig.__requestStartedAt = Date.now();

    logger.debug('HTTP request', {
      method: requestConfig.method,
      url: requestConfig.url,
      attempt: requestConfig.__retryAttempt + 1,
    });

    return requestConfig;
  });

  // ---------------------------------------------------------------------
  // Response interceptor: on success, report to the breaker and log
  // timing. On failure, decide whether to retry (with backoff) or give up.
  // ---------------------------------------------------------------------
  client.interceptors.response.use(
    (response) => {
      circuitBreaker.onSuccess();

      const startedAt = response.config.__requestStartedAt ?? Date.now();
      const durationMs = Date.now() - startedAt;

      logger.info('HTTP request succeeded', {
        method: response.config.method,
        url: response.config.url,
        status: response.status,
        attempt: (response.config.__retryAttempt ?? 0) + 1,
        durationMs,
      });

      return response;
    },
    async (error: unknown) => {
      // Breaker was already open before we even tried - do not retry,
      // do not count this as a fresh failure (it never reached the
      // network), just surface it to the caller immediately.
      if (error instanceof CircuitBreakerOpenError) {
        logger.warn(error.message);
        return Promise.reject(error);
      }

      // From here on we're dealing with a genuine axios error.
      const axiosError = error as AxiosError;
      const requestConfig = axiosError.config as InternalAxiosRequestConfig | undefined;

      circuitBreaker.onFailure();

      const currentAttempt = requestConfig?.__retryAttempt ?? 0;
      const canRetry =
        retryConfig.enabled &&
        requestConfig !== undefined &&
        isRetryableError(axiosError, retryConfig) &&
        currentAttempt < retryConfig.maxAttempts &&
        circuitBreaker.canRequest(); // don't retry if this failure just tripped the breaker

      if (!canRetry || requestConfig === undefined) {
        logger.error('HTTP request failed (no more retries)', {
          method: requestConfig?.method,
          url: requestConfig?.url,
          status: axiosError.response?.status,
          message: axiosError.message,
          attempt: currentAttempt + 1,
        });
        return Promise.reject(axiosError);
      }

      requestConfig.__retryAttempt = currentAttempt + 1;
      const delayMs = computeBackoffDelay(requestConfig.__retryAttempt, retryConfig);

      logger.warn('HTTP request failed, scheduling retry', {
        method: requestConfig.method,
        url: requestConfig.url,
        status: axiosError.response?.status,
        message: axiosError.message,
        attempt: requestConfig.__retryAttempt,
        maxAttempts: retryConfig.maxAttempts,
        delayMs,
      });

      await sleep(delayMs);

      // Re-dispatch the request. It flows back through both interceptors
      // above, so the circuit breaker gate is re-checked and success/
      // failure is re-recorded on this new attempt too.
      return client(requestConfig);
    }
  );

  // Expose the breaker so callers can inspect state / expose it on a
  // health-check endpoint.
  client.circuitBreaker = circuitBreaker;

  return client;
}
