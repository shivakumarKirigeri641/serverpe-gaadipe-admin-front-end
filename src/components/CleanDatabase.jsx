import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { count } from '../lib/format';
import { Banner, Modal, Field } from './ui.jsx';

/**
 * Clear customer and test data — the danger zone at the foot of Settings.
 *
 * THREE DELIBERATE OBSTACLES, because this cannot be undone:
 *   1. it says exactly what will go, with counts, before anything is pressed
 *   2. the word CLEAN must be typed — a button alone is one careless click
 *      from an empty database
 *   3. the server refuses on a production database whatever the panel sends
 *
 * What is kept is stated as plainly as what is removed, so nobody wonders
 * whether their settings or policy text are about to disappear.
 */
const LABELS = {
  users: 'Customers', vehicles: 'Vehicles', payments: 'Payments', invoices: 'Invoices',
  vehicle_reports: 'Reports', whatsapp_messages: 'WhatsApp messages', event_log: 'Activity log',
  api_calls: 'Lookups', feedback: 'Feedback', watches: 'Watches',
};

export default function CleanDatabase() {
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.cleanPreview().then(setPreview).catch(setError);
  useEffect(() => { load(); }, []);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const out = await api.cleanDb();
      setDone(`Cleared ${count(out.rows)} rows and ${count(out.files)} PDF files.`);
      setOpen(false); setTyped('');
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const shown = preview ? Object.entries(preview.counts).filter(([k]) => LABELS[k]) : [];

  return (
    <div className="card border-wrong-500/30">
      <div className="border-b border-wrong-500/20 px-5 py-3">
        <h2 className="text-sm font-semibold text-wrong-700">Danger zone — clear test data</h2>
        <p className="text-2xs text-muted">Removes every customer and everything they created. Cannot be undone.</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {done && <Banner tone="good">{done}</Banner>}
        {error && <Banner tone="wrong">{error.message}</Banner>}

        {preview && !preview.allowed && (
          <Banner tone="info">
            Switched off on this server ({preview.env}). Customers&apos; invoices on a live database are
            statutory records and must be kept.
          </Banner>
        )}

        {preview && (
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {shown.map(([k, n]) => (
              <div key={k} className="flex justify-between border-b border-line/60 py-1">
                <span className="text-body">{LABELS[k]}</span>
                <span className="tabular text-ink">{count(n)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-2xs text-muted">
          <b className="text-body">Kept:</b> panel users and the audit trail, prices and settings, plans,
          policy text, business details and the block list.
        </p>

        <button className="btn-danger" disabled={!preview?.allowed || !preview?.total}
          onClick={() => { setOpen(true); setError(null); setDone(null); }}>
          {preview?.total ? `Clear ${count(preview.total)} rows…` : 'Nothing to clear'}
        </button>
      </div>

      {open && (
        <Modal title="Clear all customer and test data?" busy={busy} onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn-quiet" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn-danger" disabled={typed !== 'CLEAN' || busy} onClick={run}>
                {busy ? 'Clearing…' : 'Clear everything'}
              </button>
            </>
          }>
          <Banner tone="wrong">
            Every customer, vehicle, payment, report, invoice and message will be deleted, and the PDFs with
            them. Report and invoice numbering starts again. This is recorded in the audit trail against your name.
          </Banner>
          <Field label="Type CLEAN to confirm">
            <input className="input font-mono" autoFocus value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="CLEAN" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
