/**
 * Shared state of the Explorer page: the curve inputs, the points P and Q, the scalar k
 * and the latest results. The curve panel and the three tabs all read and change this
 * one state, so picking a point in the table shows up in the Add tab, and switching
 * tabs never loses what was typed.
 */
import { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import {
  CURVE_PRESETS,
  findPreset,
  type AdditionTrace,
  type Curve,
  type MultiplicationTrace,
} from '@shared/ecc/index.ts';
import { usePointListing, type PointListing } from '../points/usePointListing.ts';
import { checkCurve, type CurveCheck, type PointDraft } from './validation.ts';

/** A finished addition, kept together with the curve it was computed on. */
export interface AddOutcome {
  curve: Curve;
  trace: AdditionTrace;
}

/** A finished scalar multiplication, kept together with its curve. */
export interface MultiplyOutcome {
  curve: Curve;
  trace: MultiplicationTrace;
}

/** Everything the Explorer page remembers. Inputs are kept as the text the user typed. */
export interface ExplorerState {
  p: string;
  a: string;
  b: string;
  pointP: PointDraft;
  pointQ: PointDraft;
  k: string;
  /** Id of the preset that filled the curve boxes, or '' once the user edits them. */
  presetId: string;
  addResult: AddOutcome | null;
  multiplyResult: MultiplyOutcome | null;
}

type ExplorerAction =
  | { type: 'curveField'; field: 'p' | 'a' | 'b'; value: string }
  | { type: 'point'; which: 'P' | 'Q'; change: Partial<PointDraft> }
  | { type: 'scalar'; value: string }
  | { type: 'preset'; id: string }
  | { type: 'clearAll' }
  | { type: 'addResult'; outcome: AddOutcome | null }
  | { type: 'multiplyResult'; outcome: MultiplyOutcome | null };

const EMPTY_POINT: PointDraft = { x: '', y: '', infinity: false };

/** The completely empty page, used by "Clear all". */
const EMPTY_STATE: ExplorerState = {
  p: '',
  a: '',
  b: '',
  pointP: EMPTY_POINT,
  pointQ: EMPTY_POINT,
  k: '',
  presetId: '',
  addResult: null,
  multiplyResult: null,
};

/**
 * Build the state for a preset: curve, both sample points and the sample scalar.
 *
 * @param id - preset identifier.
 * @returns the filled-in state, or the empty state for an unknown id.
 */
function stateFromPreset(id: string): ExplorerState {
  const preset = findPreset(id);
  if (!preset) return EMPTY_STATE;
  return {
    p: preset.p,
    a: preset.a,
    b: preset.b,
    pointP: { x: preset.pointP[0], y: preset.pointP[1], infinity: false },
    pointQ: { x: preset.pointQ[0], y: preset.pointQ[1], infinity: false },
    k: preset.k,
    presetId: preset.id,
    addResult: null,
    multiplyResult: null,
  };
}

/** The app opens on the classroom curve E23(1, 1) so there is a working example at once. */
const INITIAL_STATE: ExplorerState = stateFromPreset(CURVE_PRESETS[0]?.id ?? '');

/** Apply one change to the state. Pure: the same inputs always give the same result. */
function reducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case 'curveField':
      // A result belongs to the curve it was computed on, so changing the curve removes
      // it. The typed points stay and are simply re-checked against the new curve.
      return {
        ...state,
        [action.field]: action.value,
        presetId: '',
        addResult: null,
        multiplyResult: null,
      };
    case 'point': {
      const key = action.which === 'P' ? 'pointP' : 'pointQ';
      return { ...state, [key]: { ...state[key], ...action.change } };
    }
    case 'scalar':
      return { ...state, k: action.value };
    case 'preset':
      return stateFromPreset(action.id);
    case 'clearAll':
      return EMPTY_STATE;
    case 'addResult':
      return { ...state, addResult: action.outcome };
    case 'multiplyResult':
      return { ...state, multiplyResult: action.outcome };
  }
}

/** What components get from {@link useExplorer}. */
export interface ExplorerContextValue {
  state: ExplorerState;
  /** Live validation of p, a and b; `curveCheck.curve` is the curve when it is valid. */
  curveCheck: CurveCheck;
  /** The list of all points for the current curve (shared by every tab). */
  listing: PointListing;
  setCurveField: (field: 'p' | 'a' | 'b', value: string) => void;
  setPoint: (which: 'P' | 'Q', change: Partial<PointDraft>) => void;
  setScalar: (value: string) => void;
  applyPreset: (id: string) => void;
  clearAll: () => void;
  setAddResult: (outcome: AddOutcome | null) => void;
  setMultiplyResult: (outcome: MultiplyOutcome | null) => void;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

/** Holds the Explorer state. Wrap the Explorer page in it. */
export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const curveCheck = useMemo(
    () => checkCurve(state.p, state.a, state.b),
    [state.p, state.a, state.b],
  );
  const listing = usePointListing(curveCheck.curve);

  // `dispatch` never changes, so these functions are created once.
  const actions = useMemo(
    () => ({
      setCurveField: (field: 'p' | 'a' | 'b', value: string) =>
        dispatch({ type: 'curveField', field, value }),
      setPoint: (which: 'P' | 'Q', change: Partial<PointDraft>) =>
        dispatch({ type: 'point', which, change }),
      setScalar: (value: string) => dispatch({ type: 'scalar', value }),
      applyPreset: (id: string) => dispatch({ type: 'preset', id }),
      clearAll: () => dispatch({ type: 'clearAll' }),
      setAddResult: (outcome: AddOutcome | null) => dispatch({ type: 'addResult', outcome }),
      setMultiplyResult: (outcome: MultiplyOutcome | null) =>
        dispatch({ type: 'multiplyResult', outcome }),
    }),
    [],
  );

  const value = useMemo<ExplorerContextValue>(
    () => ({ state, curveCheck, listing, ...actions }),
    [state, curveCheck, listing, actions],
  );

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

/**
 * Read and change the Explorer state.
 *
 * @throws when used outside {@link ExplorerProvider}, which is a programming mistake.
 */
export function useExplorer(): ExplorerContextValue {
  const value = useContext(ExplorerContext);
  if (value === null) throw new Error('useExplorer must be used inside ExplorerProvider.');
  return value;
}
