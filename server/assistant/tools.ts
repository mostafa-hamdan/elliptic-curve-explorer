/**
 * The tools the AI assistant may call. Every one is backed by the app's own elliptic
 * curve engine, so every number in an AI answer comes from the same code as the Explorer.
 * Inputs are checked here again (the model's arguments are untrusted), and each result
 * is returned as JSON text the model reads.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import {
  add,
  addWithSteps,
  createCurve,
  inverseTrace,
  isEccError,
  isPrime,
  listPoints,
  makePoint,
  multiplyWithSteps,
  parseInteger,
  singularityValue,
  type Curve,
  type Point,
} from '../../shared/ecc/index.ts';

/** Largest p for which the assistant lists points (the answer must stay readable). */
export const ASSISTANT_LIST_MAX_P = 2000n;
/** Most points copied into one tool result. */
const LIST_SHOWN = 200;
/** Most additions tried when finding the order of a point one step at a time. */
const ORDER_MAX_STEPS = 20_000;

/** A number field in a tool schema: decimal text, or hexadecimal with 0x. */
const numberText = {
  type: 'string',
  description: 'A whole number as text: decimal, or hexadecimal starting with 0x.',
} as const;

/** The curve fields shared by most tools. */
const curveFields = { p: numberText, a: numberText, b: numberText } as const;

/** The arguments of one tool, as a JSON schema. */
interface ToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
  /** Both SDKs type a JSON schema as an open object. */
  [key: string]: unknown;
}

/** One tool, in a form that does not depend on the AI provider. */
export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

/** The six tools. Both providers receive exactly these names, texts and schemas. */
export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'check_curve',
    description:
      'Check whether p, a, b define a valid elliptic curve Ep(a, b) (p prime > 3, non-singular). Returns the reduced a and b and 4a³ + 27b² mod p.',
    parameters: {
      type: 'object',
      properties: curveFields,
      required: ['p', 'a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_points',
    description: `List all points of a curve with p ≤ ${ASSISTANT_LIST_MAX_P}, with the total count including the point at infinity O. At most ${LIST_SHOWN} points are listed.`,
    parameters: {
      type: 'object',
      properties: curveFields,
      required: ['p', 'a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_points',
    description:
      'Add two points P + Q on a curve (use the same point twice to double it). Use "O" for the point at infinity. Returns the result and every step: slope fraction, modular inverse, λ, x₃, y₃.',
    parameters: {
      type: 'object',
      properties: {
        ...curveFields,
        px: { type: 'string', description: 'x of P, or "O" for the point at infinity.' },
        py: { type: 'string', description: 'y of P ("O" when P is the point at infinity).' },
        qx: { type: 'string', description: 'x of Q, or "O" for the point at infinity.' },
        qy: { type: 'string', description: 'y of Q ("O" when Q is the point at infinity).' },
      },
      required: ['p', 'a', 'b', 'px', 'py', 'qx', 'qy'],
      additionalProperties: false,
    },
  },
  {
    name: 'multiply_point',
    description:
      'Compute kP with double-and-add. Returns the result, k in binary and the running result after each bit.',
    parameters: {
      type: 'object',
      properties: {
        ...curveFields,
        px: { type: 'string', description: 'x of P, or "O".' },
        py: { type: 'string', description: 'y of P, or "O".' },
        k: numberText,
      },
      required: ['p', 'a', 'b', 'px', 'py', 'k'],
      additionalProperties: false,
    },
  },
  {
    name: 'point_order',
    description: `Find the order of a point (the smallest n ≥ 1 with nP = O) by adding P repeatedly, up to ${ORDER_MAX_STEPS} steps.`,
    parameters: {
      type: 'object',
      properties: { ...curveFields, px: numberText, py: numberText },
      required: ['p', 'a', 'b', 'px', 'py'],
      additionalProperties: false,
    },
  },
  {
    name: 'modular_inverse',
    description:
      'Compute value⁻¹ mod m with the extended Euclidean algorithm, returning every division line. Also says whether m is prime.',
    parameters: {
      type: 'object',
      properties: { value: numberText, modulus: numberText },
      required: ['value', 'modulus'],
      additionalProperties: false,
    },
  },
];

/**
 * The tools in the format of Anthropic's Messages API. Strict schemas keep the arguments
 * well-formed.
 *
 * @returns one tool definition per engine tool.
 */
export function anthropicTools(): Anthropic.Tool[] {
  return ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    input_schema: parameters,
    strict: true,
  }));
}

