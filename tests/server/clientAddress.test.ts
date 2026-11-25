/**
 * Tests for the visitor's address used by the per-address limits: behind Vercel it comes
 * from the header Vercel writes; locally a visitor-supplied header is ignored.
 */
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { clientAddress } from '../../server/security/clientAddress.ts';

/** A request with the given connection address and headers. */
function request(ip: string, headers: Record<string, string>): FastifyRequest {
  return { ip, headers } as unknown as FastifyRequest;
}

describe('the visitor’s address', () => {
  it('uses the header Vercel writes on the hosted site', () => {
    expect(
      clientAddress(request('10.0.0.1', { 'x-vercel-forwarded-for': '203.0.113.7' }), true),
    ).toBe('203.0.113.7');
    expect(clientAddress(request('10.0.0.1', { 'x-real-ip': '203.0.113.8' }), true)).toBe(
      '203.0.113.8',
    );
    expect(
      clientAddress(
        request('10.0.0.1', { 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.2' }),
        true,
      ),
    ).toBe('203.0.113.9');
    expect(clientAddress(request('10.0.0.1', {}), true)).toBe('10.0.0.1');
  });

  it('ignores such headers locally, where anyone could send them', () => {
    expect(
      clientAddress(request('127.0.0.1', { 'x-vercel-forwarded-for': '1.2.3.4' }), false),
    ).toBe('127.0.0.1');
  });
});
