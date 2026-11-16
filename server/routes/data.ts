/**
 * Routes for a signed-in user's own data: saved curves and points, the history of
 * calculations, and preferences (theme, text size, tour, practice record). Curves and
 * points are validated with the same engine as the website before they are stored, and
 * every query is filtered by the signed-in user's id.
 */
import { and, count, desc, eq, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createCurve, isEccError, makePoint, parseInteger } from '../../shared/ecc/index.ts';
import { history, savedItems, settings } from '../db/schema.ts';
import { fail, requireAuth } from './shared.ts';

/** Most saved items one account may keep. */
const MAX_SAVED = 200;
/** History entries kept per account; older ones are removed. */
const MAX_HISTORY = 200;

/** A number typed by the user, as text (decimal or 0x hexadecimal). */
const numberText = { type: 'string', minLength: 1, maxLength: 400 } as const;

/** Values of a saved curve or point. */
interface SavedData {
  p: string;
  a: string;
  b: string;
  x?: string;
  y?: string;
}

/** Register the data routes. */
export async function dataRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/api/saved', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    const rows = await db
      .select()
      .from(savedItems)
      .where(eq(savedItems.userId, auth.user.id))
      .orderBy(desc(savedItems.createdAt), desc(savedItems.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        data: JSON.parse(row.data) as SavedData,
        createdAt: row.createdAt,
      })),
    };
  });

  app.post<{ Body: { kind: 'curve' | 'point'; name: string; data: SavedData } }>(
    '/api/saved',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['curve', 'point'] },
            name: { type: 'string', minLength: 1, maxLength: 60 },
            data: {
              type: 'object',
              properties: {
                p: numberText,
                a: numberText,
                b: numberText,
                x: numberText,
                y: numberText,
              },
              required: ['p', 'a', 'b'],
              additionalProperties: false,
            },
          },
          required: ['kind', 'name', 'data'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const { kind, data } = request.body;
      const name = request.body.name.trim();
      if (name === '') return fail(reply, 400, 'Give it a name.');

      // Store only what the engine accepts: a valid curve, and for a point one that is on it.
      try {
        const curve = createCurve(
          parseInteger(data.p, 'p'),
          parseInteger(data.a, 'a'),
          parseInteger(data.b, 'b'),
        );
        if (kind === 'point') {
          if (data.x === undefined || data.y === undefined)
            return fail(reply, 400, 'A point needs x and y.');
          makePoint(curve, parseInteger(data.x, 'x'), parseInteger(data.y, 'y'));
        }
      } catch (error) {
        if (isEccError(error)) return fail(reply, 400, error.message);
        throw error;
      }

      const [{ total }] = (await db
        .select({ total: count() })
        .from(savedItems)
        .where(eq(savedItems.userId, auth.user.id))) as [{ total: number }];
      if (total >= MAX_SAVED) {
        return fail(reply, 400, `You can keep up to ${MAX_SAVED} saved items. Delete some first.`);
      }
      const stored: SavedData =
        kind === 'curve'
          ? { p: data.p, a: data.a, b: data.b }
          : { p: data.p, a: data.a, b: data.b, x: data.x, y: data.y };
      const inserted = await db
        .insert(savedItems)
        .values({
          userId: auth.user.id,
          kind,
          name,
          data: JSON.stringify(stored),
          createdAt: Date.now(),
        })
        .returning({ id: savedItems.id });
      return reply.code(201).send({ id: inserted[0]!.id });
    },
  );

  app.delete<{ Params: { id: number } }>(
    '/api/saved/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'integer', minimum: 1 } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const removed = await db
        .delete(savedItems)
        .where(and(eq(savedItems.id, request.params.id), eq(savedItems.userId, auth.user.id)))
        .returning({ id: savedItems.id });
      if (removed.length === 0) return fail(reply, 404, 'That item does not exist.');
      return { ok: true };
    },
  );

  app.get('/api/history', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    const rows = await db
      .select()
      .from(history)
      .where(eq(history.userId, auth.user.id))
      .orderBy(desc(history.createdAt), desc(history.id))
      .limit(MAX_HISTORY);
    return {
      entries: rows.map((row) => ({
        id: row.id,
        operation: row.operation,
        input: JSON.parse(row.input) as Record<string, unknown>,
        result: row.result,
        createdAt: row.createdAt,
      })),
    };
  });

  app.post<{
    Body: {
      operation: 'points' | 'add' | 'multiply';
      input: Record<string, string | boolean>;
      result: string;
    };
  }>(
    '/api/history',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['points', 'add', 'multiply'] },
            input: {
              type: 'object',
              properties: {
                p: numberText,
                a: numberText,
                b: numberText,
                px: { type: 'string', maxLength: 400 },
                py: { type: 'string', maxLength: 400 },
                pInfinity: { type: 'boolean' },
                qx: { type: 'string', maxLength: 400 },
                qy: { type: 'string', maxLength: 400 },
                qInfinity: { type: 'boolean' },
                k: { type: 'string', maxLength: 400 },
              },
              required: ['p', 'a', 'b'],
              additionalProperties: false,
            },
            result: { type: 'string', minLength: 1, maxLength: 1000 },
          },
          required: ['operation', 'input', 'result'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const now = Date.now();
      const { operation, input, result } = request.body;
      await db.insert(history).values({
        userId: auth.user.id,
        operation,
        input: JSON.stringify(input),
        result,
        createdAt: now,
      });
      // Keep only the newest entries: find the oldest one still kept, delete everything older.
      const kept = await db
        .select({ createdAt: history.createdAt })
        .from(history)
        .where(eq(history.userId, auth.user.id))
        .orderBy(desc(history.createdAt))
        .limit(1)
        .offset(MAX_HISTORY - 1);
      const oldestKept = kept[0]?.createdAt;
      if (oldestKept !== undefined) {
        await db
          .delete(history)
          .where(and(eq(history.userId, auth.user.id), lt(history.createdAt, oldestKept)));
      }
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete('/api/history', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    await db.delete(history).where(eq(history.userId, auth.user.id));
    return { ok: true };
  });

  const settingsSchema = {
    type: 'object',
    properties: {
      theme: { type: 'string', enum: ['light', 'dark'] },
      textSize: { type: 'string', enum: ['small', 'default', 'large', 'larger'] },
      tourDone: { type: 'boolean' },
      practice: {
        type: 'object',
        properties: {
          attempted: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          solved: { type: 'integer', minimum: 0, maximum: 1_000_000 },
        },
        required: ['attempted', 'solved'],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  } as const;

  app.get('/api/settings', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    const rows = await db.select().from(settings).where(eq(settings.userId, auth.user.id)).limit(1);
    return { settings: rows[0] ? (JSON.parse(rows[0].data) as Record<string, unknown>) : {} };
  });

  app.put<{ Body: Record<string, unknown> }>(
    '/api/settings',
    { schema: { body: settingsSchema } },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const rows = await db
        .select()
        .from(settings)
        .where(eq(settings.userId, auth.user.id))
        .limit(1);
      const merged = {
        ...(rows[0] ? (JSON.parse(rows[0].data) as Record<string, unknown>) : {}),
        ...request.body,
      };
      const data = JSON.stringify(merged);
      await db
        .insert(settings)
        .values({ userId: auth.user.id, data, updatedAt: Date.now() })
        .onConflictDoUpdate({ target: settings.userId, set: { data, updatedAt: Date.now() } });
      return { settings: merged };
    },
  );
}