/**
 * The tools in the format of OpenAI's Responses API. Strict schemas keep the arguments
 * well-formed.
 *
 * @returns one function definition per engine tool.
 */
export function openAiTools(): OpenAI.Responses.FunctionTool[] {
  return ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({
    type: 'function',
    name,
    description,
    parameters: { ...parameters },
    strict: true,
  }));
}

/** Read a whole number from a tool argument (the model's text is untrusted). */
function number(input: Record<string, unknown>, key: string): bigint {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`${key} is missing.`);
  return parseInteger(value, key);
}

/** Read and validate the curve arguments. */
function curveFrom(input: Record<string, unknown>): Curve {
  return createCurve(number(input, 'p'), number(input, 'a'), number(input, 'b'));
}

/** Read a point argument: "O" means the point at infinity. */
function pointFrom(
  curve: Curve,
  input: Record<string, unknown>,
  xKey: string,
  yKey: string,
): Point {
  const x = input[xKey];
  if (typeof x === 'string' && x.trim().toUpperCase() === 'O') return null;
  return makePoint(curve, number(input, xKey), number(input, yKey));
}

/** Write a point for the model. */
function show(point: Point): string {
  return point === null ? 'O' : `(${point.x}, ${point.y})`;
}

/**
 * Run one tool.
 *
 * @param name - the tool the model asked for.
 * @param input - its arguments.
 * @returns JSON text with the result, or with an "error" field the model can explain.
 */
