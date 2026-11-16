/**
 * The keyboard shortcuts: one list used both to handle the keys and to show them in the
 * shortcuts dialog and on the Help page, so the two can never disagree.
 */

/** What a shortcut does. */
export type ShortcutAction =
  | 'tab-points'
  | 'tab-add'
  | 'tab-multiply'
  | 'focus-curve'
  | 'toggle-theme'
  | 'show-shortcuts'
  | 'open-assistant';

/** One shortcut as shown to the user. */
export interface ShortcutInfo {
  /** Keys to press, each shown as a key cap. */
  keys: string[];
  /** What happens. */
  description: string;
}

/** The shortcuts in the order they are listed. */
export const SHORTCUTS: ReadonlyArray<ShortcutInfo> = [
  { keys: ['1'], description: 'Show the All points tab' },
  { keys: ['2'], description: 'Show the Add points tab' },
  { keys: ['3'], description: 'Show the Multiply tab' },
  { keys: ['/'], description: 'Jump to the prime p box' },
  { keys: ['Enter'], description: 'In a number box: calculate' },
  { keys: ['T'], description: 'Switch between light and dark theme' },
  { keys: ['A'], description: 'Open the assistant' },
  { keys: ['?'], description: 'Show this list of shortcuts' },
  { keys: ['Esc'], description: 'Close a dialog or the assistant' },
];

/** The minimal facts about a key press that decide the shortcut. */
export interface KeyPress {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** True when the focus is in a text box, list or other control that takes typing. */
  typing: boolean;
}

/**
 * Decide which shortcut, if any, a key press means.
 *
 * Single-key shortcuts only work while the user is not typing, so a "1" typed into a
 * number box stays a "1". The same tab keys also work with Alt held, from anywhere.
 *
 * @param press - the key and its modifiers.
 * @returns the action, or null when the key is not a shortcut.
 */
export function shortcutFor(press: KeyPress): ShortcutAction | null {
  if (press.ctrlKey || press.metaKey) return null;

  const tabKeys: Record<string, ShortcutAction> = {
    '1': 'tab-points',
    '2': 'tab-add',
    '3': 'tab-multiply',
  };
  if (press.altKey) return tabKeys[press.key] ?? null;
  if (press.typing) return null;

  const tab = tabKeys[press.key];
  if (tab) return tab;
  switch (press.key) {
    case '/':
      return 'focus-curve';
    case 't':
    case 'T':
      return 'toggle-theme';
    case 'a':
    case 'A':
      return 'open-assistant';
    case '?':
      return 'show-shortcuts';
    default:
      return null;
  }
}

/**
 * Tell whether an element takes typed text, so single-key shortcuts must stay off.
 *
 * @param element - the focused element, if any.
 * @returns true for text boxes, text areas, drop-down lists and editable regions.
 */
export function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(type);
  }
  return (element as HTMLElement).isContentEditable === true;
}
