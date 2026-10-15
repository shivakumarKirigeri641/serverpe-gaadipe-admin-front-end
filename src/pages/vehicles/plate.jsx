import { Hint } from '../../components/ui.jsx';

/*
 * THE NUMBER PLATE, IN ITS OWN COLOURS (user, 2026-10-15: "so that I can easily identify
 * yellow board or white board or green board"). The colour is worked out on the server from
 * the RC's class, category, fuel and permit (admin/vehicles.js plateSql) — never from the
 * number alone. Shared by the explorer and a vehicle's page.
 */
export const PLATES = {
  white: { bg: '#ffffff', fg: '#111827', ring: '#1f2937', label: 'White board', kind: 'Private', note: 'A private (non-transport) vehicle.' },
  yellow: { bg: '#facc15', fg: '#111827', ring: '#1f2937', label: 'Yellow board', kind: 'Commercial', note: 'A transport vehicle: goods carrier, taxi, cab, bus, auto and the like.' },
  green: { bg: '#15803d', fg: '#ffffff', ring: '#14532d', label: 'Green board', kind: 'Electric · private', note: 'An electric vehicle, privately used (white letters).' },
  green_yellow: { bg: '#15803d', fg: '#facc15', ring: '#14532d', label: 'Green board', kind: 'Electric · commercial', note: 'An electric transport vehicle (yellow letters).' },
  black: { bg: '#111827', fg: '#facc15', ring: '#000000', label: 'Black board', kind: 'Self-drive rental', note: 'A rent-a-cab / self-drive rental vehicle.' },
  red: { bg: '#dc2626', fg: '#ffffff', ring: '#7f1d1d', label: 'Red board', kind: 'Temporary', note: 'A temporary registration.' },
  blue: { bg: '#1d4ed8', fg: '#ffffff', ring: '#1e3a8a', label: 'Blue board', kind: 'Diplomatic', note: 'A foreign mission’s vehicle.' },
  unknown: { bg: '#f3f8f7', fg: '#6b8380', ring: '#c9d6d3', label: 'Board unknown', kind: 'RC not fetched', note: 'The RC has not been fetched, so its class is not known.', dashed: true },
};
export const plateOf = (k) => PLATES[k] || PLATES.unknown;

/** The board order for counts and filters; both green boards count as "green". */
export const BOARD_ORDER = ['white', 'yellow', 'green', 'black', 'red', 'blue', 'unknown'];

/** A number plate: `sm` for a table row, `lg` for a vehicle's page (with the IND strip). */
export function NumberPlate({ reg, plate, size = 'sm', className = '' }) {
  const p = plateOf(plate);
  const lg = size === 'lg';
  return (
    <span className={`inline-flex items-stretch overflow-hidden rounded-[5px] font-mono font-bold leading-none tracking-[0.08em] shadow-[0_1px_0_rgba(0,0,0,.15),inset_0_1px_0_rgba(255,255,255,.35)] ${className}`}
      style={{ background: p.bg, color: p.fg, border: `${lg ? 2 : 1.5}px ${p.dashed ? 'dashed' : 'solid'} ${p.ring}` }}>
      {lg && (
        <span className="flex w-6 flex-col items-center justify-center gap-0.5 bg-[#1d4ed8] text-white">
          <span className="text-[7px] leading-none" aria-hidden="true">✦</span>
          <span className="text-[8px] font-bold leading-none tracking-normal">IND</span>
        </span>
      )}
      <span className={lg ? 'px-3 py-1.5 text-2xl' : 'px-1.5 py-[3px] text-[13px]'}>{reg}</span>
    </span>
  );
}

/** A small colour dot and the board's name — for a table column or a chip. */
export function BoardTag({ plate, withKind = true }) {
  const p = plateOf(plate);
  return (
    <Hint note={p.note}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-2xs">
        <span className="h-3 w-4 shrink-0 rounded-[3px]" style={{ background: p.bg, border: `1px ${p.dashed ? 'dashed' : 'solid'} ${p.ring}`, boxShadow: `inset 0 0 0 2px ${p.bg}, inset 0 0 0 3px ${p.fg}55` }} />
        <span className="font-semibold text-ink">{p.label.replace(' board', '')}</span>
        {withKind && <span className="text-muted">· {p.kind}</span>}
      </span>
    </Hint>
  );
}