export function runAssistantTool(name: string, input: unknown): string {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  try {
    switch (name) {
      case 'check_curve': {
        const p = number(args, 'p');
        const a = number(args, 'a');
        const b = number(args, 'b');
        try {
          const curve = createCurve(p, a, b);
          return JSON.stringify({
            valid: true,
            p: String(curve.p),
            a: String(curve.a),
            b: String(curve.b),
            singularity: String(singularityValue(curve.p, curve.a, curve.b)),
            // The unreduced value too, so an answer can quote the whole line of working.
            singularityWork: `4a³ + 27b² = ${4n * curve.a ** 3n + 27n * curve.b ** 2n} ≡ ${singularityValue(curve.p, curve.a, curve.b)} (mod p)`,
          });
        } catch (error) {
          if (!isEccError(error)) throw error;
          return JSON.stringify({ valid: false, reason: error.message, pIsPrime: isPrime(p) });
        }
      }
      case 'list_points': {
        const curve = curveFrom(args);
        if (curve.p > ASSISTANT_LIST_MAX_P) {
          return JSON.stringify({
            error: `The assistant lists points only for p ≤ ${ASSISTANT_LIST_MAX_P}; the Explorer lists up to p = 200000.`,
          });
        }
        const points = listPoints(curve);
        return JSON.stringify({
          count: points.length + 1,
          countNote: 'count includes the point at infinity O',
          points: points.slice(0, LIST_SHOWN).map(show),
          truncated: points.length > LIST_SHOWN,
        });
      }
      case 'add_points': {
        const curve = curveFrom(args);
        const trace = addWithSteps(
          curve,
          pointFrom(curve, args, 'px', 'py'),
          pointFrom(curve, args, 'qx', 'qy'),
        );
        const slope = trace.slope;
        const P = trace.p;
        const Q = trace.q;
        const R = trace.result;
        // Every intermediate value of the hand method is included, so an answer that writes
        // out the working can quote each number from here (see numberCheck.ts).
        const work =
          slope && P && Q && R && slope.inverse.inverse !== null
            ? {
                inverseCheck: `${slope.denominator}·${slope.inverse.inverse} = ${slope.denominator * slope.inverse.inverse} ≡ 1`,
                lambdaWork: `${slope.numerator}·${slope.inverse.inverse} = ${slope.product} ≡ ${slope.lambda}`,
                x3Work: `${slope.lambda}² − ${P.x} − ${Q.x} = ${slope.lambda ** 2n} − ${P.x} − ${Q.x} = ${trace.x3Raw} ≡ ${R.x}`,
                y3Work: `${slope.lambda}·(${P.x} − ${R.x}) − ${P.y} = ${slope.lambda}·(${P.x - R.x}) − ${P.y} = ${slope.lambda * (P.x - R.x)} − ${P.y} = ${trace.y3Raw} ≡ ${R.y}`,
              }
            : {};
        return JSON.stringify({
          rule: trace.kind,
          result: show(trace.result),
          steps: slope
            ? {
                numerator: `${slope.numeratorRaw} ≡ ${slope.numerator}`,
                denominator: `${slope.denominatorRaw} ≡ ${slope.denominator}`,
                inverseOfDenominator: String(slope.inverse.inverse),
                euclidLines: slope.inverse.steps
                  .slice(0, 20)
                  .map(
                    (step) =>
                      `${step.dividend} = ${step.quotient}·${step.divisor} + ${step.remainder}`,
                  ),
                lambda: String(slope.lambda),
                x3: `${trace.x3Raw} ≡ ${trace.result === null ? '' : trace.result.x}`,
                y3: `${trace.y3Raw} ≡ ${trace.result === null ? '' : trace.result.y}`,
                ...work,
              }
            : null,
        });
      }
      case 'multiply_point': {
        const curve = curveFrom(args);
        const trace = multiplyWithSteps(
          curve,
          number(args, 'k'),
          pointFrom(curve, args, 'px', 'py'),
        );
        return JSON.stringify({
          result: show(trace.result),
          kBinary: trace.bits,
          negated: trace.negated,
          doublings: trace.doublings,
          additions: trace.additions,
          rows: trace.rows
            .slice(0, 40)
            .map(
              (row) => `bit ${row.bit}: ${row.operation} → ${row.multiple}P = ${show(row.result)}`,
            ),
        });
      }
      case 'point_order': {
        const curve = curveFrom(args);
        const P = makePoint(curve, number(args, 'px'), number(args, 'py'));
        // Walk P, 2P, 3P, …: the first n with nP = O is the order.
        let running: Point = P;
        for (let n = 1; n <= ORDER_MAX_STEPS; n += 1) {
          if (running === null) return JSON.stringify({ order: n });
          running = add(curve, running, P);
        }
        return JSON.stringify({
          error: `The order is larger than ${ORDER_MAX_STEPS}; it cannot be found by adding P one step at a time.`,
        });
      }
      case 'modular_inverse': {
        const modulus = number(args, 'modulus');
        if (modulus < 2n) return JSON.stringify({ error: 'The modulus must be at least 2.' });
        const trace = inverseTrace(number(args, 'value'), modulus);
        return JSON.stringify({
          inverse: trace.inverse === null ? null : String(trace.inverse),
          gcd: String(trace.gcd),
          check:
            trace.inverse === null
              ? null
              : `${trace.value}·${trace.inverse} = ${trace.value * trace.inverse} ≡ 1 (mod ${modulus})`,
          modulusIsPrime: isPrime(modulus),
          lines: trace.steps
            .slice(0, 30)
            .map(
              (step) => `${step.dividend} = ${step.quotient}·${step.divisor} + ${step.remainder}`,
            ),
        });
      }
      default:
        return JSON.stringify({ error: `There is no tool called ${name}.` });
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : 'The calculation failed.',
    });
  }
}
