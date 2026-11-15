/**
 * Tiny helper for building a `className` from parts, some of which may be switched off.
 * Used by every component so conditional styles read as one list.
 */

/**
 * Join class names, skipping anything falsy.
 *
 * @param parts - class strings, or `false` / `null` / `undefined` for "leave this out".
 * @returns the remaining classes separated by single spaces.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
