import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type SwipeDirection = 'left' | 'right';

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  onSwipe: (item: T, direction: SwipeDirection) => void;
}

const THRESHOLD = 110;

/**
 * Tinder-style stack: drag the top card right to approve, left to reject.
 * Buttons and the arrow keys do the same for people who prefer not to swipe.
 */
export function SwipeDeck<T>({ items, keyOf, render, onSwipe }: Props<T>) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const top = items[0];

  const fling = (direction: SwipeDirection) => {
    if (!top || leaving) return;
    setLeaving(direction);
    window.setTimeout(() => {
      setLeaving(null);
      setDx(0);
      onSwipe(top, direction);
    }, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') fling('right');
      if (e.key === 'ArrowLeft') fling('left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!top) return null;

  const offset = leaving ? (leaving === 'right' ? 1 : -1) * window.innerWidth : dx;
  const approveOpacity = Math.max(0, Math.min(1, offset / THRESHOLD));
  const rejectOpacity = Math.max(0, Math.min(1, -offset / THRESHOLD));

  return (
    <div className="deck">
      <div className="stack">
        {items.slice(1, 3).reverse().map((item, i, arr) => (
          <div key={keyOf(item)} className="card card-behind" style={{ '--depth': arr.length - i } as CSSProperties}>
            {render(item)}
          </div>
        ))}
        <div
          key={keyOf(top)}
          className={`card card-top${dragging ? ' dragging' : ''}`}
          style={{ transform: `translateX(${offset}px) rotate(${offset / 22}deg)` }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, a')) return;
            start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (start.current?.id === e.pointerId) setDx(e.clientX - start.current.x);
          }}
          onPointerUp={() => {
            start.current = null;
            setDragging(false);
            if (dx > THRESHOLD) fling('right');
            else if (dx < -THRESHOLD) fling('left');
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
        >
          <span className="stamp stamp-approve" style={{ opacity: approveOpacity }}>
            APROVAR
          </span>
          <span className="stamp stamp-reject" style={{ opacity: rejectOpacity }}>
            REJEITAR
          </span>
          {render(top)}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="round reject" aria-label="Rejeitar" onClick={() => fling('left')}>
          ✕
        </button>
        <button type="button" className="round approve" aria-label="Aprovar" onClick={() => fling('right')}>
          ✓
        </button>
      </div>
    </div>
  );
}
