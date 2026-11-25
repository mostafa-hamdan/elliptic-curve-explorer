/**
 * Tests for the "every number from a tool" check on AI answers, for the reasoning-effort
 * setting, and for both providers retrying once and then falling back. Scripted stand-ins
 * replace the models, so no real API call is made.
 */
import type Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicProvider } from '../../server/assistant/anthropic.ts';
import {
  AnswerCheck,
  canonicalNumber,
  UnverifiedAnswerError,
  unsupportedValues,
} from '../../server/assistant/numberCheck.ts';
import { OPENAI_BASE_URL, openAiProvider } from '../../server/assistant/openai.ts';
import type { AssistantProvider } from '../../server/assistant/run.ts';
import { runAssistantTool } from '../../server/assistant/tools.ts';
import { loadConfig } from '../../server/config.ts';
import { UNVERIFIED_NOTICE } from '../../server/routes/assistant.ts';
import { createTestApp, TestBrowser } from './helpers.ts';

const ADD_ARGS = { p: '23', a: '1', b: '1', px: '3', py: '10', qx: '9', qy: '7' };
const ASK = { question: 'What is (3, 10) + (9, 7) on E23(1, 1)?', history: [], context: '' };

describe('what the check looks at', () => {
  const addResult = runAssistantTool('add_points', ADD_ARGS);

  it('accepts the full hand working when every value comes from the tool', () => {
    const answer = [
      'λ = (7 − 10)/(9 − 3) = −3/6 ≡ 20 · 6⁻¹ (mod 23).',
      'The inverse is 6⁻¹ ≡ 4, because 6·4 = 24 ≡ 1.',
      'So λ = 20·4 = 80 ≡ 11.',
      'x₃ = 11² − 3 − 9 = 121 − 3 − 9 = 109 ≡ 17 and y₃ = 11·(3 − 17) − 10 = −164 ≡ 20.',
      'P + Q = **(17, 20)**.',
    ].join('\n');
    expect(unsupportedValues(answer, [ASK.question, addResult])).toEqual([]);
  });

  it('finds an invented point and an invented result', () => {
    const answer = 'λ = 11, so P + Q = (5, 7) and x₃ ≡ 13.';
    expect(unsupportedValues(answer, [ASK.question, addResult])).toEqual(['(5, 7)', '13']);
  });

  it('leaves numbers in the prose alone', () => {
    const answer = [
      'secp256k1 is a 256-bit curve, y² = x³ + 7, used by Bitcoin since 2009.',
      'Doubling uses λ = (3x₁² + a)/(2y₁), and 2P = P + P. NIST P-256 is a 256-bit curve too.',
      'Breaking it takes about 2^128 steps. The classroom curve is E23(1, 1).',
    ].join(' ');
    expect(unsupportedValues(answer, [])).toEqual([]);
  });

  it('skips algebra after "=" (2P, 3x, 2^256) but checks plain results', () => {
    expect(unsupportedValues('Q = 2P, λ = 3x₁² + a, p = 2^256 − 977', [])).toEqual([]);
    expect(unsupportedValues('k = 19', [])).toEqual(['19']);
    expect(unsupportedValues('k = 19', ['multiply by 19'])).toEqual([]);
  });

  it('does not take a name or a function for a point', () => {
    expect(unsupportedValues('On E23(1, 1), gcd(6, 23) is used.', [])).toEqual([]);
    expect(unsupportedValues('The point (6, 23) is not on it.', [])).toEqual(['(6, 23)']);
  });

  it('treats different ways of writing the same number as equal', () => {
    expect(canonicalNumber('0x0B')).toBe('11');
    expect(canonicalNumber('+011')).toBe('11');
    expect(canonicalNumber('1,234')).toBe('1234');
    expect(unsupportedValues('x = −3 and P = (0x3, 10)', ['-3 and (3, 10)'])).toEqual([]);
    expect(unsupportedValues('count = 200,776', ['"count":200776'])).toEqual([]);
  });

  it('accepts values from the question, the current work and earlier turns', () => {
    const check = new AnswerCheck(
      [{ role: 'assistant', text: 'Earlier: Q = (9, 7).' }],
      'Is k = 5 enough?',
      'curve E17(2, 2); P = (5, 1)',
    );
    expect(check.review('With k = 5, P = (5, 1) and Q = (9, 7).')).toBeNull();
  });

  it('reminds once, then gives up', () => {
    const check = new AnswerCheck([], 'question', '');
    const reminder = check.review('The answer is (5, 7).');
    expect(reminder).toContain('Check failed: (5, 7) does not appear');
    expect(() => check.review('The answer is (5, 7).')).toThrow(UnverifiedAnswerError);
  });

  it('accepts a value once a tool has produced it', () => {
    const check = new AnswerCheck([], 'question', '');
    expect(check.review('P + Q = (17, 20)')).not.toBeNull();
    check.addToolResult(runAssistantTool('add_points', ADD_ARGS));
    expect(check.review('P + Q = (17, 20)')).toBeNull();
  });
});

