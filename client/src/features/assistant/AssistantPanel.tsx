/**
 * The assistant: a side panel where the user asks questions about elliptic curves and
 * this app, or asks for an explanation of their last result. When the server has an AI
 * key and the user is signed in, answers come from AI mode (Claude Haiku 5.5, with every
 * number computed by the engine); otherwise, and whenever AI mode fails, they come from the
 * offline helper, which needs no network and no key.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../../lib/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { cx } from '../../lib/cx.ts';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { useShell } from '../shell/ShellContext.tsx';
import { Markdown } from './Markdown.tsx';
import {
  answerOffline,
  MAX_QUESTION_LENGTH,
  SUGGESTIONS,
  type HelperContext,
} from './offlineHelper.ts';
import { describeWork } from './workContext.ts';

/** One message in the conversation. */
interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Who answered: AI mode or the offline helper (only for answers). */
  source?: 'ai' | 'offline';
  /** A short note shown above an answer, for example why AI mode was not used. */
  notice?: string;
}

/** What the server says about AI mode. */
interface AiStatus {
  ai: boolean;
  reason: string;
}

/** Earlier turns sent with an AI question: the last ten, as plain text. */
function historyFor(messages: Message[]) {
  return messages
    .slice(-10)
    .map((message) => ({ role: message.role, text: message.text.slice(0, 6000) }));
}

/** Collect what the helper needs to know about the user's current work. */
function useHelperContext(): HelperContext {
  const { state, curveCheck, listing } = useExplorer();
  const list = listing.state.status === 'done' ? listing.state.list : null;
  return {
    curve: curveCheck.curve,
    add: state.addResult,
    multiply: state.multiplyResult,
    points: list ? { curve: list.curve, count: list.count } : null,
    lastResult: state.lastResult,
    tab: state.tab,
  };
}

/** The assistant side panel. It stays mounted while closed, so the conversation is kept. */
export function AssistantPanel() {
  const { panel, closePanel } = useShell();
  const open = panel === 'assistant';
  const context = useHelperContext();
  const { state } = useExplorer();
  const { status, user } = useAuth();
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const counterId = useId();

  // Put the cursor in the question box whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Ask the server whether AI mode can be used, whenever the panel opens or the user signs in
  // or out. Without a server (or on any error) the offline helper is used.
  useEffect(() => {
    if (!open || status !== 'ready') return;
    let canceled = false;
    api<AiStatus>('GET', '/api/assistant/status')
      .then((result) => {
        if (!canceled) setAiStatus(result);
      })
      .catch(() => {
        if (!canceled) setAiStatus({ ai: false, reason: 'AI mode is not available.' });
      });
    return () => {
      canceled = true;
    };
  }, [open, status, user]);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  /** Add an answer from the offline helper, with an optional note saying why. */
  function answerHere(question: string, notice?: string) {
    const answer = answerOffline(question, context);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: 'assistant', text: answer.text, source: 'offline', notice },
    ]);
  }

  /** Ask a question and add both it and the answer to the conversation. */
  async function ask(question: string) {
    const trimmed = question.trim();
    if (trimmed === '' || trimmed.length > MAX_QUESTION_LENGTH || busy) return;
    const earlier = messages;
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text: trimmed }]);
    setDraft('');

    if (!aiStatus?.ai) {
      answerHere(trimmed);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ answer?: string; declined?: boolean; fallback?: string }>(
        'POST',
        '/api/assistant',
        {
          question: trimmed,
          history: historyFor(earlier),
          context: describeWork(context, {
            pointP: state.pointP,
            pointQ: state.pointQ,
            k: state.k,
          }),
        },
      );
      if (result.answer) {
        const text = result.answer;
        setMessages((current) => [
          ...current,
          { id: nextId.current++, role: 'assistant', text, source: 'ai' },
        ]);
      } else {
        answerHere(
          trimmed,
          `${result.fallback ?? 'AI mode did not answer.'} Answered by the offline helper.`,
        );
      }
    } catch {
      answerHere(trimmed, 'AI mode is not reachable right now. Answered by the offline helper.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  /** Enter sends; Shift+Enter starts a new line. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void ask(draft);
    }
  }

  const aiOn = aiStatus?.ai === true;

  const tooLong = draft.length > MAX_QUESTION_LENGTH;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      hidden={!open}
      data-testid="assistant"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closePanel();
        }
      }}
      className="fixed top-14 right-0 bottom-0 z-40 flex w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-pop print:hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon name="sparkle" size={17} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Assistant
            </h2>
            <p className="text-xs text-muted" data-testid="assistant-mode">
              {aiOn
                ? 'AI mode · Claude Haiku 5.5, numbers from the engine'
                : `Offline helper · ${aiStatus?.reason ?? 'built-in answers, no internet needed'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
              Clear
            </Button>
          )}
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close the assistant"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm"
        aria-live="polite"
        data-testid="assistant-messages"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-ink-soft">
              Ask about elliptic curves or this app, or let me explain your last result step by
              step. Every number in an explanation comes from the calculation itself.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void ask(suggestion)}
                  className="cursor-pointer rounded-full border border-line bg-sunken px-3 py-1.5 text-note text-ink-soft transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cx(
                'max-w-[90%] rounded-xl px-3.5 py-2.5',
                message.role === 'user'
                  ? 'bg-primary-soft text-ink'
                  : 'border border-line bg-sunken text-ink-soft',
              )}
              data-testid={message.role === 'user' ? 'assistant-question' : 'assistant-answer'}
            >
              <span className="sr-only">
                {message.role === 'user' ? 'You asked: ' : 'Answer: '}
              </span>
              {message.notice && (
                <p
                  className="mb-1.5 flex items-start gap-1 text-xs text-warning"
                  data-testid="assistant-notice"
                >
                  <Icon name="info" size={13} className="mt-px" />
                  {message.notice}
                </p>
              )}
              {message.role === 'user' ? (
                <p className="break-words whitespace-pre-wrap">{message.text}</p>
              ) : (
                <Markdown text={message.text} />
              )}
              {message.source === 'ai' && (
                <p className="mt-1.5 text-xs text-muted">
                  AI answer: the numbers come from the engine, but the wording can be imperfect.
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="text-note text-muted" role="status" data-testid="assistant-busy">
            Thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-line p-3">
        <label htmlFor="assistant-input" className="sr-only">
          Your question
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            aria-describedby={counterId}
            aria-invalid={tooLong}
            className={cx(
              'min-h-10 flex-1 resize-none rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70',
              tooLong ? 'border-danger' : 'border-line-strong',
            )}
          />
          <Button
            type="submit"
            variant="primary"
            icon="send"
            disabled={draft.trim() === '' || tooLong || busy}
            aria-label="Send"
            className="w-10 px-0"
          />
        </div>
        <p
          id={counterId}
          className={cx('mt-1 text-right text-xs', tooLong ? 'text-danger' : 'text-muted')}
        >
          {tooLong
            ? `Too long: ${draft.length} of ${MAX_QUESTION_LENGTH} characters`
            : `${draft.length} / ${MAX_QUESTION_LENGTH} · Enter to send, Shift+Enter for a new line`}
        </p>
      </form>
    </aside>
  );
}
