/**
 * Tests for the AI provider setting, with scripted stand-ins so no real API call is made.
 * The same route behavior is checked for both providers. For OpenAI the real SDK also runs
 * against a fake network, which proves the exact endpoint and how real errors are handled.
 * Also covers the global daily cap.
 */
import type Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicProvider, type AnthropicClient } from '../../server/assistant/anthropic.ts';
import {
  countDailyQuestion,
  DAILY_LIMIT_NOTICE,
  dailyLimitReached,
  startOfUtcDay,
} from '../../server/assistant/dailyLimit.ts';
import {
  explainOpenAiFailure,
  OPENAI_BASE_URL,
  openAiProvider,
  type OpenAiClient,
} from '../../server/assistant/openai.ts';
import { createAssistantProvider, describeAiSetup } from '../../server/assistant/provider.ts';
import { SYSTEM_PROMPT, type AssistantProvider } from '../../server/assistant/run.ts';
import { anthropicTools, ASSISTANT_TOOLS, openAiTools } from '../../server/assistant/tools.ts';
import { loadConfig, type ServerConfig } from '../../server/config.ts';
import { openDatabase } from '../../server/db/client.ts';
import { AI_MESSAGES_PER_HOUR } from '../../server/routes/assistant.ts';
import { createTestApp, TEST_CONFIG, TestBrowser } from './helpers.ts';

const ASK = { question: 'What is (3, 10) + (9, 7) on E23(1, 1)?', history: [], context: '' };
const ADD_ARGS = { p: '23', a: '1', b: '1', px: '3', py: '10', qx: '9', qy: '7' };

/** One model turn, described the same way for both providers. */
type Turn = { tool: Record<string, string> } | { text: string } | { refuse: true } | Error;

/** Build an OpenAI response object. Only the fields the app reads are filled in. */
function openAiResponse(output: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    error: null,
    incomplete_details: null,
    output,
    ...extra,
  } as unknown as OpenAI.Responses.Response;
}

/** An OpenAI message item holding one content part. */
function openAiMessage(part: Record<string, unknown>) {
  return { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [part] };
}

/** A provider built on a stand-in OpenAI client that plays back the given turns. */
function scriptedOpenAi(turns: Turn[]) {
  const requests: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
  const client: OpenAiClient = {
    responses: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const turn = turns.shift();
        if (!turn) throw new Error('No more scripted replies');
        if (turn instanceof Error) throw turn;
        if ('tool' in turn) {
          return openAiResponse([
            { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' },
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'add_points',
              arguments: JSON.stringify(turn.tool),
            },
          ]);
        }
        if ('refuse' in turn) {
          return openAiResponse([openAiMessage({ type: 'refusal', refusal: 'No.' })]);
        }
        return openAiResponse([
          openAiMessage({ type: 'output_text', text: turn.text, annotations: [] }),
        ]);
      },
    },
  };
  return { provider: openAiProvider(client), requests };
}

/** A provider built on a stand-in Anthropic client that plays back the given turns. */
function scriptedAnthropic(turns: Turn[]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: AnthropicClient = {
    messages: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const turn = turns.shift();
        if (!turn) throw new Error('No more scripted replies');
        if (turn instanceof Error) throw turn;
        const message = (content: unknown[], stop_reason: string) =>
          ({ id: 'msg', type: 'message', role: 'assistant', content, stop_reason }) as never;
        if ('tool' in turn) {
          return message(
            [{ type: 'tool_use', id: 'call_1', name: 'add_points', input: turn.tool }],
            'tool_use',
          );
        }
        if ('refuse' in turn) return message([], 'refusal');
        return message([{ type: 'text', text: turn.text }], 'end_turn');
      },
    },
  };
  return { provider: anthropicProvider(client), requests };
}

const PROVIDERS = [
  ['OpenAI', (turns: Turn[]) => scriptedOpenAi(turns)],
  ['Anthropic', (turns: Turn[]) => scriptedAnthropic(turns)],
] as const;

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A signed-in browser on an app that uses the given provider. */
async function signedIn(
  provider: AssistantProvider | null,
  config: Partial<ServerConfig> = {},
): Promise<TestBrowser> {
  ({ app } = await createTestApp(config, provider));
  const browser = new TestBrowser(app);
  await browser.signUp(`ai-${Math.random()}@example.com`);
  return browser;
}

