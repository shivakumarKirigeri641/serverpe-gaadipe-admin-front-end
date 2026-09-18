import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { onBusyChange } from '../lib/api';

/*
 * The small pieces every screen is built from, so the same thing looks and
 * behaves the same wherever it appears.
 */

/** The thread across the top while the panel is asking the server anything. */
export function BusyBar() {
  const [busy, setBusy] = useState(0);
  useEffect(() => onBusyChange(setBusy), []);
  if (!busy) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-brand/10">
      <div className="busy-bar h-full w-1/4 bg-brand-accent" />
    </div>
  );
}

/**
 * Detail on hover.
 *
 * Every screen here is dense, and the alternative is either a cluttered table
 * or a click that loses the reader's place. `tabIndex` is set so the same note
 * opens on keyboard focus — a hover-only fact is a fact some people cannot read.
 */
export function Hint({ children, note, right = false, className = '' }) {
  const [at, setAt] = useState(null);
  if (!note) return children;

  /* THE NOTE FLOATS ABOVE THE PAGE, in a portal at fixed coordinates. Drawn
     inside the element, a hidden note still counted towards its container's
     size — every table with notes near its last rows grew a small vertical
     scrollbar, and the notes there were clipped when shown. */
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setAt({ left: r.left, right: window.innerWidth - r.right, top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, up: below < 180 && r.top > below });
  };
  const hide = () => setAt(null);

  return (
    <span className={`hint ${className}`} tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {at && createPortal(
        <span className="hint-body" role="tooltip" style={{
          ...(right ? { right: Math.max(8, at.right) } : { left: Math.max(8, Math.min(at.left, window.innerWidth - 348)) }),
          ...(at.up ? { bottom: at.bottom } : { top: at.top }),
        }}>{note}</span>,
        document.body,
      )}
    </span>
  );
}

const TONES = {
  good: 'border-good-500/25 bg-good-50 text-good-700',
  wrong: 'border-wrong-500/25 bg-wrong-50 text-wrong-700',
  watch: 'border-watch-500/25 bg-watch-50 text-watch-700',
  info: 'border-line bg-shell text-body',
  brand: 'border-brand/20 bg-brand/5 text-brand-deep',
};

export const Banner = ({ tone = 'info', children, className = '' }) => (
  <div className={`rounded-lg border px-4 py-2.5 text-sm ${TONES[tone]} ${className}`}>{children}</div>
);

export const Chip = ({ tone = 'info', children }) => (
  <span className={`chip border ${TONES[tone]}`}>{children}</span>
);

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-muted">{hint}</span>}
    </label>
  );
}

/** A dialog over the page. Escape and the backdrop close it unless it is busy. */
export function Modal({ title, subtitle, onClose, children, footer, wide = false, busy = false }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, busy]);

  /* Drawn onto <body>, not where it is written: a dialog opened from inside a
     card would otherwise be positioned and clipped by that card. */
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-8"
      onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true"
        className={`card w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} shadow-pop`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-2xs text-muted">{subtitle}</p>}
          </div>
          <button type="button" className="btn-quiet no-print !px-3 !py-1.5 text-2xs"
            onClick={onClose} disabled={busy}>Close</button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && (
          <div className="no-print flex flex-wrap items-center justify-end gap-2 border-t border-line bg-shell/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

/**
 * One figure, with what it is measured against underneath.
 *
 * A number on its own is trivia: 14 checks today means nothing until it is
 * beside yesterday's 9. The comparison is part of the tile, not an afterthought.
 */
export function Stat({ label, value, sub, tone = 'info', note, onClick }) {
  const body = (
    <>
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className={`mt-0.5 text-2xs ${tone === 'wrong' ? 'text-wrong-700' : 'text-muted'}`}>{sub}</div>}
    </>
  );
  return (
    <Hint note={note}>
      <div className={`card px-4 py-3 ${onClick ? 'cursor-pointer transition hover:shadow-pop' : ''}`}
        onClick={onClick}>{body}</div>
    </Hint>
  );
}

/** Nothing here — said in a sentence, never as an empty box. */
export const Empty = ({ children = 'Nothing here yet.' }) => (
  <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>
);

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="px-4 py-10 text-center text-sm text-muted">{label}</div>
);

/** A page-level error that still lets the reader try again. */
export const Failed = ({ error, onRetry }) => (
  <div className="px-4 py-10 text-center">
    <p className="text-sm text-wrong-700">{error?.message || 'Something went wrong.'}</p>
    {onRetry && <button className="btn-quiet mt-3" onClick={onRetry}>Try again</button>}
  </div>
);

/** A table that scrolls sideways on a phone rather than squashing its columns. */
export const Table = ({ head, children, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="w-full min-w-[720px] border-collapse">
      <thead className="border-b border-line bg-shell/60">{head}</thead>
      <tbody className="divide-y divide-line">{children}</tbody>
    </table>
  </div>
);

/** Save a blob the browser already has, without a round trip. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a PDF the panel fetched with its token, for reading or printing. */
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  // Revoked late: a tab that has not finished loading the PDF would show blank.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return w;
}

/**
 * Pages, not a long scroll (user, 2026-09-18). `page` is 1-based; the pager
 * says where the reader is and offers the pages around it, the first and the
 * last. A list that fits on one page gets no pager at all.
 */
export const PAGE_SIZE = 25;

export function Pager({ page, total, size = PAGE_SIZE, onPage, className = '' }) {
  const last = Math.max(1, Math.ceil((total || 0) / size));
  if (!total || last <= 1) return null;
  const set = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const pages = [];
  [...set].sort((a, b) => a - b).forEach((p, i, all) => {
    if (i && p - all[i - 1] > 1) pages.push('…');
    pages.push(p);
  });
  const go = (p) => onPage(Math.max(1, Math.min(last, p)));
  const from = (page - 1) * size + 1;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-line bg-shell/40 px-4 py-2.5 ${className}`}>
      <span className="text-2xs tabular text-muted">
        {from.toLocaleString('en-IN')}–{Math.min(page * size, total).toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
      </span>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Pages">
        <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={page <= 1} onClick={() => go(page - 1)}>‹ Prev</button>
        {pages.map((p, i) => (p === '…'
          ? <span key={`gap${i}`} className="px-1 text-2xs text-muted">…</span>
          : (
            <button key={p} type="button" onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}
              className={`min-w-[2rem] rounded-md px-2 py-1 text-2xs font-semibold tabular transition ${p === page ? 'bg-brand text-white' : 'border border-line bg-white text-body hover:bg-shell'}`}>
              {p}
            </button>
          )))}
        <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={page >= last} onClick={() => go(page + 1)}>Next ›</button>
      </nav>
    </div>
  );
}