/** A model turn, described the same way for both providers. */
type Turn = { tool: Record<string, string> } | { text: string };

/** A stand-in OpenAI provider that plays back turns and records the requests. */
function scriptedOpenAi(turns: Turn[]) {
  const requests: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
  const provider = openAiProvider({
    responses: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const turn = turns.shift();
        if (!turn) throw new Error('No more scripted replies');
        const output =
          'tool' in turn
            ? [
                {
                  type: 'function_call',
                  id: 'fc_1',
                  call_id: 'call_1',
                  name: 'add_points',
                  arguments: JSON.stringify(turn.tool),
                },
              ]
            : [
                {
                  type: 'message',
                  id: 'msg_1',
                  role: 'assistant',
                  status: 'completed',
                  content: [{ type: 'output_text', text: turn.text, annotations: [] }],
                },
              ];
        return {
          id: 'resp',
          status: 'completed',
          error: null,
          incomplete_details: null,
          output,
        } as unknown as OpenAI.Responses.Response;
      },
    },
  });
  return { provider, requests };
}

/** A stand-in Anthropic provider that plays back turns and records the requests. */
function scriptedAnthropic(turns: Turn[]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const provider = anthropicProvider({
    messages: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const turn = turns.shift();
        if (!turn) throw new Error('No more scripted replies');
        const content =
          'tool' in turn
            ? [{ type: 'tool_use', id: 'call_1', name: 'add_points', input: turn.tool }]
            : [{ type: 'text', text: turn.text }];
        return {
          id: 'msg',
          type: 'message',
          role: 'assistant',
          content,
          stop_reason: 'tool' in turn ? 'tool_use' : 'end_turn',
        } as never;
      },
    },
  });
  return { provider, requests };
}

const PROVIDERS = [
  ['OpenAI', (turns: Turn[]) => scriptedOpenAi(turns)],
  ['Anthropic', (turns: Turn[]) => scriptedAnthropic(turns)],
] as const;

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A signed-in browser on an app that uses the given provider. */
async function signedIn(provider: AssistantProvider): Promise<TestBrowser> {
  ({ app } = await createTestApp({}, provider));
  const browser = new TestBrowser(app);
  await browser.signUp(`check-${Math.random()}@example.com`);
  return browser;
}

