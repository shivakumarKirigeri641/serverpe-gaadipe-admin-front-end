import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Every icon-only button explains itself (motion system, 2026-09-25): a
 * button or link with an aria-label and no readable text of its own (✕, ⋯,
 * ↑, an icon) shows that label in the panel's tooltip on hover or keyboard
 * focus — the same look and speed as every other tooltip. Mounted once, by
 * the Shell; nothing to add button by button.
 */
const iconOnly = (el) => {
  const label = el.getAttribute('aria-label');
  if (!label || el.dataset.noTip != null) return null;
  const text = (el.textContent || '').replace(/\s+/g, '');
  return text.length <= 2 ? label : null;
};

export default function IconTips() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    const show = (e) => {
      const el = e.target.closest?.('button[aria-label], a[aria-label]');
      const label = el && iconOnly(el);
      if (!label) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom > 40;
      setTip({ label, left: Math.min(window.innerWidth - 8, Math.max(8, r.left + r.width / 2)), top: below ? r.bottom + 6 : r.top - 6, below });
    };
    const hide = (e) => { const el = e.target.closest?.('button[aria-label], a[aria-label]'); if (el) setTip(null); };
    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    const clear = () => setTip(null);
    document.addEventListener('click', clear, true);
    return () => {
      document.removeEventListener('pointerover', show); document.removeEventListener('pointerout', hide);
      document.removeEventListener('focusin', show); document.removeEventListener('focusout', hide);
      document.removeEventListener('click', clear, true);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <span role="tooltip" style={{ position: 'fixed', zIndex: 80, pointerEvents: 'none', left: tip.left, top: tip.top, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}>
      <span className="tip-body">{tip.label}</span>
    </span>,
    document.body,
  );
}
