/**
 * The guided tour on screen: dims the page, cuts a bright "spotlight" around the part
 * being explained, and shows a small card with the explanation and Back / Next buttons.
 * Works with the keyboard (arrows, Escape) and keeps the focus inside the card.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.tsx';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { TOUR_STEPS } from './steps.ts';
import { useTutorial } from './TutorialContext.tsx';

/** Space between the highlighted part and the spotlight edge, in pixels. */
const SPOTLIGHT_PADDING = 6;
/** Space between the spotlight and the card, in pixels. */
const CARD_GAP = 12;
/** Minimum distance between the card and the window edge, in pixels. */
const EDGE = 16;

/** Where the spotlight sits on screen (viewport pixels), or null for a centred step. */
type Box = { top: number; left: number; width: number; height: number } | null;

/**
 * Work out where the card goes: below the spotlight if it fits, otherwise above, otherwise
 * beside it, otherwise at the bottom of the window. Always kept fully inside the window.
 *
 * @param box - the spotlight, or null to centre the card.
 * @param card - the card's measured size.
 * @returns the card's top-left corner in viewport pixels.
 */
function placeCard(
  box: Box,
  card: { width: number; height: number },
): { top: number; left: number } {
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  if (box === null) {
    return {
      top: Math.max(EDGE, (viewHeight - card.height) / 2),
      left: Math.max(EDGE, (viewWidth - card.width) / 2),
    };
  }
  const left = Math.min(Math.max(EDGE, box.left), viewWidth - card.width - EDGE);
  const below = box.top + box.height + CARD_GAP;
  if (below + card.height <= viewHeight - EDGE) return { top: below, left };
  const above = box.top - CARD_GAP - card.height;
  if (above >= EDGE) return { top: above, left };
  // A tall part (such as the curve panel): put the card beside it, level with its top.
  const besideTop = Math.min(Math.max(EDGE, box.top), viewHeight - card.height - EDGE);
  const right = box.left + box.width + CARD_GAP;
  if (right + card.width <= viewWidth - EDGE) return { top: besideTop, left: right };
  const leftSide = box.left - CARD_GAP - card.width;
  if (leftSide >= EDGE) return { top: besideTop, left: leftSide };
  return { top: viewHeight - card.height - EDGE, left };
}

/** The tour overlay. Renders nothing while the tour is not running. */
export function TourOverlay() {
  const { active, stepIndex, goTo, finish } = useTutorial();
  const { setTab } = useExplorer();
  const navigate = useNavigate();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const [box, setBox] = useState<Box>(null);
  const [ready, setReady] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 360, height: 220 });

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const next = useCallback(() => {
    direction.current = 1;
    if (isLast) finish();
    else goTo(stepIndex + 1);
  }, [finish, goTo, isLast, stepIndex]);

  const back = useCallback(() => {
    direction.current = -1;
    if (stepIndex > 0) goTo(stepIndex - 1);
  }, [goTo, stepIndex]);

  // The tour describes the Explorer page, so it always runs there.
  useEffect(() => {
    if (active && location.pathname !== '/') navigate('/');
  }, [active, location.pathname, navigate]);

  // For each step: show its tab, find its target, scroll it into view, then measure it.
  useEffect(() => {
    if (!active || !step || location.pathname !== '/') return;
    setReady(false);
    if (step.tab) setTab(step.tab);

    let frame = 0;
    const measure = (element: Element) => {
      const rect = element.getBoundingClientRect();
      setBox({
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      });
    };

    // Wait two frames so a tab that was just switched has drawn its content.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (step.target === null) {
          setBox(null);
          setReady(true);
          return;
        }
        const element = document.querySelector(`[data-tour="${step.target}"]`);
        if (!element) {
          // This part is not on screen (for example a feature that is switched off): skip it.
          const target = stepIndex + direction.current;
          if (target < 0 || target >= TOUR_STEPS.length) finish();
          else goTo(target);
          return;
        }
        element.scrollIntoView({ block: 'center', behavior: 'instant' });
        measure(element);
        setReady(true);
      });
    });

    // Follow the target when the window is resized or the page scrolls.
    const follow = () => {
      if (step.target === null) return;
      const element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) measure(element);
    };
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [active, step, stepIndex, location.pathname, setTab, goTo, finish]);

  // Measure the card (and re-measure when its text wraps differently) so it can be
  // placed without going off screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!active || !card) return;
    const update = () => {
      const rect = card.getBoundingClientRect();
      setCardSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, [active, stepIndex]);

  // Put the keyboard focus on the card for each new step, so it is read out and usable.
  useEffect(() => {
    if (active && ready) cardRef.current?.focus();
  }, [active, ready, stepIndex]);

  if (!active || !step) return null;

  /** Arrows move between steps, Escape ends, Tab stays inside the card. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      back();
    } else if (event.key === 'Tab') {
      const focusable = Array.from(
        cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === cardRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const position = placeCard(box, cardSize);

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="tour">
      {/* Blocks clicks on the page while the tour runs; the spotlight dims everything else. */}
      {box === null ? (
        <div className="absolute inset-0 bg-scrim" />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl outline-2 outline-primary"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            // A huge shadow around the spotlight dims everything outside it.
            boxShadow: '0 0 0 9999px var(--oc-scrim)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="absolute w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-5 shadow-pop outline-none"
        style={{ top: position.top, left: position.left, visibility: ready ? 'visible' : 'hidden' }}
        data-testid="tour-card"
      >
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold tracking-tight text-ink">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm text-ink-soft">
          {step.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button size="sm" onClick={back} disabled={stepIndex === 0}>
              Back
            </Button>
            <Button size="sm" variant="primary" onClick={next}>
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
