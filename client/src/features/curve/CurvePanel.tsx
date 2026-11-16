/**
 * The curve setup panel: choose an example or type p, a and b, and see at once whether
 * they describe a valid elliptic curve. Everything else on the Explorer page works on
 * the curve defined here.
 */
import { CURVE_PRESETS, curveName, type Curve } from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Card, CardHeader } from '../../components/ui/Card.tsx';
import { SelectField } from '../../components/ui/SelectField.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { equationText, shortNumber } from '../../lib/format.ts';
import { SaveButton } from '../account/SaveButton.tsx';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import type { CurveCheck, FieldCheck } from '../explorer/validation.ts';

/** Error text for a box: only real errors, never the "please enter a value" prompt. */
function errorOf(field: FieldCheck): string | null {
  return field.status === 'error' ? field.message : null;
}

/**
 * Note under a or b when the typed value was reduced mod p.
 *
 * @param name - "a" or "b".
 * @param field - the check of that box.
 * @param reduced - the value reduced mod p, if known.
 * @returns for example "a ≡ 1 (mod p)", or undefined when nothing changed.
 */
function reducedNote(name: string, field: FieldCheck, reduced: bigint | null) {
  if (field.value === null || reduced === null || field.value === reduced) return undefined;
  return `${name} ≡ ${shortNumber(reduced)} (mod p)`;
}

/** Short name for the status message: "E23(1, 1)", or "This 256-bit curve" for huge p. */
function curveLabel(curve: Curve, bits: number | null): string {
  return equationText(curve) === null ? `This ${bits ?? ''}-bit curve` : curveName(curve);
}

/** The coloured box under the inputs that says whether the curve is usable, and why. */
function CurveStatus({ check }: { check: CurveCheck }) {
  if (check.curve) {
    const equation = equationText(check.curve);
    return (
      <Callout
        tone="success"
        title={`${curveLabel(check.curve, check.bits)} is a valid curve`}
        data-testid="curve-status"
      >
        {equation && <p className="font-mono text-note text-ink">{equation}</p>}
        <p className="mt-1">
          4a³ + 27b² ≡{' '}
          <span className="font-mono break-all">{shortNumber(check.singularity ?? 0n)}</span> (mod
          p), which is not 0, so the curve is non-singular.
        </p>
      </Callout>
    );
  }

  if (check.singular) {
    return (
      <Callout tone="danger" title="This curve is singular" data-testid="curve-status">
        4a³ + 27b² ≡ 0 (mod p). The curve has a cusp or crosses itself, so its points do not form a
        group. Change a or b.
      </Callout>
    );
  }

  const hasError = [check.p, check.a, check.b].some((field) => field.status === 'error');
  if (hasError) {
    return (
      <Callout tone="warning" title="Not a valid curve yet" data-testid="curve-status">
        Fix the value marked in red to continue.
      </Callout>
    );
  }

  return (
    <Callout tone="info" title="Define a curve" data-testid="curve-status">
      Enter p, a and b, or pick an example from the list above.
    </Callout>
  );
}

/** The curve setup card shown on the left of the Explorer page. */
export function CurvePanel() {
  const { state, curveCheck, setCurveField, applyPreset, clearAll, reset } = useExplorer();
  const textbook = CURVE_PRESETS.filter((preset) => preset.group === 'textbook');
  const real = CURVE_PRESETS.filter((preset) => preset.group === 'real');
  const activePreset = CURVE_PRESETS.find((preset) => preset.id === state.presetId);

  return (
    <Card as="section" aria-labelledby="curve-heading" className="p-5" data-tour="curve">
      <CardHeader
        id="curve-heading"
        title="Curve"
        description={
          <>
            E<sub>p</sub>(a, b): <span className="font-mono">y² ≡ x³ + ax + b (mod p)</span>
          </>
        }
      />

      <div className="mt-4 space-y-4">
        <div data-tour="presets">
          <SelectField
            id="curve-preset"
            label="Example curves"
            value={state.presetId}
            onChange={(id) => {
              // Choosing "Custom curve" keeps what is typed; it only says no example is active.
              if (id !== '') applyPreset(id);
            }}
          >
            <option value="">Custom curve</option>
            <optgroup label="Textbook curves">
              {textbook.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="From class to real life">
              {real.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
          </SelectField>
          {activePreset && (
            <p className="mt-1 text-note leading-snug text-muted" data-testid="preset-note">
              {activePreset.note}
            </p>
          )}
        </div>

        <TextField
          id="curve-p"
          label="Prime p"
          value={state.p}
          onChange={(value) => setCurveField('p', value)}
          placeholder="23"
          error={errorOf(curveCheck.p)}
          note={
            curveCheck.p.status === 'ok' && curveCheck.bits !== null
              ? `Prime, ${curveCheck.bits} bits`
              : undefined
          }
          hint="A prime greater than 3. Decimal, or hex starting with 0x."
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="curve-a"
            label="Coefficient a"
            value={state.a}
            onChange={(value) => setCurveField('a', value)}
            placeholder="1"
            error={errorOf(curveCheck.a)}
            note={reducedNote('a', curveCheck.a, curveCheck.aReduced)}
          />
          <TextField
            id="curve-b"
            label="Coefficient b"
            value={state.b}
            onChange={(value) => setCurveField('b', value)}
            placeholder="1"
            error={errorOf(curveCheck.b)}
            note={reducedNote('b', curveCheck.b, curveCheck.bReduced)}
          />
        </div>

        <CurveStatus check={curveCheck} />

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {curveCheck.curve && (
            <SaveButton
              kind="curve"
              label="Save curve"
              data={{ p: state.p.trim(), a: state.a.trim(), b: state.b.trim() }}
              defaultName={curveLabel(curveCheck.curve, curveCheck.bits)}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon="reset"
            onClick={reset}
            title="Go back to the example curve E23(1, 1) with its sample points"
          >
            Reset to example
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            onClick={clearAll}
            title="Empty every box and remove every result"
          >
            Clear all
          </Button>
        </div>
      </div>
    </Card>
  );
}
