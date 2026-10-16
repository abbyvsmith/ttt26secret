import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

// Swipe down past this distance (px), or flick faster than this speed (px/ms), to close.
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.5;
// Movement before a press counts as a drag, so taps on chips and buttons still work.
const DRAG_SLOP = 8;

interface Drag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  active: boolean;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) onClose();
    else setClosing(true);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // On touch screens the browser would otherwise treat a downward swipe as a
  // scroll. Only claim the gesture when the sheet has nothing to scroll.
  useEffect(() => {
    const sheet = sheetRef.current!;
    sheet.style.touchAction = sheet.scrollHeight > sheet.clientHeight ? '' : 'none';
  });

  const setOffset = (y: number, animate: boolean) => {
    const sheet = sheetRef.current!;
    sheet.style.transition = animate ? 'transform 200ms ease' : 'none';
    sheet.style.transform = y ? `translateY(${y}px)` : '';
    if (scrimRef.current) {
      scrimRef.current.style.opacity = String(1 - Math.min(y / sheet.offsetHeight, 1));
    }
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current!;
    const target = e.target as HTMLElement;
    // Leave text fields alone, and let a scrolled sheet scroll instead of dragging.
    if (closing || target.closest('input, textarea') || sheet.scrollTop > 0) return;
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      active: false,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (dy < DRAG_SLOP) return;
      d.active = true;
      try {
        sheetRef.current!.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    // Dragging up past the resting point is damped.
    setOffset(dy > 0 ? dy : dy / 4, false);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || d.pointerId !== e.pointerId) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const dy = e.clientY - d.startY;
    if (dy > CLOSE_DISTANCE || (dy > 40 && d.velocity > CLOSE_VELOCITY)) {
      close();
    } else {
      setOffset(0, true);
    }
  }

  // A drag that ended on a chip shouldn't also select it.
  function onClickCapture(e: MouseEvent) {
    if (justDragged.current) e.stopPropagation();
  }

  return (
    <div className={`sheet-root${closing ? ' is-closing' : ''}`}>
      <button ref={scrimRef} className="sheet-scrim" aria-label="Close" tabIndex={-1} onClick={close} />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setOffset(0, true);
        }}
        onClickCapture={onClickCapture}
        onAnimationEnd={(e) => {
          if (closing && e.target === sheetRef.current) onClose();
        }}
      >
        <div className="sheet-grabber" />
        <button className="sheet-close" aria-label="Close" onClick={close}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