/** An API error as the OpenAI SDK raises it. */
function openAiError(status: number, code: string): Error {
  return OpenAI.APIError.generate(
    status,
    { error: { message: 'secret provider text', type: 'error', code } },
    undefined,
    new Headers(),
  );
}

describe.each(PROVIDERS)('the same rules with %s', (name, build) => {
  it('runs the engine tool and returns the final answer', async () => {
    const { provider } = build([{ tool: ADD_ARGS }, { text: 'P + Q = **(17, 20)**.' }]);
    const browser = await signedIn(provider);
    const response = await browser.request('POST', '/api/assistant', ASK);
    expect(response.json()).toEqual({ answer: 'P + Q = **(17, 20)**.', declined: false });
  });

  it('sends the engine result back to the model', async () => {
    const { provider, requests } = build([{ tool: ADD_ARGS }, { text: 'done' }]);
    const browser = await signedIn(provider);
    await browser.request('POST', '/api/assistant', ASK);
    expect(requests).toHaveLength(2);
    const second = JSON.stringify(requests[1]);
    expect(second).toContain('call_1');
    expect(second).toContain('(17, 20)');
  });

  it('turns a refusal into a polite message', async () => {
    const { provider } = build([{ refuse: true }]);
    const browser = await signedIn(provider);
    expect((await browser.request('POST', '/api/assistant', ASK)).json()).toMatchObject({
      declined: true,
    });
  });

  it('stops after too many tool rounds', async () => {
    const { provider, requests } = build(Array.from({ length: 12 }, () => ({ tool: ADD_ARGS })));
    const browser = await signedIn(provider);
    const answer = (await browser.request('POST', '/api/assistant', ASK)).json().answer;
    expect(answer).toMatch(/too many calculations/);
    expect(requests).toHaveLength(7);
  });

  it(`keeps the limit of ${AI_MESSAGES_PER_HOUR} questions per user per hour`, async () => {
    const { provider } = build(
      Array.from({ length: AI_MESSAGES_PER_HOUR + 1 }, () => ({ text: 'ok' })),
    );
    const browser = await signedIn(provider);
    for (let index = 0; index < AI_MESSAGES_PER_HOUR; index += 1) {
      expect((await browser.request('POST', '/api/assistant', ASK)).json().answer).toBe('ok');
    }
    expect((await browser.request('POST', '/api/assistant', ASK)).json().fallback).toMatch(
      /used your 20 AI questions/,
    );
  });

  it('keeps the 500-character limit and refuses guests', async () => {
    const { provider, requests } = build([]);
    const browser = await signedIn(provider);
    const long = { ...ASK, question: 'x'.repeat(501) };
    expect((await browser.request('POST', '/api/assistant', long)).statusCode).toBe(400);
    const guest = new TestBrowser(app!);
    await guest.start();
    expect((await guest.request('POST', '/api/assistant', ASK)).statusCode).toBe(401);
    expect(requests).toHaveLength(0);
  });

  it('names itself in the status, so the page can say who receives the questions', async () => {
    const browser = await signedIn(build([]).provider);
    expect((await browser.request('GET', '/api/assistant/status')).json()).toMatchObject({
      ai: true,
      provider: name,
    });
  });

  it('stops at the daily cap for every user, with a short notice', async () => {
    const { provider, requests } = build([{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
    const first = await signedIn(provider, { aiDailyLimit: 2 });
    const second = new TestBrowser(app!, '198.51.100.8');
    await second.signUp(`other-${Math.random()}@example.com`);

    expect((await first.request('POST', '/api/assistant', ASK)).json().answer).toBe('one');
    expect((await second.request('POST', '/api/assistant', ASK)).json().answer).toBe('two');

    for (const browser of [first, second]) {
      expect((await browser.request('POST', '/api/assistant', ASK)).json()).toEqual({
        fallback: DAILY_LIMIT_NOTICE,
        aiOff: true,
      });
      expect((await browser.request('GET', '/api/assistant/status')).json()).toMatchObject({
        ai: false,
        reason: DAILY_LIMIT_NOTICE,
      });
    }
    expect(requests).toHaveLength(2);
  });
});

describe('OpenAI requests', () => {
  it('uses the model, low effort, the scope prompt, six strict tools and no storage', async () => {
    const { provider, requests } = scriptedOpenAi([{ text: 'ok' }]);
    const browser = await signedIn(provider);
    await browser.request('POST', '/api/assistant', { ...ASK, context: 'Curve E23(1, 1)' });
    const request = requests[0]!;
    expect(request.model).toBe('gpt-6-luna');
    expect(request.reasoning).toEqual({ effort: 'low' });
    expect(request.instructions).toBe(SYSTEM_PROMPT);
    expect(request.store).toBe(false);
    expect(request.tools).toHaveLength(6);
    expect(JSON.stringify(request.input)).toContain('My current work in OnCurve: Curve E23(1, 1)');
  });

  it('passes the reasoning item back with the tool output', async () => {
    const { provider, requests } = scriptedOpenAi([{ tool: ADD_ARGS }, { text: 'done' }]);
    await provider.ask([], 'question', '');
    const types = (requests[1]!.input as Array<{ type?: string }>).map((item) => item.type);
    expect(types).toEqual([undefined, 'reasoning', 'function_call', 'function_call_output']);
  });

  it('gives bad tool arguments back to the model as an error instead of crashing', async () => {
    const requests: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
    const replies = [
      openAiResponse([
        { type: 'function_call', id: 'fc', call_id: 'c', name: 'add_points', arguments: '{oops' },
      ]),
      openAiResponse([openAiMessage({ type: 'output_text', text: 'sorry', annotations: [] })]),
    ];
    const provider = openAiProvider({
      responses: {
        create: async (params) => {
          requests.push(structuredClone(params));
          return replies.shift()!;
        },
      },
    });
    expect(await provider.ask([], 'q', '')).toEqual({ kind: 'answer', text: 'sorry' });
    expect(JSON.stringify(requests[1]!.input)).toContain('is missing');
  });

  it('handles answers cut short, filtered or failed', async () => {
    const replying = (reply: OpenAI.Responses.Response) =>
      openAiProvider({ responses: { create: async () => reply } });

    const cut = await replying(
      openAiResponse([openAiMessage({ type: 'output_text', text: 'partial', annotations: [] })], {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    ).ask([], 'q', '');
    expect(cut.text).toBe('partial\n\n(The answer was cut short.)');

    const filtered = await replying(
      openAiResponse([], {
        status: 'incomplete',
        incomplete_details: { reason: 'content_filter' },
      }),
    ).ask([], 'q', '');
    expect(filtered.kind).toBe('declined');

    await expect(
      replying(
        openAiResponse([], {
          status: 'failed',
          error: { code: 'server_error', message: 'x' },
        }),
      ).ask([], 'q', ''),
    ).rejects.toThrow();
  });
});

describe('OpenAI failures', () => {
  it.each([
    ['rate limit', 429, 'rate_limit_exceeded'],
    ['exhausted budget', 429, 'insufficient_quota'],
    ['hard spending limit', 400, 'billing_hard_limit_reached'],
    ['model not allowed for the project', 403, 'model_not_found'],
    ['model not found', 404, 'model_not_found'],
  ])('falls back quietly on a %s', async (_label, status, code) => {
    const { provider } = scriptedOpenAi([openAiError(status, code)]);
    const browser = await signedIn(provider);
    const response = await browser.request('POST', '/api/assistant', ASK);
    // Status 200, so the browser logs no network error in its console.
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-oncurve-status']).toBeUndefined();
    expect(response.json()).toEqual({
      fallback: 'AI mode is unavailable right now.',
      quiet: true,
    });
    expect(response.body).not.toContain('secret provider text');
  });

  it('still explains a rejected key or a lost connection', () => {
    expect(explainOpenAiFailure(openAiError(401, 'invalid_api_key'))).toEqual({
      reason: 'The AI key on this server is not accepted.',
      quiet: false,
    });
    expect(explainOpenAiFailure(new OpenAI.APIConnectionError({ message: 'offline' }))).toEqual({
      reason: 'The AI service cannot be reached (no internet?).',
      quiet: false,
    });
    expect(explainOpenAiFailure(new Error('anything else')).quiet).toBe(false);
  });
});

describe('the real OpenAI SDK against a fake network', () => {
  /** A real client whose requests are recorded and answered locally. */
  function fakeNetwork(answers: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const client = new OpenAI({
      apiKey: 'test-key-not-real',
      baseURL: OPENAI_BASE_URL,
      maxRetries: 0,
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        const answer = answers.shift()!;
        return new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    return { client, calls };
  }

  it('only ever calls POST https://api.openai.com/v1/responses', async () => {
    const { client, calls } = fakeNetwork([
      {
        status: 200,
        body: openAiResponse([
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'add_points',
            arguments: JSON.stringify(ADD_ARGS),
          },
        ]),
      },
      {
        status: 200,
        body: openAiResponse([
          openAiMessage({ type: 'output_text', text: '(17, 20)', annotations: [] }),
        ]),
      },
    ]);
    const outcome = await openAiProvider(client).ask([], 'question', '');
    expect(outcome.text).toBe('(17, 20)');
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://api.openai.com/v1/responses',
      'POST https://api.openai.com/v1/responses',
    ]);
    expect(calls[0]!.body.reasoning).toEqual({ effort: 'low' });
  });

  it('classifies a real budget error as quiet', async () => {
    const { client } = fakeNetwork([
      {
        status: 429,
        body: { error: { message: 'over quota', type: 'x', code: 'insufficient_quota' } },
      },
    ]);
    const provider = openAiProvider(client);
    const error = await provider.ask([], 'question', '').catch((caught: unknown) => caught);
    expect(provider.explainFailure(error)).toEqual({
      reason: 'AI mode is unavailable right now.',
      quiet: true,
    });
  });
});

describe('both tool formats', () => {
  it('offers the same six tools with strict schemas', () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      'check_curve',
      'list_points',
      'add_points',
      'multiply_point',
      'point_order',
      'modular_inverse',
    ]);
    expect(anthropicTools().map((tool) => tool.name)).toEqual(names);
    expect(openAiTools().map((tool) => tool.name)).toEqual(names);
    for (const tool of openAiTools()) {
      expect(tool.strict).toBe(true);
      expect(tool.parameters?.additionalProperties).toBe(false);
      // OpenAI's strict mode requires every property to be listed as required.
      expect([...(tool.parameters!.required as string[])].sort()).toEqual(
        Object.keys(tool.parameters!.properties as object).sort(),
      );
    }
  });
});

describe('the daily cap', () => {
  const NOON = Date.UTC(2026, 10, 22, 12);

  it('counts across the day and restarts at midnight UTC', async () => {
    const { db } = await openDatabase(':memory:');
    expect(await countDailyQuestion(db, 2, NOON)).toBe(true);
    expect(await dailyLimitReached(db, 2, NOON)).toBe(false);
    expect(await countDailyQuestion(db, 2, NOON + 1000)).toBe(true);
    expect(await dailyLimitReached(db, 2, NOON + 1000)).toBe(true);
    expect(await countDailyQuestion(db, 2, NOON + 2000)).toBe(false);

    const lastMoment = Date.UTC(2026, 10, 22, 23, 59, 59, 999);
    expect(await dailyLimitReached(db, 2, lastMoment)).toBe(true);
    const midnight = Date.UTC(2026, 10, 23);
    expect(startOfUtcDay(lastMoment + 1)).toBe(midnight);
    expect(await dailyLimitReached(db, 2, midnight)).toBe(false);
    expect(await countDailyQuestion(db, 2, midnight)).toBe(true);
    expect(await dailyLimitReached(db, 2, midnight)).toBe(false);
  });

  it('treats a limit of 0 as AI mode off', async () => {
    const { db } = await openDatabase(':memory:');
    expect(await dailyLimitReached(db, 0, NOON)).toBe(true);
    const { provider, requests } = scriptedOpenAi([{ text: 'never' }]);
    const browser = await signedIn(provider, { aiDailyLimit: 0 });
    expect((await browser.request('POST', '/api/assistant', ASK)).json().aiOff).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('does not use up a user’s hourly questions once the day is full', async () => {
    const { provider } = scriptedOpenAi([{ text: 'one' }]);
    const browser = await signedIn(provider, { aiDailyLimit: 1 });
    await browser.request('POST', '/api/assistant', ASK);
    for (let index = 0; index < AI_MESSAGES_PER_HOUR + 2; index += 1) {
      expect((await browser.request('POST', '/api/assistant', ASK)).json().fallback).toBe(
        DAILY_LIMIT_NOTICE,
      );
    }
  });

  it('counts a question that failed at the provider, since it may have cost money', async () => {
    const { provider } = scriptedOpenAi([openAiError(500, 'server_error')]);
    const browser = await signedIn(provider, { aiDailyLimit: 1 });
    expect((await browser.request('POST', '/api/assistant', ASK)).json().fallback).toBeTruthy();
    expect((await browser.request('POST', '/api/assistant', ASK)).json().aiOff).toBe(true);
  });

  it('opens again the next day', async () => {
    // Half an hour either side of midnight, so the two-hour session stays signed in.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 10, 22, 23, 30) });
    const { provider } = scriptedOpenAi([{ text: 'today' }, { text: 'tomorrow' }]);
    const browser = await signedIn(provider, { aiDailyLimit: 1 });
    expect((await browser.request('POST', '/api/assistant', ASK)).json().answer).toBe('today');
    expect((await browser.request('POST', '/api/assistant', ASK)).json().aiOff).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 10, 23, 0, 30));
    expect((await browser.request('POST', '/api/assistant', ASK)).json().answer).toBe('tomorrow');
  });
});

describe('the provider setting', () => {
  const SECRET = 'a-session-secret-that-is-long-enough-for-the-check';

  /** Read the settings from the given environment, with everything else empty. */
  function configFrom(env: Record<string, string>): ServerConfig {
    vi.stubEnv('SESSION_SECRET', SECRET);
    for (const name of [
      'AI_PROVIDER',
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'ANTHROPIC_API_KEY',
      'AI_DAILY_LIMIT',
      'OPENAI_REASONING_EFFORT',
    ]) {
      vi.stubEnv(name, env[name] ?? '');
    }
    return loadConfig();
  }

  it('defaults to OpenAI, gpt-6-luna, low effort and 50 questions a day', () => {
    expect(configFrom({})).toMatchObject({
      aiProvider: 'openai',
      openaiModel: 'gpt-6-luna',
      openaiReasoningEffort: 'low',
      aiDailyLimit: 50,
    });
  });

  it('reads the limit, and treats nonsense as the default rather than as no limit', () => {
    expect(configFrom({ AI_DAILY_LIMIT: '7' }).aiDailyLimit).toBe(7);
    expect(configFrom({ AI_DAILY_LIMIT: '0' }).aiDailyLimit).toBe(0);
    for (const bad of ['-1', 'many', '1.5', '1e9', '99999999999999999999']) {
      expect(configFrom({ AI_DAILY_LIMIT: bad }).aiDailyLimit, bad).toBe(50);
    }
  });

  it('contacts only the chosen provider, even when both keys are set', () => {
    const both = { OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };
    expect(createAssistantProvider(configFrom({ ...both, AI_PROVIDER: 'openai' }))?.name).toBe(
      'OpenAI',
    );
    expect(createAssistantProvider(configFrom({ ...both, AI_PROVIDER: 'Anthropic' }))?.name).toBe(
      'Anthropic',
    );
  });

  it('never falls through to the other provider when the chosen key is missing', () => {
    expect(
      createAssistantProvider(configFrom({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'a' })),
    ).toBeNull();
    expect(
      createAssistantProvider(configFrom({ AI_PROVIDER: 'anthropic', OPENAI_API_KEY: 'o' })),
    ).toBeNull();
  });

  it('turns AI mode off for an unknown provider, and says so at start-up', () => {
    const config = configFrom({
      AI_PROVIDER: 'opnai',
      OPENAI_API_KEY: 'o',
      ANTHROPIC_API_KEY: 'a',
    });
    expect(config.aiProvider).toBeNull();
    expect(createAssistantProvider(config)).toBeNull();
    expect(describeAiSetup(config)).toMatch(/must be "openai" or "anthropic"/);
  });

  it('says at start-up where the questions go, without printing a key', () => {
    const message = describeAiSetup({
      ...TEST_CONFIG,
      openaiApiKey: 'do-not-print-this',
    });
    expect(message).toContain('OpenAI');
    expect(message).toContain('gpt-6-luna');
    expect(message).not.toContain('do-not-print-this');
    expect(describeAiSetup(TEST_CONFIG)).toContain('no OPENAI_API_KEY');
  });
});
