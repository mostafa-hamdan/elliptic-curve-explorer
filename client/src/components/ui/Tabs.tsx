/**
 * Tabs: the row of buttons that switches between "All points", "Add points" and
 * "Multiply". Follows the standard keyboard pattern: the arrow keys, Home and End move
 * between tabs, and Tab moves into the panel.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon, type IconName } from './Icon.tsx';

/** One tab. */
export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  icon?: IconName;
}

interface TabsProps<Id extends string> {
  /** The tabs, in display order. */
  items: ReadonlyArray<TabItem<Id>>;
  /** Id of the tab that is currently shown. */
  active: Id;
  /** Called when the user picks a tab. */
  onChange: (id: Id) => void;
  /** Prefix for element ids, so tabs and panels can point at each other. */
  idPrefix: string;
  /** Accessible name for the whole row. */
  label: string;
}

/** DOM id of a tab button. */
export function tabId(idPrefix: string, id: string): string {
  return `${idPrefix}-tab-${id}`;
}

/** DOM id of a tab panel. */
export function tabPanelId(idPrefix: string, id: string): string {
  return `${idPrefix}-panel-${id}`;
}

/** The row of tab buttons. Render the panels with {@link TabPanel}. */
export function Tabs<Id extends string>({
  items,
  active,
  onChange,
  idPrefix,
  label,
}: TabsProps<Id>) {
  const listRef = useRef<HTMLDivElement>(null);

  /** Move to another tab with the keyboard and put the focus on it. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === active);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;

    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    listRef.current?.querySelector<HTMLElement>(`#${tabId(idPrefix, target.id)}`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-sunken p-1"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            id={tabId(idPrefix, item.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelId(idPrefix, item.id)}
            // Only the selected tab is in the Tab order; arrows reach the others.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              'inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
              selected
                ? 'bg-surface text-primary shadow-card'
                : 'text-ink-soft hover:bg-surface/60 hover:text-ink',
            )}
          >
            {/* Icons are left out on narrow screens so all tabs fit side by side. */}
            {item.icon && <Icon name={item.icon} size={16} className="hidden sm:block" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idPrefix: string;
  id: string;
  /** Whether this panel is the one being shown. Hidden panels are not rendered at all. */
  active: boolean;
  children: ReactNode;
}

/** The content area that belongs to one tab. */
export function TabPanel({ idPrefix, id, active, children }: TabPanelProps) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={tabPanelId(idPrefix, id)} aria-labelledby={tabId(idPrefix, id)}>
      {children}
    </div>
  );
}
