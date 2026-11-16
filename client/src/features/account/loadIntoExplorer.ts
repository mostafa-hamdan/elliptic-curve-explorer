/**
 * Loading saved work back into the Explorer: a saved curve or point, or an entry of the
 * history, fills in the boxes and opens the right tab, ready to calculate again.
 */
import type { ExplorerContextValue, ExplorerTab } from '../explorer/ExplorerContext.tsx';

/** The values of a saved curve or point. */
export interface SavedData {
  p: string;
  a: string;
  b: string;
  x?: string;
  y?: string;
}

/** The inputs of a history entry. */
export type HistoryInput = Record<string, string | boolean | undefined>;

/** Text value of a history input field ('' when missing). */
function text(input: HistoryInput, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Put a saved curve (and point) into the Explorer.
 *
 * @param explorer - the Explorer state actions.
 * @param data - the saved values.
 */
export function loadSaved(explorer: ExplorerContextValue, data: SavedData): void {
  explorer.setCurveField('p', data.p);
  explorer.setCurveField('a', data.a);
  explorer.setCurveField('b', data.b);
  if (data.x !== undefined && data.y !== undefined) {
    explorer.setPoint('P', { x: data.x, y: data.y, infinity: false });
    explorer.setTab('add');
  }
}

/**
 * Put a history entry's inputs into the Explorer and open its tab.
 *
 * @param explorer - the Explorer state actions.
 * @param operation - which calculation it was.
 * @param input - its inputs.
 */
export function loadHistory(
  explorer: ExplorerContextValue,
  operation: string,
  input: HistoryInput,
): void {
  explorer.setCurveField('p', text(input, 'p'));
  explorer.setCurveField('a', text(input, 'a'));
  explorer.setCurveField('b', text(input, 'b'));
  if (operation === 'add' || operation === 'multiply') {
    explorer.setPoint('P', {
      x: text(input, 'px'),
      y: text(input, 'py'),
      infinity: input.pInfinity === true,
    });
  }
  if (operation === 'add') {
    explorer.setPoint('Q', {
      x: text(input, 'qx'),
      y: text(input, 'qy'),
      infinity: input.qInfinity === true,
    });
  }
  if (operation === 'multiply') explorer.setScalar(text(input, 'k'));
  const tab: ExplorerTab =
    operation === 'add' ? 'add' : operation === 'multiply' ? 'multiply' : 'points';
  explorer.setTab(tab);
}
