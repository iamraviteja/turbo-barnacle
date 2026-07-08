/**
 * demo.ts
 * ---------------------------------------------------------------------------
 * Spins up a tiny local HTTP server that fails on purpose (to simulate a
 * flaky/downed downstream dependency), then hits it through our resilient
 * client so you can watch, in the logs, the retry/backoff behaviour and the
 * circuit breaker moving through CLOSED -> OPEN -> HALF_OPEN -> CLOSED.
 *
 * Run with: npm run demo
 * ---------------------------------------------------------------------------
 */

import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { createHttpClient } from './httpClient';
import { logger } from './logger';

interface PingResponse {
  ok: boolean;
  requestCount: number;
}

let requestCount = 0;
const failuresBeforeRecovery = 4;

const server: Server = http.createServer((_req, res) => {
  requestCount += 1;
  if (requestCount <= failuresBeforeRecovery) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service Unavailable' }));
  } else {
    const body: PingResponse = { ok: true, requestCount };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  const client = createHttpClient({
    name: 'demo-service',
    http: { baseURL: `http://localhost:${port}` },
    circuitBreaker: {
      failureThreshold: 3,
      openDurationMs: 1500,
      successThreshold: 2,
      halfOpenMaxCalls: 2,
    },
    retry: {
      maxAttempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 500,
    },
  });

  logger.info('--- Demo start: hammering a flaky downstream service ---');

  for (let i = 0; i < 15; i += 1) {
    try {
      const res = await client.get<PingResponse>('/ping');
      logger.info(`call #${i + 1} -> SUCCESS`, { data: res.data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`call #${i + 1} -> FAILED`, { message });
    }
    logger.debug('breaker status', { ...client.circuitBreaker.getStatus() });
    await new Promise((r) => setTimeout(r, 400));
  }

  logger.info('--- Demo complete ---');
  server.close();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Demo crashed', { message });
  server.close();
  process.exit(1);
});
