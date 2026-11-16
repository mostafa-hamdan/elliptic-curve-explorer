/**
 * Server smoke tests: the health route answers, unknown API routes are a 404, and the
 * server still works when the website has not been built.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './helpers.ts';

describe('server basics', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // The test app points at a folder that does not exist, so no build is needed.
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', app: 'oncurve' });
  });

  it('returns 404 for an unknown API route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for a page when the website is not built', async () => {
    const response = await app.inject({ method: 'GET', url: '/limitations' });
    expect(response.statusCode).toBe(404);
  });
});
