/**
 * A short description of the user's current work (curve, points, k, latest results),
 * sent with an AI-mode question so "explain my last result" and "is my P right?" make
 * sense to the model. Long numbers are shortened so the description stays small.
 */
import { curveName } from '@shared/ecc/index.ts';
import { pointText, shortNumber } from '../../lib/format.ts';
import type { PointDraft } from '../explorer/validation.ts';
import type { HelperContext } from './offlineHelper.ts';

/** Most characters sent (the server accepts up to 1000). */
const MAX_CONTEXT = 900;

/** A typed coordinate, shortened when it is a long number. */
function brief(text: string): string {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) && trimmed.length > 24
    ? shortNumber(BigInt(trimmed))
    : trimmed.slice(0, 40);
}

/** A typed point as text: "O", "(3, 10)", or null when nothing usable is typed. */
function draftText(draft: PointDraft): string | null {
  if (draft.infinity) return 'O';
  if (draft.x.trim() === '' || draft.y.trim() === '') return null;
  return `(${brief(draft.x)}, ${brief(draft.y)})`;
}

/**
 * Describe the current work in one or two sentences.
 *
 * @param helper - the results the offline helper also uses.
 * @param inputs - what is typed in the P, Q and k boxes.
 * @returns the description, at most about 900 characters; empty when there is no curve.
 */
export function describeWork(
  helper: HelperContext,
  inputs: { pointP: PointDraft; pointQ: PointDraft; k: string },
): string {
  if (!helper.curve) return '';
  const parts = [
    `curve ${curveName(helper.curve).length < 60 ? curveName(helper.curve) : `with a ${helper.curve.p.toString(2).length}-bit p`}`,
  ];
  const P = draftText(inputs.pointP);
  const Q = draftText(inputs.pointQ);
  if (P) parts.push(`P = ${P}`);
  if (Q) parts.push(`Q = ${Q}`);
  if (inputs.k.trim()) parts.push(`k = ${brief(inputs.k)}`);
  parts.push(`open tab: ${helper.tab}`);
  if (helper.points) parts.push(`all points found: ${helper.points.count + 1} including O`);
  if (helper.add) {
    parts.push(
      `last addition: ${pointText(helper.add.trace.p, true)} + ${pointText(helper.add.trace.q, true)} = ${pointText(helper.add.trace.result, true)}`,
    );
  }
  if (helper.multiply) {
    parts.push(
      `last multiplication: ${shortNumber(helper.multiply.trace.k)} · ${pointText(helper.multiply.trace.p, true)} = ${pointText(helper.multiply.trace.result, true)}`,
    );
  }
  return `${parts.join('; ')}.`.slice(0, MAX_CONTEXT);
}