describe.each(PROVIDERS)('the number check with %s', (_name, build) => {
  it('passes an answer whose numbers came from a tool, with no extra request', async () => {
    const { provider, requests } = build([{ tool: ADD_ARGS }, { text: 'P + Q = (17, 20).' }]);
    const browser = await signedIn(provider);
    expect((await browser.request('POST', '/api/assistant', ASK)).json()).toEqual({
      answer: 'P + Q = (17, 20).',
      declined: false,
    });
    expect(requests).toHaveLength(2);
  });

  it('retries once with a reminder, and shows the corrected answer', async () => {
    const { provider, requests } = build([
      { text: 'P + Q = (5, 7).' },
      { tool: ADD_ARGS },
      { text: 'P + Q = (17, 20).' },
    ]);
    const browser = await signedIn(provider);
    expect((await browser.request('POST', '/api/assistant', ASK)).json().answer).toBe(
      'P + Q = (17, 20).',
    );
    expect(requests).toHaveLength(3);
    const second = JSON.stringify(requests[1]);
    expect(second).toContain('Check failed: (5, 7) does not appear');
  });

  it('answers with the offline helper when the retry fails as well', async () => {
    const { provider, requests } = build([
      { text: 'P + Q = (5, 7).' },
      { text: 'Sorry: P + Q = (5, 7).' },
    ]);
    const browser = await signedIn(provider);
    const response = await browser.request('POST', '/api/assistant', ASK);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ fallback: UNVERIFIED_NOTICE });
    expect(requests).toHaveLength(2);
  });
});

describe('the reasoning effort setting', () => {
  const SECRET = 'a-session-secret-that-is-long-enough-for-the-check';

  /** The effort read from OPENAI_REASONING_EFFORT. */
  function effortFrom(value: string): string | null {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.stubEnv('OPENAI_REASONING_EFFORT', value);
    return loadConfig().openaiReasoningEffort;
  }

  it('reads the setting, with "low" as the default', () => {
    expect(effortFrom('')).toBe('low');
    expect(effortFrom('Medium')).toBe('medium');
    expect(effortFrom('none')).toBe('none');
    expect(effortFrom('default')).toBeNull();
    expect(effortFrom('very high!')).toBe('low');
  });

  it('sends the effort, or leaves it out when set to the model default', async () => {
    const withEffort = scriptedOpenAi([{ text: 'ok' }]);
    await withEffort.provider.ask([], 'q', '');
    expect(withEffort.requests[0]!.reasoning).toEqual({ effort: 'low' });

    const requests: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
    const modelDefault = openAiProvider(
      {
        responses: {
          create: async (params) => {
            requests.push(params);
            return scriptedReply('ok');
          },
        },
      },
      { effort: null },
    );
    await modelDefault.ask([], 'q', '');
    expect(requests[0]).not.toHaveProperty('reasoning');
  });

  it('retries without the effort when a model refuses it, and stops sending it', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const answers = [
      {
        status: 400,
        body: {
          error: {
            message: "Unsupported value: 'reasoning.effort' does not support 'minimal'.",
            type: 'invalid_request_error',
            param: 'reasoning.effort',
            code: 'unsupported_value',
          },
        },
      },
      { status: 200, body: scriptedReply('first') },
      { status: 200, body: scriptedReply('second') },
    ];
    const client = new OpenAI({
      apiKey: 'test-key-not-real',
      baseURL: OPENAI_BASE_URL,
      maxRetries: 0,
      fetch: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        const answer = answers.shift()!;
        return new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const refused: string[] = [];
    const provider = openAiProvider(client, {
      effort: 'minimal',
      onEffortRejected: (effort) => refused.push(effort),
    });

    expect((await provider.ask([], 'q', '')).text).toBe('first');
    expect((await provider.ask([], 'q', '')).text).toBe('second');
    expect(calls.map((body) => body.reasoning)).toEqual([
      { effort: 'minimal' },
      undefined,
      undefined,
    ]);
    expect(refused).toEqual(['minimal']);
  });

  it('does not retry other bad requests', async () => {
    const provider = openAiProvider(
      {
        responses: {
          create: async () => {
            throw OpenAI.APIError.generate(
              400,
              { error: { message: 'bad input', param: 'input', code: 'invalid_value' } },
              undefined,
              new Headers(),
            );
          },
        },
      },
      { effort: 'low' },
    );
    await expect(provider.ask([], 'q', '')).rejects.toThrow();
  });
});

/** A completed response holding one text answer. */
function scriptedReply(text: string): OpenAI.Responses.Response {
  return {
    id: 'resp',
    object: 'response',
    status: 'completed',
    error: null,
    incomplete_details: null,
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  } as unknown as OpenAI.Responses.Response;
}
