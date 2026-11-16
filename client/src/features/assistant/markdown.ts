/**
 * Parsing for the assistant's small markdown subset (paragraphs, lists, **bold**, `code`).
 * Kept apart from the React component so it can be unit-tested on its own.
 */

/** A parsed block of the answer. */
export type Block =
  { type: 'paragraph'; text: string } | { type: 'list'; ordered: boolean; items: string[] };

/**
 * Split markdown text into paragraphs and lists. Consecutive list lines form one list;
 * any other line is a paragraph of its own.
 *
 * @param text - the answer.
 * @returns the blocks in order.
 */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      const ordered = numbered !== null;
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }
  return blocks;
}

/** A piece of a line: plain text, bold text or code. */
export type Span = { type: 'text' | 'bold' | 'code'; text: string };

/**
 * Split one line into plain, **bold** and `code` pieces. Unmatched markers are left as
 * ordinary characters.
 *
 * @param line - one line of the answer.
 * @returns the pieces in order.
 */
export function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ type: 'text', text: line.slice(last, index) });
    const token = match[0];
    spans.push(
      token.startsWith('**')
        ? { type: 'bold', text: token.slice(2, -2) }
        : { type: 'code', text: token.slice(1, -1) },
    );
    last = index + token.length;
  }
  if (last < line.length) spans.push({ type: 'text', text: line.slice(last) });
  return spans;
}
