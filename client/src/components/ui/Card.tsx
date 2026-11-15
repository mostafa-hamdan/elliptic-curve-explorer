/**
 * Card: the raised white (or dark) panel that groups related content.
 * `CardHeader` gives every card the same title layout.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** HTML element to render. Use `section` when the card has its own heading. */
  as?: 'div' | 'section' | 'aside';
  children: ReactNode;
}

/** A panel with the standard border, radius and shadow. Padding is left to the caller. */
export function Card({ as: Element = 'div', className, children, ...rest }: CardProps) {
  return (
    <Element
      className={cx('rounded-xl border border-line bg-surface shadow-card', className)}
      {...rest}
    >
      {children}
    </Element>
  );
}

interface CardHeaderProps {
  /** Title text. */
  title: ReactNode;
  /** Optional one-line explanation under the title. */
  description?: ReactNode;
  /** Optional controls on the right, for example a button. */
  actions?: ReactNode;
  /** Heading level, so the page outline stays correct. Defaults to 2. */
  level?: 2 | 3;
  /** id for the heading, to label the card with `aria-labelledby`. */
  id?: string;
}

/** Title row for a card: heading and description on the left, actions on the right. */
export function CardHeader({ title, description, actions, level = 2, id }: CardHeaderProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading
          id={id}
          className={cx(
            'font-semibold tracking-tight text-ink',
            level === 2 ? 'text-lg' : 'text-base',
          )}
        >
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
