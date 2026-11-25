/**
 * The network address a request came from, for the per-address limits. Locally that is
 * the connection's own address. On the hosted site every request reaches the server
 * through Vercel's network, so the connection address is Vercel's, not the visitor's; there
 * the visitor's address comes from the x-vercel-forwarded-for header, which Vercel always
 * writes itself (a visitor cannot set it), with x-real-ip as a fallback.
 */
import type { FastifyRequest } from 'fastify';

/**
 * The visitor's address.
 *
 * @param request - the request.
 * @param hosted - true on the hosted site (HOSTED=1), where the headers above are trusted.
 * @returns the address, used only as a key for counting attempts.
 */
export function clientAddress(request: FastifyRequest, hosted: boolean): string {
  if (!hosted) return request.ip;
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip']) {
    const value = request.headers[name];
    const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.ip;
}
