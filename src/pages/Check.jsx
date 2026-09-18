import { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api';
import { plate, dateTime } from '../lib/format';
import { Banner, Chip, Hint, Table } from '../components/ui.jsx';

/*
 * Check a vehicle — RC, eChallans and FASTag in full, laid out as the Pravesha
 * panel's check (user, 2026-09-18). The helpers and views below are that page's,
 * kept alike so the two panels read the same; the page at the bottom is
 * GaadiPe's, which gets all three records in one response.
 */

/* ─────────────────────────────────────────────────────────── formatting ── */

/* snake_case and camelCase to words: "insurance_upto" -> "Insurance upto". */
const labelOf = (k) => {
  const s = String(k).replace(/_paise$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const rupeesWhole = (r) => `₹${Number(r || 0).toLocaleString('en-IN')}`;
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
  .replace(/\b(Ltd|Pvt|Llp|Bs|Vi|Iv|Ii|Iii|Lmv|Hpv|Rto|Puc|Cng|Lpg|Ev|Ac)\b/g, (m) => m.toUpperCase());
const ordinal = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = x % 100;
  return `${x}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/*
 * EXPIRY, IN COLOUR. Red once a date has passed, orange in the last 30 days
 * before it. VAHAN writes dates as 2021-11-16, 16-11-2021 or 16/11/2021
 * depending on the field; all three are read.
 */
const SOON_DAYS = 30;
const dateOf = (d) => {
  const t = String(d || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59+05:30`);
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(t);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T23:59:59+05:30`);
  return null;
};
const expiryOf = (d) => {
  const at = dateOf(d);
  if (!at || Number.isNaN(at.getTime())) return null;
  const days = Math.ceil((at - new Date()) / 86400000);
  if (days < 0) return { state: 'expired', days: -days };
  if (days <= SOON_DAYS) return { state: 'soon', days };
  return { state: 'valid', days };
};
const EXPIRY_KEY = /upto|expir|valid_?(till|to)/i;
const TONE = {
  expired: { row: 'bg-wrong-50/70', text: 'text-wrong-700', chip: 'bg-wrong-500 text-white', word: 'Expired' },
  soon: { row: 'bg-watch-50/70', text: 'text-watch-700', chip: 'bg-watch-500 text-white', word: 'Expiring' },
  valid: { row: '', text: 'text-ink', chip: 'bg-good-50 text-good-700', word: 'Valid' },
};
const expiryWords = (e) => {
  if (e.state === 'expired') return `expired ${e.days === 0 ? 'today' : `${e.days} day${e.days === 1 ? '' : 's'} ago`}`;
  if (e.state === 'soon') return `expires ${e.days === 0 ? 'today' : `in ${e.days} day${e.days === 1 ? '' : 's'}`}`;
  return `${e.days} days left`;
};
const BAD_STATUS = /expired|inactive|blacklist|suspend|cancel|surrender|seiz|stolen|closed/i;

/* Two-wheelers carry no FASTag: they do not pay tolls, so a missing tag is not
   a finding, and a failed tag lookup is not worth an alarm (user, 2026-09-16). */
const TWO_WHEELER = /two.?wheeler|m-?cycle|scooter|moped|motor.?cycle/i;
const isTwoWheeler = (rc) => Boolean(rc) && TWO_WHEELER.test(`${rc.vehicle_class || ''} ${rc.vehicle_category || ''} ${rc.body_type || ''}`);

/* ─────────────────────────────────────────────────── generic, every field ── */

function Value({ k, v }) {
  if (v === null || v === undefined || v === '') return <span className="text-muted/60">—</span>;
  if (typeof v === 'boolean') return <span className={v ? 'font-semibold text-good-700' : 'text-muted'}>{v ? 'Yes' : 'No'}</span>;
  if (typeof v === 'number' && /_paise$/.test(String(k))) return <span className="tabular">{inr(v)}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted/60">none</span>;
    if (v.every((x) => x === null || typeof x !== 'object')) return <span>{v.join(', ')}</span>;
    return <Rows rows={v} />;
  }
  if (typeof v === 'object') return <Fields data={v} nested />;
  if (EXPIRY_KEY.test(String(k))) {
    const e = expiryOf(v);
    if (e && e.state !== 'valid') {
      return <span className={`font-semibold ${TONE[e.state].text}`}>{String(v)} <span className="text-2xs">· {expiryWords(e)}</span></span>;
    }
  }
  if (/status/i.test(String(k)) && BAD_STATUS.test(String(v))) return <span className="font-semibold text-wrong-700">{String(v)}</span>;
  return <span className="break-words">{String(v)}</span>;
}

function Fields({ data, skip = [], nested = false }) {
  const entries = Object.entries(data || {}).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <span className="text-muted/60">—</span>;
  return (
    <dl className={nested ? 'space-y-1 text-2xs' : 'grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2'}>
      {entries.map(([k, v]) => (
        <div key={k} className={nested ? 'flex gap-2' : 'flex items-baseline justify-between gap-4 border-b border-line/60 pb-2'}>
          <dt className="shrink-0 text-muted">{labelOf(k)}</dt>
          <dd className={nested ? 'min-w-0 text-ink' : 'min-w-0 text-right font-medium text-ink'}><Value k={k} v={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

function Rows({ rows }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-2xs">
        <thead className="bg-shell"><tr>{cols.map((c) => <th key={c} className="th whitespace-nowrap">{labelOf(c)}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className={`cv-row ${i % 2 ? 'bg-shell/40' : ''}`} style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>{cols.map((c) => <td key={c} className="td align-top"><Value k={c} v={r?.[c]} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Section = ({ title, children, note, right, delay = 0 }) => (
  <section className="card cv-rise overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-shell/60 px-5 py-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {right || (note && <span className="text-2xs text-muted">{note}</span>)}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

/* A number that counts up to itself once, when it first appears. */
function CountUp({ to, format = (n) => n.toLocaleString('en-IN') }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(to) || 0;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || target === 0) { setN(target); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 700);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(n)}</>;
}

const Stat = ({ label, value, count, format, tone = 'text-ink', delay = 0 }) => (
  <div className="cv-rise cv-tile rounded-xl border border-line bg-white px-4 py-3" style={{ animationDelay: `${delay}ms` }}>
    <div className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className={`mt-1 text-xl font-bold tabular ${tone}`}>{count !== undefined ? <CountUp to={count} format={format} /> : value}</div>
  </div>
);

/* Everything the record carries, folded away until it is wanted. */
function AllFields({ data, skip = [], count }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card cv-rise overflow-hidden" style={{ animationDelay: '240ms' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-shell">
        <span className="text-sm font-semibold text-ink">Every field in the response</span>
        <span className="flex items-center gap-2 text-2xs text-muted">
          {count != null ? `${count} fields` : ''}
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </span>
      </button>
      {open && <div className="cv-unfold border-t border-line p-5"><Fields data={data} skip={skip} /></div>}
    </section>
  );
}

/* A two-column specification table: label on the left, value on the right. */
function SpecTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.filter(Boolean).map(([label, value, hint], i) => (
          <tr key={label} className={`cv-row ${i % 2 ? 'bg-shell/50' : ''}`} style={{ animationDelay: `${120 + i * 22}ms` }}>
            <th scope="row" className="w-2/5 border-b border-line/60 px-4 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted">{label}</th>
            <td className="border-b border-line/60 px-4 py-2 font-medium text-ink">
              {value === null || value === undefined || value === '' ? <span className="text-muted/60">—</span> : value}
              {hint && <span className="ml-2 text-2xs font-normal text-muted">{hint}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ───────────────────────────────────────────────────────────────── RC ── */

/* "VE COMMERCIAL VEHICLES LTD (VOLVO BUSES DIVISION)" + "VOLVO 9600S B8R 6X2 15M BS VI"
   -> model "9600S", variant "B8R 6X2 15M BS VI": the maker's own words at the
   front of the model are dropped, the first word left is the model. */
function modelParts(maker, model) {
  const makerWords = new Set(String(maker || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  let words = String(model || '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && makerWords.has(words[0].toUpperCase())) words = words.slice(1);
  return { model: words[0] || null, variant: words.length > 1 ? words.slice(1).join(' ') : null };
}

/*
 * THE BOARD, AS IT IS ON THE ROAD (user, 2026-09-16). Indian plates are
 * coloured by use: white for private, yellow for transport (taxis, maxi cabs,
 * buses, goods carriers), black with yellow letters for self-drive rentals, and
 * green for electric — white letters when private, yellow when transport. The
 * RC says so through the vehicle class; a permit on record means transport even
 * when the class is vague.
 */
const RENTAL = /rent|self.?drive|for hire/i;
const TRANSPORT = /cab|taxi|bus|goods|carrier|truck|lorry|tipper|tanker|trailer|articulated|passenger|rickshaw|construction|crane|delivery|tourist|contract carriage|stage carriage|ambulance.*transport|transport/i;
const PRIVATE_USE = /private|non.?transport/i;

function boardOf(rc) {
  const cls = [rc.vehicle_class, rc.vehicle_category, rc.body_type].filter(Boolean).join(' ');
  const electric = /electric|battery|\bev\b|bov/i.test(String(rc.fuel || ''));
  const rental = RENTAL.test(cls);
  const transport = rental || ((TRANSPORT.test(cls) || Boolean(rc.permit_type || rc.permit_number)) && !PRIVATE_USE.test(cls));
  if (rental && !electric) return { key: 'rental', label: 'Black board · self-drive rental', bg: 'bg-black', text: 'text-[#facc15]', border: 'border-[#facc15]/70' };
  if (electric) {
    return transport
      ? { key: 'ev-transport', label: 'Green board · electric, transport', bg: 'bg-[#15803d]', text: 'text-[#facc15]', border: 'border-black/70' }
      : { key: 'ev', label: 'Green board · electric', bg: 'bg-[#15803d]', text: 'text-white', border: 'border-black/70' };
  }
  if (transport) return { key: 'transport', label: 'Yellow board · transport', bg: 'bg-[#facc15]', text: 'text-black', border: 'border-black/80' };
  return { key: 'private', label: 'White board · private', bg: 'bg-white', text: 'text-black', border: 'border-black/80' };
}

function RcView({ body }) {
  const rc = body.rc || {};
  const { model, variant } = modelParts(rc.maker, rc.model);
  const board = boardOf(rc);
  const flagged = Object.entries(rc)
    .filter(([k, v]) => EXPIRY_KEY.test(k) && v)
    .map(([k, v]) => ({ k, e: expiryOf(v) }))
    .filter((x) => x.e && x.e.state !== 'valid');
  const expiredN = flagged.filter((x) => x.e.state === 'expired').length;
  const soonN = flagged.length - expiredN;
  const badStatus = rc.status && BAD_STATUS.test(rc.status);

  const DOCS = [
    ['Registration', null, rc.reg_upto],
    ['Fitness', null, rc.fitness_upto],
    ['Insurance', [rc.insurance_company, rc.insurance_policy].filter(Boolean).join(' · '), rc.insurance_upto],
    ['Road tax', null, rc.tax_upto],
    ['PUC', rc.pucc_number, rc.pucc_upto],
    ['Permit', [rc.permit_type, rc.permit_number].filter(Boolean).join(' · '), rc.permit_upto],
  ];

  return (
    <div className="space-y-4">
      {(expiredN > 0 || soonN > 0 || badStatus) && (
        <div className={`rounded-xl border-2 px-4 py-3 ${expiredN || badStatus ? 'border-wrong-500/40 bg-wrong-50 text-wrong-700' : 'border-watch-500/40 bg-watch-50 text-watch-700'}`} role="alert">
          <div className="text-sm font-bold">
            {[badStatus && `RC status: ${rc.status}`, expiredN && `${expiredN} expired`, soonN && `${soonN} expiring within ${SOON_DAYS} days`].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-0.5 text-2xs">{flagged.map((x) => `${labelOf(x.k)} ${expiryWords(x.e)}`).join(' · ')}</div>
        </div>
      )}

      {/*
        THE VEHICLE, AT A GLANCE (user, 2026-09-16). The plate as it looks on
        the road, the maker and model as a heading, then the facts people ask
        for first as a grid of tiles rather than a sentence joined with dots.
      */}
      <div className="card cv-rise overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-gradient-to-br from-brand-deep via-brand to-brand-light px-6 py-5 text-white">
          {/* An Indian number plate: IND strip, and the board's own colours. */}
          <div className="flex flex-col items-start gap-1.5">
          <div className={`cv-plate flex overflow-hidden rounded-md border-2 shadow-lg ${board.bg} ${board.border}`}>
            <div className="flex w-7 flex-col items-center justify-center bg-[#1d4ed8] text-[9px] font-bold leading-none text-white">
              <span className="text-[10px]">⚙</span><span className="mt-0.5">IND</span>
            </div>
            <div className={`px-4 py-1.5 font-mono text-2xl font-extrabold tracking-[.12em] sm:text-3xl ${board.text}`}>{plate(rc.reg_no || body.vehicle_number)}</div>
          </div>
          <span className="rounded bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.1em] text-white/90">{board.label}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-2xs font-semibold uppercase tracking-[.14em] text-white/70">{titleCase(rc.maker) || 'Manufacturer not recorded'}</div>
            <div className="mt-0.5 text-2xl font-bold leading-tight">{model || rc.model || 'Model not recorded'}</div>
            {variant && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {variant.split(/\s+/).map((v, i) => (
                  <span key={`${v}${i}`} className="cv-rise rounded-md bg-white/15 px-2 py-0.5 font-mono text-2xs font-semibold backdrop-blur-sm" style={{ animationDelay: `${150 + i * 40}ms` }}>{v}</span>
                ))}
              </div>
            )}
          </div>
          {rc.status && (
            <div className="text-right">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold shadow ${badStatus ? 'bg-wrong-500 text-white' : /active/i.test(rc.status) ? 'bg-white text-good-700' : 'bg-watch-500 text-white'}`}>
                <span className={`h-2 w-2 rounded-full ${badStatus ? 'bg-white' : /active/i.test(rc.status) ? 'animate-pulse bg-good-500' : 'bg-white'}`} />
                {rc.status}
              </span>
              {rc.status_as_on && <div className="mt-1.5 text-2xs text-white/70">as on {rc.status_as_on}</div>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Class', rc.vehicle_class],
            ['Body', titleCase(rc.body_type)],
            ['Fuel', titleCase(rc.fuel)],
            ['Colour', titleCase(rc.colour)],
            ['Seats', rc.seats],
            ['Engine', rc.cubic_capacity ? `${Number(rc.cubic_capacity).toLocaleString('en-IN')} cc` : null],
            ['Norms', titleCase(rc.norms)],
            ['Registered', rc.reg_date],
            ['RTO', rc.registered_at],
            ['Manufactured', rc.manufactured],
            ['Owner', ordinal(rc.owner_serial) ? `${ordinal(rc.owner_serial)} · ${titleCase(rc.owner_type) || '—'}` : titleCase(rc.owner_type)],
            ['Financer', rc.financer ? titleCase(rc.financer) : 'None'],
          ].map(([k, v], i) => (
            <div key={k} className="cv-rise cv-tile bg-shell/40 px-4 py-3" style={{ animationDelay: `${80 + i * 30}ms` }}>
              <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">{k}</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-ink" title={v ? String(v) : ''}>{v || <span className="text-muted/60">—</span>}</div>
            </div>
          ))}
        </div>
      </div>

      <Section title="Documents & validity" note="Red: expired · orange: within 30 days" delay={60}>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-shell">
              <tr><th className="th">Document</th><th className="th">Number / company</th><th className="th">Valid until</th><th className="th">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {DOCS.map(([doc, detail, upto]) => {
                const e = upto ? expiryOf(upto) : null;
                const tone = e ? TONE[e.state] : null;
                return (
                  <tr key={doc} className={`cv-row ${tone ? tone.row : ''}`} style={{ animationDelay: `${140 + DOCS.findIndex((d) => d[0] === doc) * 35}ms` }}>
                    <td className="td font-semibold text-ink">{doc}</td>
                    <td className="td text-body">{detail || <span className="text-muted/60">—</span>}</td>
                    <td className={`td tabular font-semibold ${tone ? tone.text : 'text-muted'}`}>
                      {upto || 'Not recorded'}
                      {e && e.state !== 'valid' && <div className="text-2xs font-semibold">{expiryWords(e)}</div>}
                    </td>
                    <td className="td">{e ? <span className={`chip ${tone.chip}`}>{tone.word}</span> : <span className="chip bg-shell text-muted">—</span>}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="td font-semibold text-ink">Blacklist</td>
                <td className="td" colSpan={2}>{rc.blacklist_status || <span className="text-muted">Nothing recorded</span>}</td>
                <td className="td">{rc.blacklist_status ? <span className="chip bg-wrong-500 text-white">Listed</span> : <span className="chip bg-good-50 text-good-700">Clear</span>}</td>
              </tr>
              <tr>
                <td className="td font-semibold text-ink">NOC</td>
                <td className="td" colSpan={2}>{[rc.noc_details, rc.noc_date].filter(Boolean).join(' · ') || <span className="text-muted">None issued</span>}</td>
                <td className="td">{rc.noc_details ? <span className="chip bg-watch-50 text-watch-700">Issued</span> : <span className="chip bg-shell text-muted">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Vehicle" delay={120}>
          <div className="-m-5">
            <SpecTable rows={[
              ['Manufacturer', titleCase(rc.maker)],
              ['Model', model],
              ['Variant', variant],
              ['As registered', rc.model],
              ['Vehicle class', rc.vehicle_class],
              ['Category', titleCase(rc.vehicle_category)],
              ['Body type', titleCase(rc.body_type)],
              ['Fuel', titleCase(rc.fuel)],
              ['Emission norms', titleCase(rc.norms)],
              ['Colour', titleCase(rc.colour)],
              ['Seats', rc.seats],
              ['Engine capacity', rc.cubic_capacity ? `${Number(rc.cubic_capacity).toLocaleString('en-IN')} cc` : null],
              ['Cylinders', rc.cylinders],
              ['Wheelbase', rc.wheelbase ? `${Number(rc.wheelbase).toLocaleString('en-IN')} mm` : null],
              ['Unladen weight', rc.unladen_weight ? `${Number(rc.unladen_weight).toLocaleString('en-IN')} kg` : null],
              ['Gross weight', rc.gross_weight ? `${Number(rc.gross_weight).toLocaleString('en-IN')} kg` : null],
              ['Manufactured', rc.manufactured],
            ]} />
          </div>
        </Section>
        <Section title="Registration & owner" delay={180}>
          <div className="-m-5">
            <SpecTable rows={[
              ['Registration no.', rc.reg_no ? <span className="font-mono">{plate(rc.reg_no)}</span> : null],
              ['Registered at', rc.registered_at],
              ['State · RTO code', [rc.state_code, rc.rto_code].filter(Boolean).join(' · ')],
              ['Registration date', rc.reg_date],
              ['Purchase date', rc.purchase_date],
              ['Owner', rc.owner_name, rc.owner_name ? 'masked by VAHAN' : null],
              ['Ownership', ordinal(rc.owner_serial) ? `${ordinal(rc.owner_serial)} owner` : null],
              ['Owner type', titleCase(rc.owner_type)],
              ['Owner category', titleCase(rc.owner_category)],
              ['Address', rc.address],
              ['Financer', rc.financer],
              ['Sale amount', rc.sale_amount ? rupeesWhole(rc.sale_amount) : null],
              ['Chassis', rc.chassis ? <span className="font-mono">{rc.chassis}</span> : null],
              ['Engine no.', rc.engine ? <span className="font-mono">{rc.engine}</span> : null],
            ]} />
          </div>
        </Section>
      </div>

      <AllFields data={rc} count={Object.keys(rc).length} />
    </div>
  );
}

const PER_VIEW = 20;

/* A challan's moment, from whichever shape the record gave: "15-11-2025 03:16:16",
   "2025-11-15 03:16:16" or just a date. Unknown dates sort last. */
function challanTime(c) {
  // challan_date is always YYYY-MM-DD; challan_at adds the time when the record has one.
  const at = /(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(c.challan_at || '').trim());
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.challan_date || ''));
  if (day) return Date.UTC(+day[1], +day[2] - 1, +day[3], +(at?.[1] || 0), +(at?.[2] || 0), +(at?.[3] || 0));
  const t = String(c.challan_at || c.date || '').trim();
  let m = /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return -Infinity;
}

/* 1 … 4 5 6 … 18 — the pages worth offering around the current one. */
function pageList(current, last) {
  const set = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push('…'); out.push(p); });
  return out;
}

