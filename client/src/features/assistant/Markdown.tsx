/**
 * A very small markdown renderer for the assistant's answers. It understands paragraphs,
 * "- " and "1. " lists, **bold** and `code`, and builds React elements directly. It never
 * produces HTML from text, so an answer cannot inject markup or scripts into the page,
 * whatever it contains.
 */
import type { ReactNode } from 'react';
import { parseBlocks, parseInline } from './markdown.ts';

/** Render one line's pieces as React elements (text is always escaped by React). */
function Inline({ line }: { line: string }) {
  return (
    <>
      {parseInline(line).map((span, index): ReactNode => {
        if (span.type === 'bold') {
          return (
            <strong key={index} className="font-semibold text-ink">
              {span.text}
            </strong>
          );
        }
        if (span.type === 'code') {
          return (
            <code
              key={index}
              className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.92em] text-ink"
            >
              {span.text}
            </code>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

/** Render an answer. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words">
      {parseBlocks(text).map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index}>
              <Inline line={block.text} />
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List
            key={index}
            className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline line={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