/* Twenty at a time, each opening onto every field the record carries. */
function ChallanRows({ list, total, tone = 'wrong', empty }) {
  const [view, setView] = useState(1);
  const [open, setOpen] = useState(null);
  const lastView = Math.max(1, Math.ceil(list.length / PER_VIEW));
  const start = (view - 1) * PER_VIEW;
  const rows = list.slice(start, start + PER_VIEW);
  const goTo = (p) => { setOpen(null); setView(Math.max(1, Math.min(p, lastView))); };

  if (!list.length) return <p className="text-sm font-semibold text-good-700">{empty}</p>;
  return (
    <>
      <div className="-mx-5 -mt-5 divide-y divide-line">
        {rows.map((c, i) => {
          const n = start + i;
          const isOpen = open === n;
          const court = c.sent_to_court || c.sent_to_virtual_court;
          return (
            <div key={`${view}:${c.challan_no || n}`} className={`cv-row ${isOpen ? 'bg-shell/40' : 'bg-white'}`} style={{ animationDelay: `${i * 22}ms` }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : n)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-shell">
                <span className="w-8 shrink-0 text-right text-2xs tabular text-muted">{n + 1}</span>
                <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold text-ink">{c.challan_at || c.challan_date || c.date || 'Date not given'}</span>
                    <span className="font-mono text-2xs text-muted">{c.challan_no || '—'}</span>
                    {court && <span className="chip bg-wrong-500 text-white">In court</span>}
                  </div>
                  <div className="truncate text-sm text-body">{c.offence || 'Offence not given'}</div>
                  <div className="truncate text-2xs text-muted">{[c.place, c.department].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`tabular text-base font-bold ${tone === 'wrong' ? 'text-wrong-700' : 'text-ink'}`}>{c.amount_paise != null ? inr(c.amount_paise) : '—'}</div>
                  <span className={`chip ${tone === 'wrong' ? 'bg-watch-50 text-watch-700' : 'bg-good-50 text-good-700'}`}>{c.status || (tone === 'wrong' ? 'pending' : 'disposed')}</span>
                </div>
              </button>
              {isOpen && (
                <div className="cv-unfold space-y-3 border-t border-line px-5 pb-4 pt-3">
                  {Array.isArray(c.offences) && c.offences.length > 0 && (
                    <div>
                      <div className="label">Offences</div>
                      <div className="overflow-hidden rounded-lg border border-line">
                        <Rows rows={c.offences.map((o) => (o && typeof o === 'object' ? o : { offence: o }))} />
                      </div>
                    </div>
                  )}
                  <Fields data={c} skip={['offences']} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-shell/40 px-5 py-3">
        <span className="text-2xs text-muted">
          {start + 1}–{Math.min(start + PER_VIEW, list.length)} of {list.length} · newest first
          {total > list.length ? ` · ${total} on record, ${list.length} returned` : ''}
        </span>
        {lastView > 1 && (
          <nav className="flex flex-wrap items-center gap-1" aria-label="Challan pages">
            <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={view === 1} onClick={() => goTo(view - 1)}>‹ Prev</button>
            {pageList(view, lastView).map((p, i) => (p === '…'
              ? <span key={`e${i}`} className="px-1 text-2xs text-muted">…</span>
              : (
                <button key={p} type="button" onClick={() => goTo(p)}
                  className={`min-w-[2rem] rounded-md px-2 py-1 text-2xs font-semibold tabular ${p === view ? 'bg-brand text-white' : 'border border-line bg-white text-body hover:bg-shell'}`}>
                  {p}
                </button>
              )))}
            <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={view === lastView} onClick={() => goTo(view + 1)}>Next ›</button>
          </nav>
        )}
      </div>
    </>
  );
}

/* The whole list arrives in one response (challans=all), so it is sorted once,
   newest first — the record's own order sorts DD-MM-YYYY as text. */
function ChallanView({ body }) {
  const s = body.summary || {};
  const newest = (list) => [...(list || [])].sort((x, y) => challanTime(y) - challanTime(x));
  const pending = newest(body.pending);
  const disposed = newest(body.disposed);
  const total = s.total_pending ?? body.pending_count ?? pending.length;
  const penalty = s.total_pending_amount_paise ?? body.pending_amount_paise ?? 0;
  const disposedN = s.total_disposed ?? body.disposed_count ?? disposed.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pending challans" count={total} tone={total ? 'text-wrong-700' : 'text-good-700'} />
        <Stat label="Total penalty pending" count={penalty} format={inr} tone={penalty > 0 ? 'text-wrong-700' : 'text-ink'} delay={50} />
        <Stat label="Disposed" count={disposedN} delay={100} />
        <Stat label="In court" count={s.in_court ?? 0} tone={s.in_court ? 'text-wrong-700' : 'text-ink'} delay={150} />
      </div>

      <Section
        title={total ? `Pending challans (${total})` : 'Pending challans'}
        right={total ? (
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xs text-muted">Total penalty</span>
            <span className="tabular text-base font-bold text-wrong-700">{inr(penalty)}</span>
            {s.oldest_challan_date && <span className="text-2xs text-muted">· {s.oldest_challan_date} to {s.newest_challan_date}</span>}
          </span>
        ) : null}
      >
        <ChallanRows list={pending} total={total} empty="No pending challans." />
      </Section>

      {disposedN > 0 && (
        <Section title={`Disposed challans (${disposedN})`} note={body.disposed_amount_paise ? `${inr(body.disposed_amount_paise)} settled` : null} delay={60}>
          <ChallanRows list={disposed} total={disposedN} tone="good" empty="None returned." />
        </Section>
      )}

      {Array.isArray(s.top_offences) && s.top_offences.length > 0 && (
        <Section title="Most frequent offences" delay={100}><div className="-m-5"><Rows rows={s.top_offences} /></div></Section>
      )}
      {Array.isArray(s.states) && s.states.length > 0 && (
        <Section title="Where the challans were issued" delay={140}><div className="-m-5"><Rows rows={s.states} /></div></Section>
      )}
      <AllFields data={body} skip={['pending', 'disposed', 'summary']} />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── FASTag ── */

const FastagNotApplicable = () => (
  <div className="card cv-rise flex items-start gap-4 p-6">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-shell text-lg font-bold text-muted">N/A</span>
    <div>
      <div className="text-base font-semibold text-ink">FASTag — not applicable</div>
      <p className="mt-1 text-sm text-muted">Two-wheelers do not pay tolls and carry no FASTag, so there is nothing to check.</p>
    </div>
  </div>
);

function FastagView({ body }) {
  const f = body.fastag || {};
  const active = f.active_tag;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active tag" value={f.has_active_tag ? 'Yes' : 'No'} tone={f.has_active_tag ? 'text-good-700' : 'text-wrong-700'} />
        <Stat label="Tags on record" count={f.tag_count ?? (f.tags || []).length} delay={50} />
        <Stat label="Toll crossings" count={f.crossing_count ?? (f.crossings || []).length} delay={100} />
        <Stat label="Last seen" value={f.last_seen_plaza || '—'} delay={150} />
      </div>
      {active && (
        <Section title="Active tag" delay={60}>
          <div className="-m-5">
            <SpecTable rows={[
              ['Tag ID', active.tag_id ? <span className="font-mono">{active.tag_id}</span> : null],
              ['Status', active.status ? <span className={`chip ${active.is_active ? 'bg-good-500 text-white' : 'bg-wrong-500 text-white'}`}>{titleCase(active.status)}</span> : null],
              ['Vehicle class', active.vehicle_class],
              ['Issued', active.issue_date],
              ['Issuing bank', active.bank_id],
              ['Commercial vehicle', active.commercial === undefined ? null : active.commercial ? 'Yes' : 'No'],
              ['Registration', active.reg_no],
              ['TID', active.tid ? <span className="font-mono text-2xs">{active.tid}</span> : null],
              ['Exception code', active.exception_code],
            ]} />
          </div>
        </Section>
      )}
      <Section title="All tags" note={`${(f.tags || []).length}`} delay={120}>
        {(f.tags || []).length ? <div className="-m-5"><Rows rows={f.tags} /></div> : <p className="text-sm text-muted">No FASTag on record.</p>}
      </Section>
      <Section title="Toll crossings" note={f.last_seen_at ? `last ${f.last_seen_at}` : null} delay={180}>
        {(f.crossings || []).length ? <div className="-m-5"><Rows rows={f.crossings} /></div> : <p className="text-sm text-muted">No crossings returned.{f.crossings_error ? ` ${f.crossings_error}` : ''}</p>}
      </Section>
      <AllFields data={{ ...body, fastag: Object.fromEntries(Object.entries(f).filter(([k]) => !['tags', 'crossings', 'active_tag'].includes(k))) }}
        skip={['calls', 'success', 'vehicle_number']} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── page ── */

const TABS = [
  { key: 'rc', label: 'RC' },
  { key: 'challans', label: 'eChallan' },
  { key: 'fastag', label: 'FASTag' },
  { key: 'lookup', label: 'Lookup' },
];

/**
 * Look a vehicle up for yourself — in full.
 *
 * The plate as it looks on the road, the facts people ask for first as tiles,
 * documents coloured by expiry, then every challan and every FASTag record,
 * with every other field the record returned one tap away. It goes through the
 * same gateway a customer's check does, so what appears here is what they are
 * shown once they pay.
 *
 * `Refresh from ULIP` spends a live call instead of using the cache. It is a
 * separate button rather than the default, because the cache keeps the margin.
 * Every check is written to the audit trail.
 */
export default function Check() {
  const [reg, setReg] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rc');
  const [round, setRound] = useState(0);

  const run = async (refresh) => {
    const value = reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length < 5) { setError({ message: 'Enter a full registration number.' }); return; }
    setBusy(true); setError(null); setData(null);
    try {
      const out = await api.check(value, { refresh: refresh ? 1 : undefined, challans: 'all' });
      if (out.success === false) { setError({ message: out.message || 'Not found.' }); return; }
      setData(out);
      setRound((n) => n + 1);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const rc = data?.rc || {};
  const challans = data?.challans;
  const fastagNA = isTwoWheeler(rc) && !(data?.fastag?.tags || []).length;

  const badge = (key) => {
    if (!data) return null;
    if (key === 'rc') {
      const hits = Object.entries(rc).filter(([k, v]) => EXPIRY_KEY.test(k) && v).map(([, v]) => expiryOf(v)).filter((e) => e && e.state !== 'valid');
      if (hits.some((e) => e.state === 'expired') || BAD_STATUS.test(rc.status || '')) return <span className="chip ml-1.5 bg-wrong-500 text-white">expired</span>;
      if (hits.length) return <span className="chip ml-1.5 bg-watch-500 text-white">expiring</span>;
      return <span className="ml-1.5">✓</span>;
    }
    if (key === 'challans') {
      if (!challans) return <span className="ml-1.5 font-bold text-wrong-700">!</span>;
      const n = challans.summary?.total_pending ?? challans.pending_count ?? 0;
      return n ? <span className="chip ml-1.5 bg-wrong-500 text-white">{n}</span> : <span className="ml-1.5">✓</span>;
    }
    if (key === 'fastag') {
      if (fastagNA) return <span className="chip ml-1.5 bg-shell text-muted">N/A</span>;
      if (!data.fastag) return <span className="ml-1.5 font-bold text-wrong-700">!</span>;
      return <span className="ml-1.5">✓</span>;
    }
    return <span className="chip ml-1.5 bg-shell text-muted">{data.ulip_calls_made}</span>;
  };

  return (
    <Shell title="Check a vehicle" subtitle="RC, eChallans and FASTag in full · the same lookup a customer pays for · recorded in the audit trail">
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        <label className="min-w-[14rem] flex-1">
          <span className="label">Vehicle number</span>
          <input className="input font-mono text-lg uppercase tracking-wider" value={reg} autoFocus
            placeholder="KA02EX1480" maxLength={14} onChange={(e) => setReg(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Check'}</button>
        <Hint note="Spends a live ULIP call instead of answering from the cache. Free today; the reason to be sparing is the day it is not.">
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => run(true)}>Refresh from ULIP</button>
        </Hint>
      </form>

      {error && <Banner tone="wrong" className="mb-4">{error.message}</Banner>}
      {busy && (
        <div className="card flex items-center justify-center gap-3 p-8 text-sm text-muted">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
          Reading the Government records… a vehicle with a long challan history can take a minute.
        </div>
      )}

      {data && !busy && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
                {t.label}{badge(t.key)}
              </button>
            ))}
            <span className="ml-auto font-mono text-sm font-semibold text-ink">{plate(data.vehicle_number)}</span>
          </div>

          <p className="mb-3 text-2xs text-muted">
            {data.source ? `${data.source} · ` : ''}
            {data.cached ? `from cache, ${data.age_minutes ?? 0} min old` : 'fresh from ULIP'}
            {` · ${data.ulip_calls_made} ULIP call${data.ulip_calls_made === 1 ? '' : 's'} · ${data.latency_ms} ms`}
          </p>

          <div key={`${round}:${tab}`} className="cv-rise">
            {tab === 'rc' && <RcView body={{ rc, vehicle_number: data.vehicle_number }} />}
            {tab === 'challans' && (challans
              ? <ChallanView body={challans} />
              : <Banner tone="watch">The challan record could not be read{data.challans_error ? `: ${data.challans_error}` : '.'}</Banner>)}
            {tab === 'fastag' && (fastagNA ? <FastagNotApplicable /> : data.fastag
              ? <FastagView body={{ fastag: data.fastag }} />
              : <Banner tone="watch">The FASTag record could not be read{data.fastag_error ? `: ${data.fastag_error}` : '.'}</Banner>)}
            {tab === 'lookup' && <LookupView data={data} />}
          </div>
        </>
      )}
    </Shell>
  );
}

/* What the lookup cost, call by call, and the whole response. */
function LookupView({ data }) {
  const [raw, setRaw] = useState(false);
  return (
    <Section title="What this lookup cost" right={
      <button type="button" className="btn-quiet !py-1.5 text-2xs" onClick={() => setRaw(!raw)}>{raw ? 'Hide raw response' : 'Show raw response'}</button>
    }>
      <div className="-m-5">
        {(data.calls || []).length ? (
          <Table head={<tr><th className="th">Path</th><th className="th">Outcome</th><th className="th">Code</th><th className="th">Took</th></tr>}>
            {data.calls.map((c, i) => (
              <tr key={i}>
                <td className="td font-mono text-2xs">{c.path}</td>
                <td className="td"><Chip tone={c.outcome === 'FOUND' ? 'good' : 'watch'}>{c.outcome}</Chip></td>
                <td className="td text-2xs">{c.code}</td>
                <td className="td tabular text-2xs">{c.ms} ms</td>
              </tr>
            ))}
          </Table>
        ) : <p className="px-5 py-4 text-sm text-muted">Answered entirely from the cache — no ULIP call made.</p>}
        <p className="px-5 py-3 text-2xs text-muted">Fetched {dateTime(data.fetched_at)}</p>
        {raw && (
          <pre className="mx-5 mb-5 max-h-96 overflow-auto rounded-lg bg-ink/95 p-3 text-2xs text-white">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </Section>
  );
}
